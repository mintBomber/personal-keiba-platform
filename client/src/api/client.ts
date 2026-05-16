import axios from 'axios';
import { Race, RaceScheduleDay, Settings, HorseEntry, HorseDetail, UpdateResult, RacePick } from '../types';

const api = axios.create({ baseURL: '/api', timeout: 30000 });
// Update can take several minutes (3 years of data on first run)
const updateApi = axios.create({ baseURL: '/api', timeout: 900000 });

export async function fetchSchedule(year: number, month: number): Promise<RaceScheduleDay[]> {
  const { data } = await api.get<RaceScheduleDay[]>(`/schedule/${year}/${month}`);
  return data;
}

export async function fetchRaces(date: string): Promise<Race[]> {
  const { data } = await api.get<Race[]>(`/races/${date}`);
  return data;
}

export async function fetchSettings(): Promise<Settings> {
  const { data } = await api.get<Settings>('/settings');
  return data;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await api.post('/settings', settings);
}

export async function runUpdate(): Promise<UpdateResult> {
  const { data } = await updateApi.post<UpdateResult>('/update');
  return data;
}

export async function fetchShutuba(raceId: string): Promise<HorseEntry[]> {
  const { data } = await api.get<HorseEntry[]>(`/shutuba/${raceId}`);
  return data;
}

export async function fetchHorse(horseId: string): Promise<HorseDetail> {
  const { data } = await api.get<HorseDetail>(`/horses/${horseId}`);
  return data;
}

export async function fetchPicks(raceId: string): Promise<RacePick> {
  const { data } = await api.get<RacePick>(`/picks/${raceId}`);
  return data;
}
