import { useEffect, useRef, useState } from 'react';
import { FavoriteHorse, HorseSearchResult, RaceScheduleDay, View } from '../../types';
import { fetchFavoriteHorses, fetchSchedule, searchHorse } from '../../api/client';
import RacePanel from './RacePanel';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Returns 0=Mon ... 6=Sun (ISO weekday - 1)
function getFirstWeekday(year: number, month: number): number {
  const dow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

interface Props {
  onNavigateSettings: () => void;
  onNavigate: (view: View) => void;
}

export default function CalendarView({ onNavigateSettings, onNavigate }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    toDateString(today.getFullYear(), today.getMonth() + 1, today.getDate())
  );
  const [schedule, setSchedule] = useState<RaceScheduleDay[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [showHorseSearch, setShowHorseSearch] = useState(false);
  const [horseQuery, setHorseQuery] = useState('');
  const [horseSearching, setHorseSearching] = useState(false);
  const [horseSearchError, setHorseSearchError] = useState<string | null>(null);
  const [horseSearchResults, setHorseSearchResults] = useState<HorseSearchResult[] | null>(null);
  const [showFavoriteHorses, setShowFavoriteHorses] = useState(false);
  const [favoriteHorses, setFavoriteHorses] = useState<FavoriteHorse[]>([]);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const horseInputRef = useRef<HTMLInputElement>(null);

  const todayStr = toDateString(today.getFullYear(), today.getMonth() + 1, today.getDate());

  useEffect(() => {
    setLoadingSchedule(true);
    fetchSchedule(year, month)
      .then(setSchedule)
      .catch(err => console.error('Schedule fetch error:', err))
      .finally(() => setLoadingSchedule(false));
  }, [year, month]);

  function openHorseSearch() {
    setHorseQuery('');
    setHorseSearchError(null);
    setHorseSearchResults(null);
    setShowFavoriteHorses(false);
    setShowHorseSearch(true);
    setTimeout(() => horseInputRef.current?.focus(), 50);
  }

  function closeHorseSearch() {
    setShowHorseSearch(false);
    setHorseQuery('');
    setHorseSearchError(null);
    setHorseSearchResults(null);
    setShowFavoriteHorses(false);
  }

  async function handleToggleFavoriteList() {
    const next = !showFavoriteHorses;
    setShowFavoriteHorses(next);
    setHorseSearchError(null);
    setHorseSearchResults(null);
    if (!next) return;

    setFavoriteLoading(true);
    try {
      const favorites = await fetchFavoriteHorses();
      setFavoriteHorses(favorites);
    } catch {
      setFavoriteHorses([]);
      setHorseSearchError('お気に入り馬を取得できませんでした');
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function handleHorseSearch() {
    const name = horseQuery.trim();
    if (!name || horseSearching) return;
    setHorseSearching(true);
    setHorseSearchError(null);
    setHorseSearchResults(null);
    setShowFavoriteHorses(false);
    try {
      const results = await searchHorse(name);
      if (results.length === 0) {
        setHorseSearchError('該当する馬は登録されていません');
      } else if (results.length === 1) {
        closeHorseSearch();
        onNavigate({ type: 'horseDetail', horseId: results[0].horseId, horseName: results[0].horseName, backView: { type: 'calendar' } });
      } else {
        setHorseSearchResults(results);
      }
    } catch {
      setHorseSearchError('該当する馬は登録されていません');
    } finally {
      setHorseSearching(false);
    }
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekday(year, month);

  // Build a flat array: null for empty leading cells, then day numbers
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last week
  while (cells.length % 7 !== 0) cells.push(null);

  const raceDayMap = new Map<string, RaceScheduleDay>();
  schedule.forEach(day => raceDayMap.set(day.date, day));

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left: Calendar (2/3) */}
      <div className="flex flex-col w-2/3 min-w-0 border-r border-gray-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateSettings}
              className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
            >
              設定
            </button>
            <button
              onClick={openHorseSearch}
              className="text-sm px-3 py-1 rounded bg-green-100 hover:bg-green-200 text-green-700 border border-green-200 transition"
            >
              馬
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-lg transition"
            >
              ‹
            </button>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="text-sm font-bold text-gray-800 bg-transparent border border-gray-200 rounded px-1 py-0.5 cursor-pointer hover:border-gray-400 transition"
            >
              {Array.from({ length: 4 }, (_, i) => today.getFullYear() - 1 + i).map(y => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="text-sm font-bold text-gray-800 bg-transparent border border-gray-200 rounded px-1 py-0.5 cursor-pointer hover:border-gray-400 transition"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-lg transition"
            >
              ›
            </button>
          </div>

          <div className="w-16" /> {/* spacer */}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto p-3">
          {loadingSchedule && (
            <div className="text-center text-gray-400 text-sm py-4">スケジュール読み込み中...</div>
          )}

          <table className="w-full border-collapse">
            <thead>
              <tr>
                {WEEKDAYS.map((wd, i) => (
                  <th
                    key={wd}
                    className={`text-center text-xs font-semibold py-2 ${
                      i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-500'
                    }`}
                  >
                    {wd}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((day, di) => {
                    if (!day) {
                      return <td key={di} className="p-1 h-20 align-top" />;
                    }

                    const dateStr = toDateString(year, month, day);
                    const raceDay = raceDayMap.get(dateStr);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const hasRaces = !!raceDay;

                    return (
                      <td
                        key={di}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`p-1 h-20 align-top border border-gray-100 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-100 border-blue-300'
                            : hasRaces
                            ? 'hover:bg-green-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {/* Day number */}
                        <div className={`text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-red-500 text-white'
                            : isSelected
                            ? 'bg-blue-500 text-white'
                            : di === 5
                            ? 'text-blue-600'
                            : di === 6
                            ? 'text-red-600'
                            : 'text-gray-700'
                        }`}>
                          {day}
                        </div>

                        {/* Track badges */}
                        {raceDay && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {raceDay.tracks.map(t => (
                              <span
                                key={t.id}
                                className="text-xs bg-green-100 text-green-800 rounded px-1 leading-tight"
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Race Panel (1/3) */}
      <div className="w-1/3 flex flex-col min-w-0">
        <RacePanel
          selectedDate={selectedDate}
          isScheduledRaceDay={selectedDate ? !!raceDayMap.get(selectedDate) : false}
          onNavigate={onNavigate}
        />
      </div>

      {/* Horse search popup */}
      {showHorseSearch && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) closeHorseSearch(); }}
        >
          <div className="bg-white rounded-xl shadow-xl p-5 w-80">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleToggleFavoriteList}
                className={`w-8 h-8 rounded-full text-lg leading-none transition ${
                  showFavoriteHorses ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300 bg-gray-50 hover:bg-gray-100'
                }`}
                title="お気に入り馬"
              >
                ★
              </button>
              <h3 className="font-bold text-gray-800 text-base">馬名で検索</h3>
            </div>
            <input
              ref={horseInputRef}
              type="text"
              value={horseQuery}
              onChange={e => { setHorseQuery(e.target.value); setHorseSearchError(null); setHorseSearchResults(null); setShowFavoriteHorses(false); }}
              onKeyDown={e => { if (e.key === 'Enter') handleHorseSearch(); if (e.key === 'Escape') closeHorseSearch(); }}
              placeholder="馬名を入力..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            {horseSearchError && (
              <p className="text-red-500 text-xs mb-3">{horseSearchError}</p>
            )}
            {horseSearchResults && horseSearchResults.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">候補 {horseSearchResults.length}件</p>
                <div className="max-h-72 overflow-y-auto bg-gray-100 rounded-lg p-2">
                  {horseSearchResults.map(h => (
                    <div
                      key={h.horseId}
                      className="px-2 py-1.5 hover:bg-gray-200 cursor-pointer rounded text-sm text-gray-800 transition"
                      onClick={() => {
                        closeHorseSearch();
                        onNavigate({ type: 'horseDetail', horseId: h.horseId, horseName: h.horseName, backView: { type: 'calendar' } });
                      }}
                    >
                      {h.horseName}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showFavoriteHorses && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">お気に入り馬</p>
                <div className="max-h-72 overflow-y-auto bg-yellow-50 rounded-lg p-2 border border-yellow-100">
                  {favoriteLoading ? (
                    <p className="px-2 py-2 text-sm text-gray-500">読み込み中...</p>
                  ) : favoriteHorses.length > 0 ? (
                    favoriteHorses.map(h => (
                      <div
                        key={h.horseId}
                        className="px-2 py-1.5 hover:bg-yellow-100 cursor-pointer rounded text-sm text-gray-800 transition"
                        onClick={() => {
                          closeHorseSearch();
                          onNavigate({ type: 'horseDetail', horseId: h.horseId, horseName: h.horseName, backView: { type: 'calendar' } });
                        }}
                      >
                        <span className="text-yellow-500 mr-1">★</span>{h.horseName}
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-2 text-sm text-gray-500">お気に入り馬はまだありません</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeHorseSearch}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleHorseSearch}
                disabled={horseSearching || !horseQuery.trim()}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-50"
              >
                {horseSearching ? '検索中...' : '検索'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
