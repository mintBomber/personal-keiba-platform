import { useEffect, useState } from 'react';
import { Race, RacePick, HorseEntry, View } from '../../types';
import { fetchPicks, fetchShutuba } from '../../api/client';

const GATE_COLORS: Record<number, string> = {
  1: 'bg-white border-gray-400 text-gray-800',
  2: 'bg-black text-white border-black',
  3: 'bg-red-600 text-white border-red-700',
  4: 'bg-blue-600 text-white border-blue-700',
  5: 'bg-yellow-400 text-gray-800 border-yellow-500',
  6: 'bg-green-600 text-white border-green-700',
  7: 'bg-orange-500 text-white border-orange-600',
  8: 'bg-pink-400 text-white border-pink-500',
};

const PLACEMENT_COLOR: Record<string, string> = {
  '1': 'text-yellow-600 font-bold',
  '2': 'text-gray-500 font-semibold',
  '3': 'text-orange-500 font-semibold',
};

const EMPTY_PICKS: RacePick = { honmei: '---', taikou: '---', tanana: '---' };

type SortKey = 'placement' | 'horseNumber' | 'weight';

interface Props {
  race: Race;
  onBack: () => void;
  onNavigate: (view: View) => void;
}

function sortEntries(entries: HorseEntry[], key: SortKey | null, asc: boolean): HorseEntry[] {
  if (!key) return entries;
  return [...entries].sort((a, b) => {
    let av: number, bv: number;
    if (key === 'placement') {
      av = parseInt(a.placement ?? '', 10);
      bv = parseInt(b.placement ?? '', 10);
      if (isNaN(av)) av = 999;
      if (isNaN(bv)) bv = 999;
    } else if (key === 'horseNumber') {
      av = a.horseNumber; bv = b.horseNumber;
    } else {
      av = a.weight; bv = b.weight;
    }
    return asc ? av - bv : bv - av;
  });
}

