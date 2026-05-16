import fs from 'fs';
import path from 'path';
import {
  RaceScheduleDay,
  Race,
  HorseEntry,
  HorseDetail,
  HorseSearchResult,
  FavoriteHorse,
  RaceMeta,
  RacePick,
  HorseMemo,
  DeletedRaceEvent,
  PurchasedTicket,
  BettingRecord,
} from './types';

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

function deleteJson(filePath: string): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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

// ── Deleted race markers ──────────────────────────────────

function deletedRaceFile(): string {
  return path.join(DATA_DIR, 'deleted-races.json');
}

function isDeletedEvent(value: unknown): value is DeletedRaceEvent {
  const event = value as DeletedRaceEvent;
  return Boolean(event?.race?.id && event?.race?.date && event.deletedAt);
}

export function loadDeletedRaceEvents(): DeletedRaceEvent[] {
  const file = deletedRaceFile();
  const raw = readJson<unknown[]>(file) ?? [];
  const events = raw.filter(isDeletedEvent);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const fresh = events.filter(event => new Date(event.deletedAt).getTime() >= cutoff);
  if (fresh.length !== events.length || raw.length !== events.length) {
    writeJson(file, fresh);
  }
  return fresh.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function loadDeletedRaceIds(): string[] {
  return loadDeletedRaceEvents().map(event => event.race.id);
}

export function markDeletedRace(race: Race, entries: HorseEntry[]): void {
  const events = loadDeletedRaceEvents().filter(event => event.race.id !== race.id);
  events.unshift({ race, entries, deletedAt: new Date().toISOString() });
  writeJson(deletedRaceFile(), events);
}

export function unmarkDeletedRace(raceId: string): void {
  const events = loadDeletedRaceEvents().filter(event => event.race.id !== raceId);
  writeJson(deletedRaceFile(), events);
}

export function findDeletedRaceEvent(raceId: string): DeletedRaceEvent | null {
  return loadDeletedRaceEvents().find(event => event.race.id === raceId) ?? null;
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

export function loadUserRacePicks(raceId: string): RacePick | null {
  const file = path.join(DATA_DIR, 'user-picks', `${keyToFileName(raceId)}.json`);
  return readJson<RacePick>(file);
}

export function saveUserRacePicks(raceId: string, picks: RacePick): RacePick {
  const saved: RacePick = { ...picks, source: '自分の予想' };
  const file = path.join(DATA_DIR, 'user-picks', `${keyToFileName(raceId)}.json`);
  writeJson(file, saved);
  return saved;
}

export function deleteUserRacePicks(raceId: string): void {
  deleteJson(path.join(DATA_DIR, 'user-picks', `${keyToFileName(raceId)}.json`));
}

export function deleteRaceMeta(raceId: string): void {
  deleteJson(path.join(DATA_DIR, 'race-meta', `${raceId}.json`));
}

export function deleteRacePicks(raceId: string): void {
  deleteJson(path.join(DATA_DIR, 'race-picks', `${raceId}.json`));
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

export function deleteShutuba(raceId: string): void {
  deleteJson(path.join(DATA_DIR, 'shutuba', `${raceId}.json`));
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

export function loadHorseMemo(horseId: string): HorseMemo {
  const file = path.join(DATA_DIR, 'horse-memos', `${horseId}.json`);
  return readJson<HorseMemo>(file) ?? { horseId, note: '', updatedAt: '' };
}

export function saveHorseMemo(horseId: string, note: string): HorseMemo {
  const memo: HorseMemo = { horseId, note, updatedAt: new Date().toISOString() };
  const file = path.join(DATA_DIR, 'horse-memos', `${horseId}.json`);
  writeJson(file, memo);
  return memo;
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

// ── Purchased tickets ─────────────────────────────────────

export function loadPurchasedTickets(raceId: string): PurchasedTicket[] {
  const file = path.join(DATA_DIR, 'purchased-tickets', `${keyToFileName(raceId)}.json`);
  return readJson<PurchasedTicket[]>(file) ?? [];
}

export function savePurchasedTickets(raceId: string, tickets: PurchasedTicket[]): void {
  const file = path.join(DATA_DIR, 'purchased-tickets', `${keyToFileName(raceId)}.json`);
  writeJson(file, tickets);
}

// ── Betting records (flat log for analysis) ───────────────

export function loadBettingRecords(): BettingRecord[] {
  const file = path.join(DATA_DIR, 'betting-records.json');
  return readJson<BettingRecord[]>(file) ?? [];
}

export function saveBettingRecords(records: BettingRecord[]): void {
  const file = path.join(DATA_DIR, 'betting-records.json');
  writeJson(file, records);
}
