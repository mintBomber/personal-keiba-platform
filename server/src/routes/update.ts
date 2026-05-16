import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { loadSettings } from './settings';
import { getMonthlySchedule, getDayRaces } from '../scrapers/netkeiba';
import { getJraDayRaces, getJraMonthlySchedule, mergeScheduleDays } from '../scrapers/jraCalendar';
import { saveSchedule, saveRaces, loadRaces } from '../store';
import { Race, RaceScheduleDay, UpdateResult } from '../types';
import { cache } from '../cache';

const router = Router();
const DATA_DIR = path.join(__dirname, '../../data');

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function batchProcess<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize = 3,
  delayMs = 300
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// Delete all schedule JSON files and flush in-memory schedule cache
function clearScheduleCache(): void {
  const dir = path.join(DATA_DIR, 'schedule');
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
  });
  cache.invalidateByPrefix('schedule:');
  console.log('Cleared schedule cache');
}

// Delete race files whose grade data may be stale (races in the past 14 days or future)
// These will be re-fetched to pick up the new grade detection logic
function clearRecentRaceCache(today: string): void {
  const dir = path.join(DATA_DIR, 'races');
  if (!fs.existsSync(dir)) return;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let deleted = 0;
  fs.readdirSync(dir).forEach(f => {
    const dateStr = f.replace('.json', '');
    if (dateStr >= cutoffStr) {
      fs.unlinkSync(path.join(dir, f));
      deleted++;
    }
  });
  console.log(`Cleared ${deleted} recent/future race cache files`);
}

// Rebuild schedule files from already-stored race data (track info derived from races)
function buildScheduleFromStoredRaces(
  year: number,
  month: number,
  trackIds: string[]
): RaceScheduleDay[] {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const racesDir = path.join(DATA_DIR, 'races');
  if (!fs.existsSync(racesDir)) return [];

  const schedule: RaceScheduleDay[] = [];
  const files = fs.readdirSync(racesDir)
    .filter(f => f.startsWith(monthStr) && f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const date = file.replace('.json', '');
    try {
      const races = JSON.parse(fs.readFileSync(path.join(racesDir, file), 'utf-8')) as Race[];
      if (!races || races.length === 0) continue;
      const trackMap = new Map<string, { id: string; name: string }>();
      for (const race of races) {
        if (!race.racecourseId || !race.racecourse) continue;
        if (trackIds.length > 0 && !trackIds.includes(race.racecourseId)) continue;
        if (!trackMap.has(race.racecourseId)) {
          trackMap.set(race.racecourseId, { id: race.racecourseId, name: race.racecourse });
        }
      }
      if (trackIds.length === 0 || trackMap.size > 0) {
        schedule.push({ date, tracks: [...trackMap.values()] });
      }
    } catch { /* skip corrupt files */ }
  }
  return schedule;
}

function hasStoredRaceDetails(date: string): boolean {
  const races = loadRaces(date);
  return races !== null && races.some(race => /^\d{12}$/.test(race.id));
}

function mergeOfficialFallbacks(races: Race[], officialRaces: Race[]): Race[] {
  if (officialRaces.length === 0) return races;
  const detailedTrackIds = new Set(
    races
      .filter(race => /^\d{12}$/.test(race.id))
      .map(race => race.racecourseId)
  );
  const existingIds = new Set(races.map(race => race.id));
  const supplements = officialRaces.filter(race =>
    !detailedTrackIds.has(race.racecourseId) && !existingIds.has(race.id)
  );
  return [...races, ...supplements];
}

