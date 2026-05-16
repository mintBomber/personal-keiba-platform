import { Router, Request, Response } from 'express';
import { scrapeHorse } from '../scrapers/horse';
import { loadHorse, saveHorse } from '../store';
import type { HorseDetail } from '../types';

const router = Router();

function hasUsableHorseDetail(detail: HorseDetail): boolean {
  return Boolean(detail.horseName && detail.races.length > 0 && detail.sex && detail.age > 0);
}

// GET /api/horses/:horseId
// Returns horse detail. Reads from store first; fetches if missing.
router.get('/:horseId', async (req: Request, res: Response) => {
  const { horseId } = req.params;

  if (!/^\d+$/.test(horseId)) {
    res.status(400).json({ error: 'Invalid horse ID' });
    return;
  }

  const stored = loadHorse(horseId);
  // Use stored data only when it has meaningful content (not an empty-scrape artifact)
  if (stored && hasUsableHorseDetail(stored)) {
    res.json(stored);
    return;
  }

  try {
    const detail = await scrapeHorse(horseId);
    saveHorse(horseId, detail);
    res.json(detail);
  } catch (err) {
    console.error('Horse fetch error:', err);
    if (stored) {
      res.json(stored);
      return;
    }
    res.status(500).json({ error: 'Failed to fetch horse details' });
  }
});

export default router;
