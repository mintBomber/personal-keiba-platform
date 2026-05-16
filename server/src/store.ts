import fs from 'fs';
import path from 'path';
import { RaceScheduleDay, Race, HorseEntry, HorseDetail, HorseSearchResult, FavoriteHorse, RaceMeta, RacePick } from './types';

const DATA_DIR = path.join(__dirname, '../data');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function keyToFileName(key: string): string {
  return Buffer.from(key, 'utf-8').toString('base64url');
}

// ── Schedule ──────────────────────────────────────────────

export function loadSchedule(year: number, month: number): RaceScheduleDay[] | null {
  const file = path.join(DATA_DIR, 'schedule', `${year}-${String(month).padStart(2, '0')}.json`);
  return readJson<RaceScheduleDay[]>(file);
}

export function saveSchedule(year: number, month: number, data: RaceScheduleDay[]): void {
  const file = path.join(DATA_DIR, 'schedule', `${year}-${String(month).padStart(2, '0')}.json`);
  writeJson(file, data);
}

// ── Daily races ───────────────────────────────────────────

export function loadRaces(date: string): Race[] | null {
  const file = path.join(DATA_DIR, 'races', `${date}.json`);
  return readJson<Race[]>(file);
}

export function saveRaces(date: string, races: Race[]): void {
  const file = path.join(DATA_DIR, 'races', `${date}.json`);
  writeJson(file, races);
}

// ── Race metadata and picks ───────────────────────────────

export function loadRaceMeta(raceId: string): RaceMeta | null {
  const file = path.join(DATA_DIR, 'race-meta', `${raceId}.json`);
  return readJson<RaceMeta>(file);
}

export function saveRaceMeta(raceId: string, meta: RaceMeta): void {
  const file = path.join(DATA_DIR, 'race-meta', `${raceId}.json`);
  writeJson(file, meta);
}

export function loadRacePicks(raceId: string): RacePick | null {
  const file = path.join(DATA_DIR, 'race-picks', `${raceId}.json`);
  return readJson<RacePick>(file);
}

export function saveRacePicks(raceId: string, picks: RacePick): void {
  const file = path.join(DATA_DIR, 'race-picks', `${raceId}.json`);
  writeJson(file, picks);
}

// ── Shutuba (entry list per race) ─────────────────────────

export function loadShutuba(raceId: string): HorseEntry[] | null {
  const file = path.join(DATA_DIR, 'shutuba', `${raceId}.json`);
  return readJson<HorseEntry[]>(file);
}

export function saveShutuba(raceId: string, entries: HorseEntry[]): void {
  const file = path.join(DATA_DIR, 'shutuba', `${raceId}.json`);
  writeJson(file, entries);
}

// ── Horse detail ──────────────────────────────────────────

export function loadHorse(horseId: string): HorseDetail | null {
  const file = path.join(DATA_DIR, 'horses', `${horseId}.json`);
  return readJson<HorseDetail>(file);
}

export function saveHorse(horseId: string, detail: HorseDetail): void {
  const file = path.join(DATA_DIR, 'horses', `${horseId}.json`);
  writeJson(file, detail);
}

// ── Horse search and favorites ────────────────────────────

export function loadHorseSearchResults(query: string): HorseSearchResult[] | null {
  const file = path.join(DATA_DIR, 'horse-search', `${keyToFileName(query)}.json`);
  return readJson<HorseSearchResult[]>(file);
}

export function saveHorseSearchResults(query: string, results: HorseSearchResult[]): void {
  const file = path.join(DATA_DIR, 'horse-search', `${keyToFileName(query)}.json`);
  writeJson(file, results);
}

export function loadFavoriteHorses(): FavoriteHorse[] {
  const file = path.join(DATA_DIR, 'favorite-horses.json');
  return readJson<FavoriteHorse[]>(file) ?? [];
}

export function saveFavoriteHorses(favorites: FavoriteHorse[]): void {
  const file = path.join(DATA_DIR, 'favorite-horses.json');
  writeJson(file, favorites);
}
