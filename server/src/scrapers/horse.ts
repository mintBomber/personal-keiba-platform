import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { HorseDetail, HorseRaceHistory } from '../types';

const BASE = 'https://db.netkeiba.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ja,en-US;q=0.7',
  'Referer': BASE + '/',
};

async function fetchEucJp(url: string): Promise<string> {
  const res = await axios.get<ArrayBuffer>(url, {
    headers: HEADERS,
    responseType: 'arraybuffer',
    timeout: 20000,
  });
  return iconv.decode(Buffer.from(res.data), 'EUC-JP');
}

// db.netkeiba.com/horse/{id}/        — static: horse name in div.horse_title h1, profile table
// db.netkeiba.com/horse/result/{id}/ — static: full race history table
// db.netkeiba.com/horse/ped/{id}/    — static: blood_table with sire/dam links
export async function scrapeHorse(horseId: string): Promise<HorseDetail> {
  console.log(`Scraping horse ${horseId}`);

  const [mainHtml, resultHtml, pedHtml] = await Promise.all([
    fetchEucJp(`${BASE}/horse/${horseId}/`).catch(() => ''),
    fetchEucJp(`${BASE}/horse/result/${horseId}/`).catch(() => ''),
    fetchEucJp(`${BASE}/horse/ped/${horseId}/`).catch(() => ''),
  ]);

  // === Main page: name + profile ===
  const $m = cheerio.load(mainHtml);
  const horseName =
    $m('div.horse_title h1').text().trim() ||
    $m('h1').first().text().trim() ||
    $m('title').text().split(/[|｜]/)[0].trim();

  const birthDate = findTableValue($m, '生年月日') ?? '';
  const sexAgeText =
    findTableValue($m, '性齢') ??
    $m('div.horse_title .txt_01').first().text().trim();
  const parsedSexAge = parseSexAge(sexAgeText);
  const sex = parsedSexAge.sex;
  const age = parsedSexAge.age || deriveJapaneseRaceAge(birthDate) || 0;
  const trainer   = findTableValue($m, '調教師') ?? findTableValue($m, '担当') ?? '';
  const owner     = findTableValue($m, '馬主') ?? '';

  // === Pedigree page: blood_table ===
  const $p = cheerio.load(pedHtml);
  let sire = '', sireId = '', dam = '', damId = '', broodmareSire = '';
  const bloodTable = $p('table.blood_table');
  if (bloodTable.length) {
    // Sire and dam are the two td[rowspan] cells with the largest rowspan that
    // link to a horse page.  After dam, the next large-rowspan cell = 母父 (broodmareSire).
    let maxRs = 0;
    bloodTable.find('td[rowspan]').each((_, td) => {
      const rs = parseInt($p(td).attr('rowspan') ?? '0', 10);
      const link = $p(td).find('a[href*="/horse/"]').first();
      if (!link.length) return;
      if (rs > maxRs) maxRs = rs;
    });

    let mainCount = 0;
    let damEncountered = false;
    bloodTable.find('td[rowspan]').each((_, td) => {
      const rs = parseInt($p(td).attr('rowspan') ?? '0', 10);
      const link = $p(td).find('a[href*="/horse/"]').first();
      if (!link.length) return;
      const href = link.attr('href') ?? '';
      // Only pure horse-ID links (e.g. /horse/12345/) not /horse/result/ etc.
      const hid = href.match(/\/horse\/(\d+)\/?$/)?.[1];
      if (!hid) return;
      const text = link.text().trim();
      if (!text) return;

      if (rs === maxRs) {
        if (mainCount === 0) { sire = text; sireId = hid; }
        else if (mainCount === 1) { dam = text; damId = hid; damEncountered = true; }
        mainCount++;
      } else if (damEncountered && !broodmareSire) {
        broodmareSire = text;
      }
    });
  }

  // === Result page: race history ===
  const $r = cheerio.load(resultHtml);
  const races = parseRaceHistory($r);

  return {
    horseId,
    horseName: horseName || `馬ID:${horseId}`,
    sex,
    age,
    birthDate,
    sire,
    sireId,
    dam,
    damId,
    broodmareSire,
    owner,
    trainer,
    totalRecord: `${races.length}戦${races.filter(r => r.placement === '1').length}勝`,
    races,
    updatedAt: new Date().toISOString(),
  };
}

