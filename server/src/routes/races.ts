import { Router, Request, Response } from 'express';
import { loadSettings } from './settings';
import {
  deleteRaceMeta,
  deleteRacePicks,
  deleteShutuba,
  deleteUserRacePicks,
  findDeletedRaceEvent,
  loadDeletedRaceEvents,
  loadDeletedRaceIds,
  loadSchedule,
  loadRaces,
  loadShutuba,
  markDeletedRace,
  saveSchedule,
  saveRaces,
  saveShutuba,
  unmarkDeletedRace,
} from '../store';
import { fetchRaw } from '../scrapers/netkeiba';
import { HorseEntry, Race, TRACK_ID_TO_NAME } from '../types';

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

function isSafeRaceId(raceId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(raceId);
}

function emptyPicks() {
  return { honmei: '---', taikou: '---', tanana: '---' };
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

function sortRaces(races: Race[]): Race[] {
  return [...races].sort((a, b) => {
    const course = a.racecourse.localeCompare(b.racecourse, 'ja');
    if (course !== 0) return course;
    return a.raceNumber - b.raceNumber;
  });
}

function filterDeletedRaces(races: Race[]): Race[] {
  const deleted = new Set(loadDeletedRaceIds());
  return races.filter(race => !deleted.has(race.id));
}

function mergeStoredLocalOverrides(races: Race[], stored: Race[] | null): Race[] {
  if (!stored) return races;
  const byId = new Map(races.map(race => [race.id, race]));
  for (const race of stored) {
    if (race.manual || !/^\d{12}$/.test(race.id)) {
      byId.set(race.id, race);
    }
  }
  return sortRaces([...byId.values()]);
}

function normalizeEntry(entry: Partial<HorseEntry>, index: number): HorseEntry {
  const horseNumber = Number(entry.horseNumber) || index + 1;
  const gateNumber = Number(entry.gateNumber) || Math.ceil(horseNumber / 2);
  const popularity = Math.max(1, Number(entry.popularity) || 0) || undefined;

  return {
    gateNumber: Math.max(1, gateNumber),
    horseNumber: Math.max(1, horseNumber),
    horseId: typeof entry.horseId === 'string' ? entry.horseId : '',
    horseName: typeof entry.horseName === 'string' ? entry.horseName.trim() : '',
    sex: typeof entry.sex === 'string' ? entry.sex.trim() : '',
    age: Math.max(0, Number(entry.age) || 0),
    weight: Math.max(0, Number(entry.weight) || 0),
    weightDiff: Number(entry.weightDiff) || undefined,
    placement: typeof entry.placement === 'string' && entry.placement.trim() ? entry.placement.trim() : undefined,
    jockey: typeof entry.jockey === 'string' ? entry.jockey.trim() : '',
    jockeyId: typeof entry.jockeyId === 'string' ? entry.jockeyId : '',
    trainer: typeof entry.trainer === 'string' ? entry.trainer.trim() : '',
    trainerId: typeof entry.trainerId === 'string' ? entry.trainerId : '',
    odds: typeof entry.odds === 'string' && entry.odds.trim() ? entry.odds.trim() : undefined,
    popularity,
  };
}

function normalizeManualRace(rawRace: Partial<Race>, entries: HorseEntry[]): Race {
  const date = typeof rawRace.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawRace.date)
    ? rawRace.date
    : todayStr();
  const draftId = typeof rawRace.id === 'string' ? rawRace.id : '';
  const id = draftId && !draftId.startsWith('manual-draft-')
    ? draftId
    : `manual-${date}-${Date.now()}`;
  const racecourseId = rawRace.racecourseId || '05';
  const racecourse = rawRace.racecourse || TRACK_ID_TO_NAME[racecourseId] || '';
  const enteredCount = entries.filter(entry => entry.horseName || entry.jockey || entry.trainer).length;
  const raceNumber = Math.max(1, Number(rawRace.raceNumber) || 1);
  const horseCount = Math.max(1, Number(rawRace.horseCount) || enteredCount || entries.length || 1);
  const distance = Math.max(1, Number(rawRace.distance) || 1);
  const direction = rawRace.direction === '右' || rawRace.direction === '左' ? rawRace.direction : '';
  const startTime = typeof rawRace.startTime === 'string' && /^\d{2}:\d{2}$/.test(rawRace.startTime)
    ? rawRace.startTime
    : undefined;

  return {
    id,
    raceNumber,
    name: typeof rawRace.name === 'string' && rawRace.name.trim() ? rawRace.name.trim() : '手動登録レース',
    date,
    racecourseId,
    racecourse,
    horseCount,
    distance,
    surface: rawRace.surface === 'dirt' ? 'dirt' : 'turf',
    direction,
    grade: rawRace.grade,
    startTime,
    manual: true,
    picks: rawRace.picks ?? emptyPicks(),
  };
}

