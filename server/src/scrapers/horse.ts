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
  const trainer   = findTableValue($m, '調教師') ?? findTableValue($m, '担当') ?? '';
  const owner     = findTableValue($m, '馬主') ?? '';
  const statusDates = mergeStatusDates(
    parseHorseStatusDates(extractNetkeibaStatusText($m)),
    await fetchWikipediaStatusDates(horseName).catch(() => ({})),
  );
  const age = statusDates.deathDate
    ? deriveAgeAtDate(birthDate, statusDates.deathDate) || parsedSexAge.age || deriveJapaneseRaceAge(birthDate) || 0
    : parsedSexAge.age || deriveJapaneseRaceAge(birthDate) || 0;

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
    retiredDate: statusDates.retiredDate,
    deathDate: statusDates.deathDate,
    races,
    updatedAt: new Date().toISOString(),
  };
}

function parseHorseStatusDates(text: string): { retiredDate?: string; deathDate?: string } {
  const normalized = normalizeDigits(text).replace(/\s+/g, ' ');
  const deathDate =
    normalizeJapaneseDate(normalized.match(/(\d{4}年\d{1,2}月\d{1,2}日)\s*(?:死亡|没|死去|死没)/)?.[1]) ??
    normalizeJapaneseDate(normalized.match(/(?:死亡|没|死去|死没)\s*(\d{4}年\d{1,2}月\d{1,2}日)/)?.[1]);
  const retiredDate =
    normalizeJapaneseDate(normalized.match(/(\d{4}年\d{1,2}月\d{1,2}日)\s*(?:引退|登録抹消|抹消)/)?.[1]) ??
    normalizeJapaneseDate(normalized.match(/(?:引退日|登録抹消日|抹消日|引退|登録抹消|抹消)\s*[:：=]?\s*(\d{4}年\d{1,2}月\d{1,2}日)/)?.[1]);

  return { retiredDate, deathDate };
}

function extractNetkeibaStatusText($: cheerio.CheerioAPI): string {
  const chunks: string[] = [
    $('div.horse_title').text(),
  ];
  const labels = ['引退日', '登録抹消日', '抹消日', '死亡日', '没年月日', '死没'];
  for (const label of labels) {
    const value = findTableValue($, label);
    if (value) chunks.push(`${label} ${value}`);
  }
  return chunks.join(' ');
}

function mergeStatusDates(
  primary: { retiredDate?: string; deathDate?: string },
  fallback: { retiredDate?: string; deathDate?: string },
): { retiredDate?: string; deathDate?: string } {
  return {
    retiredDate: primary.retiredDate ?? fallback.retiredDate,
    deathDate: primary.deathDate ?? fallback.deathDate,
  };
}

async function fetchWikipediaStatusDates(horseName: string): Promise<{ retiredDate?: string; deathDate?: string }> {
  if (!horseName) return {};

  const res = await axios.get('https://ja.wikipedia.org/w/api.php', {
    headers: {
      ...HEADERS,
      'User-Agent': 'keiba-app/1.0 (local personal use; https://example.invalid)',
      'Referer': 'https://ja.wikipedia.org/',
    },
    params: {
      action: 'query',
      format: 'json',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: 1,
      titles: horseName,
    },
    timeout: 15000,
  });

  const pages = res.data?.query?.pages ?? {};
  const page = Object.values(pages)[0] as any;
  const content = page?.revisions?.[0]?.slots?.main?.['*'] ?? page?.revisions?.[0]?.['*'] ?? '';
  if (!content || typeof content !== 'string') return {};

  return {
    deathDate: extractWikipediaDeathDate(content),
    retiredDate: extractWikipediaRetiredDate(content),
  };
}

function extractWikipediaDeathDate(content: string): string | undefined {
  return extractLastTemplateDate(content, ['死亡年月日と没年齢', '死亡年月日', '没年月日と没年齢', '没年月日']) ??
    extractDateFromLabels(content, ['死没', '死亡日', '没年月日', '死亡年月日']);
}

function extractWikipediaRetiredDate(content: string): string | undefined {
  return extractDateFromLabels(content, ['引退日', '登録抹消日', '抹消日', '引退', '登録抹消']) ??
    extractContextDate(content, ['登録抹消', '抹消', '引退']);
}

function extractLastTemplateDate(content: string, templateNames: string[]): string | undefined {
  for (const name of templateNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`\\{\\{\\s*${escaped}\\s*\\|([^}]+)\\}\\}`, 'i'));
    if (!match) continue;
    const numbers = normalizeDigits(match[1]).split('|')
      .map(part => parseInt(part.trim(), 10))
      .filter(num => Number.isInteger(num));
    if (numbers.length >= 3) {
      const [year, month, day] = numbers.slice(-3);
      return formatJapaneseDate(year, month, day);
    }
  }
  return undefined;
}

function extractDateFromLabels(content: string, labels: string[]): string | undefined {
  const normalized = normalizeDigits(content);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = normalized.match(new RegExp(`(?:^|[\\n|])\\s*${escaped}\\s*=\\s*([^\\n]+)`, 'i'))?.[1];
    const date = normalizeJapaneseDate(line?.match(/\d{4}年\d{1,2}月\d{1,2}日/)?.[0]);
    if (date) return date;
  }
  return undefined;
}

