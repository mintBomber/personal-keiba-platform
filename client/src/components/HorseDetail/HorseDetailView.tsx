import { useEffect, useState, type CSSProperties } from 'react';
import { HorseDetail, HorseRaceHistory, View } from '../../types';
import {
  addFavoriteHorse,
  fetchFavoriteHorses,
  fetchHorse,
  fetchHorseMemo,
  removeFavoriteHorse,
  saveHorseMemo,
} from '../../api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface Props {
  horseId: string;
  horseName: string;
  backView: View;
  onBack: () => void;
  onNavigate: (view: View) => void;
}

const PLACEMENT_COLOR: Record<string, string> = {
  '1': 'text-yellow-600 font-bold',
  '2': 'text-gray-500 font-semibold',
  '3': 'text-orange-500 font-semibold',
};

function parseRaceDate(dateStr: string): number {
  const normalized = dateStr.replace(/年|月/g, '/').replace(/日/g, '').replace(/-/g, '/');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function getSurfaceStyle(surface: string): CSSProperties {
  if (surface === '芝') return { color: '#16a34a' }; // green-600
  if (surface === 'ダ' || surface.includes('ダート') || surface === 'D') return { color: '#92400e' }; // amber-900
  return { color: '#4b5563' };
}

function getDistanceColor(distance: number): string {
  if (!distance || distance <= 0) return '#4b5563';
  if (distance >= 3200) return 'hsl(240,80%,45%)'; // blue
  if (distance <= 1000) return 'hsl(0,85%,45%)';   // red

  const stops: { dist: number; hue: number }[] = [
    { dist: 1000, hue: 0 },
    { dist: 1200, hue: 15 },
    { dist: 1400, hue: 30 },
    { dist: 1600, hue: 50 },
    { dist: 2000, hue: 120 },
    { dist: 2400, hue: 180 },
    { dist: 3200, hue: 240 },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (distance >= stops[i].dist && distance <= stops[i + 1].dist) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const t = (distance - lower.dist) / (upper.dist - lower.dist);
  const hue = lower.hue + t * (upper.hue - lower.hue);
  return `hsl(${hue.toFixed(0)},85%,38%)`;
}

interface ChartPoint {
  dateMs: number;
  dateLabel: string;
  popularity: number | null;
  placement: number | null;
  weight: number | null;
}

function buildChartData(races: HorseRaceHistory[]): ChartPoint[] {
  return [...races]
    .map(r => {
      const dateMs = parseRaceDate(r.date);
      const popularity = parseInt(r.popularity, 10) || null;
      const placement = parseInt(r.placement, 10) || null;
      const weightMatch = r.horseWeight.match(/^(\d+)/);
      const weight = weightMatch ? parseInt(weightMatch[1], 10) : null;
      return { dateMs, dateLabel: r.date, popularity, placement, weight };
    })
    .filter(d => d.dateMs > 0)
    .sort((a, b) => a.dateMs - b.dateMs);
}

function formatDateTick(ms: number): string {
  const d = new Date(ms);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

function PerformanceChart({ races }: { races: HorseRaceHistory[] }) {
  const data = buildChartData(races);
  if (data.length < 2) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h2 className="font-bold text-gray-700 mb-3 text-sm border-b pb-1">成績推移グラフ</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 50, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="dateMs"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatDateTick}
            tick={{ fontSize: 10 }}
            tickCount={6}
          />
          <YAxis
            yAxisId="rank"
            reversed
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 10 }}
            width={22}
            label={{ value: '順位', angle: -90, position: 'insideLeft', fontSize: 10, offset: 10 }}
          />
          <YAxis
            yAxisId="weight"
            orientation="right"
            domain={['dataMin - 10', 'dataMax + 10']}
            tick={{ fontSize: 10 }}
            width={38}
            label={{ value: '馬体重', angle: 90, position: 'insideRight', fontSize: 10, offset: 10 }}
          />
          <Tooltip
            labelFormatter={(v) => {
              const d = new Date(v as number);
              return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
            }}
            formatter={(value, name) => [value ?? '-', name as string]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            yAxisId="rank"
            type="linear"
            dataKey="popularity"
            stroke="#8b5cf6"
            name="人気"
            dot={{ r: 3 }}
            connectNulls
            strokeWidth={1.5}
          />
          <Line
            yAxisId="rank"
            type="linear"
            dataKey="placement"
            stroke="#ef4444"
            name="着順"
            dot={{ r: 3 }}
            connectNulls
            strokeWidth={1.5}
          />
          <Line
            yAxisId="weight"
            type="linear"
            dataKey="weight"
            stroke="#f59e0b"
            name="馬体重"
            dot={{ r: 3 }}
            connectNulls
            strokeWidth={1.5}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function HorseDetailView({ horseId, horseName, onBack }: Props) {
  const [detail, setDetail] = useState<HorseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [memo, setMemo] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoSavedAt, setMemoSavedAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchHorse(horseId)
      .then(setDetail)
      .catch(() => setError('馬情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [horseId]);

  useEffect(() => {
    fetchFavoriteHorses()
      .then(favorites => setFavorite(favorites.some(h => h.horseId === horseId)))
      .catch(() => undefined);
  }, [horseId]);

  useEffect(() => {
    fetchHorseMemo(horseId)
      .then(data => {
        setMemo(data.note);
        setMemoSavedAt(data.updatedAt);
      })
      .catch(() => undefined);
  }, [horseId]);

  const displayName = detail?.horseName || horseName;
  const statusText = detail?.deathDate
    ? `${detail.deathDate} 没`
    : detail?.retiredDate
    ? `${detail.retiredDate} 引退`
    : '';

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await fetchHorse(horseId, true);
      setDetail(fresh);
      if (favorite) await addFavoriteHorse(horseId, fresh.horseName || horseName);
    } catch {
      setError('馬情報の更新に失敗しました');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleToggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    try {
      if (next) {
        await addFavoriteHorse(horseId, displayName);
      } else {
        await removeFavoriteHorse(horseId);
      }
    } catch {
      setFavorite(!next);
    }
  }

  async function handleSaveMemo() {
    if (memoSaving) return;
    setMemoSaving(true);
    try {
      const saved = await saveHorseMemo(horseId, memo);
      setMemo(saved.note);
      setMemoSavedAt(saved.updatedAt);
    } finally {
      setMemoSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="text-sm px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
            >
              ← 戻る
            </button>
            <h1 className="font-bold text-gray-900 text-lg truncate">{displayName}</h1>
            <button
              onClick={handleToggleFavorite}
              className={`w-8 h-8 rounded-full text-lg leading-none transition ${
                favorite ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100' : 'text-gray-300 bg-gray-50 hover:bg-gray-100'
              }`}
              title={favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
            >
              ★
            </button>
            {detail && (
              <>
                <span className="text-sm text-gray-500 whitespace-nowrap">{detail.sex}{detail.age}歳</span>
                {statusText && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">{statusText}</span>
                )}
              </>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm px-3 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition disabled:opacity-50 whitespace-nowrap"
          >
            {refreshing ? '更新中...' : '更新'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
            <span className="ml-3 text-gray-500">馬情報を取得中...</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {detail && !loading && (
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* Basic info card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="font-bold text-gray-700 mb-3 text-sm border-b pb-1">基本情報</h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <InfoRow label="生年月日" value={detail.birthDate} />
                <InfoRow label="通算成績" value={detail.totalRecord} />
                <InfoRow label="馬主" value={detail.owner} />
                <InfoRow label="調教師" value={detail.trainer} />
              </div>
            </div>

            {/* Blood info card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="font-bold text-gray-700 mb-3 text-sm border-b pb-1">血統</h2>
              <div className="space-y-2 text-sm">
                <InfoRow label="父" value={detail.sire || '-'} />
                <InfoRow label="母" value={detail.dam || '-'} />
                <InfoRow label="母父" value={detail.broodmareSire || '-'} />
              </div>
            </div>

            {/* Performance chart */}
            {detail.races.length >= 2 && <PerformanceChart races={detail.races} />}

            {/* Race history */}
            {detail.races.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h2 className="font-bold text-gray-700 text-sm">
                    過去レース履歴 ({detail.races.length}戦)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-2 py-2 text-left text-gray-500">日付</th>
                        <th className="px-2 py-2 text-left text-gray-500">開催</th>
                        <th className="px-2 py-2 text-left text-gray-500">レース名</th>
                        <th className="px-2 py-2 text-center text-gray-500">コース</th>
                        <th className="px-2 py-2 text-center text-gray-500">着順</th>
                        <th className="px-2 py-2 text-center text-gray-500">人気</th>
                        <th className="px-2 py-2 text-center text-gray-500">タイム</th>
                        <th className="px-2 py-2 text-left text-gray-500">騎手</th>
                        <th className="px-2 py-2 text-center text-gray-500">馬体重</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.races.map((race, i) => {
                        const placementClass = PLACEMENT_COLOR[race.placement] ?? 'text-gray-700';
                        const surfaceStyle = getSurfaceStyle(race.surface);
                        const distanceColor = getDistanceColor(race.distance);
                        return (
                          <tr key={i} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{race.date}</td>
                            <td className="px-2 py-1.5 text-gray-600">{race.racecourse}</td>
                            <td className="px-2 py-1.5 text-gray-800 max-w-[120px] truncate">{race.raceName}</td>
                            <td className="px-2 py-1.5 text-center whitespace-nowrap">
                              <span style={surfaceStyle} className="font-semibold">{race.surface}</span>
                              {race.distance > 0 && (
                                <span style={{ color: distanceColor }} className="font-semibold ml-0.5">
                                  {race.distance}m
                                </span>
                              )}
                            </td>
                            <td className={`px-2 py-1.5 text-center ${placementClass}`}>{race.placement}</td>
                            <td className="px-2 py-1.5 text-center text-gray-500">{race.popularity}</td>
                            <td className="px-2 py-1.5 text-center text-gray-600">{race.time}</td>
                            <td className="px-2 py-1.5 text-gray-600">{race.jockey}</td>
                            <td className="px-2 py-1.5 text-center text-gray-500">{race.horseWeight}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detail.races.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400 text-sm">
                過去レース情報が取得できませんでした
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3 border-b pb-2">
                <h2 className="font-bold text-gray-700 text-sm">メモ</h2>
                {memoSavedAt && (
                  <span className="text-xs text-gray-400">
                    保存済み {new Date(memoSavedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                className="w-full min-h-32 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                placeholder="この馬についてのメモを入力..."
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleSaveMemo}
                  disabled={memoSaving}
                  className="px-4 py-1.5 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-50"
                >
                  {memoSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value || '-'}</span>
    </div>
  );
}
