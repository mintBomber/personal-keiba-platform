import { useEffect, useRef, useState } from 'react';
import { Race, RacePick, View } from '../../types';
import { fetchRaces, fetchPicks } from '../../api/client';

const SURFACE: Record<string, string> = { turf: '芝', dirt: 'ダ' };

const GRADE_STYLE: Record<string, string> = {
  G1: 'bg-red-600 text-white',
  G2: 'bg-purple-600 text-white',
  G3: 'bg-blue-500 text-white',
  'J・G3': 'bg-blue-500 text-white',
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
  picks: RacePick | null;
  onNavigate: (view: View) => void;
}

function RaceRow({ race, picks, onNavigate }: RaceRowProps) {
  const surface = SURFACE[race.surface] ?? race.surface;
  const displayPicks = picks ?? race.picks;
  const hasRealPicks = displayPicks.honmei !== '---';
  const hasDetailedPage = /^\d{12}$/.test(race.id);

  const content = (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-block bg-green-700 text-white text-xs font-bold px-1.5 py-0.5 rounded ${hasDetailedPage ? 'group-hover:bg-blue-600 transition-colors' : ''}`}>
          {race.racecourse}
        </span>
        {race.grade && <GradeBadge grade={race.grade} />}
        <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{race.name}</span>
        {race.startTime && <span className="text-xs text-gray-500">{race.startTime}</span>}
        {race.distance > 0 && (
          <span className="text-xs text-gray-500">{surface}{race.distance}m</span>
        )}
        {race.horseCount > 0 && (
          <span className="text-xs text-gray-400">{race.horseCount}頭</span>
        )}
      </div>
      {/* Picks — only shown when odds data is available */}
      {hasRealPicks && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs pl-1">
          <span>
            <span className="font-bold text-red-600">◎</span>
            <span className="ml-0.5 text-gray-700">{displayPicks.honmei}</span>
          </span>
          <span>
            <span className="font-bold text-blue-600">〇</span>
            <span className="ml-0.5 text-gray-700">{displayPicks.taikou}</span>
          </span>
          <span>
            <span className="font-bold text-green-600">△</span>
            <span className="ml-0.5 text-gray-700">{displayPicks.tanana}</span>
          </span>
        </div>
      )}
    </>
  );

  return (
    <div className="ml-2 mb-2">
      {hasDetailedPage ? (
        <button
          onClick={() => onNavigate({ type: 'raceDetail', raceId: race.id, race })}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all group"
        >
          {content}
        </button>
      ) : (
        <div className="w-full text-left px-2 py-1.5 rounded border border-transparent bg-white">
          {content}
        </div>
      )}
    </div>
  );
}

export default function RacePanel({ selectedDate, isScheduledRaceDay, onNavigate }: Props) {
  const [races, setRaces] = useState<Race[]>([]);
  const [picksMap, setPicksMap] = useState<Map<string, RacePick>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      setRaces([]);
      setPicksMap(new Map());
      setError(null);
      return;
    }

    // Cancel any in-flight picks fetch from a previous date
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setPicksMap(new Map());
    setError(null);

    fetchRaces(selectedDate)
      .then(data => {
        setRaces(data);

        // Only fetch picks for past/today races where odds data exists
        const today = new Date().toISOString().slice(0, 10);
        if (selectedDate > today) return;

        const raceIds = data.filter(r => /^\d{12}$/.test(r.id)).map(r => r.id);
        if (raceIds.length === 0) return;

        // Fetch all picks in parallel; ignore errors per race
        Promise.all(
          raceIds.map(id =>
            fetchPicks(id)
              .then(p => ({ id, p }) as { id: string; p: RacePick })
              .catch(() => null)
          )
        ).then(results => {
          if (ac.signal.aborted) return;
          const map = new Map<string, RacePick>();
          for (const r of results) {
            if (r && r.p.honmei !== '---') map.set(r.id, r.p);
          }
          setPicksMap(map);
        });
      })
      .catch(() => setError('レース情報の取得に失敗しました'))
      .finally(() => setLoading(false));

    return () => { ac.abort(); };
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

        {!loading && !error && [...grouped.entries()].map(([raceNum, raceList]) => (
          <div key={raceNum} className="mb-3">
            <div className="px-3 py-1 bg-gray-200 sticky top-0 z-10">
              <span className="text-xs font-bold text-gray-600">
                {raceNum > 0 ? `第${raceNum}レース` : '開催予定'}
              </span>
            </div>
            <div className="px-1 pt-1">
              {raceList.map(race => (
                <RaceRow
                  key={race.id || `${race.racecourseId}-${race.name}`}
                  race={race}
                  picks={picksMap.get(race.id) ?? null}
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
