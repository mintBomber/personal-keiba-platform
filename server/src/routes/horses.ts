import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { scrapeHorse, searchHorse } from '../scrapers/horse';
import {
  loadFavoriteHorses,
  loadHorse,
  loadHorseSearchResults,
  saveFavoriteHorses,
  saveHorse,
  saveHorseSearchResults,
} from '../store';
import type { FavoriteHorse, HorseDetail } from '../types';

const router = Router();
const HORSES_DIR = path.join(__dirname, '../../data/horses');

function sortFavorites(favorites: FavoriteHorse[]): FavoriteHorse[] {
  return [...favorites].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

// GET /api/horses/favorites
router.get('/favorites', (_req: Request, res: Response) => {
  res.json(sortFavorites(loadFavoriteHorses()));
});

// POST /api/horses/favorites/:horseId
router.post('/favorites/:horseId', (req: Request, res: Response) => {
  const { horseId } = req.params;
  const horseName = typeof req.body?.horseName === 'string' ? req.body.horseName.trim() : '';

  if (!/^\d+$/.test(horseId) || !horseName) {
    res.status(400).json({ error: 'horseId and horseName required' });
    return;
  }

  const favorites = loadFavoriteHorses();
  const withoutCurrent = favorites.filter(f => f.horseId !== horseId);
  const favorite: FavoriteHorse = { horseId, horseName, addedAt: new Date().toISOString() };
  saveFavoriteHorses([favorite, ...withoutCurrent]);
  res.json(favorite);
});

// DELETE /api/horses/favorites/:horseId
router.delete('/favorites/:horseId', (req: Request, res: Response) => {
  const { horseId } = req.params;
  if (!/^\d+$/.test(horseId)) {
    res.status(400).json({ error: 'Invalid horse ID' });
    return;
  }

  saveFavoriteHorses(loadFavoriteHorses().filter(f => f.horseId !== horseId));
  res.status(204).send();
});

// GET /api/horses/search?name=xxx  — must come before /:horseId
router.get('/search', async (req: Request, res: Response) => {
  const name = req.query.name;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const query = name.trim();

  try {
    const cachedResults = loadHorseSearchResults(query);
    if (cachedResults && cachedResults.length > 0) {
      res.json(cachedResults);
      return;
    }

    const localResults: { horseId: string; horseName: string }[] = [];
    if (fs.existsSync(HORSES_DIR)) {
      const files = fs.readdirSync(HORSES_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(HORSES_DIR, file), 'utf-8');
            const data = JSON.parse(raw);
            if (data.horseName && data.horseName.includes(query)) {
              localResults.push({ horseId: data.horseId, horseName: data.horseName });
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }

    const remoteResults = await searchHorse(query);
    if (remoteResults.length > 0) {
      saveHorseSearchResults(query, remoteResults);
      res.json(remoteResults);
      return;
    }

    if (localResults.length > 0) {
      saveHorseSearchResults(query, localResults);
    }
    res.json(localResults);
  } catch (err) {
    console.error('Horse search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

function hasUsableHorseDetail(detail: HorseDetail): boolean {
  return Boolean(detail.horseName && detail.races.length > 0 && detail.sex && detail.age > 0);
}

// GET /api/horses/:horseId
// Returns horse detail. Reads from store first; fetches if missing.
router.get('/:horseId', async (req: Request, res: Response) => {
  const { horseId } = req.params;
  const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';

  if (!/^\d+$/.test(horseId)) {
    res.status(400).json({ error: 'Invalid horse ID' });
    return;
  }

  const stored = loadHorse(horseId);
  // Use stored data only when it has meaningful content (not an empty-scrape artifact)
  if (!forceRefresh && stored && hasUsableHorseDetail(stored)) {
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
