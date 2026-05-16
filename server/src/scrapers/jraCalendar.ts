import axios from 'axios';
import { cache } from '../cache';
import { RaceScheduleDay, TRACK_ID_TO_NAME, TRACK_NAME_TO_ID } from '../types';

const JRA_CALENDAR_BASE = 'https://www.jra.go.jp/keiba/common/calendar';
const unavailableYears = new Set<number>();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/calendar,text/plain,*/*',
  'Accept-Language': 'ja,en-US;q=0.7',
};

interface IcsEvent {
  start: string;
  end: string;
  summary: string;
}

function toDateString(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function addDays(raw: string, days: number): string {
  const d = new Date(Date.UTC(
    parseInt(raw.slice(0, 4), 10),
    parseInt(raw.slice(4, 6), 10) - 1,
    parseInt(raw.slice(6, 8), 10) + days,
  ));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function unfoldIcs(ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r?\n/);
}

function parseIcsEvents(ics: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;

  for (const line of unfoldIcs(ics)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start && current.end && current.summary) {
        events.push(current as IcsEvent);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const value = line.slice(line.indexOf(':') + 1).trim();
    if (line.startsWith('DTSTART')) current.start = value;
    else if (line.startsWith('DTEND')) current.end = value;
    else if (line.startsWith('SUMMARY')) current.summary = value;
  }

  return events;
}

function extractTrackId(summary: string): string | null {
  for (const [name, id] of Object.entries(TRACK_NAME_TO_ID)) {
    if (summary.includes(name)) return id;
  }
  return null;
}

function addTrack(day: RaceScheduleDay, trackId: string): void {
  if (day.tracks.some(track => track.id === trackId)) return;
  day.tracks.push({ id: trackId, name: TRACK_ID_TO_NAME[trackId] });
}

async function fetchJraKaisaiIcs(year: number): Promise<string> {
  const cacheKey = `jra-calendar:${year}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const url = `${JRA_CALENDAR_BASE}/jrakaisai${year}.ics`;
  const res = await axios.get<string>(url, {
    headers: HEADERS,
    timeout: 20000,
    responseType: 'text',
  });

  cache.set(cacheKey, res.data, 24 * 60 * 60 * 1000);
  return res.data;
}

export function mergeScheduleDays(...sources: RaceScheduleDay[][]): RaceScheduleDay[] {
  const byDate = new Map<string, RaceScheduleDay>();

  for (const source of sources) {
    for (const day of source) {
      const merged = byDate.get(day.date) ?? { date: day.date, tracks: [] };
      for (const track of day.tracks) {
        if (!merged.tracks.some(existing => existing.id === track.id)) {
          merged.tracks.push({ ...track });
        }
      }
      byDate.set(day.date, merged);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getJraMonthlySchedule(
  year: number,
  month: number,
  trackIds: string[],
): Promise<RaceScheduleDay[]> {
  const sortedTrackIds = [...trackIds].sort();
  const cacheKey = `jra-schedule:${year}:${month}:${sortedTrackIds.join(',')}`;
  const cached = cache.get<RaceScheduleDay[]>(cacheKey);
  if (cached) return cached;
  if (unavailableYears.has(year)) return [];

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const scheduleByDate = new Map<string, RaceScheduleDay>();
  let ics = '';
  try {
    ics = await fetchJraKaisaiIcs(year);
  } catch (err) {
    console.error(`JRA calendar fetch error (${year}):`, err);
    unavailableYears.add(year);
    const empty: RaceScheduleDay[] = [];
    cache.set(cacheKey, empty, 60 * 60 * 1000);
    return empty;
  }

  for (const event of parseIcsEvents(ics)) {
    const trackId = extractTrackId(event.summary);
    if (!trackId) continue;
    if (trackIds.length > 0 && !trackIds.includes(trackId)) continue;

    for (let raw = event.start; raw < event.end; raw = addDays(raw, 1)) {
      const date = toDateString(raw);
      if (!date.startsWith(monthKey)) continue;

      const day = scheduleByDate.get(date) ?? { date, tracks: [] };
      addTrack(day, trackId);
      scheduleByDate.set(date, day);
    }
  }

  const schedule = [...scheduleByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  cache.set(cacheKey, schedule, 24 * 60 * 60 * 1000);
  return schedule;
}
