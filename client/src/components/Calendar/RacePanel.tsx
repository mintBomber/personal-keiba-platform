import { useEffect, useState } from 'react';
import { Race, View } from '../../types';
import { fetchRaces } from '../../api/client';

const SURFACE: Record<string, string> = { turf: '芝', dirt: 'ダ' };

const GRADE_STYLE: Record<string, string> = {
  G1: 'bg-red-600 text-white',
  G2: 'bg-purple-600 text-white',
  G3: 'bg-blue-500 text-white',
  L:  'bg-orange-400 text-white',
};

function GradeBadge({ grade }: { grade: string }) {
  if (!grade) return null;
  const style = GRADE_STYLE[grade] ?? 'bg-gray-500 text-white';
  return (
    <span className={`inline-block text-xs font-bold px-1 py-0.5 rounded leading-none ${style}`}>
      {grade}
    </span>
  );
}

interface Props {
  selectedDate: string | null;
  isScheduledRaceDay: boolean;
  onNavigate: (view: View) => void;
}

// Group races by race number, return sorted map
function groupByRaceNum(races: Race[]): Map<number, Race[]> {
  const map = new Map<number, Race[]>();
  for (const race of races) {
    if (!map.has(race.raceNumber)) map.set(race.raceNumber, []);
    map.get(race.raceNumber)!.push(race);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

interface RaceRowProps {
  race: Race;
  onNavigate: (view: View) => void;
}

function RaceRow({ race, onNavigate }: RaceRowProps) {
  const surface = SURFACE[race.surface] ?? race.surface;

  return (
    <div className="ml-2 mb-2">
      {/* Track name + race info (clickable row) */}
      <button
        onClick={() => onNavigate({ type: 'raceDetail', raceId: race.id, race })}
        className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all group"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-block bg-green-700 text-white text-xs font-bold px-1.5 py-0.5 rounded group-hover:bg-blue-600 transition-colors">
            {race.racecourse}
          </span>
          {race.grade && <GradeBadge grade={race.grade} />}
          <span className="text-sm font-medium text-gray-800 truncate max-w-[110px]">{race.name}</span>
          {race.startTime && <span className="text-xs text-gray-500">{race.startTime}</span>}
          {race.distance > 0 && (
            <span className="text-xs text-gray-500">{surface}{race.distance}m</span>
          )}
          {race.horseCount > 0 && (
            <span className="text-xs text-gray-400">{race.horseCount}頭</span>
          )}
        </div>
        {/* Picks */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs pl-1">
          <span>
            <span className="font-bold text-red-600">◎</span>
            <span className="ml-0.5 text-gray-700">{race.picks.honmei}</span>
          </span>
          <span>
            <span className="font-bold text-blue-600">〇</span>
            <span className="ml-0.5 text-gray-700">{race.picks.taikou}</span>
          </span>
          <span>
            <span className="font-bold text-green-600">△</span>
            <span className="ml-0.5 text-gray-700">{race.picks.tanana}</span>
          </span>
        </div>
      </button>
    </div>
  );
}

export default function RacePanel({ selectedDate, isScheduledRaceDay, onNavigate }: Props) {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDate) { setRaces([]); setError(null); return; }
    setLoading(true);
    setError(null);
    fetchRaces(selectedDate)
      .then(setRaces)
      .catch(() => setError('レース情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const grouped = groupByRaceNum(races);

  const [y, m, d] = selectedDate?.split('-') ?? [];
  const dateLabel = selectedDate
    ? `${parseInt(y)}年${parseInt(m)}月${parseInt(d)}日`
    : null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-3 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
        {dateLabel
          ? <h2 className="font-bold text-gray-800 text-sm">{dateLabel}のレース</h2>
          : <h2 className="text-gray-400 text-sm">日付を選択してください</h2>}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {!selectedDate && (
          <p className="text-gray-400 text-xs text-center mt-8">
            カレンダーの日付をクリック<br />するとレース情報が表示されます
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-green-500 border-t-transparent" />
            <span className="ml-2 text-gray-500 text-sm">読み込み中...</span>
          </div>
        )}

        {error && !loading && (
          <div className="mx-3 bg-red-50 border border-red-200 rounded p-3 text-red-700 text-xs">
            {error}
            <p className="mt-1 text-gray-500">設定画面で「競馬情報の更新」を実行してください</p>
          </div>
        )}

        {!loading && !error && selectedDate && races.length === 0 && (
          <div className="mx-3 text-center mt-8">
            {isScheduledRaceDay ? (
              <>
                <p className="text-yellow-600 text-xs font-medium">開催予定日</p>
                <p className="text-gray-400 text-xs mt-1">レース詳細はまだ公開されていません</p>
                <p className="text-gray-400 text-xs mt-1">（発表後に「情報更新」で取得できます）</p>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-xs">この日のレースはありません</p>
                <p className="text-gray-400 text-xs mt-1">設定画面で「競馬情報の更新」を実行してください</p>
              </>
            )}
          </div>
        )}

        {/* Grouped by race number */}
        {!loading && !error && [...grouped.entries()].map(([raceNum, raceList]) => (
          <div key={raceNum} className="mb-3">
            {/* Race number header */}
            <div className="px-3 py-1 bg-gray-200 sticky top-0 z-10">
              <span className="text-xs font-bold text-gray-600">第{raceNum}レース</span>
            </div>
            {/* Each track's race */}
            <div className="px-1 pt-1">
              {raceList.map(race => (
                <RaceRow
                  key={race.id}
                  race={race}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