function extractContextDate(content: string, keywords: string[]): string | undefined {
  const normalized = normalizeDigits(content).replace(/\s+/g, ' ');
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = normalizeJapaneseDate(
      normalized.match(new RegExp(`(\\d{4}年\\d{1,2}月\\d{1,2}日)[^。\\n]{0,40}${escaped}`))?.[1],
    );
    if (before) return before;
    const after = normalizeJapaneseDate(
      normalized.match(new RegExp(`${escaped}[^。\\n]{0,40}(\\d{4}年\\d{1,2}月\\d{1,2}日)`))?.[1],
    );
    if (after) return after;
  }
  return undefined;
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

function parseJapaneseDate(value: string | undefined): { year: number; month: number; day: number } | null {
  const match = normalizeDigits(value ?? '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatJapaneseDate(year: number, month: number, day: number): string | undefined {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日`;
}

function normalizeJapaneseDate(value: string | undefined): string | undefined {
  const parsed = parseJapaneseDate(value);
  return parsed ? formatJapaneseDate(parsed.year, parsed.month, parsed.day) : undefined;
}

function deriveAgeAtDate(birthDate: string, targetDate: string): number {
  const birth = parseJapaneseDate(birthDate);
  const target = parseJapaneseDate(targetDate);
  if (!birth || !target) return 0;

  let age = target.year - birth.year;
  if (target.month < birth.month || (target.month === birth.month && target.day < birth.day)) {
    age--;
  }
  return age > 0 ? age : 0;
}

function encodeEucJpQuery(value: string): string {
  const eucBuffer = iconv.encode(value, 'EUC-JP') as Buffer;
  return Array.from(eucBuffer)
    .map(b => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

function extractDirectHorse($: cheerio.CheerioAPI, responseUrl: string): { horseId: string; horseName: string } | null {
  const horseId = responseUrl.match(/\/horse\/(\d+)\/?/)?.[1];
  if (!horseId) return null;

  const horseName =
    $('div.horse_title h1').text().trim() ||
    $('h1').first().text().trim() ||
    $('title').text().split(/[|｜(（]/)[0].trim();

  return horseName ? { horseId, horseName } : null;
}

function extractHorseSearchResults($: cheerio.CheerioAPI): { horseId: string; horseName: string }[] {
  const results: { horseId: string; horseName: string }[] = [];
  const seen = new Set<string>();

  $('table.race_table_01 tr').each((_, row) => {
    const link = $(row).find('a[href^="/horse/"]').first();
    const href = link.attr('href') ?? '';
    const horseId = href.match(/^\/horse\/(\d+)\/?$/)?.[1];
    const horseName = (link.attr('title') ?? link.text()).trim();
    if (!horseId || !horseName || seen.has(horseId)) return;

    seen.add(horseId);
    results.push({ horseId, horseName });
  });

  return results;
}

function extractLastPage($: cheerio.CheerioAPI): number {
  let lastPage = 1;
  $('.common_pager a[href*="page="]').each((_, link) => {
    const href = $(link).attr('href') ?? '';
    const page = parseInt(href.match(/[?&]page=(\d+)/)?.[1] ?? '', 10);
    if (Number.isInteger(page) && page > lastPage) lastPage = page;
  });
  return lastPage;
}

async function fetchHorseSearchPage(
  encodedName: string,
  filter: 'active' | 'retired',
  page = 1,
): Promise<{
  results: { horseId: string; horseName: string }[];
  lastPage: number;
  direct: { horseId: string; horseName: string } | null;
}> {
  const filterParam = filter === 'active' ? '&act=1' : '&retired=1';
  const url = `${BASE}/?pid=horse_list&word=${encodedName}&match=partial_match&sort=prize&list=100${filterParam}&page=${page}`;
  const res = await axios.get<ArrayBuffer>(url, {
    headers: HEADERS,
    responseType: 'arraybuffer',
    maxRedirects: 5,
    timeout: 20000,
  });
  const html = iconv.decode(Buffer.from(res.data), 'EUC-JP');
  const $ = cheerio.load(html);
  const responseUrl = res.request?.res?.responseUrl ?? url;
  const direct = extractDirectHorse($, responseUrl);
  if (direct) return { results: [direct], lastPage: 1, direct };

  return {
    results: extractHorseSearchResults($),
    lastPage: extractLastPage($),
    direct: null,
  };
}

async function searchHorseByFilter(
  encodedName: string,
  filter: 'active' | 'retired',
): Promise<{ horseId: string; horseName: string }[]> {
  const first = await fetchHorseSearchPage(encodedName, filter);
  if (first.direct) return first.results;

  const byId = new Map<string, string>();
  for (const result of first.results) byId.set(result.horseId, result.horseName);

  const pages = Array.from({ length: Math.max(0, first.lastPage - 1) }, (_, i) => i + 2);
  const batchSize = 4;
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);
    const fetched = await Promise.all(batch.map(page =>
      fetchHorseSearchPage(encodedName, filter, page).catch(() => null)
    ));
    for (const pageResult of fetched) {
      for (const result of pageResult?.results ?? []) {
        byId.set(result.horseId, result.horseName);
      }
    }
  }

  return [...byId.entries()].map(([horseId, horseName]) => ({ horseId, horseName }));
}

// Search active horses first, then retired/unregistered horses when active search misses.
export async function searchHorse(name: string): Promise<{ horseId: string; horseName: string }[]> {
  const encodedName = encodeEucJpQuery(name);

  try {
    const activeResults = await searchHorseByFilter(encodedName, 'active');
    if (activeResults.length > 0) return activeResults;
    return await searchHorseByFilter(encodedName, 'retired');
  } catch {
    return [];
  }
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
