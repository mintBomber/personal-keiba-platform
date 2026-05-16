import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { Race, RacePick, RaceScheduleDay, TRACK_NAME_TO_ID, TRACK_ID_TO_NAME } from '../types';
import { cache } from '../cache';
import { loadRaces } from '../store';

const RACE_URL = 'https://race.netkeiba.com';
const DB_URL   = 'https://db.netkeiba.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
};

async function fetchEucJp(url: string): Promise<string> {
  const res = await axios.get<ArrayBuffer>(url, {
    headers: { ...HEADERS, 'Referer': url.startsWith(DB_URL) ? DB_URL + '/' : RACE_URL + '/' },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  return iconv.decode(Buffer.from(res.data), 'EUC-JP');
}

async function fetchUtf8(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    headers: { ...HEADERS, 'Referer': RACE_URL + '/' },
    timeout: 15000,
  });
  return res.data;
}

// Extract track name from DataTitle like "2回 東京 7日目"
function extractTrackName(title: string): string {
  for (const name of Object.keys(TRACK_NAME_TO_ID)) {
    if (title.includes(name)) return name;
  }
  return '';
}

// ============================================================
// SCHEDULE
//
// Strategy 1: db.netkeiba.com/race/list/YYYYMM01/ — collect race-day links
//   and track data available on the selected day.
// Strategy 2: race.netkeiba.com/top/calendar.html — parse the monthly calendar
//   cells and their JyoName track labels. This page is EUC-JP.
// Strategy 3: derive track info from already-stored race files.
// ============================================================
export async function getMonthlySchedule(
  year: number,
  month: number,
  trackIds: string[]
): Promise<RaceScheduleDay[]> {
  const sorted = [...trackIds].sort();
  const cacheKey = `schedule:${year}:${month}:${sorted.join(',')}`;
  const cached = cache.get<RaceScheduleDay[]>(cacheKey);
  if (cached) return cached;

  const monthStr = `${year}${String(month).padStart(2, '0')}`;
  const raceDays = new Map<string, RaceScheduleDay>();

  function addDay(rawDate: string, trackCode: string) {
    const trackName = TRACK_ID_TO_NAME[trackCode];
    if (!trackName) return;
    if (!rawDate.startsWith(monthStr)) return;
    const dd = parseInt(rawDate.slice(6, 8), 10);
    if (dd < 1 || dd > 31) return;
    if (trackIds.length > 0 && !trackIds.includes(trackCode)) return;
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    if (!raceDays.has(date)) raceDays.set(date, { date, tracks: [] });
    const day = raceDays.get(date)!;
    if (!day.tracks.find(t => t.id === trackCode)) {
      day.tracks.push({ id: trackCode, name: trackName });
    }
  }

  function addDateOnly(rawDate: string) {
    if (!rawDate.startsWith(monthStr)) return;
    const dd = parseInt(rawDate.slice(6, 8), 10);
    if (dd < 1 || dd > 31) return;
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    if (!raceDays.has(date)) raceDays.set(date, { date, tracks: [] });
  }

  function parseDbTrackLinks(html: string, rawDateFilter?: string) {
    let m: RegExpExecArray | null;
    const re = /\/race\/sum\/(\d{2})\/(\d{8})\/?/g;
    while ((m = re.exec(html)) !== null) {
      if (!rawDateFilter || m[2] === rawDateFilter) addDay(m[2], m[1]);
    }
  }

  function shouldFetchDailyDbPages(): boolean {
    const now = new Date();
    const currentKey = now.getFullYear() * 100 + now.getMonth() + 1;
    const requestedKey = year * 100 + month;
    return requestedKey >= currentKey;
  }

  // === Strategy 1: db.netkeiba monthly list page ===
  for (const suffix of [`${monthStr}01/`, `${monthStr}/`]) {
    if (raceDays.size > 0) break;
    try {
      const url = `${DB_URL}/race/list/${suffix}`;
      console.log(`Fetching DB schedule: ${url}`);
      const html = await fetchEucJp(url);
      let m: RegExpExecArray | null;

      // Pattern A: /race/sum/TT/YYYYMMDD/
      parseDbTrackLinks(html);

      // Pattern B: kaisai_date=YYYYMMDD occurrence (collect dates at minimum)
      const reD = new RegExp(`kaisai_date=(${monthStr}\\d{2})`, 'g');
      while ((m = reD.exec(html)) !== null) addDateOnly(m[1]);

      // Pattern C: /race/list/YYYYMMDD/ calendar navigation links
      const reE = new RegExp(`/race/list/(${monthStr}\\d{2})/`, 'g');
      while ((m = reE.exec(html)) !== null) addDateOnly(m[1]);

      console.log(`DB schedule ${suffix}: ${raceDays.size} days found`);
    } catch (err) {
      console.error(`DB schedule error (${suffix}):`, err);
    }
  }

  // === Strategy 2: race.netkeiba calendar.html — ALWAYS runs to supplement ===
  // This page contains all race days for the month as calendar cells.
  // Running unconditionally (not just as fallback) ensures future months are complete.
  try {
    const calUrl = `${RACE_URL}/top/calendar.html?kaisai_date=${monthStr}01`;
    console.log(`Fetching calendar: ${calUrl}`);
    const html = await fetchEucJp(calUrl);
    const $ = cheerio.load(html);
    const seenDates = new Set<string>();
    const hasRequestedMonthLinks = new RegExp(`kaisai_date=${monthStr}\\d{2}`).test(html);

    if (hasRequestedMonthLinks) {
      $('.RaceCellBox').each((_, cell) => {
        const dayText = $(cell).find('.RaceKaisaiBox .Day').first().text().trim();
        const dayNumber = parseInt(dayText, 10);
        if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return;

        const rawDate = `${monthStr}${String(dayNumber).padStart(2, '0')}`;
        const trackNames = new Set<string>();
        $(cell).find('.RaceKaisaiBox .JyoName').each((_, el) => {
          const name = $(el).text().trim();
          if (name) trackNames.add(name);
        });

        if (trackNames.size === 0) {
          const href = $(cell).find('a[href*="kaisai_date="]').attr('href') ?? '';
          if (href.includes(`kaisai_date=${rawDate}`)) {
            seenDates.add(rawDate);
            addDateOnly(rawDate);
          }
          return;
        }

        seenDates.add(rawDate);
        for (const name of trackNames) {
          const id = TRACK_NAME_TO_ID[name];
          if (id) addDay(rawDate, id);
        }
      });
    } else {
      console.log(`Calendar did not include requested month ${monthStr}; skipping calendar cells`);
    }

    $('a[href*="kaisai_date="]').each((_, a) => {
      const href = $(a).attr('href') ?? '';
      const rawDate = href.match(/kaisai_date=(\d{8})/)?.[1];
      if (!rawDate || !rawDate.startsWith(monthStr) || seenDates.has(rawDate)) return;
      seenDates.add(rawDate);

      const trackNames = new Set<string>();
      $(a).find('.RaceKaisaiBox .JyoName').each((_, el) => {
        const name = $(el).text().trim();
        if (name) trackNames.add(name);
      });

      if (trackNames.size === 0) {
        addDateOnly(rawDate);
        return;
      }

      for (const name of trackNames) {
        const id = TRACK_NAME_TO_ID[name];
        if (id) addDay(rawDate, id);
      }
    });

    // Fallback for markup changes where links survive but the cell structure does not.
    let m: RegExpExecArray | null;
    const reDates = new RegExp(`kaisai_date=(${monthStr}\\d{2})`, 'g');
    while ((m = reDates.exec(html)) !== null) {
      if (!seenDates.has(m[1])) addDateOnly(m[1]);
    }

    console.log(`Calendar: ${raceDays.size} days total after merge`);
  } catch (err) {
    console.error('Calendar fetch error:', err);
  }

  // For current/future months, race.netkeiba often does not expose full future
  // details yet. The DB day page still contains /race/sum/{track}/{date}/ links.
  if (shouldFetchDailyDbPages()) {
    const missingTrackDates = Array.from(raceDays.values())
      .filter(day => day.tracks.length === 0)
      .map(day => day.date.replace(/-/g, ''));

    for (const rawDate of missingTrackDates) {
      try {
        const url = `${DB_URL}/race/list/${rawDate}/`;
        const html = await fetchEucJp(url);
        parseDbTrackLinks(html, rawDate);
        await new Promise(r => setTimeout(r, 80));
      } catch (err) {
        console.error(`DB daily schedule error (${rawDate}):`, err);
      }
    }
  }

  // === Strategy 3: derive track info from stored race data ===
  for (const [date, day] of raceDays.entries()) {
    if (day.tracks.length > 0) continue;
    const stored = loadRaces(date);
    if (!stored) continue;
    for (const race of stored) {
      if (race.racecourseId && race.racecourse) {
        if (!day.tracks.find(t => t.id === race.racecourseId)) {
          if (trackIds.length === 0 || trackIds.includes(race.racecourseId)) {
            day.tracks.push({ id: race.racecourseId, name: race.racecourse });
          }
        }
      }
    }
  }

  const result = Array.from(raceDays.values())
    .filter(d => trackIds.length === 0 || d.tracks.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  cache.set(cacheKey, result, 30 * 60 * 1000);
  return result;
}

// ============================================================
// RACE LIST  (UTF-8, from race_list_sub.html)
// Structure:
//   <dl class="RaceList_DataList">
//     <dt class="RaceList_DataHeader">
//       <p class="RaceList_DataTitle"><small>2回</small> 東京 <small>7日目</small></p>
//     </dt>
//     <dd class="RaceList_Data">
//       <ul>
//         <li class="RaceList_DataItem">
//           <a href="../race/shutuba.html?race_id=202605020701&rf=...">
//             <div class="Race_Num"><span>1R</span></div>
//             <div class="RaceList_ItemContent">
//               <div class="RaceList_ItemTitle"><span class="ItemTitle">3歳未勝利</span></div>
//               <div class="RaceData">
//                 <span class="RaceList_Itemtime">09:50</span>
//                 <span class="RaceList_ItemLong Dart">ダ1400m</span>  ← Dart=ダ, else=芝
//                 <span class="RaceList_Itemnumber">16頭</span>
//               </div>
//             </div>
//           </a>
//         </li>
//       </ul>
//     </dd>
//   </dl>
// ============================================================
export async function getDayRaces(date: string, trackIds: string[], skipPicks = false): Promise<Race[]> {
  const cacheKey = `races:${date}:${[...trackIds].sort().join(',')}`;
  const cached = cache.get<Race[]>(cacheKey);
  if (cached) return cached;

  const dateFormatted = date.replace(/-/g, '');
  const url = `${RACE_URL}/top/race_list_sub.html?kaisai_date=${dateFormatted}`;
  console.log(`Fetching race list: ${url}`);

  try {
    const html = await fetchUtf8(url);
    const $ = cheerio.load(html);
    const races: Race[] = [];

    // Process each track section (dl.RaceList_DataList)
    $('dl.RaceList_DataList').each((_, dl) => {
      const titleText = $(dl).find('p.RaceList_DataTitle').text().trim();
      const trackName = extractTrackName(titleText);
      const trackId = TRACK_NAME_TO_ID[trackName] ?? '';

      if (trackIds.length > 0 && !trackIds.includes(trackId)) return;

      $(dl).find('li.RaceList_DataItem').each((_, li) => {
        const link = $(li).find('a[href*="race_id="]').first();
        const href = link.attr('href') ?? '';
        const raceIdMatch = href.match(/race_id=(\w+)/);
        const raceId = raceIdMatch ? raceIdMatch[1] : '';

        // Race number: "1R" → 1
        const raceNumText = $(li).find('.Race_Num span').text().trim();
        const raceNumber = parseInt(raceNumText.replace(/[^\d]/g, ''), 10) || 0;

        // Race name
        const raceName = $(li).find('span.ItemTitle').text().trim();

        // Start time
        const startTime = $(li).find('span.RaceList_Itemtime').text().trim();

        // Distance + surface
        const distSpan = $(li).find('span.RaceList_ItemLong');
        const isDirt = distSpan.hasClass('Dart');
        const surface: 'turf' | 'dirt' = isDirt ? 'dirt' : 'turf';
        const distText = distSpan.text().trim(); // e.g. "ダ1400m" or "芝1600m"
        const distMatch = distText.match(/(\d+)m/);
        const distance = distMatch ? parseInt(distMatch[1], 10) : 0;

        // Horse count
        const horseText = $(li).find('span.RaceList_Itemnumber').text().trim(); // "16頭"
        const horseCount = parseInt(horseText.replace(/[^\d]/g, ''), 10) || 0;

        // Grade: check icon class first, then race name text
        let grade = '';
        const gradeIcon = $(li).find('[class*="Icon_GradeType"]');
        if (gradeIcon.length) {
          const cls = gradeIcon.attr('class') ?? '';
          if (cls.includes('GradeType1')) grade = 'G1';
          else if (cls.includes('GradeType2')) grade = 'G2';
          else if (cls.includes('GradeType3')) grade = 'G3';
          else if (cls.includes('GradeType15') || cls.includes('Listed')) grade = 'L';
        }
        if (!grade) {
          const gm = raceName.match(/\(?([GＧ][１1Ⅰ]|[GＧ][２2Ⅱ]|[GＧ][３3Ⅲ]|Listed)\)?/);
          if (gm) {
            const raw = gm[1];
            if (/[１1Ⅰ]/.test(raw)) grade = 'G1';
            else if (/[２2Ⅱ]/.test(raw)) grade = 'G2';
            else if (/[３3Ⅲ]/.test(raw)) grade = 'G3';
            else if (/Listed/.test(raw)) grade = 'L';
          }
        }

        if (raceNumber > 0) {
          races.push({
            id: raceId,
            raceNumber,
            name: raceName || `第${raceNumber}レース`,
            date,
            racecourseId: trackId,
            racecourse: trackName || TRACK_ID_TO_NAME[trackId] || '不明',
            horseCount,
            distance,
            surface,
            startTime,
            grade,
            picks: { honmei: '---', taikou: '---', tanana: '---' },
          });
        }
      });
    });

    // Fetch picks (horse entry names) in parallel batches
    if (!skipPicks) {
      const BATCH = 4;
      for (let i = 0; i < races.length; i += BATCH) {
        const batch = races.slice(i, i + BATCH);
        await Promise.all(batch.map(async race => {
          if (race.id) race.picks = await getRacePicks(race.id);
        }));
        if (i + BATCH < races.length) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }

    races.sort((a, b) => {
      const trackOrder = a.racecourse.localeCompare(b.racecourse, 'ja');
      return trackOrder !== 0 ? trackOrder : a.raceNumber - b.raceNumber;
    });

    cache.set(cacheKey, races, 5 * 60 * 1000);
    return races;
  } catch (err) {
    console.error('getDayRaces error:', err);
    return [];
  }
}

// ============================================================
// PICKS  — 1番人気/2番人気/3番人気 by odds ranking
//
// Past races:  result.html has a td.Ninki column with race-day popularity rank.
// Today/upcoming: shutuba.html shows td.Ninki once betting opens (race morning).
//   If betting hasn't opened yet td.Ninki is absent → returns "---" for all three.
//
// Both pages use EUC-JP and tr.HorseList / span.HorseName a structure.
// ============================================================
export async function getRacePicks(raceId: string): Promise<RacePick> {
  const cacheKey = `picks:${raceId}`;
  const cached = cache.get<RacePick>(cacheKey);
  if (cached) return cached;

  const raceDate = raceId.slice(0, 8); // YYYYMMDD
  const todayNum = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const isPast = raceDate < todayNum;

  const url = isPast
    ? `${RACE_URL}/race/result.html?race_id=${raceId}`
    : `${RACE_URL}/race/shutuba.html?race_id=${raceId}`;

  try {
    const html = await fetchEucJp(url);
    const $ = cheerio.load(html);

    const entries: { name: string; ninki: number }[] = [];
    $('tr.HorseList').each((_, el) => {
      const row = $(el);
      const name = row.find('span.HorseName a').first().text().trim();
      const ninki = parseInt(row.find('td.Ninki').first().text().trim(), 10);
      if (name && ninki > 0) entries.push({ name, ninki });
    });

    if (entries.length === 0) {
      return { honmei: '---', taikou: '---', tanana: '---' };
    }

    entries.sort((a, b) => a.ninki - b.ninki);

    const picks: RacePick = {
      honmei: entries[0]?.name ?? '---',
      taikou: entries[1]?.name ?? '---',
      tanana: entries[2]?.name ?? '---',
    };

    // Past picks are permanent; upcoming picks may change until post-time
    const ttl = isPast ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
    cache.set(cacheKey, picks, ttl);
    return picks;
  } catch {
    return { honmei: '---', taikou: '---', tanana: '---' };
  }
}

export async function fetchRaw(url: string): Promise<string> {
  try {
    return await fetchUtf8(url);
  } catch {
    return await fetchEucJp(url);
  }
}
