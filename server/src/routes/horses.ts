import { Router, Request, Response } from 'express';
import { scrapeHorse } from '../scrapers/horse';
import { loadHorse, saveHorse } from '../store';

const router = Router();

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
  if (stored && stored.horseName && stored.races.length > 0) {
    res.json(stored);
    return;
  }

  try {
    const detail = await scrapeHorse(horseId);
    saveHorse(horseId, detail);
    res.json(detail);
  } catch (err) {
    console.error('Horse fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch horse details' });
  }
});

export default router;
