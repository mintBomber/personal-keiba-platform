import { useEffect, useState } from 'react';
import { RACECOURSES, UpdateResult } from '../../types';
import { fetchSettings, saveSettings, runUpdate } from '../../api/client';

interface Props {
  onBack: () => void;
}

export default function SettingsView({ onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'error' } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<UpdateResult | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(s => setSelected(new Set(s.favoriteTrackIds)))
      .catch(() => setMessage({ text: '設定の読み込みに失敗しました', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await saveSettings({ favoriteTrackIds: Array.from(selected) });
      setMessage({ text: '保存しました', type: 'ok' });
    } catch {
      setMessage({ text: '保存に失敗しました', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    setUpdating(true);
    setMessage(null);
    try {
      // Save current settings first
      await saveSettings({ favoriteTrackIds: Array.from(selected) });
      // Then run update
      const result = await runUpdate();
      setLastUpdate(result);
      setMessage({
        text: `更新完了: ${result.raceDays}日分 / ${result.totalRaces}レース取得`,
        type: 'ok',
      });
    } catch {
      setMessage({ text: '更新に失敗しました', type: 'error' });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
        >
          ← カレンダーに戻る
        </button>
        <h1 className="text-lg font-bold text-gray-800">設定</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* ── Favorite tracks ────────────────────────────────── */}
        <section>
          <h2 className="text-base font-bold text-gray-700 mb-1">お気に入り競馬場</h2>
          <p className="text-xs text-gray-500 mb-3">
            カレンダーに表示したい競馬場を選択してください。
          </p>

          <div className="flex gap-2 mb-3">
            <button onClick={() => setSelected(new Set(RACECOURSES.map(r => r.id)))}
              className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 transition">
              すべて選択
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 transition">
              すべて解除
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {RACECOURSES.map(course => {
                const on = selected.has(course.id);
                return (
                  <button key={course.id} onClick={() => toggle(course.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-all text-left ${
                      on ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      on ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}>
                      {on && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{course.name}</div>
                      <div className="text-xs text-gray-400">{course.location}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || loading}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition">
              {saving ? '保存中...' : '設定を保存'}
            </button>
          </div>
        </section>

        {/* ── Data update ────────────────────────────────────── */}
        <section className="border-t border-gray-200 pt-6">
          <h2 className="text-base font-bold text-gray-700 mb-1">競馬情報の更新</h2>
          <p className="text-xs text-gray-500 mb-4">
            過去3年〜2年後先までのスケジュールと、未取得のレース詳細情報を一括取得します。<br />
            初回は数分かかる場合があります。2回目以降は差分のみ取得するため高速です。
          </p>

          {lastUpdate && (
            <div className="mb-3 text-xs text-gray-500 bg-gray-50 rounded p-2">
              前回の更新: {new Date(lastUpdate.updatedAt).toLocaleString('ja-JP')} —
              {lastUpdate.raceDays}日分 / {lastUpdate.totalRaces}レース
            </div>
          )}

          <button
            onClick={handleUpdate}
            disabled={updating || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition"
          >
            {updating && (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {updating ? '更新中...' : '競馬情報を更新する'}
          </button>

          {updating && (
            <p className="mt-2 text-xs text-gray-500">
              スケジュールとレース情報を取得しています。しばらくお待ちください...
            </p>
          )}
        </section>

        {/* Message */}
        {message && (
          <div className={`rounded-lg p-3 text-sm ${
            message.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
