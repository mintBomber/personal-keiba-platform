import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Settings } from '../types';

const router = Router();
const SETTINGS_PATH = path.join(__dirname, '../../data/settings.json');

export function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return JSON.parse(raw) as Settings;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  // Default: all tracks selected
  return {
    favoriteTrackIds: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
  };
}

function saveSettings(settings: Settings): void {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  res.json(loadSettings());
});

// POST /api/settings
router.post('/', (req: Request, res: Response) => {
  const { favoriteTrackIds } = req.body as Partial<Settings>;

  if (!Array.isArray(favoriteTrackIds)) {
    res.status(400).json({ error: 'favoriteTrackIds must be an array' });
    return;
  }

  const settings: Settings = { favoriteTrackIds };
  saveSettings(settings);
  res.json({ success: true, settings });
});

export default router;
