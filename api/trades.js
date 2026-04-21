/**
 * Trade Journal API
 * GET  /api/trades          — list all trades (optional ?status=open|closed)
 * POST /api/trades          — log a new trade
 * PATCH /api/trades         — update outcome (body: { id, status, exit_price, exit_reason })
 */

import fs   from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'trades.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { trades: [] }; }
}

function write(db) {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function stats(trades) {
  const closed = trades.filter(t => t.status !== 'open');
  const wins   = closed.filter(t => t.exit_reason === 'target');
  const losses = closed.filter(t => t.exit_reason === 'stoploss');
  const totalPnl    = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalRisk   = closed.reduce((s, t) => s + (t.risk_rs || 0), 0);
  const totalReward = closed.reduce((s, t) => s + (t.reward_rs || 0), 0);
  return {
    total:    trades.length,
    open:     trades.filter(t => t.status === 'open').length,
    closed:   closed.length,
    wins:     wins.length,
    losses:   losses.length,
    win_rate: closed.length ? +(wins.length / closed.length * 100).toFixed(1) : null,
    total_pnl: +totalPnl.toFixed(2),
    avg_rr:    totalRisk ? +(totalReward / totalRisk).toFixed(2) : null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const db = read();

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url, 'https://x.vercel.app');
    const status = url.searchParams.get('status');
    const trades = status
      ? db.trades.filter(t => t.status === status)
      : [...db.trades].reverse(); // newest first
    res.status(200).json({ trades, stats: stats(db.trades) });
    return;
  }

  // ── POST — log new trade ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      symbol, exchange = 'NSE', sector = '', side = 'BUY',
      entry, target, sl, qty, capital,
      risk_rs, reward_rs, rr,
      trigger_id,       // Kite GTT trigger ID
      factors = {},     // ATR%, VIX, beta etc. from trade-plan
      source = 'market-brain',
      confidence, score,
    } = req.body ?? {};

    if (!symbol || !entry || !target || !sl || !qty) {
      res.status(400).json({ error: 'symbol, entry, target, sl, qty required' }); return;
    }

    // Bulk replace (used by clear-closed on frontend)
    if (req.body?._bulk_replace) {
      db.trades = req.body._bulk_replace;
      write(db);
      res.status(200).json({ stats: stats(db.trades) });
      return;
    }

    const trade = {
      id:           `${Date.now()}-${symbol}`,
      symbol:       symbol.toUpperCase(),
      exchange,
      sector,
      side,
      entry:        +entry,
      target:       +target,
      sl:           +sl,
      qty:          +qty,
      capital:      +capital || 0,
      risk_rs:      +risk_rs || 0,
      reward_rs:    +reward_rs || 0,
      rr:           +rr || 0,
      trigger_id:   trigger_id || null,
      factors,
      source,
      confidence:   +confidence || 0,
      score:        +score || 0,
      status:       'open',
      pnl:          null,
      exit_price:   null,
      exit_reason:  null,  // 'target' | 'stoploss' | 'manual'
      opened_at:    new Date().toISOString(),
      closed_at:    null,
    };

    db.trades.push(trade);
    write(db);
    res.status(201).json({ trade, stats: stats(db.trades) });
    return;
  }

  // ── PATCH — update outcome ───────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, status, exit_price, exit_reason } = req.body ?? {};
    if (!id) { res.status(400).json({ error: 'id required' }); return; }

    const trade = db.trades.find(t => t.id === id);
    if (!trade) { res.status(404).json({ error: 'Trade not found' }); return; }

    trade.status      = status      || trade.status;
    trade.exit_price  = exit_price  != null ? +exit_price : trade.exit_price;
    trade.exit_reason = exit_reason || trade.exit_reason;

    if (exit_price != null) {
      trade.pnl = +((+exit_price - trade.entry) * trade.qty * (trade.side === 'SELL' ? -1 : 1)).toFixed(2);
    }
    if (status === 'closed' || status === 'cancelled') {
      trade.closed_at = new Date().toISOString();
    }

    write(db);
    res.status(200).json({ trade, stats: stats(db.trades) });
    return;
  }

  res.status(405).end();
}
