import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { BettingRecord, Race, TicketType, View } from '../../types';
import { fetchBettingRecords } from '../../api/client';

// ── Types ──────────────────────────────────────────────────────────────────

type XDim = 'distance' | 'surface' | 'ticketType' | 'racecourse' | 'month' | 'horseCount' | 'purchaseType';
type YMetric = 'totalBet' | 'totalPayout' | 'profit' | 'roi' | 'winRate' | 'count';
type SeriesDim = 'none' | 'surface' | 'ticketType' | 'purchaseType';
type ChartType = 'bar' | 'line';

interface CustomChartConfig {
  id: string;
  name: string;
  xDim: XDim;
  yMetric: YMetric;
  seriesDim: SeriesDim;
  chartType: ChartType;
  yScale: 'linear' | 'log';
  yMin: string;
  yMax: string;
  distanceBinSize: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const X_DIM_LABELS: Record<XDim, string> = {
  distance: '距離', surface: '芝ダート', ticketType: '馬券種別',
  racecourse: '競馬場', month: '月別', horseCount: '頭数', purchaseType: '掛け方',
};
const Y_METRIC_LABELS: Record<YMetric, string> = {
  totalBet: '掛け金合計(円)', totalPayout: '払戻金合計(円)', profit: '収支(円)',
  roi: '回収率(%)', winRate: '的中率(%)', count: '件数',
};
const SERIES_DIM_LABELS: Record<SeriesDim, string> = {
  none: 'なし', surface: '芝ダート', ticketType: '馬券種別', purchaseType: '掛け方',
};
const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#0f766e'];

const DEFAULT_CONFIG: Omit<CustomChartConfig, 'id' | 'name'> = {
  xDim: 'distance', yMetric: 'totalBet', seriesDim: 'none',
  chartType: 'bar', yScale: 'linear', yMin: '', yMax: '', distanceBinSize: 200,
};

// ── Aggregation helpers ────────────────────────────────────────────────────

function getXKey(r: BettingRecord, dim: XDim, binSize = 200): string {
  switch (dim) {
    case 'surface': return r.surface === 'turf' ? '芝' : 'ダート';
    case 'distance': return `${Math.round(r.distance / binSize) * binSize}`;
    case 'ticketType': return r.ticketType;
    case 'racecourse': return r.racecourse;
    case 'month': return r.raceDate.slice(0, 7);
    case 'horseCount': return String(r.horseCount);
    case 'purchaseType': return r.purchaseType;
  }
}

function computeMetric(rows: BettingRecord[], metric: YMetric): number {
  const bet = rows.reduce((s, r) => s + r.totalAmount, 0);
  const payout = rows.reduce((s, r) => s + (r.payoutAmount ?? 0), 0);
  switch (metric) {
    case 'totalBet': return bet;
    case 'totalPayout': return payout;
    case 'profit': return payout - bet;
    case 'roi': return bet > 0 ? Math.round(payout / bet * 1000) / 10 : 0;
    case 'winRate': {
      const w = rows.filter(r => (r.payoutAmount ?? 0) > 0).length;
      return rows.length > 0 ? Math.round(w / rows.length * 1000) / 10 : 0;
    }
    case 'count': return rows.length;
  }
}

function sortXKeys(keys: string[], dim: XDim): string[] {
  if (dim === 'distance' || dim === 'horseCount') return [...keys].sort((a, b) => +a - +b);
  if (dim === 'month') return [...keys].sort();
  return [...keys].sort();
}

function xLabel(key: string, dim: XDim): string {
  if (dim === 'distance') return `${key}m`;
  if (dim === 'horseCount') return `${key}頭`;
  return key;
}

type ChartRow = Record<string, string | number>;

function buildChartData(
  records: BettingRecord[],
  xDim: XDim, yMetric: YMetric, seriesDim: SeriesDim, binSize = 200,
): { data: ChartRow[]; seriesKeys: string[] } {
  const rawX = [...new Set(records.map(r => getXKey(r, xDim, binSize)))];
  const xKeys = sortXKeys(rawX, xDim);

  if (seriesDim === 'none') {
    const label = Y_METRIC_LABELS[yMetric];
    return {
      data: xKeys.map(xk => {
        const grp = records.filter(r => getXKey(r, xDim, binSize) === xk);
        return { xKey: xLabel(xk, xDim), [label]: computeMetric(grp, yMetric) };
      }),
      seriesKeys: [label],
    };
  }

  const rawS = [...new Set(records.map(r => getXKey(r, seriesDim as XDim, binSize)))];
  const seriesKeys = rawS.sort();
  return {
    data: xKeys.map(xk => {
      const row: ChartRow = { xKey: xLabel(xk, xDim) };
      for (const sk of seriesKeys) {
        const grp = records.filter(r =>
          getXKey(r, xDim, binSize) === xk && getXKey(r, seriesDim as XDim, binSize) === sk
        );
        row[sk] = computeMetric(grp, yMetric);
      }
      return row;
    }),
    seriesKeys,
  };
}

// ── Chart renderer ─────────────────────────────────────────────────────────

function RechartArea({
  data, seriesKeys, chartType, yScale, yMin, yMax, yLabel,
}: {
  data: ChartRow[]; seriesKeys: string[]; chartType: ChartType;
  yScale: 'linear' | 'log'; yMin: string; yMax: string; yLabel: string;
}) {
  const domain: [number | string, number | string] = [
    yMin !== '' ? Number(yMin) : yScale === 'log' ? 1 : 'auto',
    yMax !== '' ? Number(yMax) : 'auto',
  ];

  const common = {
    data,
    margin: { top: 8, right: 24, left: 16, bottom: 4 },
  };
  const axis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey="xKey" tick={{ fontSize: 11 }} />
      <YAxis
        scale={yScale}
        domain={domain}
        tick={{ fontSize: 11 }}
        label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 11 } }}
        tickFormatter={v => typeof v === 'number' && Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
      />
      <Tooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString() : String(v)} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      {(yLabel.includes('円') || yLabel.includes('収支') || yLabel.includes('profit')) && (
        <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 2" />
      )}
    </>
  );

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart {...common}>
          {axis}
          {seriesKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart {...common}>
        {axis}
        {seriesKeys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Preset charts ──────────────────────────────────────────────────────────

const PRESET_TABS = ['distance', 'monthly', 'ticketType', 'racecourse'] as const;
type PresetTab = typeof PRESET_TABS[number];
const PRESET_TAB_LABELS: Record<PresetTab, string> = {
  distance: '距離別', monthly: '月別', ticketType: '馬券種別', racecourse: '競馬場別',
};

function PresetChartPanel({ records }: { records: BettingRecord[] }) {
  const [tab, setTab] = useState<PresetTab>('distance');
  const [distSurface, setDistSurface] = useState<'all' | 'turf' | 'dirt'>('all');

  const presetData = useMemo(() => {
    const filtered = tab === 'distance' && distSurface !== 'all'
      ? records.filter(r => r.surface === distSurface)
      : records;

    if (tab === 'distance') {
      const sd: SeriesDim = distSurface === 'all' ? 'surface' : 'none';
      return buildChartData(filtered, 'distance', 'totalBet', sd);
    }
    if (tab === 'monthly') return buildChartData(filtered, 'month', 'totalBet', 'none');
    if (tab === 'ticketType') return buildChartData(filtered, 'ticketType', 'totalBet', 'none');
    return buildChartData(filtered, 'racecourse', 'totalBet', 'none');
  }, [records, tab, distSurface]);

  const payoutData = useMemo(() => {
    const filtered = tab === 'distance' && distSurface !== 'all'
      ? records.filter(r => r.surface === distSurface)
      : records;
    const dim: XDim = tab === 'distance' ? 'distance' : tab === 'monthly' ? 'month' : tab === 'ticketType' ? 'ticketType' : 'racecourse';
    const sd: SeriesDim = tab === 'distance' && distSurface === 'all' ? 'surface' : 'none';
    return buildChartData(filtered, dim, 'totalPayout', sd);
  }, [records, tab, distSurface]);

  // Merge bet + payout into single dataset for combined chart
  const combined = useMemo(() => {
    const betMap = new Map(presetData.data.map(r => [r.xKey, r]));
    const payMap = new Map(payoutData.data.map(r => [r.xKey, r]));
    const allKeys = [...new Set([...betMap.keys(), ...payMap.keys()])];
    return allKeys.map(k => {
      const b = betMap.get(k) ?? {};
      const p = payMap.get(k) ?? {};
      const row: ChartRow = { xKey: k };
      for (const [sk, v] of Object.entries(b)) if (sk !== 'xKey') row[`掛(${sk})`] = v;
      for (const [sk, v] of Object.entries(p)) if (sk !== 'xKey') row[`払(${sk})`] = v;
      return row;
    });
  }, [presetData, payoutData]);

  const combinedKeys = [
    ...presetData.seriesKeys.map(k => `掛(${k})`),
    ...payoutData.seriesKeys.map(k => `払(${k})`),
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {PRESET_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-sm transition ${tab === t ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'}`}>
            {PRESET_TAB_LABELS[t]}
          </button>
        ))}
        {tab === 'distance' && (
          <div className="flex gap-1 ml-auto">
            {(['all', 'turf', 'dirt'] as const).map(s => (
              <button key={s} onClick={() => setDistSurface(s)}
                className={`px-2 py-1 rounded text-xs transition ${distSurface === s ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-green-400'}`}>
                {s === 'all' ? '両方' : s === 'turf' ? '芝' : 'ダート'}
              </button>
            ))}
          </div>
        )}
      </div>
      {records.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">まだ馬券データがありません</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">掛け金 vs 払戻金</p>
          <RechartArea
            data={combined} seriesKeys={combinedKeys}
            chartType="bar" yScale="linear" yMin="" yMax="" yLabel="円"
          />
        </div>
      )}
    </div>
  );
}

