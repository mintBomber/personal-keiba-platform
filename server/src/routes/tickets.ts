import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { loadBettingRecords, loadPurchasedTickets, saveBettingRecords, savePurchasedTickets } from '../store';
import type { BettingRecord, PurchasedTicket, TicketType, PurchaseType } from '../types';

const router = Router();

const TICKET_TYPES: TicketType[] = ['単勝', '複勝', '枠連', '馬連', '馬単', 'ワイド', '3連複', '3連単'];
const PURCHASE_TYPES: PurchaseType[] = ['通常', 'ボックス', 'フォーメーション'];
const SUPPORTS_BOX: TicketType[] = ['馬連', '馬単', 'ワイド', '3連複', '3連単'];
const SUPPORTS_FORMATION: TicketType[] = ['馬単', '3連複', '3連単'];

const TICKETS_DIR = path.join(__dirname, '../../data/purchased-tickets');

function normalSelCount(type: TicketType): number {
  if (type === '単勝' || type === '複勝') return 1;
  if (type === '3連複' || type === '3連単') return 3;
  return 2;
}

function formationPosCount(type: TicketType): number {
  return type === '馬単' ? 2 : 3;
}

function calcCombinations(pt: PurchaseType, tt: TicketType, sel: number[], form?: number[][]): number {
  if (pt === '通常') return 1;
  const n = sel.length;
  if (pt === 'ボックス') {
    if (tt === '馬連' || tt === 'ワイド') return n * (n - 1) / 2;
    if (tt === '馬単') return n * (n - 1);
    if (tt === '3連複') return n * (n - 1) * (n - 2) / 6;
    if (tt === '3連単') return n * (n - 1) * (n - 2);
    return 1;
  }
  if (pt === 'フォーメーション' && form) {
    if (form.length === 2) {
      let c = 0;
      for (const h1 of form[0]) for (const h2 of form[1]) if (h1 !== h2) c++;
      return c;
    }
    if (form.length === 3) {
      if (tt === '3連複') {
        const seen = new Set<string>();
        for (const h1 of form[0]) for (const h2 of form[1]) for (const h3 of form[2])
          if (h1 !== h2 && h1 !== h3 && h2 !== h3) seen.add([h1, h2, h3].sort((a, b) => a - b).join('-'));
        return seen.size;
      }
      let c = 0;
      for (const h1 of form[0]) for (const h2 of form[1]) for (const h3 of form[2])
        if (h1 !== h2 && h1 !== h3 && h2 !== h3) c++;
      return c;
    }
  }
  return 1;
}

// GET /api/tickets/purchased-race-ids — must come before /:raceId
router.get('/purchased-race-ids', (_req: Request, res: Response) => {
  if (!fs.existsSync(TICKETS_DIR)) { res.json([]); return; }
  const raceIds: string[] = [];
  for (const file of fs.readdirSync(TICKETS_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raceId = Buffer.from(file.slice(0, -5), 'base64url').toString('utf-8');
      const tickets = JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, file), 'utf-8'));
      if (Array.isArray(tickets) && tickets.length > 0) raceIds.push(raceId);
    } catch { /* ignore */ }
  }
  res.json(raceIds);
});

// GET /api/tickets/betting-records — must come before /:raceId
router.get('/betting-records', (_req: Request, res: Response) => {
  res.json(loadBettingRecords());
});

// GET /api/tickets/:raceId
router.get('/:raceId', (req: Request, res: Response) => {
  res.json(loadPurchasedTickets(req.params.raceId));
});

