import { Router, Request, Response } from 'express';
import { getRacePicks } from '../scrapers/netkeiba';
import { cache } from '../cache';
import { loadRacePicks, saveRacePicks } from '../store';

const router = Router();

function hasMeaningfulPicks(picks: Awaited<ReturnType<typeof getRacePicks>>): boolean {
  return picks.honmei !== '---' || picks.taikou !== '---' || picks.tanana !== '---';
}

// GET /api/picks/:raceId
// Returns odds-based popularity picks (1番人気/2番人気/3番人気) for a race.
// Returns "---" when betting hasn't opened yet (far-future races).
router.get('/:raceId', async (req: Request, res: Response) => {
  const { raceId } = req.params;

  if (!/^\d{12}$/.test(raceId)) {
    res.status(400).json({ error: 'Invalid race ID' });
    return;
  }

  try {
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    if (forceRefresh) {
      cache.delete(`picks:${raceId}`);
    } else {
      const stored = loadRacePicks(raceId);
      if (stored && hasMeaningfulPicks(stored)) {
        res.json(stored);
        return;
      }
    }

    const picks = await getRacePicks(raceId);
    if (hasMeaningfulPicks(picks)) {
      saveRacePicks(raceId, picks);
    }
    res.json(picks);
  } catch (err) {
    console.error('Picks fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch picks' });
  }
});

export default router;
