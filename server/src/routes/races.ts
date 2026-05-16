import { Router, Request, Response } from 'express';
import { loadSettings } from './settings';
import { loadSchedule, loadRaces, saveSchedule, saveRaces } from '../store';
import { fetchRaw, getDayRaces, getMonthlySchedule } from '../scrapers/netkeiba';
import { getJraDayRaces, getJraMonthlySchedule, mergeScheduleDays } from '../scrapers/jraCalendar';
import { Race } from '../types';

const router = Router();

function isCurrentOrFutureMonth(year: number, month: number): boolean {
  const now = new Date();
  const currentKey = now.getFullYear() * 100 + now.getMonth() + 1;
  const requestedKey = year * 100 + month;
  return requestedKey >= currentKey;
}

function hasDetailedRaceIds(races: Race[]): boolean {
  return races.some(race => /^\d{12}$/.test(race.id));
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// GET /api/schedule/:year/:month
// Returns schedule; current/future months are refreshed on demand.
router.get('/schedule/:year/:month', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Invalid year or month' });
    return;
  }

  const stored = loadSchedule(year, month);

  if (!isCurrentOrFutureMonth(year, month) && stored) {
    res.json(stored);
    return;
  }

  try {
    const { favoriteTrackIds } = loadSettings();
    const [netkeibaSchedule, jraSchedule] = await Promise.all([
      getMonthlySchedule(year, month, favoriteTrackIds),
      getJraMonthlySchedule(year, month, favoriteTrackIds),
    ]);
    const schedule = mergeScheduleDays(netkeibaSchedule, jraSchedule);
    saveSchedule(year, month, schedule);
    res.json(schedule);
  } catch (err) {
    console.error(`Schedule fetch error ${year}/${month}:`, err);
    res.json(stored ?? []);
  }
});

// GET /api/races/:date
// Returns saved race list; if missing or empty, fetches the selected day on demand.
router.get('/races/:date', async (req: Request, res: Response) => {
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid date format' });
    return;
  }

  const stored = loadRaces(date);
  const today = todayStr();
  if (date < today && stored && stored.length > 0 && hasDetailedRaceIds(stored)) {
    res.json(stored);
    return;
  }

  try {
    const { favoriteTrackIds } = loadSettings();
    const races = await getDayRaces(date, favoriteTrackIds, true);
    const officialRaces = date >= today ? await getJraDayRaces(date, favoriteTrackIds) : [];
    const baseRaces = races.length > 0 ? races : (stored ?? []);
    const mergedRaces = mergeOfficialFallbacks(baseRaces, officialRaces);
    if (mergedRaces.length > 0) {
      saveRaces(date, mergedRaces);
      res.json(mergedRaces);
      return;
    }

    res.json(stored ?? []);
  } catch (err) {
    console.error(`Race fetch error ${date}:`, err);
    res.json(stored ?? []);
  }
});

// GET /api/debug/fetch?url=... (dev only)
router.get('/debug/fetch', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: 'url required' }); return; }
  try {
    const html = await fetchRaw(url);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