// POST /api/tickets/:raceId
router.post('/:raceId', (req: Request, res: Response) => {
  const { raceId } = req.params;
  const {
    ticketType, purchaseType, selections, formationSelections, unitAmount, payoutAmount,
    raceName, raceDate, racecourse, surface, distance, horseCount,
  } = req.body;

  if (!TICKET_TYPES.includes(ticketType as TicketType)) {
    res.status(400).json({ error: 'Invalid ticket type' }); return;
  }
  const pt: PurchaseType = PURCHASE_TYPES.includes(purchaseType as PurchaseType) ? purchaseType : '通常';
  if (pt === 'ボックス' && !SUPPORTS_BOX.includes(ticketType as TicketType)) {
    res.status(400).json({ error: 'Box not supported' }); return;
  }
  if (pt === 'フォーメーション' && !SUPPORTS_FORMATION.includes(ticketType as TicketType)) {
    res.status(400).json({ error: 'Formation not supported' }); return;
  }
  if (pt === '通常' && (!Array.isArray(selections) || selections.length !== normalSelCount(ticketType as TicketType))) {
    res.status(400).json({ error: 'Invalid selections' }); return;
  }
  if (pt === 'ボックス' && (!Array.isArray(selections) || selections.length < 2)) {
    res.status(400).json({ error: 'Box needs ≥2 horses' }); return;
  }
  if (pt === 'フォーメーション' && (!Array.isArray(formationSelections) || formationSelections.length !== formationPosCount(ticketType as TicketType))) {
    res.status(400).json({ error: 'Invalid formation' }); return;
  }
  if (typeof unitAmount !== 'number' || unitAmount <= 0) {
    res.status(400).json({ error: 'Invalid amount' }); return;
  }

  const sel: number[] = Array.isArray(selections) ? selections : [];
  const form: number[][] | undefined = pt === 'フォーメーション' ? formationSelections : undefined;
  const combos = calcCombinations(pt, ticketType as TicketType, sel, form);

  const ticket: PurchasedTicket = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ticketType: ticketType as TicketType, purchaseType: pt,
    selections: sel, formationSelections: form,
    unitAmount,
    payoutAmount: typeof payoutAmount === 'number' && payoutAmount >= 0 ? payoutAmount : undefined,
    createdAt: new Date().toISOString(),
  };

  const tickets = loadPurchasedTickets(raceId);
  tickets.unshift(ticket);
  savePurchasedTickets(raceId, tickets);

  // Sync BettingRecord
  if (typeof raceName === 'string' && typeof raceDate === 'string' && typeof racecourse === 'string') {
    const record: BettingRecord = {
      id: ticket.id, raceId,
      raceName, raceDate, racecourse,
      surface: surface === 'dirt' ? 'dirt' : 'turf',
      distance: typeof distance === 'number' ? distance : 0,
      horseCount: typeof horseCount === 'number' ? horseCount : 0,
      ticketType: ticketType as TicketType, purchaseType: pt,
      selections: sel, formationSelections: form,
      unitAmount, combinations: combos, totalAmount: unitAmount * combos,
      payoutAmount: ticket.payoutAmount,
      createdAt: ticket.createdAt,
    };
    const records = loadBettingRecords();
    records.push(record);
    saveBettingRecords(records);
  }

  res.json(ticket);
});

// PATCH /api/tickets/:raceId/:ticketId — update payoutAmount
router.patch('/:raceId/:ticketId', (req: Request, res: Response) => {
  const { raceId, ticketId } = req.params;
  const { payoutAmount } = req.body;
  const pa = typeof payoutAmount === 'number' && payoutAmount >= 0 ? payoutAmount : undefined;

  const tickets = loadPurchasedTickets(raceId);
  const idx = tickets.findIndex(t => t.id === ticketId);
  if (idx === -1) { res.status(404).json({ error: 'Ticket not found' }); return; }
  tickets[idx] = { ...tickets[idx], payoutAmount: pa };
  savePurchasedTickets(raceId, tickets);

  const records = loadBettingRecords();
  const ri = records.findIndex(r => r.id === ticketId);
  if (ri >= 0) { records[ri] = { ...records[ri], payoutAmount: pa }; saveBettingRecords(records); }

  res.json(tickets[idx]);
});

// DELETE /api/tickets/:raceId/:ticketId
router.delete('/:raceId/:ticketId', (req: Request, res: Response) => {
  const { raceId, ticketId } = req.params;
  savePurchasedTickets(raceId, loadPurchasedTickets(raceId).filter(t => t.id !== ticketId));
  saveBettingRecords(loadBettingRecords().filter(r => r.id !== ticketId));
  res.status(204).send();
});

export default router;