function SortTh({
  label, col, sortKey, asc, onSort, className = '',
}: {
  label: string; col: SortKey; sortKey: SortKey | null; asc: boolean;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-2 py-2 text-center text-xs font-semibold cursor-pointer select-none whitespace-nowrap
        ${active ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-blue-500'} ${className}`}
    >
      {label}{active ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

function hasPrediction(picks: RacePick): boolean {
  return picks.honmei !== '---' || picks.taikou !== '---' || picks.tanana !== '---';
}

function PickHorseName({
  name, entries, onNavigate, backView,
}: {
  name: string;
  entries: HorseEntry[];
  onNavigate: (view: View) => void;
  backView: View;
}) {
  const horse = entries.find(entry => entry.horseName === name);
  if (!horse?.horseId) {
    return <span className="font-semibold text-gray-800 truncate">{name}</span>;
  }

  return (
    <button
      onClick={() => onNavigate({ type: 'horseDetail', horseId: horse.horseId, horseName: horse.horseName, backView })}
      className="font-semibold text-blue-700 hover:text-blue-900 hover:underline truncate text-left"
    >
      {name}
    </button>
  );
}

function PredictionCard({
  picks, loading, entries, onNavigate, backView,
}: {
  picks: RacePick;
  loading: boolean;
  entries: HorseEntry[];
  onNavigate: (view: View) => void;
  backView: View;
}) {
  const source = picks.source ?? 'netkeiba';
  const rows = [
    { mark: '◎', label: '本命', name: picks.honmei, color: 'text-red-600 bg-red-50 border-red-100' },
    { mark: '○', label: '対抗', name: picks.taikou, color: 'text-blue-600 bg-blue-50 border-blue-100' },
    { mark: '△', label: '単穴', name: picks.tanana, color: 'text-green-700 bg-green-50 border-green-100' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800">有望馬予想</h2>
        <span className="text-xs text-gray-500">{source}</span>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="flex items-center text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent mr-2" />
            予想を取得中...
          </div>
        ) : hasPrediction(picks) ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {rows.map(row => (
              <div key={row.mark} className={`border rounded-md px-3 py-2 ${row.color}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl font-black leading-none">{row.mark}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold opacity-80">{row.label}</p>
                    {row.name !== '---' ? (
                      <PickHorseName
                        name={row.name}
                        entries={entries}
                        onNavigate={onNavigate}
                        backView={backView}
                      />
                    ) : (
                      <span className="font-semibold text-gray-400">未設定</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">netkeibaの予想情報はまだ公開されていません</p>
        )}
      </div>
    </div>
  );
}

export default function RaceDetailView({ race, onBack, onNavigate }: Props) {
  const [entries, setEntries] = useState<HorseEntry[]>([]);
  const [picks, setPicks] = useState<RacePick>(race.picks ?? EMPTY_PICKS);
  const [picksLoading, setPicksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (!race.id) { setError('レースIDがありません'); setLoading(false); return; }
    fetchShutuba(race.id)
      .then(setEntries)
      .catch(() => setError('出馬表の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [race.id]);

  useEffect(() => {
    setPicks(race.picks ?? EMPTY_PICKS);
    if (!/^\d{12}$/.test(race.id)) return;

    setPicksLoading(true);
    fetchPicks(race.id)
      .then(setPicks)
      .catch(() => setPicks(race.picks ?? EMPTY_PICKS))
      .finally(() => setPicksLoading(false));
  }, [race.id, race.picks]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const surface = race.surface === 'dirt' ? 'ダ' : '芝';
  const isPastRace = race.date < new Date().toISOString().slice(0, 10);
  const hasPlacements = entries.some(e => e.placement);
  const showPlacement = isPastRace || hasPlacements;

  const displayed = sortEntries(entries, sortKey, sortAsc);
  const backView: View = { type: 'calendar' };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="text-sm px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
            ← 戻る
          </button>
          <h1 className="font-bold text-gray-900">
            {race.racecourse} 第{race.raceNumber}レース
          </h1>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-gray-600 pl-1">
          <span className="font-medium text-gray-800">{race.name}</span>
          {race.grade && <span className="text-red-600 font-bold">{race.grade}</span>}
          <span>{race.startTime}</span>
          <span>{surface}{race.distance}m</span>
          {race.horseCount > 0 && <span>{race.horseCount}頭</span>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <PredictionCard
          picks={picks}
          loading={picksLoading}
          entries={entries}
          onNavigate={onNavigate}
          backView={backView}
        />

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
            <span className="ml-3 text-gray-500">出馬表を取得中...</span>
          </div>
        )}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}
        {!loading && !error && entries.length === 0 && (
          <p className="text-gray-400 text-center py-16 text-sm">出馬表がまだ発表されていません</p>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {showPlacement && (
                    <SortTh label="着順" col="placement" sortKey={sortKey} asc={sortAsc} onSort={handleSort} className="w-10" />
                  )}
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 w-8">枠</th>
                  <SortTh label="馬番" col="horseNumber" sortKey={sortKey} asc={sortAsc} onSort={handleSort} className="w-8" />
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">馬名</th>
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">性齢</th>
                  <SortTh label="斤量(差)" col="weight" sortKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden sm:table-cell" />
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500">騎手</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">調教師</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((horse, idx) => {
                  const gateColor = GATE_COLORS[horse.gateNumber] ?? 'bg-gray-200';
                  const plClass = PLACEMENT_COLOR[horse.placement ?? ''] ?? 'text-gray-700';
                  return (
                    <tr key={horse.horseNumber} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      {/* 着順 */}
                      {showPlacement && (
                        <td className={`px-2 py-2 text-center font-bold text-sm ${plClass}`}>
                          {horse.placement ?? '-'}
                        </td>
                      )}
                      {/* 枠番 */}
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-flex w-6 h-6 rounded-full border text-xs font-bold items-center justify-center ${gateColor}`}>
                          {horse.gateNumber}
                        </span>
                      </td>
                      {/* 馬番 */}
                      <td className="px-2 py-2 text-center font-bold text-gray-700">{horse.horseNumber}</td>
                      {/* 馬名 */}
                      <td className="px-3 py-2">
                        {horse.horseId ? (
                          <button
                            onClick={() => onNavigate({ type: 'horseDetail', horseId: horse.horseId, horseName: horse.horseName, backView })}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                          >
                            {horse.horseName}
                          </button>
                        ) : (
                          <span className="font-medium text-gray-800">{horse.horseName}</span>
                        )}
                      </td>
                      {/* 性齢 */}
                      <td className="px-2 py-2 text-center text-gray-600 hidden sm:table-cell">
                        {horse.sex}{horse.age}
                      </td>
                      {/* 斤量(差) */}
                      <td className="px-2 py-2 text-center text-gray-600 hidden sm:table-cell">
                        {horse.weight > 0 ? (
                          <span>
                            {horse.weight}
                            {horse.weightDiff != null && horse.weightDiff !== 0 && (
                              <span className={`ml-0.5 text-xs font-semibold ${horse.weightDiff > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                ({horse.weightDiff > 0 ? '+' : ''}{horse.weightDiff})
                              </span>
                            )}
                          </span>
                        ) : '-'}
                      </td>
                      {/* 騎手 */}
                      <td className="px-2 py-2 text-gray-700 text-xs">{horse.jockey || '-'}</td>
                      {/* 調教師 */}
                      <td className="px-2 py-2 text-gray-600 text-xs hidden md:table-cell">{horse.trainer || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
