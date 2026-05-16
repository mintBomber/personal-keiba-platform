import { useEffect, useState } from 'react';
import { HorseDetail, View } from '../../types';
import { fetchHorse } from '../../api/client';

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

export default function HorseDetailView({ horseId, horseName, onBack }: Props) {
  const [detail, setDetail] = useState<HorseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHorse(horseId)
      .then(setDetail)
      .catch(() => setError('馬情報の取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [horseId]);

  const displayName = detail?.horseName || horseName;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
          >
            ← 戻る
          </button>
          <h1 className="font-bold text-gray-900 text-lg">{displayName}</h1>
          {detail && (
            <span className="text-sm text-gray-500">{detail.sex}{detail.age}歳</span>
          )}
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
                        return (
                          <tr key={i} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{race.date}</td>
                            <td className="px-2 py-1.5 text-gray-600">{race.racecourse}</td>
                            <td className="px-2 py-1.5 text-gray-800 max-w-[120px] truncate">{race.raceName}</td>
                            <td className="px-2 py-1.5 text-center text-gray-600">
                              {race.surface}{race.distance > 0 ? `${race.distance}m` : ''}
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
