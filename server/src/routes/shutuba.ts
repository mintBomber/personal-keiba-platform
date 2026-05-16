import { Router, Request, Response } from 'express';
import { scrapeShutuba } from '../scrapers/shutuba';
import { loadShutuba, saveShutuba, loadHorse } from '../store';
import { HorseEntry } from '../types';

const router = Router();

function attachWeightDiff(entries: HorseEntry[]): HorseEntry[] {
  return entries.map(entry => {
    if (!entry.horseId || entry.weight <= 0) return entry;
    const horse = loadHorse(entry.horseId);
    if (!horse || horse.races.length === 0) return entry;
    const lastKinRyo = horse.races[0].kinRyo;
    if (lastKinRyo == null) return entry;
    const diff = entry.weight - lastKinRyo;
    return { ...entry, weightDiff: diff };
  });
}

// GET /api/shutuba/:raceId
router.get('/:raceId', async (req: Request, res: Response) => {
  const { raceId } = req.params;

  if (!/^\d{12}$/.test(raceId)) {
    res.status(400).json({ error: 'Invalid race ID' });
    return;
  }

  const stored = loadShutuba(raceId);
  const raceDate = raceId.slice(0, 8); // YYYYMMDD
  const todayNum = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const isPast = raceDate < todayNum;

  // For past races: return cached data only if placements are already stored.
  // If not, fall through to re-scrape (which will also fetch result.html).
  if (stored && (!isPast || stored.some(e => e.placement != null))) {
    res.json(attachWeightDiff(stored));
    return;
  }

  try {
    const entries = await scrapeShutuba(raceId);
    if (entries.length > 0) {
      saveShutuba(raceId, entries);
    }
    res.json(attachWeightDiff(entries));
  } catch (err) {
    console.error('Shutuba fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch entry list' });
  }
});

export default router;