// ── Custom chart panel ─────────────────────────────────────────────────────

const LS_KEY = 'keiba-custom-charts';

function loadSavedCharts(): CustomChartConfig[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}
function saveSavedCharts(charts: CustomChartConfig[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(charts));
}

function CustomChartPanel({ records }: { records: BettingRecord[] }) {
  const [charts, setCharts] = useState<CustomChartConfig[]>(loadSavedCharts);
  const [activeId, setActiveId] = useState<string | null>(charts[0]?.id ?? null);
  const [editing, setEditing] = useState<CustomChartConfig | null>(null);
  const [newName, setNewName] = useState('');

  const activeChart = charts.find(c => c.id === activeId) ?? null;
  const chartToShow = editing ?? activeChart;

  const chartData = useMemo(() => {
    if (!chartToShow) return null;
    return buildChartData(records, chartToShow.xDim, chartToShow.yMetric, chartToShow.seriesDim, chartToShow.distanceBinSize);
  }, [records, chartToShow]);

  function createNew() {
    const cfg: CustomChartConfig = { ...DEFAULT_CONFIG, id: `${Date.now()}`, name: `グラフ${charts.length + 1}` };
    setEditing(cfg);
    setNewName(cfg.name);
  }

  function saveChart() {
    if (!editing) return;
    const named = { ...editing, name: newName || editing.name };
    const updated = charts.find(c => c.id === named.id)
      ? charts.map(c => c.id === named.id ? named : c)
      : [...charts, named];
    setCharts(updated);
    saveSavedCharts(updated);
    setActiveId(named.id);
    setEditing(null);
  }

  function deleteChart(id: string) {
    const updated = charts.filter(c => c.id !== id);
    setCharts(updated);
    saveSavedCharts(updated);
    if (activeId === id) setActiveId(updated[0]?.id ?? null);
    if (editing?.id === id) setEditing(null);
  }

  function updateEditing(patch: Partial<CustomChartConfig>) {
    setEditing(prev => prev ? { ...prev, ...patch } : prev);
  }

  const cfg = editing ?? activeChart;

  return (
    <div className="flex gap-4 flex-col lg:flex-row">
      {/* Left: chart list + config */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-3">
        {/* Chart list */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">保存済みグラフ</span>
            <button onClick={createNew}
              className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition">
              ＋ 新規作成
            </button>
          </div>
          {charts.length === 0 && !editing && (
            <p className="text-xs text-gray-400">「新規作成」でグラフを追加</p>
          )}
          {charts.map(c => (
            <div key={c.id} className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition ${activeId === c.id && !editing ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
              onClick={() => { setActiveId(c.id); setEditing(null); }}>
              <span className="text-sm text-gray-800 flex-1 truncate">{c.name}</span>
              <button onClick={e => { e.stopPropagation(); setEditing({ ...c }); setNewName(c.name); setActiveId(c.id); }}
                className="text-xs text-blue-500 hover:text-blue-700 px-1">編集</button>
              <button onClick={e => { e.stopPropagation(); deleteChart(c.id); }}
                className="text-xs text-red-400 hover:text-red-600 px-1">×</button>
            </div>
          ))}
          {editing && !charts.find(c => c.id === editing.id) && (
            <div className="flex items-center gap-1 px-2 py-1.5 rounded bg-blue-50 border border-blue-200">
              <span className="text-sm text-gray-800 flex-1 truncate italic">{editing.name}（未保存）</span>
            </div>
          )}
        </div>

        {/* Config panel */}
        {editing && (
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 mb-1">グラフ設定</p>
            <label className="block">
              <span className="text-xs text-gray-500">グラフ名</span>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                className="mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-gray-500">X軸</span>
                <select value={editing.xDim} onChange={e => updateEditing({ xDim: e.target.value as XDim })}
                  className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs bg-white">
                  {(Object.keys(X_DIM_LABELS) as XDim[]).map(k => <option key={k} value={k}>{X_DIM_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Y軸指標</span>
                <select value={editing.yMetric} onChange={e => updateEditing({ yMetric: e.target.value as YMetric })}
                  className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs bg-white">
                  {(Object.keys(Y_METRIC_LABELS) as YMetric[]).map(k => <option key={k} value={k}>{Y_METRIC_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">系列</span>
                <select value={editing.seriesDim} onChange={e => updateEditing({ seriesDim: e.target.value as SeriesDim })}
                  className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs bg-white">
                  {(Object.keys(SERIES_DIM_LABELS) as SeriesDim[]).map(k => <option key={k} value={k}>{SERIES_DIM_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">グラフ種</span>
                <select value={editing.chartType} onChange={e => updateEditing({ chartType: e.target.value as ChartType })}
                  className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs bg-white">
                  <option value="bar">棒グラフ</option>
                  <option value="line">折れ線</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Y軸スケール</span>
                <select value={editing.yScale} onChange={e => updateEditing({ yScale: e.target.value as 'linear' | 'log' })}
                  className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs bg-white">
                  <option value="linear">線形</option>
                  <option value="log">対数</option>
                </select>
              </label>
              {editing.xDim === 'distance' && (
                <label className="block">
                  <span className="text-xs text-gray-500">距離ビン(m)</span>
                  <input type="number" min={100} step={100} value={editing.distanceBinSize}
                    onChange={e => updateEditing({ distanceBinSize: Number(e.target.value) || 200 })}
                    className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs" />
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="text-xs text-gray-500">Y最小値</span>
                <input value={editing.yMin} onChange={e => updateEditing({ yMin: e.target.value })}
                  placeholder="auto" className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs" />
              </label>
              <label className="flex-1">
                <span className="text-xs text-gray-500">Y最大値</span>
                <input value={editing.yMax} onChange={e => updateEditing({ yMax: e.target.value })}
                  placeholder="auto" className="mt-0.5 w-full border border-gray-300 rounded px-1 py-1 text-xs" />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)}
                className="flex-1 text-xs py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
                キャンセル
              </button>
              <button onClick={saveChart}
                className="flex-1 text-xs py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition">
                保存
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: chart */}
      <div className="flex-1 min-w-0">
        {!cfg || !chartData ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
            左の「新規作成」でカスタムグラフを作成してください
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
            まだ馬券データがありません
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">{cfg.name}</p>
            <p className="text-xs text-gray-400 mb-3">
              X: {X_DIM_LABELS[cfg.xDim]} / Y: {Y_METRIC_LABELS[cfg.yMetric]}
              {cfg.seriesDim !== 'none' && ` / 系列: ${SERIES_DIM_LABELS[cfg.seriesDim]}`}
            </p>
            <RechartArea
              data={chartData.data} seriesKeys={chartData.seriesKeys}
              chartType={cfg.chartType} yScale={cfg.yScale}
              yMin={cfg.yMin} yMax={cfg.yMax}
              yLabel={Y_METRIC_LABELS[cfg.yMetric]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Betting history table ──────────────────────────────────────────────────

function formatSelections(record: BettingRecord): string {
  if (record.purchaseType === 'フォーメーション' && record.formationSelections) {
    return record.formationSelections.map(pos => pos.join('/')).join(' → ');
  }
  if (record.selections.length === 0) return '—';
  return record.selections.join('-');
}

function recordToRace(r: BettingRecord): Race {
  return {
    id: r.raceId,
    raceNumber: 0,
    name: r.raceName,
    date: r.raceDate,
    racecourseId: r.raceId.length === 12 ? r.raceId.slice(4, 6) : '',
    racecourse: r.racecourse,
    horseCount: r.horseCount,
    distance: r.distance,
    surface: r.surface,
    picks: { honmei: '---', taikou: '---', tanana: '---' },
  };
}

function BettingHistoryTable({ records, onNavigate }: { records: BettingRecord[]; onNavigate: (v: View) => void }) {
  const sorted = useMemo(
    () => [...records].sort((a, b) =>
      b.raceDate.localeCompare(a.raceDate) || b.createdAt.localeCompare(a.createdAt)
    ),
    [records]
  );

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">掛け履歴</span>
        <span className="ml-2 text-xs text-gray-400">{sorted.length}件</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '252px' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">日付</th>
              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">レース</th>
              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">競馬場</th>
              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">条件</th>
              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">馬券</th>
              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">購入内容</th>
              <th className="text-right px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">掛金</th>
              <th className="text-right px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">払戻</th>
              <th className="text-right px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">収支</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const payout = r.payoutAmount ?? 0;
              const diff = payout - r.totalAmount;
              const hasPayout = r.payoutAmount !== undefined;
              const surface = r.surface === 'turf' ? '芝' : 'ダ';
              return (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{r.raceDate}</td>
                  <td className="px-3 py-1.5 max-w-[120px]">
                    <button
                      onClick={() => onNavigate({ type: 'raceDetail', raceId: r.raceId, race: recordToRace(r) })}
                      className="text-blue-600 hover:underline truncate block max-w-full text-left"
                      title={r.raceName}
                    >{r.raceName}</button>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{r.racecourse}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{surface}{r.distance > 0 ? `${r.distance}m` : '—'}</td>
                  <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{r.ticketType}</td>
                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{formatSelections(r)}{r.combinations > 1 ? <span className="ml-1 text-gray-400">×{r.combinations}</span> : null}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">¥{r.totalAmount.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {hasPayout ? <span className={payout > 0 ? 'text-green-600 font-medium' : 'text-gray-500'}>¥{payout.toLocaleString()}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {hasPayout ? <span className={diff >= 0 ? 'text-green-600 font-bold' : 'text-red-500'}>{diff >= 0 ? '+' : ''}¥{diff.toLocaleString()}</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Summary cards ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color ?? 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

interface Props { onBack: () => void; onNavigate: (v: View) => void }

export default function BettingAnalysisView({ onBack, onNavigate }: Props) {
  const [records, setRecords] = useState<BettingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'preset' | 'custom'>('preset');

  // Global filters
  const [surfaceFilter, setSurfaceFilter] = useState<'all' | 'turf' | 'dirt'>('all');
  const [ticketFilter, setTicketFilter] = useState<TicketType | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchBettingRecords()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => records.filter(r => {
    if (surfaceFilter !== 'all' && r.surface !== surfaceFilter) return false;
    if (ticketFilter !== 'all' && r.ticketType !== ticketFilter) return false;
    if (dateFrom && r.raceDate < dateFrom) return false;
    if (dateTo && r.raceDate > dateTo) return false;
    return true;
  }), [records, surfaceFilter, ticketFilter, dateFrom, dateTo]);

  const totalBet = filtered.reduce((s, r) => s + r.totalAmount, 0);
  const totalPayout = filtered.reduce((s, r) => s + (r.payoutAmount ?? 0), 0);
  const profit = totalPayout - totalBet;
  const roi = totalBet > 0 ? (totalPayout / totalBet * 100).toFixed(1) : '—';
  const wins = filtered.filter(r => (r.payoutAmount ?? 0) > 0).length;
  const winRate = filtered.length > 0 ? (wins / filtered.length * 100).toFixed(1) : '—';
  const ticketTypes: TicketType[] = ['単勝', '複勝', '枠連', '馬連', '馬単', 'ワイド', '3連複', '3連単'];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack}
            className="text-sm px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
            ← 戻る
          </button>
          <h1 className="font-bold text-gray-900">馬券分析</h1>
          {loading && <span className="text-xs text-gray-400">読み込み中...</span>}
        </div>
        {/* Global filters */}
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <div className="flex gap-1">
            {(['all', 'turf', 'dirt'] as const).map(s => (
              <button key={s} onClick={() => setSurfaceFilter(s)}
                className={`px-2 py-0.5 rounded text-xs border transition ${surfaceFilter === s ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:border-green-500'}`}>
                {s === 'all' ? '全馬場' : s === 'turf' ? '芝' : 'ダート'}
              </button>
            ))}
          </div>
          <select value={ticketFilter} onChange={e => setTicketFilter(e.target.value as TicketType | 'all')}
            className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white">
            <option value="all">全馬券</option>
            {ticketTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-1 py-0.5 text-xs" />
            <span className="text-gray-400 text-xs">〜</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-1 py-0.5 text-xs" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="件数" value={`${filtered.length}件`} />
          <SummaryCard label="掛け金合計" value={`¥${totalBet.toLocaleString()}`} />
          <SummaryCard label="払戻金合計" value={`¥${totalPayout.toLocaleString()}`} />
          <SummaryCard
            label="収支"
            value={`${profit >= 0 ? '+' : ''}¥${profit.toLocaleString()}`}
            color={profit >= 0 ? 'text-green-600' : 'text-red-600'}
          />
          <SummaryCard
            label="回収率"
            value={roi === '—' ? '—' : `${roi}%`}
            color={Number(roi) >= 100 ? 'text-green-600' : Number(roi) > 0 ? 'text-red-600' : undefined}
          />
          <SummaryCard
            label="的中率"
            value={winRate === '—' ? '—' : `${winRate}%`}
            sub={winRate !== '—' ? `${wins}/${filtered.length}回` : undefined}
          />
        </div>

        {/* Main tab */}
        <div className="flex gap-2">
          {(['preset', 'custom'] as const).map(t => (
            <button key={t} onClick={() => setMainTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mainTab === t ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:border-blue-400'}`}>
              {t === 'preset' ? 'プリセット' : 'カスタムグラフ'}
            </button>
          ))}
        </div>

        {mainTab === 'preset' ? (
          <PresetChartPanel records={filtered} />
        ) : (
          <CustomChartPanel records={filtered} />
        )}

        <BettingHistoryTable records={filtered} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
