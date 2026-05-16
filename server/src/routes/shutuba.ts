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

function hasCompletePlacements(entries: HorseEntry[]): boolean {
  return entries.length > 0 && entries.every(entry => entry.placement != null && entry.placement !== '');
}

// GET /api/shutuba/:raceId
router.get('/:raceId', async (req: Request, res: Response) => {
  const { raceId } = req.params;

  if (!/^\d{12}$/.test(raceId)) {
    res.status(400).json({ error: 'Invalid race ID' });
    return;
  }

  const stored = loadShutuba(raceId);

  // Cached past races from older scraper versions may be missing placements.
  // Re-scrape those once; result.html is empty before official results exist.
  if (stored && hasCompletePlacements(stored)) {
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
    if (stored) {
      res.json(attachWeightDiff(stored));
      return;
    }
    res.status(500).json({ error: 'Failed to fetch entry list' });
  }
});

export default router;
