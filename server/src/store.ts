import fs from 'fs';
import path from 'path';
import { RaceScheduleDay, Race, HorseEntry, HorseDetail } from './types';

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