// POST /api/update
// Schedule: past 36 months + future 24 months (db.netkeiba.com source — complete data)
// Race lists: all race days (skip already-stored; recent data always re-fetched)
router.post('/', async (_req: Request, res: Response) => {
  const settings = loadSettings();
  const { favoriteTrackIds } = settings;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const today = todayStr();

  // Always clear schedule cache to get fresh data from new scraper
  clearScheduleCache();
  // Clear recent race cache to refresh grade detection
  clearRecentRaceCache(today);

  // Build month list: -36 to +24 months
  const months: { year: number; month: number }[] = [];
  for (let i = -36; i <= 24; i++) {
    months.push(addMonths(curYear, curMonth, i));
  }

  let scheduleDays = 0;
  const allRaceDates: string[] = [];
  const schedulesByMonth = new Map<string, RaceScheduleDay[]>();

  // 1. Fetch all schedules (sequential)
  console.log(`Fetching schedules for ${months.length} months...`);
  for (const { year, month } of months) {
    try {
      const [netkeibaSchedule, jraSchedule] = await Promise.all([
        getMonthlySchedule(year, month, favoriteTrackIds),
        getJraMonthlySchedule(year, month, favoriteTrackIds),
      ]);
      const schedule = mergeScheduleDays(netkeibaSchedule, jraSchedule);
      schedulesByMonth.set(monthKey(year, month), schedule);
      saveSchedule(year, month, schedule);
      scheduleDays += schedule.length;
      for (const day of schedule) allRaceDates.push(day.date);
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`Schedule fetch error ${year}/${month}:`, err);
    }
  }

  const uniqueDates = [...new Set(allRaceDates)].sort();

  // 2. Fetch race detail for dates not yet stored
  //    Future dates first, then recent past (newest → oldest)
  const futureDates = uniqueDates.filter(d => d >= today);
  const pastDates   = uniqueDates.filter(d => d < today).reverse();
  const toFetch = [...futureDates, ...pastDates].filter(d => !hasStoredRaceDetails(d));

  console.log(`Race detail needed for ${toFetch.length} / ${uniqueDates.length} dates`);

  let raceDays   = 0;
  let totalRaces = 0;
  let fetchErrors = 0;

  await batchProcess(toFetch, async (date) => {
    try {
      let races = await getDayRaces(date, favoriteTrackIds, true);
      let source = 'netkeiba';
      if (date >= today) {
        const officialRaces = await getJraDayRaces(date, favoriteTrackIds);
        const mergedRaces = mergeOfficialFallbacks(races, officialRaces);
        if (mergedRaces.length > races.length) {
          source = races.length > 0 ? 'netkeiba + JRA calendar' : 'JRA calendar';
          races = mergedRaces;
        }
      }

      if (races.length > 0) {
        saveRaces(date, races);
        raceDays++;
        totalRaces += races.length;
        console.log(`  ✓ ${date}: ${races.length} races (${source})`);
      } else {
        console.log(`  - ${date}: race details not published yet`);
      }
    } catch (err) {
      fetchErrors++;
      console.error(`  ✗ ${date}:`, err);
    }
  }, 3, 250);

  // Add already-stored counts
  for (const date of uniqueDates) {
    if (!toFetch.includes(date)) {
      const stored = loadRaces(date);
      if (stored && stored.length > 0) {
        raceDays++;
        totalRaces += stored.length;
      }
    }
  }

  // Phase 3: Merge stored race-derived tracks into schedules without dropping
  // future dates whose race details are not published yet.
  console.log('Merging schedules with stored race data...');
  let mergedMonths = 0;
  let finalScheduleDays = 0;
  for (const { year, month } of months) {
    const base = schedulesByMonth.get(monthKey(year, month)) ?? [];
    const fromStored = buildScheduleFromStoredRaces(year, month, favoriteTrackIds);
    const merged = mergeScheduleDays(base, fromStored);
    saveSchedule(year, month, merged);
    finalScheduleDays += merged.length;
    mergedMonths++;
  }
  scheduleDays = finalScheduleDays;
  console.log(`Merged ${mergedMonths} schedule files`);

  const result: UpdateResult = {
    updatedAt: new Date().toISOString(),
    scheduleDays,
    raceDays,
    totalRaces,
  };

  console.log(`Update complete (${fetchErrors} errors):`, result);
  res.json(result);
});

export default router;