// POST /api/races/manual
router.post('/races/manual', (req: Request, res: Response) => {
  const rawRace = req.body?.race as Partial<Race> | undefined;
  const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries as Partial<HorseEntry>[] : [];

  if (!rawRace) {
    res.status(400).json({ error: 'race required' });
    return;
  }

  const entries = rawEntries.map(normalizeEntry);
  const race = normalizeManualRace(rawRace, entries);
  if (!isSafeRaceId(race.id)) {
    res.status(400).json({ error: 'Invalid race ID' });
    return;
  }

  const races = loadRaces(race.date) ?? [];
  const byId = new Map(races.map(item => [item.id, item]));
  byId.set(race.id, race);
  saveRaces(race.date, sortRaces([...byId.values()]));
  saveShutuba(race.id, entries);
  unmarkDeletedRace(race.id);

  res.json({ race, entries });
});

// DELETE /api/races/:raceId?date=YYYY-MM-DD
router.delete('/races/:raceId', (req: Request, res: Response) => {
  const { raceId } = req.params;
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  if (!isSafeRaceId(raceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid race ID or date' });
    return;
  }

  const races = loadRaces(date) ?? [];
  const race = races.find(item => item.id === raceId);
  if (race) {
    markDeletedRace(race, loadShutuba(raceId) ?? []);
  }
  saveRaces(date, races.filter(item => item.id !== raceId));
  deleteShutuba(raceId);
  deleteRaceMeta(raceId);
  deleteRacePicks(raceId);
  deleteUserRacePicks(raceId);
  res.status(204).send();
});

// GET /api/races/deleted
router.get('/races/deleted', (_req: Request, res: Response) => {
  res.json(loadDeletedRaceEvents());
});

// POST /api/races/deleted/:raceId/restore
router.post('/races/deleted/:raceId/restore', (req: Request, res: Response) => {
  const { raceId } = req.params;
  if (!isSafeRaceId(raceId)) {
    res.status(400).json({ error: 'Invalid race ID' });
    return;
  }

  const event = findDeletedRaceEvent(raceId);
  if (!event) {
    res.status(404).json({ error: 'Deleted race not found' });
    return;
  }

  const races = loadRaces(event.race.date) ?? [];
  const byId = new Map(races.map(race => [race.id, race]));
  byId.set(event.race.id, event.race);
  saveRaces(event.race.date, sortRaces([...byId.values()]));
  saveShutuba(event.race.id, event.entries);
  unmarkDeletedRace(event.race.id);
  res.json(event);
});

// GET /api/schedule/:year/:month
// Returns locally saved schedule only. Network refresh happens only via /api/update.
router.get('/schedule/:year/:month', async (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Invalid year or month' });
    return;
  }

  const stored = loadSchedule(year, month);

  res.json(stored ?? []);
});

// GET /api/races/:date
// Returns locally saved race list only. Network refresh happens only via /api/update.
router.get('/races/:date', async (req: Request, res: Response) => {
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid date format' });
    return;
  }

  const stored = loadRaces(date);
  res.json(filterDeletedRaces(stored ?? []));
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
