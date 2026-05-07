/**
 * Orders domain router
 * POST /api/orders                  — place market order or GTT (body.type === 'gtt')
 * GET  /api/orders?action=journal   — list trade journal
 * POST /api/orders?action=journal   — log new trade
 * PATCH /api/orders?action=journal  — update trade outcome
 */
import { placeOrder, placeGTT, getQuotes, cancelGTT } from '../dashboard/lib/kite.js';
import { listTrades, insertTrade, updateTrade, deleteTrades, upsertSnapshot } from '../dashboard/lib/supabase.js';
import { redisGet, redisSet } from '../dashboard/lib/redis.js';

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

  // ── Sync Trades — auto-close open trades against current LTP ─────────────────
  // POST /api/orders?action=sync_trades  (requires X-Kite-Enctoken header)
  if (action === 'sync_trades') {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    const raw = req.headers['x-kite-enctoken'] || '';
    const enctoken = raw ? decodeURIComponent(raw) : '';
    if (!enctoken) {
      res.status(401).json({ error: 'X-Kite-Enctoken header required for sync' }); return;
    }
    try {
      const openTrades = await listTrades('open');
      if (!openTrades.length) {
        const all = await listTrades();
        return res.status(200).json({ synced: 0, auto_closed: [], stats: stats(all) });
      }

      // Batch LTP fetch — unique symbols, prefixed with exchange
      const symbols = [...new Set(openTrades.map(t => `${t.exchange || 'NSE'}:${t.symbol}`))];
      const ltpMap = {};
      try {
        const quotes = await getQuotes(symbols, enctoken);
        for (const [key, data] of Object.entries(quotes || {})) {
          const sym = key.split(':')[1];
          if (sym && data?.last_price != null) ltpMap[sym] = data.last_price;
        }
      } catch (e) {
        return res.status(502).json({ error: 'LTP fetch failed: ' + e.message });
      }

      const autoClosed = [];
      for (const trade of openTrades) {
        const ltp = ltpMap[trade.symbol];
        if (ltp == null) continue;

        let exitReason = null;
        let exitPrice  = null;
        if (trade.side === 'BUY') {
          if (ltp >= trade.target)      { exitReason = 'target';   exitPrice = trade.target; }
          else if (ltp <= trade.sl)     { exitReason = 'stoploss'; exitPrice = trade.sl; }
        } else {
          if (ltp <= trade.target)      { exitReason = 'target';   exitPrice = trade.target; }
          else if (ltp >= trade.sl)     { exitReason = 'stoploss'; exitPrice = trade.sl; }
        }

        if (exitReason) {
          const pnl = +((exitPrice - trade.entry) * trade.qty * (trade.side === 'SELL' ? -1 : 1)).toFixed(2);
          await updateTrade(trade.id, {
            status: 'closed', exit_price: exitPrice, exit_reason: exitReason,
            pnl, closed_at: new Date().toISOString(),
          });
          autoClosed.push({ id: trade.id, symbol: trade.symbol, exit_reason: exitReason, exit_price: exitPrice, pnl });
        }
      }

      const all = await listTrades();
      return res.status(200).json({ synced: autoClosed.length, auto_closed: autoClosed, stats: stats(all) });
    } catch (e) {
      res.status(500).json({ error: e.message }); return;
    }
  }

  // ── Auto Session Status ───────────────────────────────────────────────────────
  // GET /api/orders?action=session_status
  if (action === 'session_status') {
    if (req.method !== 'GET') { res.status(405).end(); return; }
    try {
      const session = await redisGet('auto:session').catch(() => null);
      if (!session) return res.status(404).json({ error: 'No session found — run auto_session to start one' });
      return res.status(200).json(session);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Session Monitor — circuit breaker check (called by cron every 30 min) ─────
  // POST /api/orders?action=session_monitor
  // Header: X-Kite-Enctoken (from KITE_ENCTOKEN secret in GitHub Actions)
  if (action === 'session_monitor') {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    try {
      const session = await redisGet('auto:session').catch(() => null);
      if (!session || session.status !== 'active') {
        return res.status(200).json({ monitored: false, reason: session ? `session_${session.status}` : 'no_session' });
      }

      // Find open auto-session trades in Supabase
      const allTrades  = await listTrades();
      const istToday   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const autoOpen   = allTrades.filter(t => t.source === 'auto_session' && t.status === 'open');
      const autoClosed = allTrades.filter(t => t.source === 'auto_session' && t.status === 'closed'
                                             && t.closed_at?.slice(0, 10) === istToday);

      // Compute realized P&L from today's closed auto trades
      const realizedPnl = +autoClosed.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2);

      const { profit_target, loss_limit } = session;

      // All positions closed naturally — mark session complete
      if (!autoOpen.length) {
        const done = { ...session, status: 'completed', realized_pnl: realizedPnl, stopped_at: new Date().toISOString(), stop_reason: 'all_positions_closed' };
        await redisSet('auto:session', done, 24 * 60 * 60).catch(() => {});
        return res.status(200).json({ monitored: true, circuit_fired: false, status: 'completed', realized_pnl: realizedPnl });
      }

      // Circuit breaker: profit target or loss limit hit
      let circuitFired = false;
      let stopReason   = null;
      if (profit_target != null && realizedPnl >= profit_target) {
        circuitFired = true;
        stopReason   = `profit_target_hit (+₹${realizedPnl.toFixed(0)} ≥ +₹${profit_target})`;
      } else if (loss_limit != null && realizedPnl <= -loss_limit) {
        circuitFired = true;
        stopReason   = `loss_limit_hit (-₹${Math.abs(realizedPnl).toFixed(0)} ≥ -₹${loss_limit})`;
      }

      if (circuitFired) {
        const rawEnc   = req.headers['x-kite-enctoken'] || '';
        const enctoken = rawEnc ? decodeURIComponent(rawEnc) : (process.env.KITE_ENCTOKEN || '');
        const cancelled = [];

        for (const trade of autoOpen) {
          // Cancel GTT so no automatic exit fires
          if (trade.trigger_id && enctoken) {
            try { await cancelGTT(trade.trigger_id, enctoken); cancelled.push(trade.trigger_id); } catch { /* best-effort */ }
          }
          // Mark trade cancelled (user must exit the position manually)
          await updateTrade(trade.id, { status: 'cancelled', exit_reason: 'circuit_breaker', closed_at: new Date().toISOString() });
        }

        const stopped = { ...session, status: 'stopped', realized_pnl: realizedPnl, stopped_at: new Date().toISOString(), stop_reason: stopReason };
        await redisSet('auto:session', stopped, 24 * 60 * 60).catch(() => {});
        return res.status(200).json({ monitored: true, circuit_fired: true, stop_reason: stopReason, gtts_cancelled: cancelled.length, realized_pnl: realizedPnl });
      }

      // Normal check-in — update P&L in session
      await redisSet('auto:session', { ...session, realized_pnl: realizedPnl }, 24 * 60 * 60).catch(() => {});
      return res.status(200).json({ monitored: true, circuit_fired: false, realized_pnl: realizedPnl, open_trades: autoOpen.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Session Stop — manual kill switch ─────────────────────────────────────────
  // POST /api/orders?action=session_stop
  // Header: X-Kite-Enctoken (required to cancel GTTs)
  if (action === 'session_stop') {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    try {
      const session = await redisGet('auto:session').catch(() => null);
      if (!session || !['active', 'no_signals', 'no_opportunities', 'no_plans', 'no_trades'].includes(session.status)) {
        return res.status(404).json({ error: 'No stoppable session found' });
      }

      const rawEnc   = req.headers['x-kite-enctoken'] || '';
      const enctoken = rawEnc ? decodeURIComponent(rawEnc) : '';
      const autoOpen = await listTrades('open').then(ts => ts.filter(t => t.source === 'auto_session'));
      const cancelled = [];

      for (const trade of autoOpen) {
        if (trade.trigger_id && enctoken) {
          try { await cancelGTT(trade.trigger_id, enctoken); cancelled.push(trade.trigger_id); } catch { /* best-effort */ }
        }
        await updateTrade(trade.id, { status: 'cancelled', exit_reason: 'manual_stop', closed_at: new Date().toISOString() });
      }

      const stopped = { ...session, status: 'stopped', stopped_at: new Date().toISOString(), stop_reason: 'manual_stop' };
      await redisSet('auto:session', stopped, 24 * 60 * 60).catch(() => {});
      return res.status(200).json({ ok: true, gtts_cancelled: cancelled.length, trades_cancelled: autoOpen.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
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
