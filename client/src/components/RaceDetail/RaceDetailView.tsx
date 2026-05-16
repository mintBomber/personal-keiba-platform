import { useEffect, useState } from 'react';
import { Race, RacePick, HorseEntry, View, RaceMeta, RACECOURSES } from '../../types';
import {
  deleteRace,
  fetchPicks,
  fetchRaceMeta,
  fetchShutuba,
  fetchUserPicks,
  saveManualRace,
  saveUserPicks,
} from '../../api/client';

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

function isNetkeibaRaceId(raceId: string): boolean {
  return /^\d{12}$/.test(raceId);
}

function isEditableRace(race: Race): boolean {
  return Boolean(race.manual) || !isNetkeibaRaceId(race.id);
}

function createEmptyEntry(index: number): HorseEntry {
  const horseNumber = index + 1;
  return {
    gateNumber: Math.ceil(horseNumber / 2),
    horseNumber,
    horseId: '',
    horseName: '',
    sex: '',
    age: 0,
    weight: 0,
    jockey: '',
    jockeyId: '',
    trainer: '',
    trainerId: '',
  };
}

function createEmptyEntries(count: number): HorseEntry[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => createEmptyEntry(index));
}

function mergeRaceMeta(race: Race, meta: RaceMeta): Race {
  return {
    ...race,
    name: meta.name || race.name,
    startTime: meta.startTime ?? race.startTime,
    horseCount: meta.horseCount ?? race.horseCount,
    distance: meta.distance ?? race.distance,
    surface: meta.surface ?? race.surface,
    direction: meta.direction ?? race.direction,
    grade: meta.grade ?? race.grade,
  };
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
  picks, loading, entries, onNavigate, backView, collapsed, onToggle,
}: {
  picks: RacePick;
  loading: boolean;
  entries: HorseEntry[];
  onNavigate: (view: View) => void;
  backView: View;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const source = picks.source ?? 'netkeiba';
  const rows = [
    { mark: '◎', label: '本命', name: picks.honmei, color: 'text-red-600 bg-red-50 border-red-100' },
    { mark: '○', label: '対抗', name: picks.taikou, color: 'text-blue-600 bg-blue-50 border-blue-100' },
    { mark: '△', label: '単穴', name: picks.tanana, color: 'text-green-700 bg-green-50 border-green-100' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
      <div className={`px-4 py-2.5 bg-gray-50 flex items-center justify-between ${collapsed ? '' : 'border-b border-gray-200'}`}>
        <h2 className="text-sm font-bold text-gray-800">有望馬予想</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{source}</span>
          <button
            onClick={onToggle}
            className="w-6 h-6 rounded hover:bg-gray-200 text-xs text-gray-600 transition"
            title={collapsed ? '表示する' : '隠す'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {!collapsed && <div className="p-3">
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
      </div>}
    </div>
  );
}

function UserPredictionCard({
  picks, saving, message, entries, collapsed, onToggle, onChange, onSave,
}: {
  picks: RacePick;
  saving: boolean;
  message: string;
  entries: HorseEntry[];
  collapsed: boolean;
  onToggle: () => void;
  onChange: (key: keyof Pick<RacePick, 'honmei' | 'taikou' | 'tanana'>, value: string) => void;
  onSave: () => void;
}) {
  const horseOptions = entries
    .map(entry => entry.horseName.trim())
    .filter((name, index, self) => name && self.indexOf(name) === index);
  const rows: Array<{
    key: keyof Pick<RacePick, 'honmei' | 'taikou' | 'tanana'>;
    mark: string;
    label: string;
    color: string;
    placeholder: string;
  }> = [
    { key: 'honmei', mark: '◎', label: '本命', color: 'text-red-600 bg-red-50 border-red-100', placeholder: '本命馬' },
    { key: 'taikou', mark: '○', label: '対抗', color: 'text-blue-600 bg-blue-50 border-blue-100', placeholder: '対抗馬' },
    { key: 'tanana', mark: '△', label: '単穴', color: 'text-green-700 bg-green-50 border-green-100', placeholder: '単穴馬' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
      <div className={`px-4 py-2.5 bg-gray-50 flex items-center justify-between gap-3 ${collapsed ? '' : 'border-b border-gray-200'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-gray-800">自分の予想</h2>
          {message && <span className="text-xs text-blue-600">{message}</span>}
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <button
              onClick={onSave}
              disabled={saving}
              className="text-sm px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          )}
          <button
            onClick={onToggle}
            className="w-6 h-6 rounded hover:bg-gray-200 text-xs text-gray-600 transition"
            title={collapsed ? '表示する' : '隠す'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {!collapsed && <div className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {rows.map(row => (
            <div key={row.key} className={`border rounded-md px-3 py-2 ${row.color}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl font-black leading-none">{row.mark}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold opacity-80">{row.label}</p>
                  <select
                    value={picks[row.key] === '---' ? '' : picks[row.key]}
                    onChange={e => onChange(row.key, e.target.value)}
                    className="mt-0.5 w-full min-w-0 rounded border border-white/80 bg-white px-2 py-1 text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="">{row.placeholder}</option>
                    {picks[row.key] !== '---' && picks[row.key] && !horseOptions.includes(picks[row.key]) && (
                      <option value={picks[row.key]}>{picks[row.key]}</option>
                    )}
                    {horseOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}

export default function RaceDetailView({ race, onBack, onNavigate }: Props) {
  const [displayRace, setDisplayRace] = useState<Race>(race);
  const [entries, setEntries] = useState<HorseEntry[]>([]);
  const [picks, setPicks] = useState<RacePick>(race.picks ?? EMPTY_PICKS);
  const [userPicks, setUserPicks] = useState<RacePick>({ ...EMPTY_PICKS, source: '自分の予想' });
  const [picksLoading, setPicksLoading] = useState(false);
  const [userPicksSaving, setUserPicksSaving] = useState(false);
  const [userPicksMessage, setUserPicksMessage] = useState('');
  const [predictionCollapsed, setPredictionCollapsed] = useState(false);
  const [userPredictionCollapsed, setUserPredictionCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (!race.id) { setError('レースIDがありません'); setLoading(false); return; }
    const editable = isEditableRace(race);
    setDisplayRace(race);
    setError(null);
    setLoading(true);
    fetchShutuba(race.id)
      .then(data => {
        setEntries(editable && data.length === 0 ? createEmptyEntries(race.horseCount || 18) : data);
      })
      .catch(() => setError('出馬表の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [race.id]);

  useEffect(() => {
    if (!isNetkeibaRaceId(race.id)) return;
    fetchRaceMeta(race.id)
      .then(meta => setDisplayRace(current => mergeRaceMeta(current, meta)))
      .catch(() => undefined);
  }, [race.id]);

  useEffect(() => {
    setPicks(race.picks ?? EMPTY_PICKS);
    if (!isNetkeibaRaceId(race.id)) return;

    setPicksLoading(true);
    fetchPicks(race.id)
      .then(setPicks)
      .catch(() => setPicks(race.picks ?? EMPTY_PICKS))
      .finally(() => setPicksLoading(false));
  }, [race.id, race.picks]);

  useEffect(() => {
    setUserPicks({ ...EMPTY_PICKS, source: '自分の予想' });
    setUserPicksMessage('');
    if (!race.id) return;

    fetchUserPicks(race.id)
      .then(setUserPicks)
      .catch(() => undefined);
  }, [race.id]);

  const editable = isEditableRace(displayRace);

  function updateRaceField<K extends keyof Race>(key: K, value: Race[K]) {
    setDisplayRace(current => ({ ...current, [key]: value }));
    setSaveMessage('');
  }

  function updateEntry(index: number, patch: Partial<HorseEntry>) {
    setEntries(current => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
    setSaveMessage('');
  }

  function addEntryRow() {
    setEntries(current => [...current, createEmptyEntry(current.length)]);
  }

  function updateUserPick(key: keyof Pick<RacePick, 'honmei' | 'taikou' | 'tanana'>, value: string) {
    setUserPicks(current => ({ ...current, [key]: value.trim() ? value : '---', source: '自分の予想' }));
    setUserPicksMessage('');
  }

  async function handleSaveUserPicks() {
    if (userPicksSaving || !race.id) return;
    setUserPicksSaving(true);
    try {
      const saved = await saveUserPicks(race.id, userPicks);
      setUserPicks(saved);
      setUserPicksMessage('保存しました');
    } catch {
      setUserPicksMessage('保存に失敗しました');
    } finally {
      setUserPicksSaving(false);
    }
  }

  async function handleSaveManualRace() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const normalizedRace: Race = {
        ...displayRace,
        manual: true,
        horseCount: displayRace.horseCount || entries.length,
        picks: displayRace.picks ?? EMPTY_PICKS,
      };
      const saved = await saveManualRace(normalizedRace, entries);
      setDisplayRace(saved.race);
      setEntries(saved.entries.length > 0 ? saved.entries : createEmptyEntries(saved.race.horseCount || 18));
      setSaveMessage('保存しました');
    } catch {
      setError('レース情報の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    if (refreshing || !race.id) return;
    setRefreshing(true);
    setPicksLoading(true);
    try {
      const [fresh, meta, refreshedPicks] = await Promise.all([
        fetchShutuba(race.id, true),
        fetchRaceMeta(race.id, true).catch(() => null),
        fetchPicks(race.id, true).catch(() => null),
      ]);
      setEntries(fresh);
      if (meta) setDisplayRace(current => mergeRaceMeta(current, meta));
      if (refreshedPicks) setPicks(refreshedPicks);
    } catch {
      // silently ignore; show stale data
    } finally {
      setPicksLoading(false);
      setRefreshing(false);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  async function handleDeleteRace() {
    if (deleting) return;
    if (displayRace.id.startsWith('manual-draft-')) {
      onBack();
      return;
    }
    setDeleting(true);
    try {
      await deleteRace(displayRace.id, displayRace.date);
      onBack();
    } catch {
      setError('レース情報の削除に失敗しました');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  const surface = displayRace.surface === 'dirt' ? 'ダ' : '芝';
  const isPastRace = displayRace.date < new Date().toISOString().slice(0, 10);
  const hasPlacements = entries.some(e => e.placement);
  const showPlacement = editable || isPastRace || hasPlacements;

  const displayed = editable ? entries : sortEntries(entries, sortKey, sortAsc);
  const backView: View = { type: 'calendar' };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-sm px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
              ← 戻る
            </button>
            <h1 className="font-bold text-gray-900">
              {displayRace.racecourse} 第{displayRace.raceNumber}レース
            </h1>
          </div>
          <div className="flex items-center gap-2">
          {editable ? (
            <button
              onClick={handleSaveManualRace}
              disabled={saving}
              className="text-sm px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          ) : isNetkeibaRaceId(race.id) && (
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="text-sm px-3 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition disabled:opacity-50"
            >
              {refreshing ? '更新中...' : '更新'}
            </button>
          )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm px-3 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition"
            >
              削除
            </button>
          </div>
        </div>
        {editable ? (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 text-sm pt-2">
            <select
              value={displayRace.racecourseId}
              onChange={e => {
                const course = RACECOURSES.find(c => c.id === e.target.value);
                updateRaceField('racecourseId', e.target.value);
                updateRaceField('racecourse', course?.name ?? '');
              }}
              className="border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {RACECOURSES.map(course => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={displayRace.raceNumber || ''}
              onChange={e => updateRaceField('raceNumber', Math.max(1, Number(e.target.value) || 1))}
              className="border border-gray-300 rounded px-2 py-1"
              placeholder="レース番号"
            />
            <input
              value={displayRace.name}
              onChange={e => updateRaceField('name', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 lg:col-span-2"
              placeholder="レース名"
            />
            <input
              type="time"
              step={60}
              value={displayRace.startTime ?? ''}
              onChange={e => updateRaceField('startTime', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
              placeholder="発走時刻"
            />
            <input
              type="number"
              min={1}
              value={displayRace.horseCount || ''}
              onChange={e => updateRaceField('horseCount', Math.max(1, Number(e.target.value) || 1))}
              className="border border-gray-300 rounded px-2 py-1"
              placeholder="頭数"
            />
            <select
              value={displayRace.surface}
              onChange={e => updateRaceField('surface', e.target.value as Race['surface'])}
              className="border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="turf">芝</option>
              <option value="dirt">ダート</option>
            </select>
            <input
              type="number"
              min={1}
              value={displayRace.distance || ''}
              onChange={e => updateRaceField('distance', Math.max(1, Number(e.target.value) || 1))}
              className="border border-gray-300 rounded px-2 py-1"
              placeholder="距離"
            />
            <input
              value={displayRace.grade ?? ''}
              onChange={e => updateRaceField('grade', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
              placeholder="格"
            />
            <select
              value={displayRace.direction ?? ''}
              onChange={e => updateRaceField('direction', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="">回りなし</option>
              <option value="右">右</option>
              <option value="左">左</option>
            </select>
            {saveMessage && <span className="text-xs text-blue-600 self-center">{saveMessage}</span>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 text-sm text-gray-600 pl-1">
            <span className="font-medium text-gray-800">{displayRace.name}</span>
            {displayRace.grade && <span className="text-red-600 font-bold">{displayRace.grade}</span>}
            {displayRace.startTime && <span>{displayRace.startTime}</span>}
            {displayRace.distance > 0 && <span>{surface}{displayRace.distance}m{displayRace.direction ? ` ${displayRace.direction}` : ''}</span>}
            {displayRace.horseCount > 0 && <span>{displayRace.horseCount}頭</span>}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!editable && (
          <>
            <PredictionCard
              picks={picks}
              loading={picksLoading}
              entries={entries}
              onNavigate={onNavigate}
              backView={backView}
              collapsed={predictionCollapsed}
              onToggle={() => setPredictionCollapsed(value => !value)}
            />
            <UserPredictionCard
              picks={userPicks}
              saving={userPicksSaving}
              message={userPicksMessage}
              entries={entries}
              collapsed={userPredictionCollapsed}
              onToggle={() => setUserPredictionCollapsed(value => !value)}
              onChange={updateUserPick}
              onSave={handleSaveUserPicks}
            />
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
            <span className="ml-3 text-gray-500">出馬表を取得中...</span>
          </div>
        )}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}
        {!editable && !loading && !error && entries.length === 0 && (
          <p className="text-gray-400 text-center py-16 text-sm">出馬表がまだ発表されていません</p>
        )}

        {!loading && !error && (entries.length > 0 || editable) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {showPlacement && (
                    editable
                      ? <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 w-10">着順</th>
                      : <SortTh label="着順" col="placement" sortKey={sortKey} asc={sortAsc} onSort={handleSort} className="w-10" />
                  )}
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 w-8">枠</th>
                  {editable
                    ? <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 w-8">馬番</th>
                    : <SortTh label="馬番" col="horseNumber" sortKey={sortKey} asc={sortAsc} onSort={handleSort} className="w-8" />}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">馬名</th>
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">性齢</th>
                  {editable
                    ? <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">斤量</th>
                    : <SortTh label="斤量(差)" col="weight" sortKey={sortKey} asc={sortAsc} onSort={handleSort} className="hidden sm:table-cell" />}
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500">騎手</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">調教師</th>
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">オッズ</th>
                  <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">人気</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((horse, idx) => {
                  const gateColor = GATE_COLORS[horse.gateNumber] ?? 'bg-gray-200';
                  const plClass = PLACEMENT_COLOR[horse.placement ?? ''] ?? 'text-gray-700';
                  const cellInput = 'w-full min-w-0 border border-gray-300 rounded px-1.5 py-1 text-xs bg-white';
                  return (
                    <tr key={horse.horseNumber} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      {/* 着順 */}
                      {showPlacement && (
                        <td className={`px-2 py-2 text-center font-bold text-sm ${plClass}`}>
                          {editable ? (
                            <input
                              value={horse.placement ?? ''}
                              onChange={e => updateEntry(idx, { placement: e.target.value || undefined })}
                              className={cellInput}
                            />
                          ) : horse.placement ?? '-'}
                        </td>
                      )}
                      {/* 枠番 */}
                      <td className="px-2 py-2 text-center">
                        {editable ? (
                          <input
                            type="number"
                            value={horse.gateNumber || ''}
                            onChange={e => updateEntry(idx, { gateNumber: Number(e.target.value) || 0 })}
                            className={`${cellInput} text-center`}
                          />
                        ) : (
                          <span className={`inline-flex w-6 h-6 rounded-full border text-xs font-bold items-center justify-center ${gateColor}`}>
                            {horse.gateNumber}
                          </span>
                        )}
                      </td>
                      {/* 馬番 */}
                      <td className="px-2 py-2 text-center font-bold text-gray-700">
                        {editable ? (
                          <input
                            type="number"
                            value={horse.horseNumber || ''}
                            onChange={e => updateEntry(idx, { horseNumber: Number(e.target.value) || 0 })}
                            className={`${cellInput} text-center`}
                          />
                        ) : horse.horseNumber}
                      </td>
                      {/* 馬名 */}
                      <td className="px-3 py-2">
                        {editable ? (
                          <input
                            value={horse.horseName}
                            onChange={e => updateEntry(idx, { horseName: e.target.value })}
                            className={cellInput}
                            placeholder="馬名"
                          />
                        ) : horse.horseId ? (
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
                        {editable ? (
                          <div className="flex gap-1">
                            <input
                              value={horse.sex}
                              onChange={e => updateEntry(idx, { sex: e.target.value })}
                              className={`${cellInput} w-10 text-center`}
                              placeholder="性"
                            />
                            <input
                              type="number"
                              value={horse.age || ''}
                              onChange={e => updateEntry(idx, { age: Number(e.target.value) || 0 })}
                              className={`${cellInput} w-12 text-center`}
                              placeholder="齢"
                            />
                          </div>
                        ) : `${horse.sex}${horse.age}`}
                      </td>
                      {/* 斤量(差) */}
                      <td className="px-2 py-2 text-center text-gray-600 hidden sm:table-cell">
                        {editable ? (
                          <input
                            type="number"
                            step="0.5"
                            value={horse.weight || ''}
                            onChange={e => updateEntry(idx, { weight: Number(e.target.value) || 0 })}
                            className={`${cellInput} text-center`}
                          />
                        ) : horse.weight > 0 ? (
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
                      <td className="px-2 py-2 text-gray-700 text-xs">
                        {editable ? (
                          <input
                            value={horse.jockey}
                            onChange={e => updateEntry(idx, { jockey: e.target.value })}
                            className={cellInput}
                            placeholder="騎手"
                          />
                        ) : horse.jockey || '-'}
                      </td>
                      {/* 調教師 */}
                      <td className="px-2 py-2 text-gray-600 text-xs hidden md:table-cell">
                        {editable ? (
                          <input
                            value={horse.trainer}
                            onChange={e => updateEntry(idx, { trainer: e.target.value })}
                            className={cellInput}
                            placeholder="調教師"
                          />
                        ) : horse.trainer || '-'}
                      </td>
                      {/* オッズ・人気 */}
                      <td className="px-2 py-2 text-center text-xs text-gray-700 font-medium">
                        {editable ? (
                          <input
                            value={horse.odds ?? ''}
                            onChange={e => updateEntry(idx, { odds: e.target.value || undefined })}
                            className={`${cellInput} text-center`}
                          />
                        ) : horse.odds ?? '-'}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">
                        {editable ? (
                          <input
                            type="number"
                            value={horse.popularity ?? ''}
                            onChange={e => updateEntry(idx, { popularity: Number(e.target.value) || undefined })}
                            className={`${cellInput} text-center`}
                          />
                        ) : horse.popularity != null ? (
                          <span className={`font-bold ${horse.popularity === 1 ? 'text-red-600' : horse.popularity === 2 ? 'text-blue-600' : horse.popularity === 3 ? 'text-green-600' : 'text-gray-600'}`}>
                            {horse.popularity}人気
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editable && (
              <div className="px-3 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <button
                  onClick={addEntryRow}
                  className="text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                >
                  行を追加
                </button>
                <span className="text-xs text-gray-400">右上の「保存」で登録します</span>
              </div>
            )}
          </div>
        )}
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-80 rounded-lg shadow-xl overflow-hidden bg-white">
            <div className="bg-red-600 px-4 py-3">
              <h2 className="text-white font-bold text-sm">本当に削除しますか？</h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-700 mb-4">このレース情報と登録済みの出馬表を削除します。</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition disabled:opacity-50"
                >
                  いいえ
                </button>
                <button
                  onClick={handleDeleteRace}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
                >
                  {deleting ? '削除中...' : '削除する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
