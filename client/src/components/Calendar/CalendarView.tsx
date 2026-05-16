import { useEffect, useState } from 'react';
import { RaceScheduleDay, View } from '../../types';
import { fetchSchedule } from '../../api/client';
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

  const todayStr = toDateString(today.getFullYear(), today.getMonth() + 1, today.getDate());

  useEffect(() => {
    setLoadingSchedule(true);
    fetchSchedule(year, month)
      .then(setSchedule)
      .catch(err => console.error('Schedule fetch error:', err))
      .finally(() => setLoadingSchedule(false));
  }, [year, month]);

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
          <button
            onClick={onNavigateSettings}
            className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            設定
          </button>

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
    </div>
  );
}