function parseRaceHistory($: cheerio.CheerioAPI): HorseRaceHistory[] {
  const races: HorseRaceHistory[] = [];

  // Find the race history table — try known classes first, then any table with race headers
  let table = $('table.db_h_race_results, table.race_table_01').first();
  if (!table.length) {
    $('table').each((_, t) => {
      const headerText = $(t).find('tr').first().find('th, td')
        .map((_, el) => $(el).text().trim()).get().join('');
      if (headerText.includes('着順') || headerText.includes('レース名')) {
        table = $(t);
        return false;
      }
    });
  }
  if (!table.length) return races;

  // Build column index from header row
  const colIndex: Record<string, number> = {};
  table.find('tr').first().find('th, td').each((i, th) => {
    colIndex[$(th).text().trim()] = i;
  });
  const ci = (label: string, fallback: number) => colIndex[label] ?? fallback;

  table.find('tr').each((rowIdx, el) => {
    if (rowIdx === 0) return;
    const cells = $(el).find('td');
    if (cells.length < 8) return;

    const date      = cells.eq(0).text().trim();
    const racecourse = cells.eq(ci('開催', 1)).text().trim().replace(/\s+/g, '');
    const raceName  = cells.eq(ci('レース名', 4)).text().trim();
    const placement = cells.eq(ci('着順', 10)).text().trim();
    const jockey    = cells.eq(ci('騎手', 11)).text().trim();
    const kinRyoTxt = cells.eq(ci('斤量', 12)).text().trim();
    const kinRyo    = parseFloat(kinRyoTxt) || undefined;

    // Course info: "芝1600m" or "ダ1400m"
    const courseIdx  = ci('距離', 13) !== 13 ? ci('距離', 13) : ci('コース', 13);
    const courseText = cells.eq(courseIdx).text().trim();
    const surfMatch  = courseText.match(/([芝ダ障])(\d+)/);
    const surface    = surfMatch ? surfMatch[1] : '';
    const distance   = surfMatch ? parseInt(surfMatch[2], 10) : 0;

    const odds        = cells.eq(ci('オッズ', 8)).text().trim();
    const popularity  = cells.eq(ci('人気', 9)).text().trim();
    const horseWeight = cells.eq(ci('馬体重', 14)).text().trim();
    const time        = cells.eq(ci('タイム', 16)).text().trim();

    if (date && raceName) {
      races.push({ date, racecourse, raceName, distance, surface, placement, time, jockey, odds, popularity, horseWeight, kinRyo });
    }
  });

  return races;
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

function parseSexAge(value: string | undefined): { sex: string; age: number } {
  const normalized = normalizeDigits(value ?? '').replace(/\s+/g, '');
  const sex = normalized.match(/[牡牝セ騸]/)?.[0] ?? '';
  const age = parseInt(normalized.match(/(\d+)歳?/)?.[1] ?? '', 10) || 0;

  return {
    sex: sex === '騸' ? 'セ' : sex,
    age,
  };
}

function deriveJapaneseRaceAge(birthDate: string): number {
  const birthYear = parseInt(normalizeDigits(birthDate).match(/(\d{4})/)?.[1] ?? '', 10);
  if (!birthYear) return 0;

  const age = new Date().getFullYear() - birthYear;
  return age > 0 ? age : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findTableValue($: cheerio.CheerioAPI, label: string): string | undefined {
  let result: string | undefined;
  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('th, td');
      cells.each((i, cell) => {
        if ($(cell).text().trim() === label && result === undefined) {
          result = cells.eq(i + 1).text().trim();
        }
      });
    });
  });
  return result;
}
