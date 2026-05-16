import axios from 'axios';
import {
  Race, RaceScheduleDay, Settings, HorseEntry, HorseDetail, UpdateResult, RacePick,
  HorseSearchResult, RaceMeta, FavoriteHorse, HorseMemo, DeletedRaceEvent,
  PurchasedTicket, TicketType, PurchaseType, BettingRecord,
} from '../types';

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

export async function saveManualRace(race: Race, entries: HorseEntry[]): Promise<{ race: Race; entries: HorseEntry[] }> {
  const { data } = await api.post<{ race: Race; entries: HorseEntry[] }>('/races/manual', { race, entries });
  return data;
}

export async function deleteRace(raceId: string, date: string): Promise<void> {
  await api.delete(`/races/${encodeURIComponent(raceId)}?date=${encodeURIComponent(date)}`);
}

export async function fetchDeletedRaceEvents(): Promise<DeletedRaceEvent[]> {
  const { data } = await api.get<DeletedRaceEvent[]>('/races/deleted');
  return data;
}

export async function restoreDeletedRace(raceId: string): Promise<DeletedRaceEvent> {
  const { data } = await api.post<DeletedRaceEvent>(`/races/deleted/${encodeURIComponent(raceId)}/restore`);
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

export async function fetchShutuba(raceId: string, refresh = false): Promise<HorseEntry[]> {
  const { data } = await api.get<HorseEntry[]>(`/shutuba/${raceId}${refresh ? '?refresh=true' : ''}`);
  return data;
}

export async function fetchRaceMeta(raceId: string, refresh = false): Promise<RaceMeta> {
  const { data } = await api.get<RaceMeta>(`/shutuba/meta/${raceId}${refresh ? '?refresh=true' : ''}`);
  return data;
}

export async function fetchHorse(horseId: string, refresh = false): Promise<HorseDetail> {
  const { data } = await api.get<HorseDetail>(`/horses/${horseId}${refresh ? '?refresh=true' : ''}`);
  return data;
}

export async function fetchPicks(raceId: string, refresh = false): Promise<RacePick> {
  const { data } = await api.get<RacePick>(`/picks/${raceId}${refresh ? '?refresh=true' : ''}`);
  return data;
}

export async function fetchUserPicks(raceId: string): Promise<RacePick> {
  const { data } = await api.get<RacePick>(`/picks/user/${encodeURIComponent(raceId)}`);
  return data;
}

export async function saveUserPicks(raceId: string, picks: RacePick): Promise<RacePick> {
  const { data } = await api.put<RacePick>(`/picks/user/${encodeURIComponent(raceId)}`, picks);
  return data;
}

export async function searchHorse(name: string): Promise<HorseSearchResult[]> {
  const { data } = await api.get<HorseSearchResult[]>(`/horses/search?name=${encodeURIComponent(name)}`);
  return data;
}

export async function fetchFavoriteHorses(): Promise<FavoriteHorse[]> {
  const { data } = await api.get<FavoriteHorse[]>('/horses/favorites');
  return data;
}

export async function addFavoriteHorse(horseId: string, horseName: string): Promise<FavoriteHorse> {
  const { data } = await api.post<FavoriteHorse>(`/horses/favorites/${horseId}`, { horseName });
  return data;
}

export async function removeFavoriteHorse(horseId: string): Promise<void> {
  await api.delete(`/horses/favorites/${horseId}`);
}

export async function fetchHorseMemo(horseId: string): Promise<HorseMemo> {
  const { data } = await api.get<HorseMemo>(`/horses/${horseId}/memo`);
  return data;
}

export async function saveHorseMemo(horseId: string, note: string): Promise<HorseMemo> {
  const { data } = await api.put<HorseMemo>(`/horses/${horseId}/memo`, { note });
  return data;
}

export async function fetchPurchasedRaceIds(): Promise<string[]> {
  const { data } = await api.get<string[]>('/tickets/purchased-race-ids');
  return data;
}

export async function fetchPurchasedTickets(raceId: string): Promise<PurchasedTicket[]> {
  const { data } = await api.get<PurchasedTicket[]>(`/tickets/${encodeURIComponent(raceId)}`);
  return data;
}

export async function addPurchasedTicket(
  raceId: string,
  payload: {
    ticketType: TicketType;
    purchaseType: PurchaseType;
    selections: number[];
    formationSelections?: number[][];
    unitAmount: number;
    raceName?: string;
    raceDate?: string;
    racecourse?: string;
    surface?: 'turf' | 'dirt';
    distance?: number;
    horseCount?: number;
  },
): Promise<PurchasedTicket> {
  const { data } = await api.post<PurchasedTicket>(`/tickets/${encodeURIComponent(raceId)}`, payload);
  return data;
}

export async function fetchBettingRecords(): Promise<BettingRecord[]> {
  const { data } = await api.get<BettingRecord[]>('/tickets/betting-records');
  return data;
}

export async function updateTicketPayout(raceId: string, ticketId: string, payoutAmount: number | undefined): Promise<PurchasedTicket> {
  const { data } = await api.patch<PurchasedTicket>(`/tickets/${encodeURIComponent(raceId)}/${encodeURIComponent(ticketId)}`, { payoutAmount });
  return data;
}

export async function deletePurchasedTicket(raceId: string, ticketId: string): Promise<void> {
  await api.delete(`/tickets/${encodeURIComponent(raceId)}/${encodeURIComponent(ticketId)}`);
}
