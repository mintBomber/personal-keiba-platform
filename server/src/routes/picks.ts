import { Router, Request, Response } from 'express';
import { getRacePicks } from '../scrapers/netkeiba';

const router = Router();

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
    const picks = await getRacePicks(raceId);
    res.json(picks);
  } catch (err) {
    console.error('Picks fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch picks' });
  }
});

export default router;
