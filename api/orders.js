/**
 * Orders domain router
 * POST /api/orders                  — place market order or GTT (body.type === 'gtt')
 * GET  /api/orders?action=journal   — list trade journal
 * POST /api/orders?action=journal   — log new trade
 * PATCH /api/orders?action=journal  — update trade outcome
 */
import { placeOrder, placeGTT } from '../dashboard/lib/kite.js';
import { listTrades, insertTrade, updateTrade, deleteTrades, upsertSnapshot } from '../dashboard/lib/supabase.js';

function stats(trades) {
  const closed      = trades.filter(t => t.status !== 'open');
  const wins        = closed.filter(t => t.exit_reason === 'target');
  const totalPnl    = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalRisk   = closed.reduce((s, t) => s + (t.risk_rs || 0), 0);
  const totalReward = closed.reduce((s, t) => s + (t.reward_rs || 0), 0);
  return {
    total:     trades.length,
    open:      trades.filter(t => t.status === 'open').length,
    closed:    closed.length,
    wins:      wins.length,
    losses:    closed.filter(t => t.exit_reason === 'stoploss').length,
    win_rate:  closed.length ? +(wins.length / closed.length * 100).toFixed(1) : null,
    total_pnl: +totalPnl.toFixed(2),
    avg_rr:    totalRisk ? +(totalReward / totalRisk).toFixed(2) : null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Kite-Enctoken');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const url    = new URL(req.url, 'https://x.vercel.app');
  const action = url.searchParams.get('action');

  // ── Trade Journal ─────────────────────────────────────────────────────────────
  if (action === 'journal') {
    try {
      // GET — list all trades
      if (req.method === 'GET') {
        const status = url.searchParams.get('status');
        const trades = await listTrades(status || null);
        return res.status(200).json({ trades, stats: stats(trades) });
      }

      // POST — log new trade  OR  bulk-delete closed  OR  upsert snapshot
      if (req.method === 'POST') {
        // Upsert portfolio snapshot from live refresh
        if (req.body?._action === 'upsert_snapshot') {
          const { snapshot_date, total_invested, current_value, total_pnl, total_pnl_pct, day_pnl, holdings } = req.body;
          await upsertSnapshot({ snapshot_date, total_invested, current_value, total_pnl, total_pnl_pct, day_pnl, holdings });
          return res.status(200).json({ ok: true });
        }

        // Bulk delete (clear-closed button on trades page)
        if (req.body?._delete_ids) {
          await deleteTrades(req.body._delete_ids);
          const remaining = await listTrades();
          return res.status(200).json({ stats: stats(remaining) });
        }

        const {
          symbol, exchange = 'NSE', sector = '', side = 'BUY',
          entry, target, sl, qty, capital, risk_rs, reward_rs, rr,
          trigger_id, factors = {}, source = 'market-brain', confidence, score,
        } = req.body ?? {};

        if (!symbol || !entry || !target || !sl || !qty) {
          res.status(400).json({ error: 'symbol, entry, target, sl, qty required' }); return;
        }

        const trade = {
          id:           `${Date.now()}-${symbol.toUpperCase()}`,
          symbol:       symbol.toUpperCase(),
          exchange,
          sector,
          side,
          entry:        +entry,
          target:       +target,
          sl:           +sl,
          qty:          +qty,
          capital:      +capital      || 0,
          risk_rs:      +risk_rs      || 0,
          reward_rs:    +reward_rs    || 0,
          rr:           +rr           || 0,
          trigger_id:   trigger_id    || null,
          factors,
          source,
          confidence:   +confidence   || 0,
          score:        +score        || 0,
          status:       'open',
          pnl:          null,
          exit_price:   null,
          exit_reason:  null,
          opened_at:    new Date().toISOString(),
          closed_at:    null,
        };

        const saved = await insertTrade(trade);
        const all   = await listTrades();
        return res.status(201).json({ trade: saved, stats: stats(all) });
      }

      // PATCH — update outcome
      if (req.method === 'PATCH') {
        const { id, status, exit_price, exit_reason } = req.body ?? {};
        if (!id) { res.status(400).json({ error: 'id required' }); return; }

        const patch = {};
        if (status)           patch.status      = status;
        if (exit_reason)      patch.exit_reason = exit_reason;
        if (exit_price != null) {
          patch.exit_price = +exit_price;
          // pnl computed here; we need the original trade to get entry/qty/side
          const all   = await listTrades();
          const trade = all.find(t => t.id === id);
          if (!trade) { res.status(404).json({ error: 'Trade not found' }); return; }
          patch.pnl = +((+exit_price - trade.entry) * trade.qty * (trade.side === 'SELL' ? -1 : 1)).toFixed(2);
        }
        if (status === 'closed' || status === 'cancelled') patch.closed_at = new Date().toISOString();

        const updated = await updateTrade(id, patch);
        const all     = await listTrades();
        return res.status(200).json({ trade: updated, stats: stats(all) });
      }

      res.status(405).end();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // ── Place Order / GTT ─────────────────────────────────────────────────────────
  if (req.method !== 'POST') { res.status(405).end(); return; }

  try {
    const enc     = req.headers['x-kite-enctoken'] || '';
    const decoded = enc ? decodeURIComponent(enc) : '';
    const body    = req.body ?? {};

    if (body.type === 'gtt') {
      const { symbol, exchange = 'NSE', qty, ltp, target, sl } = body;
      if (!symbol || !qty || !ltp || !target || !sl) {
        res.status(400).json({ error: 'symbol, qty, ltp, target, sl required' }); return;
      }
      const result = await placeGTT({ symbol, exchange, qty: +qty, ltp: +ltp,
                                      target: +target, sl: +sl, enctoken: decoded });
      return res.status(200).json({ ...result, status: 'success' });
    }

    const { symbol, transaction_type, quantity, enctoken, exchange } = body;
    if (!symbol || !transaction_type || !quantity) {
      res.status(400).json({ error: 'symbol, transaction_type, and quantity are required' }); return;
    }
    const effectiveEnc = decoded || enctoken || '';
    const result = await placeOrder({ symbol, transactionType: transaction_type,
                                      quantity, enctoken: effectiveEnc, exchange });
    return res.status(200).json({ ...result, status: 'success' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
