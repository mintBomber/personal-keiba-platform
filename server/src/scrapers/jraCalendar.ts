import axios from 'axios';
import { cache } from '../cache';
import { Race, RaceScheduleDay, TRACK_ID_TO_NAME, TRACK_NAME_TO_ID } from '../types';

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

interface JraCalendarRace {
  name?: string;
}

interface JraCalendarGradeRace {
  name?: string;
  detail?: string;
  pos?: string;
  grade?: string;
}

interface JraCalendarInfo {
  race?: JraCalendarRace[];
  gradeRace?: JraCalendarGradeRace[];
}

interface JraCalendarDay {
  date: string;
  info?: JraCalendarInfo[];
}

interface JraCalendarMonth {
  month: string;
  data?: JraCalendarDay[];
}

interface OfficialTrack {
  id: string;
  name: string;
  meetingName: string;
  position: number;
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

function extractTrackFromMeeting(meetingName: string): OfficialTrack | null {
  for (const [name, id] of Object.entries(TRACK_NAME_TO_ID)) {
    if (meetingName.includes(name)) {
      return { id, name, meetingName, position: 0 };
    }
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

async function fetchJraCalendarJson(year: number, month: number): Promise<JraCalendarMonth[]> {
  const cacheKey = `jra-calendar-json:${year}:${month}`;
  const cached = cache.get<JraCalendarMonth[]>(cacheKey);
  if (cached) return cached;

  const monthKey = `${year}${String(month).padStart(2, '0')}`;
  const url = `${JRA_CALENDAR_BASE}/json/${monthKey}.json`;
  const res = await axios.get<ArrayBuffer>(url, {
    headers: {
      ...HEADERS,
      'Accept': 'application/json,text/plain,*/*',
      'Referer': `https://www.jra.go.jp/keiba/calendar/${String(month).padStart(2, '0')}.html`,
    },
    responseType: 'arraybuffer',
    timeout: 20000,
  });

  const text = Buffer.from(res.data).toString('utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(text) as JraCalendarMonth[];
  cache.set(cacheKey, parsed, 24 * 60 * 60 * 1000);
  return parsed;
}

function getCalendarDays(monthData: JraCalendarMonth[], month: number): JraCalendarDay[] {
  const target = monthData.find(item => parseInt(item.month, 10) === month);
  return target?.data ?? [];
}

function extractOfficialTracks(info: JraCalendarInfo, trackIds: string[]): OfficialTrack[] {
  const tracks: OfficialTrack[] = [];
  (info.race ?? []).forEach((race, index) => {
    const meetingName = race.name?.trim() ?? '';
    if (!meetingName) return;

    const track = extractTrackFromMeeting(meetingName);
    if (!track) return;
    if (trackIds.length > 0 && !trackIds.includes(track.id)) return;

    tracks.push({ ...track, position: index + 1 });
  });
  return tracks;
}

function addJsonSchedule(
  scheduleByDate: Map<string, RaceScheduleDay>,
  year: number,
  month: number,
  trackIds: string[],
  monthData: JraCalendarMonth[],
): void {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  for (const day of getCalendarDays(monthData, month)) {
    const dayNumber = parseInt(day.date, 10);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) continue;

    const date = `${monthKey}-${String(dayNumber).padStart(2, '0')}`;
    for (const info of day.info ?? []) {
      const tracks = extractOfficialTracks(info, trackIds);
      if (tracks.length === 0) continue;

      const scheduleDay = scheduleByDate.get(date) ?? { date, tracks: [] };
      for (const track of tracks) addTrack(scheduleDay, track.id);
      scheduleByDate.set(date, scheduleDay);
    }
  }
}

function normalizeGrade(grade?: string): string {
  if (!grade) return '';
  return grade
    .replace(/[Ｇｇ]/g, 'G')
    .replace(/Ⅰ/g, '1')
    .replace(/Ⅱ/g, '2')
    .replace(/Ⅲ/g, '3')
    .trim();
}

function createOfficialRace(
  date: string,
  track: OfficialTrack,
  name: string,
  suffix: string,
  grade = '',
): Race {
  return {
    id: `jra-${date.replace(/-/g, '')}-${track.id}-${suffix}`,
    raceNumber: 0,
    name,
    date,
    racecourseId: track.id,
    racecourse: track.name,
    horseCount: 0,
    distance: 0,
    surface: 'turf',
    grade,
    picks: { honmei: '---', taikou: '---', tanana: '---' },
  };
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

  if (!unavailableYears.has(year)) {
    try {
      const ics = await fetchJraKaisaiIcs(year);
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
    } catch (err) {
      console.error(`JRA ICS calendar fetch error (${year}):`, err);
      unavailableYears.add(year);
    }
  }

  try {
    const monthData = await fetchJraCalendarJson(year, month);
    addJsonSchedule(scheduleByDate, year, month, trackIds, monthData);
  } catch (err) {
    console.error(`JRA monthly calendar fetch error (${year}/${month}):`, err);
  }

  const schedule = [...scheduleByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  cache.set(cacheKey, schedule, 24 * 60 * 60 * 1000);
  return schedule;
}

export async function getJraDayRaces(date: string, trackIds: string[]): Promise<Race[]> {
  const sortedTrackIds = [...trackIds].sort();
  const cacheKey = `jra-day-races:${date}:${sortedTrackIds.join(',')}`;
  const cached = cache.get<Race[]>(cacheKey);
  if (cached) return cached;

  const [yearRaw, monthRaw, dayRaw] = date.split('-');
  const year = parseInt(yearRaw, 10);
  const month = parseInt(monthRaw, 10);
  const dayNumber = parseInt(dayRaw, 10);
  if (!year || !month || !dayNumber) return [];

  try {
    const monthData = await fetchJraCalendarJson(year, month);
    const calendarDay = getCalendarDays(monthData, month)
      .find(day => parseInt(day.date, 10) === dayNumber);
    if (!calendarDay) return [];

    const races: Race[] = [];
    const seen = new Set<string>();

    for (const info of calendarDay.info ?? []) {
      const tracks = extractOfficialTracks(info, trackIds);
      if (tracks.length === 0) continue;

      const tracksByPosition = new Map<number, OfficialTrack>();
      for (const track of tracks) tracksByPosition.set(track.position, track);

      const gradeRacesByTrack = new Map<string, JraCalendarGradeRace[]>();
      for (const gradeRace of info.gradeRace ?? []) {
        const position = parseInt(gradeRace.pos ?? '', 10);
        const track = tracksByPosition.get(position);
        if (!track) continue;

        const current = gradeRacesByTrack.get(track.id) ?? [];
        current.push(gradeRace);
        gradeRacesByTrack.set(track.id, current);
      }

      for (const track of tracks) {
        const gradeRaces = gradeRacesByTrack.get(track.id) ?? [];
        if (gradeRaces.length === 0) {
          const race = createOfficialRace(date, track, track.meetingName, 'schedule');
          if (!seen.has(race.id)) {
            seen.add(race.id);
            races.push(race);
          }
          continue;
        }

        gradeRaces.forEach((gradeRace, index) => {
          const name = (gradeRace.detail || gradeRace.name || track.meetingName).trim();
          const race = createOfficialRace(
            date,
            track,
            name,
            `grade-${index + 1}`,
            normalizeGrade(gradeRace.grade),
          );
          if (!seen.has(race.id)) {
            seen.add(race.id);
            races.push(race);
          }
        });
      }
    }

    races.sort((a, b) => {
      const trackOrder = a.racecourse.localeCompare(b.racecourse, 'ja');
      return trackOrder !== 0 ? trackOrder : a.name.localeCompare(b.name, 'ja');
    });

    cache.set(cacheKey, races, 24 * 60 * 60 * 1000);
    return races;
  } catch (err) {
    console.error(`JRA day race fetch error (${date}):`, err);
    return [];
  }
}
