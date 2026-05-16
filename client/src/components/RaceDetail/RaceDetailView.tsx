import { useEffect, useState } from 'react';
import { Race, RacePick, HorseEntry, View, RaceMeta, RACECOURSES, PurchasedTicket, TicketType, PurchaseType } from '../../types';
import {
  deleteRace,
  fetchPicks,
  fetchRaceMeta,
  fetchShutuba,
  fetchUserPicks,
  saveManualRace,
  saveUserPicks,
  fetchPurchasedTickets,
  addPurchasedTicket,
  deletePurchasedTicket,
  updateTicketPayout,
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

const TICKET_TYPES: TicketType[] = ['単勝', '複勝', '枠連', '馬連', '馬単', 'ワイド', '3連複', '3連単'];
const SUPPORTS_BOX: TicketType[] = ['馬連', '馬単', 'ワイド', '3連複', '3連単'];
const SUPPORTS_FORMATION: TicketType[] = ['馬単', '3連複', '3連単'];
const NORMAL_SEL_COUNT: Record<TicketType, number> = {
  '単勝': 1, '複勝': 1, '枠連': 2, '馬連': 2, '馬単': 2, 'ワイド': 2, '3連複': 3, '3連単': 3,
};
const FORMATION_POS_COUNT: Record<TicketType, number> = {
  '単勝': 1, '複勝': 1, '枠連': 2, '馬連': 2, '馬単': 2, 'ワイド': 2, '3連複': 3, '3連単': 3,
};
const POSITION_LABELS: Record<TicketType, string[]> = {
  '馬単': ['1着', '2着'],
  '3連複': ['軸1', '軸2', '軸3'],
  '3連単': ['1着', '2着', '3着'],
  '単勝': [''], '複勝': [''], '枠連': [''], '馬連': [''], 'ワイド': [''],
};

function calcCombinations(ticket: PurchasedTicket): number {
  const { ticketType, purchaseType, selections, formationSelections } = ticket;
  if (purchaseType === '通常') return 1;
  const n = selections.length;
  if (purchaseType === 'ボックス') {
    if (ticketType === '馬連' || ticketType === 'ワイド') return n * (n - 1) / 2;
    if (ticketType === '馬単') return n * (n - 1);
    if (ticketType === '3連複') return n * (n - 1) * (n - 2) / 6;
    if (ticketType === '3連単') return n * (n - 1) * (n - 2);
    return 1;
  }
  if (purchaseType === 'フォーメーション' && formationSelections) {
    if (formationSelections.length === 2) {
      let count = 0;
      for (const h1 of formationSelections[0]) for (const h2 of formationSelections[1]) if (h1 !== h2) count++;
      return count;
    }
    if (formationSelections.length === 3) {
      if (ticketType === '3連複') {
        const seen = new Set<string>();
        for (const h1 of formationSelections[0]) for (const h2 of formationSelections[1]) for (const h3 of formationSelections[2]) {
          if (h1 !== h2 && h1 !== h3 && h2 !== h3) seen.add([h1, h2, h3].sort((a, b) => a - b).join('-'));
        }
        return seen.size;
      }
      let count = 0;
      for (const h1 of formationSelections[0]) for (const h2 of formationSelections[1]) for (const h3 of formationSelections[2]) {
        if (h1 !== h2 && h1 !== h3 && h2 !== h3) count++;
      }
      return count;
    }
  }
  return 1;
}

function ticketTotalAmount(ticket: PurchasedTicket): number {
  return ticket.unitAmount * calcCombinations(ticket);
}

function formatTicketLabel(ticket: PurchasedTicket): string {
  const { ticketType, purchaseType, selections, formationSelections } = ticket;
  const arrow = ticketType === '馬単' || ticketType === '3連単';
  const sep = arrow ? '→' : '-';
  const fmt = (n: number) => ticketType === '枠連' ? `${n}枠` : `${n}`;
  if (purchaseType === '通常') {
    if (ticketType === '単勝' || ticketType === '複勝') return `${selections[0]}番`;
    return selections.map(fmt).join(sep);
  }
  if (purchaseType === 'ボックス') return `[${selections.map(fmt).join(',')}] BOX`;
  if (purchaseType === 'フォーメーション' && formationSelections) {
    return formationSelections.map(pos => `[${pos.map(fmt).join(',')}]`).join(sep);
  }
  return selections.map(fmt).join(sep);
}

function TicketsPopup({ raceId, race, entries, onClose }: {
  raceId: string;
  race: Race;
  entries: HorseEntry[];
  onClose: () => void;
}) {
  const [tickets, setTickets] = useState<PurchasedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState<TicketType>('単勝');
  const [newPurchaseType, setNewPurchaseType] = useState<PurchaseType>('通常');
  // 通常用
  const [newSelections, setNewSelections] = useState<(number | '')[]>(['']);
  // ボックス用
  const [boxSelections, setBoxSelections] = useState<Set<number>>(new Set());
  // フォーメーション用（ポジション別）
  const [formationSels, setFormationSels] = useState<Set<number>[]>([new Set(), new Set()]);
  const [newAmount, setNewAmount] = useState<number | ''>(100);
  // 払戻金編集
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null);
  const [editingPayoutVal, setEditingPayoutVal] = useState<number | ''>('');

  const horseNums = entries.map(e => e.horseNumber).filter(n => n > 0).sort((a, b) => a - b);
  const allNums = horseNums.length > 0 ? horseNums : Array.from({ length: 18 }, (_, i) => i + 1);
  const gateNums = [1, 2, 3, 4, 5, 6, 7, 8];
  const isGate = newType === '枠連';
  const nums = isGate ? gateNums : allNums;

  const supportsBox = SUPPORTS_BOX.includes(newType);
  const supportsFormation = SUPPORTS_FORMATION.includes(newType);
  const posCount = FORMATION_POS_COUNT[newType];
  const posLabels = POSITION_LABELS[newType] ?? [];

  useEffect(() => {
    fetchPurchasedTickets(raceId)
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [raceId]);

  function resetForm(type: TicketType, pt: PurchaseType) {
    const pos = FORMATION_POS_COUNT[type];
    setNewSelections(Array(NORMAL_SEL_COUNT[type]).fill(''));
    setBoxSelections(new Set());
    setFormationSels(Array.from({ length: pos }, () => new Set<number>()));
    setNewPurchaseType(pt);
    setNewType(type);
  }

  function handleTypeChange(type: TicketType) {
    const pt = newPurchaseType === 'ボックス' && !SUPPORTS_BOX.includes(type) ? '通常'
      : newPurchaseType === 'フォーメーション' && !SUPPORTS_FORMATION.includes(type) ? '通常'
      : newPurchaseType;
    resetForm(type, pt);
  }

  function toggleBox(n: number) {
    setBoxSelections(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  }

  function toggleFormation(posIdx: number, n: number) {
    setFormationSels(prev => prev.map((s, i) => {
      if (i !== posIdx) return s;
      const ns = new Set(s); ns.has(n) ? ns.delete(n) : ns.add(n); return ns;
    }));
  }

  // 組み合わせ数プレビュー
  const previewTicket: PurchasedTicket | null = (() => {
    if (newPurchaseType === 'ボックス') {
      const sel = Array.from(boxSelections).sort((a, b) => a - b);
      if (sel.length < 2) return null;
      return { id: '', ticketType: newType, purchaseType: 'ボックス', selections: sel, unitAmount: Number(newAmount) || 0, createdAt: '' };
    }
    if (newPurchaseType === 'フォーメーション') {
      if (formationSels.some(s => s.size === 0)) return null;
      return { id: '', ticketType: newType, purchaseType: 'フォーメーション', selections: [], formationSelections: formationSels.map(s => Array.from(s).sort((a, b) => a - b)), unitAmount: Number(newAmount) || 0, createdAt: '' };
    }
    return null;
  })();
  const previewCombinations = previewTicket ? calcCombinations(previewTicket) : null;

  const canSave = !saving && Number(newAmount) > 0 && (
    newPurchaseType === '通常' ? newSelections.every(s => s !== '') :
    newPurchaseType === 'ボックス' ? boxSelections.size >= 2 :
    formationSels.every(s => s.size > 0)
  );

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const raceCtx = { raceName: race.name, raceDate: race.date, racecourse: race.racecourse, surface: race.surface, distance: race.distance, horseCount: race.horseCount };
      const payload = newPurchaseType === 'フォーメーション'
        ? { ticketType: newType, purchaseType: newPurchaseType as PurchaseType, selections: [], formationSelections: formationSels.map(s => Array.from(s).sort((a, b) => a - b)), unitAmount: Number(newAmount), ...raceCtx }
        : newPurchaseType === 'ボックス'
        ? { ticketType: newType, purchaseType: newPurchaseType as PurchaseType, selections: Array.from(boxSelections).sort((a, b) => a - b), unitAmount: Number(newAmount), ...raceCtx }
        : { ticketType: newType, purchaseType: '通常' as PurchaseType, selections: newSelections as number[], unitAmount: Number(newAmount), ...raceCtx };
      const ticket = await addPurchasedTicket(raceId, payload);
      setTickets(prev => [ticket, ...prev]);
      resetForm(newType, newPurchaseType);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ticketId: string) {
    await deletePurchasedTicket(raceId, ticketId);
    setTickets(prev => prev.filter(t => t.id !== ticketId));
  }

  async function handleSavePayout(ticketId: string) {
    const val = editingPayoutVal === '' ? undefined : Number(editingPayoutVal);
    const updated = await updateTicketPayout(raceId, ticketId, val);
    setTickets(prev => prev.map(t => t.id === ticketId ? updated : t));
    setEditingPayoutId(null);
  }

  const totalBet = tickets.reduce((sum, t) => sum + ticketTotalAmount(t), 0);
  const totalPayout = tickets.reduce((sum, t) => sum + (t.payoutAmount ?? 0), 0);

  const arrow = newType === '馬単' || newType === '3連単';
  const sep = arrow ? '→' : '-';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-[440px] max-h-[88vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-800">購入馬券</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* ── 新規入力フォーム ── */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            {/* 馬券種類 + 購入方式 */}
            <div className="flex gap-2 flex-wrap">
              <select value={newType} onChange={e => handleTypeChange(e.target.value as TicketType)}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="flex gap-1">
                {(['通常', ...(supportsBox ? ['ボックス'] : []), ...(supportsFormation ? ['フォーメーション'] : [])] as PurchaseType[]).map(pt => (
                  <button key={pt} onClick={() => resetForm(newType, pt)}
                    className={`text-xs px-2 py-1 rounded border transition ${newPurchaseType === pt ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                    {pt}
                  </button>
                ))}
              </div>
            </div>

            {/* 通常 選択 */}
            {newPurchaseType === '通常' && (
              <div className="flex items-center gap-1 flex-wrap">
                {newSelections.map((sel, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-500 text-sm font-bold">{sep}</span>}
                    <select value={sel} onChange={e => setNewSelections(prev => prev.map((s, idx) => idx === i ? (e.target.value === '' ? '' : Number(e.target.value)) : s))}
                      className="border border-gray-300 rounded px-1 py-1 text-sm bg-white w-16 text-center">
                      <option value="">-</option>
                      {nums.map(n => <option key={n} value={n}>{isGate ? `${n}枠` : `${n}番`}</option>)}
                    </select>
                  </span>
                ))}
              </div>
            )}

            {/* ボックス 選択（チェックボックス） */}
            {newPurchaseType === 'ボックス' && (
              <div className="flex flex-wrap gap-1">
                {nums.map(n => (
                  <label key={n} className={`flex items-center gap-0.5 px-2 py-1 rounded border text-xs cursor-pointer transition ${boxSelections.has(n) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                    <input type="checkbox" className="hidden" checked={boxSelections.has(n)} onChange={() => toggleBox(n)} />
                    {isGate ? `${n}枠` : `${n}番`}
                  </label>
                ))}
              </div>
            )}

            {/* フォーメーション 選択 */}
            {newPurchaseType === 'フォーメーション' && (
              <div className="space-y-1.5">
                {Array.from({ length: posCount }, (_, posIdx) => (
                  <div key={posIdx}>
                    <div className="text-xs text-gray-500 mb-1">{posLabels[posIdx] ?? `${posIdx + 1}着`}</div>
                    <div className="flex flex-wrap gap-1">
                      {nums.map(n => (
                        <label key={n} className={`flex items-center gap-0.5 px-2 py-1 rounded border text-xs cursor-pointer transition ${formationSels[posIdx]?.has(n) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                          <input type="checkbox" className="hidden" checked={formationSels[posIdx]?.has(n) ?? false} onChange={() => toggleFormation(posIdx, n)} />
                          {isGate ? `${n}枠` : `${n}番`}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 金額 + 組数プレビュー + 保存 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">1組</span>
              <input type="number" min={100} step={100} value={newAmount}
                onChange={e => setNewAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-24" placeholder="金額" />
              <span className="text-sm text-gray-600">円</span>
              {previewCombinations !== null && (
                <span className="text-xs text-blue-600 font-semibold">{previewCombinations}組 = ¥{(Number(newAmount || 0) * previewCombinations).toLocaleString()}</span>
              )}
              <button onClick={handleSave} disabled={!canSave}
                className="ml-auto px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-50">
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>

          {/* ── 登録済みリスト ── */}
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-2">読み込み中...</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">購入馬券はまだ登録されていません</p>
          ) : (
            <div className="space-y-2">
              {tickets.map(ticket => {
                const combos = calcCombinations(ticket);
                const total = ticket.unitAmount * combos;
                const isEditingPayout = editingPayoutId === ticket.id;
                return (
                  <div key={ticket.id} className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white bg-blue-500 rounded px-1.5 py-0.5 whitespace-nowrap">{ticket.ticketType}</span>
                      {ticket.purchaseType !== '通常' && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">{ticket.purchaseType}</span>
                      )}
                      <span className="text-sm font-medium text-gray-800 flex-1 min-w-0 break-all">{formatTicketLabel(ticket)}</span>
                      <button onClick={() => handleDelete(ticket.id)}
                        className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 transition whitespace-nowrap">
                        削除する
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                      <span>¥{ticket.unitAmount.toLocaleString()} × {combos}組 = <span className="font-semibold text-gray-800">¥{total.toLocaleString()}</span></span>
                      <span className="flex items-center gap-1">
                        払戻：
                        {isEditingPayout ? (
                          <>
                            <input type="number" min={0} step={10} autoFocus value={editingPayoutVal}
                              onChange={e => setEditingPayoutVal(e.target.value === '' ? '' : Number(e.target.value))}
                              onBlur={() => handleSavePayout(ticket.id)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSavePayout(ticket.id); if (e.key === 'Escape') setEditingPayoutId(null); }}
                              className="border border-gray-300 rounded px-1 py-0.5 w-24 text-right" />
                            <span>円</span>
                          </>
                        ) : (
                          <button onClick={() => { setEditingPayoutId(ticket.id); setEditingPayoutVal(ticket.payoutAmount ?? ''); }}
                            className="underline decoration-dotted text-blue-600 hover:text-blue-800">
                            {ticket.payoutAmount != null ? `¥${ticket.payoutAmount.toLocaleString()}` : '未入力'}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── フッター：合計 ── */}
        {!loading && tickets.length > 0 && (
          <div className="border-t border-gray-200 px-4 py-3 flex-shrink-0 bg-gray-50 rounded-b-xl space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">合計掛け金</span>
              <span className="font-bold text-gray-800">¥{totalBet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">合計払戻金</span>
              <span className={`font-bold ${totalPayout > totalBet ? 'text-green-600' : totalPayout > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {totalPayout > 0 ? `¥${totalPayout.toLocaleString()}` : '—'}
              </span>
            </div>
            {totalPayout > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>収支</span>
                <span className={totalPayout >= totalBet ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {totalPayout >= totalBet ? '+' : ''}¥{(totalPayout - totalBet).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
  picks, saving, message, entries, collapsed, onToggle, onChange, onSave, onOpenTickets,
}: {
  picks: RacePick;
  saving: boolean;
  message: string;
  entries: HorseEntry[];
  collapsed: boolean;
  onToggle: () => void;
  onChange: (key: keyof Pick<RacePick, 'honmei' | 'taikou' | 'tanana'>, value: string) => void;
  onSave: () => void;
  onOpenTickets: () => void;
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
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h2 className="text-sm font-bold text-gray-800">自分の予想</h2>
          <button
            onClick={onOpenTickets}
            className="text-xs px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200 transition whitespace-nowrap"
          >
            購入馬券
          </button>
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
  const [showTicketsPopup, setShowTicketsPopup] = useState(false);
  const [hasTickets, setHasTickets] = useState(false);
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

  useEffect(() => {
    if (!race.id) return;
    fetchPurchasedTickets(race.id)
      .then(list => setHasTickets(list.length > 0))
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
            <h1 className="font-bold text-gray-900 flex items-center gap-1.5">
              {displayRace.racecourse} 第{displayRace.raceNumber}レース
              {hasTickets && <span title="購入馬券あり">💴</span>}
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
              onOpenTickets={() => setShowTicketsPopup(true)}
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
      {showTicketsPopup && (
        <TicketsPopup
          raceId={race.id}
          race={displayRace}
          entries={entries}
          onClose={() => {
            setShowTicketsPopup(false);
            fetchPurchasedTickets(race.id).then(list => setHasTickets(list.length > 0)).catch(() => undefined);
          }}
        />
      )}
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
