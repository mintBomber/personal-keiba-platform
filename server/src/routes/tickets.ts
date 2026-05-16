import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { loadPurchasedTickets, savePurchasedTickets } from '../store';
import type { PurchasedTicket, TicketType, PurchaseType } from '../types';

const router = Router();

const TICKET_TYPES: TicketType[] = ['単勝', '複勝', '枠連', '馬連', '馬単', 'ワイド', '3連複', '3連単'];
const PURCHASE_TYPES: PurchaseType[] = ['通常', 'ボックス', 'フォーメーション'];
const SUPPORTS_BOX: TicketType[] = ['馬連', '馬単', 'ワイド', '3連複', '3連単'];
const SUPPORTS_FORMATION: TicketType[] = ['馬単', '3連複', '3連単'];

function normalSelectionCount(type: TicketType): number {
  if (type === '単勝' || type === '複勝') return 1;
  if (type === '3連複' || type === '3連単') return 3;
  return 2;
}

function formationPositionCount(type: TicketType): number {
  if (type === '馬単') return 2;
  return 3; // 3連複・3連単
}

const TICKETS_DIR = path.join(__dirname, '../../data/purchased-tickets');

// GET /api/tickets/purchased-race-ids — must come before /:raceId
router.get('/purchased-race-ids', (_req: Request, res: Response) => {
  if (!fs.existsSync(TICKETS_DIR)) { res.json([]); return; }
  const raceIds: string[] = [];
  for (const file of fs.readdirSync(TICKETS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const base = file.slice(0, -5);
    try {
      const raceId = Buffer.from(base, 'base64url').toString('utf-8');
      const tickets = JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, file), 'utf-8'));
      if (Array.isArray(tickets) && tickets.length > 0) raceIds.push(raceId);
    } catch { /* ignore */ }
  }
  res.json(raceIds);
});

// GET /api/tickets/:raceId
router.get('/:raceId', (req: Request, res: Response) => {
  res.json(loadPurchasedTickets(req.params.raceId));
});

// POST /api/tickets/:raceId
router.post('/:raceId', (req: Request, res: Response) => {
  const { raceId } = req.params;
  const { ticketType, purchaseType, selections, formationSelections, unitAmount, payoutAmount } = req.body;

  if (!TICKET_TYPES.includes(ticketType as TicketType)) {
    res.status(400).json({ error: 'Invalid ticket type' }); return;
  }
  const pt: PurchaseType = PURCHASE_TYPES.includes(purchaseType as PurchaseType) ? purchaseType : '通常';

  if (pt === 'ボックス' && !SUPPORTS_BOX.includes(ticketType as TicketType)) {
    res.status(400).json({ error: 'Box not supported for this ticket type' }); return;
  }
  if (pt === 'フォーメーション' && !SUPPORTS_FORMATION.includes(ticketType as TicketType)) {
    res.status(400).json({ error: 'Formation not supported for this ticket type' }); return;
  }

  if (pt === '通常') {
    const expected = normalSelectionCount(ticketType as TicketType);
    if (!Array.isArray(selections) || selections.length !== expected) {
      res.status(400).json({ error: 'Invalid selections' }); return;
    }
  }
  if (pt === 'ボックス') {
    if (!Array.isArray(selections) || selections.length < 2) {
      res.status(400).json({ error: 'Box needs at least 2 horses' }); return;
    }
  }
  if (pt === 'フォーメーション') {
    const pos = formationPositionCount(ticketType as TicketType);
    if (!Array.isArray(formationSelections) || formationSelections.length !== pos) {
      res.status(400).json({ error: 'Invalid formation' }); return;
    }
  }

  if (typeof unitAmount !== 'number' || unitAmount <= 0) {
    res.status(400).json({ error: 'Invalid amount' }); return;
  }

  const ticket: PurchasedTicket = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ticketType: ticketType as TicketType,
    purchaseType: pt,
    selections: Array.isArray(selections) ? selections : [],
    formationSelections: pt === 'フォーメーション' ? formationSelections : undefined,
    unitAmount,
    payoutAmount: typeof payoutAmount === 'number' && payoutAmount >= 0 ? payoutAmount : undefined,
    createdAt: new Date().toISOString(),
  };

  const tickets = loadPurchasedTickets(raceId);
  tickets.unshift(ticket);
  savePurchasedTickets(raceId, tickets);
  res.json(ticket);
});

// PATCH /api/tickets/:raceId/:ticketId — update payoutAmount
router.patch('/:raceId/:ticketId', (req: Request, res: Response) => {
  const { raceId, ticketId } = req.params;
  const { payoutAmount } = req.body;
  const tickets = loadPurchasedTickets(raceId);
  const idx = tickets.findIndex(t => t.id === ticketId);
  if (idx === -1) { res.status(404).json({ error: 'Ticket not found' }); return; }
  tickets[idx] = {
    ...tickets[idx],
    payoutAmount: typeof payoutAmount === 'number' && payoutAmount >= 0 ? payoutAmount : undefined,
  };
  savePurchasedTickets(raceId, tickets);
  res.json(tickets[idx]);
});

// DELETE /api/tickets/:raceId/:ticketId
router.delete('/:raceId/:ticketId', (req: Request, res: Response) => {
  const { raceId, ticketId } = req.params;
  savePurchasedTickets(raceId, loadPurchasedTickets(raceId).filter(t => t.id !== ticketId));
  res.status(204).send();
});

export default router;
