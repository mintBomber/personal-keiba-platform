export const RACECOURSES = [
  { id: '01', name: '札幌', location: '北海道' },
  { id: '02', name: '函館', location: '北海道' },
  { id: '03', name: '福島', location: '福島県' },
  { id: '04', name: '新潟', location: '新潟県' },
  { id: '05', name: '東京', location: '東京都' },
  { id: '06', name: '中山', location: '千葉県' },
  { id: '07', name: '中京', location: '愛知県' },
  { id: '08', name: '京都', location: '京都府' },
  { id: '09', name: '阪神', location: '兵庫県' },
  { id: '10', name: '小倉', location: '福岡県' },
] as const;

export const TRACK_NAME_TO_ID: Record<string, string> = {
  '札幌': '01', '函館': '02', '福島': '03', '新潟': '04', '東京': '05',
  '中山': '06', '中京': '07', '京都': '08', '阪神': '09', '小倉': '10',
};

export const TRACK_ID_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TRACK_NAME_TO_ID).map(([name, id]) => [id, name])
);

export interface RaceScheduleDay {
  date: string;
  tracks: Array<{ id: string; name: string }>;
}

export interface RacePick {
  honmei: string;
  taikou: string;
  tanana: string;
  source?: string;
}

export interface Race {
  id: string;
  raceNumber: number;
  name: string;
  date: string;
  racecourseId: string;
  racecourse: string;
  horseCount: number;
  distance: number;
  surface: 'turf' | 'dirt';
  direction?: string;
  grade?: string;
  startTime?: string;
  manual?: boolean;
  picks: RacePick;
}

export interface RaceMeta {
  name: string;
  startTime?: string;
  horseCount?: number;
  distance?: number;
  surface?: 'turf' | 'dirt';
  direction?: string;
  grade?: string;
}

export interface FavoriteHorse {
  horseId: string;
  horseName: string;
  addedAt: string;
}

export interface HorseMemo {
  horseId: string;
  note: string;
  updatedAt: string;
}

export interface DeletedRaceEvent {
  race: Race;
  entries: HorseEntry[];
  deletedAt: string;
}

export interface HorseEntry {
  gateNumber: number;
  horseNumber: number;
  horseId: string;
  horseName: string;
  sex: string;
  age: number;
  weight: number;
  weightDiff?: number;
  placement?: string;
  jockey: string;
  jockeyId: string;
  trainer: string;
  trainerId: string;
  odds?: string;
  popularity?: number;
}

export interface HorseSearchResult {
  horseId: string;
  horseName: string;
}

export interface HorseRaceHistory {
  date: string;
  racecourse: string;
  raceName: string;
  distance: number;
  surface: string;
  placement: string;
  time: string;
  jockey: string;
  odds: string;
  popularity: string;
  horseWeight: string;
  kinRyo?: number;
}

export interface HorseDetail {
  horseId: string;
  horseName: string;
  sex: string;
  age: number;
  birthDate: string;
  sire: string;
  sireId: string;
  dam: string;
  damId: string;
  broodmareSire: string;
  owner: string;
  trainer: string;
  totalRecord: string;
  retiredDate?: string;
  deathDate?: string;
  races: HorseRaceHistory[];
  updatedAt: string;
}

export interface Settings {
  favoriteTrackIds: string[];
}

export interface UpdateResult {
  updatedAt: string;
  scheduleDays: number;
  raceDays: number;
  totalRaces: number;
}

export type TicketType = '単勝' | '複勝' | '枠連' | '馬連' | '馬単' | 'ワイド' | '3連複' | '3連単';
export type PurchaseType = '通常' | 'ボックス' | 'フォーメーション';

export interface BettingRecord {
  id: string;
  raceId: string;
  raceName: string;
  raceDate: string;
  racecourse: string;
  surface: 'turf' | 'dirt';
  distance: number;
  horseCount: number;
  ticketType: TicketType;
  purchaseType: PurchaseType;
  selections: number[];
  formationSelections?: number[][];
  unitAmount: number;
  combinations: number;
  totalAmount: number;
  payoutAmount?: number;
  createdAt: string;
}

export interface PurchasedTicket {
  id: string;
  ticketType: TicketType;
  purchaseType: PurchaseType;
  selections: number[];             // 通常・ボックス用
  formationSelections?: number[][]; // フォーメーション用（ポジション別）
  unitAmount: number;               // 1組あたりの金額
  payoutAmount?: number;            // 払戻金（手動入力）
  createdAt: string;
}
