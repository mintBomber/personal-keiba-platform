import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { HorseEntry, RaceMeta } from '../types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ja,en-US;q=0.7',
  'Referer': 'https://race.netkeiba.com/',
};

async function fetchEucJp(url: string): Promise<string> {
  const res = await axios.get<ArrayBuffer>(url, {
    headers: HEADERS,
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  return iconv.decode(Buffer.from(res.data), 'EUC-JP');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseGrade($: cheerio.CheerioAPI): string {
  const cls = $('h1.RaceName [class*="Icon_GradeType"]').first().attr('class') ?? '';
  if (cls.includes('GradeType1')) return 'G1';
  if (cls.includes('GradeType2')) return 'G2';
  if (cls.includes('GradeType3')) return 'G3';
  if (cls.includes('GradeType15')) return 'L';
  return '';
}

function cleanOdds(value: string): string | undefined {
  const odds = normalizeText(value);
  if (!odds) return undefined;
  if (!/\d/.test(odds)) return undefined;
  if (/^[\-\*]+(?:\.[\-\*]+)?$/.test(odds)) return undefined;
  return odds;
}

function parsePopularity(value: string): number | undefined {
  const popularity = parseInt(normalizeText(value), 10);
  return popularity > 0 ? popularity : undefined;
}

export async function scrapeRaceMeta(raceId: string): Promise<RaceMeta> {
  const url = `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`;
  const html = await fetchEucJp(url);
  const $ = cheerio.load(html);

  const raceName = normalizeText(
    $('h1.RaceName').first().clone().children().remove().end().text()
  );
  const raceData = normalizeText($('.RaceData01').first().text());
  const raceData2 = normalizeText($('.RaceData02').first().text());
  const startTime = raceData.match(/(\d{1,2}:\d{2})発走/)?.[1];
  const course = raceData.match(/(芝|ダ|ダート)(\d+)m/) ?? null;
  const direction = raceData.match(/\((右|左|直線|右外|左外)[^)]*\)/)?.[1];
  const horseCount = parseInt(raceData2.match(/(\d+)頭/)?.[1] ?? '', 10) || undefined;

  return {
    name: raceName,
    startTime,
    horseCount,
    distance: course ? parseInt(course[2], 10) : undefined,
    surface: course ? (course[1] === '芝' ? 'turf' : 'dirt') : undefined,
    direction,
    grade: parseGrade($),
  };
}

// Shutuba page structure (EUC-JP):
//   tr.HorseList
//     td[class*="Waku"] span    → 枠番
//     td[class*="Umaban"]       → 馬番
//     span.HorseName a          → 馬名 / href="https://db.netkeiba.com/horse/HORSEID"
//     td.Barei                  → 性齢 e.g. "牝3"
//     td.Txt_C (after Barei)    → 斤量
//     td.Jockey a               → 騎手名 / href contains jockey ID
//     td.Trainer a              → 調教師名 / href contains trainer ID
export async function scrapeShutuba(raceId: string): Promise<HorseEntry[]> {
  const url = `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`;
  console.log(`Scraping shutuba: ${url}`);

  const html = await fetchEucJp(url);
  const $ = cheerio.load(html);
  const entries: HorseEntry[] = [];

  $('tr.HorseList').each((_, el) => {
    const row = $(el);

    const gateCell = row.find('td[class*="Waku"]').first();
    const gateNumber = parseInt(gateCell.find('span').text().trim(), 10) || 0;
    const horseNumber = parseInt(row.find('td[class*="Umaban"]').first().text().trim(), 10) || 0;

    const horseLink = row.find('span.HorseName a').first();
    const horseName = horseLink.text().trim();
    const horseHref = horseLink.attr('href') ?? '';
    const horseIdMatch = horseHref.match(/horse\/(\d+)/);
    const horseId = horseIdMatch ? horseIdMatch[1] : '';

    const bareiText = row.find('td.Barei').text().trim();
    const sex = bareiText.replace(/\d/g, '').trim();
    const age = parseInt(bareiText.replace(/\D/g, ''), 10) || 0;

    const weightText = row.find('td.Barei').next('td').text().trim();
    const weight = parseFloat(weightText) || 0;

    const jockeyLink = row.find('td.Jockey a').first();
    const jockey = jockeyLink.text().trim();
    const jockeyHref = jockeyLink.attr('href') ?? '';
    const jockeyIdMatch = jockeyHref.match(/jockey\/(?:result\/recent\/)?(\d+)/);
    const jockeyId = jockeyIdMatch ? jockeyIdMatch[1] : '';

    const trainerLink = row.find('td.Trainer a').first();
    const trainer = trainerLink.text().trim();
    const trainerHref = trainerLink.attr('href') ?? '';
    const trainerIdMatch = trainerHref.match(/trainer\/(?:result\/recent\/)?(\d+)/);
    const trainerId = trainerIdMatch ? trainerIdMatch[1] : '';

    // オッズ (単勝) and 人気 — only available after betting opens
    const odds = cleanOdds(
      row.find('td.Odds').first().text() ||
      row.find('span.Odds').first().text()
    );
    const popularity = parsePopularity(
      row.find('td.Popular_Ninki').first().text() ||
      row.find('td.Ninki').first().text()
    );

    if (horseNumber > 0 && horseName) {
      entries.push({ gateNumber, horseNumber, horseId, horseName, sex, age, weight, jockey, jockeyId, trainer, trainerId, odds, popularity });
    }
  });

  entries.sort((a, b) => a.horseNumber - b.horseNumber);

  if (entries.length > 0) {
    const stats = await fetchResultStats(raceId);
    if (stats.size > 0) {
      entries.forEach(e => {
        const stat = stats.get(e.horseNumber);
        if (!stat) return;
        if (stat.placement) e.placement = stat.placement;
        if (!e.odds && stat.odds) e.odds = stat.odds;
        if (e.popularity == null && stat.popularity != null) e.popularity = stat.popularity;
      });
    }
  }

  return entries;
}

// Fetch finishing positions from race result page.
// result.html uses EUC-JP. Current rows use td.Result_Num .Rank for 着順
// and td.Num.Txt_C for 馬番.
async function fetchResultStats(raceId: string): Promise<Map<number, Pick<HorseEntry, 'placement' | 'odds' | 'popularity'>>> {
  const url = `https://race.netkeiba.com/race/result.html?race_id=${raceId}`;
  const stats = new Map<number, Pick<HorseEntry, 'placement' | 'odds' | 'popularity'>>();
  try {
    console.log(`Fetching result stats: ${url}`);
    const html = await fetchEucJp(url);
    const $ = cheerio.load(html);

    $('tr.HorseList').each((_, el) => {
      const row = $(el);
      let placement = row.find('td.Result_Num .Rank').first().text().trim();
      if (!placement) {
        placement = row.find('td.Result_Num').first().text().trim();
      }
      if (!placement) {
        placement = row.children('td').first().text().trim();
      }

      const horseNumber =
        parseInt(row.find('td.Num.Txt_C').first().text().trim(), 10) ||
        parseInt(row.find('td[class*="Umaban"]').first().text().trim(), 10);

      const odds = cleanOdds(
        row.find('td.Odds').first().text() ||
        row.find('span.Odds').first().text()
      );
      const popularity = parsePopularity(
        row.find('td.Popular_Ninki').first().text() ||
        row.find('td.Ninki').first().text() ||
        row.find('td.Popular').first().text()
      );

      if (horseNumber > 0 && (placement || odds || popularity != null)) {
        stats.set(horseNumber, { placement, odds, popularity });
      }
    });
  } catch (err) {
    console.error(`fetchResultStats error (${raceId}):`, err);
  }
  return stats;
}
