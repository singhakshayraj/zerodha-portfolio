/**
 * System Health Test Runner — shared across all pages.
 * Injected via <script src="/health.js"> + a <div id="healthMount"> anchor.
 * Call initHealthPanel() once the DOM is ready.
 */
(function () {
  'use strict';

  const BASE = 'https://zerodha-portfolio-three.vercel.app';

  // ── Mock payloads ────────────────────────────────────────────────────────────
  const MOCK_BRAIN_PICKS = [{
    symbol: 'RELIANCE', score: 7.8, directional_bias: 'bullish',
    regime: 'trending', event_type: 'institutional_flow',
    signal_types: ['institutional_flow'], ltp_at_emit: 2850,
  }];
  const MOCK_TRIGGERS = [{
    symbol: 'RELIANCE', triggers: ['breakout_high', 'volume'],
    primary_trigger: 'breakout_high', strength: 'strong', signal_intensity: 3,
    trend_context: 'uptrend',
    price: { ltp: 2870, change_from_open_pct: 1.2, vwap: 2845, above_vwap: true },
    volume: { current: 2100000, volume_ratio: 2.4 },
    breakout: { or_high: 2855, or_low: 2820 },
    triggered_at: new Date().toISOString(),
  }];
  const MOCK_OPPORTUNITY = [{
    symbol: 'RELIANCE', exchange: 'NSE', direction: 'long',
    setup_type: 'breakout + institutional_flow', confidence: 'high', final_score: 0.82,
    brain: { score: 7.8, directional_bias: 'bullish', regime: 'trending',
             event_type: 'institutional_flow', signal_types: ['institutional_flow'], ltp_at_emit: 2850 },
    trigger: { primary: 'breakout_high', all_triggers: ['breakout_high', 'volume'],
               strength: 'strong', signal_intensity: 3, trend_context: 'uptrend',
               triggered_at: new Date().toISOString(), age_min: 2 },
    price: { ltp: 2870, change_from_open_pct: 1.2, vwap: 2845, above_vwap: true, or_high: 2855, or_low: 2820 },
    volume: { current: 2100000, volume_ratio: 2.4 },
    plan: { entry: 2875, sl: 2820, t1: 2960, t2: 3010 },
  }];

  // ── HTTP helper ──────────────────────────────────────────────────────────────
  async function hit(method, path, body, extraHeaders) {
    const enc = localStorage.getItem('kite_enctoken') || '';
    const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
    if (enc) headers['X-Kite-Enctoken'] = enc;
    const t0 = Date.now();
    let status = 0, raw = null, error = null;
    try {
      const res = await fetch(BASE + path, {
        method, headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      status = res.status;
      const text = await res.text();
      try { raw = JSON.parse(text); } catch { raw = text; }
      if (!res.ok) error = (raw && raw.error) ? raw.error : `HTTP ${status}`;
    } catch (e) { error = e.message; }
    return { ok: status >= 200 && status < 300, status, ms: Date.now() - t0, raw, error };
  }

  // ── Skip helpers ─────────────────────────────────────────────────────────────
  function kiteSkipIf(r) { return r.skipped || r.status === 403; }
  function kiteSkipMsg(r) { return r.status === 403 ? 'Enctoken expired — log in via Connect page' : 'No enctoken — skipped'; }

  // ── Full test suite ──────────────────────────────────────────────────────────
  function buildSuite() {
    const enc = localStorage.getItem('kite_enctoken') || '';
    const skip = (msg) => ({ ok: false, status: 0, ms: 0, error: msg, skipped: true, raw: null });

    return [
      // ── Intelligence ──────────────────────────────────────────────────────────
      {
        group: 'Intelligence', name: 'Brain cache',
        desc: 'GET /api/intel?action=brain',
        fn: () => hit('GET', '/api/intel?action=brain'),
        validate: r => r.raw?.picks || r.raw?.cached !== undefined,
        validateMsg: 'must return picks[] or cached flag',
      },
      {
        group: 'Intelligence', name: 'Calibration stats',
        desc: 'GET /api/intel?action=calibration_stats',
        fn: () => hit('GET', '/api/intel?action=calibration_stats'),
        validate: r => 'segment_count' in (r.raw ?? {}),
        validateMsg: 'must return segment_count',
      },
      {
        group: 'Intelligence', name: 'Record outcome',
        desc: 'POST /api/intel?action=record_outcome',
        fn: () => hit('POST', '/api/intel?action=record_outcome', { ltpMap: { RELIANCE: 2870 } }),
        validate: r => r.raw?.ok === true,
        validateMsg: 'must return ok: true',
      },
      {
        group: 'Intelligence', name: 'Intersect engine',
        desc: 'POST /api/intel?action=intersect',
        fn: () => hit('POST', '/api/intel?action=intersect', { triggers: MOCK_TRIGGERS, picks: MOCK_BRAIN_PICKS }),
        validate: r => Array.isArray(r.raw?.opportunities),
        validateMsg: 'must return opportunities[]',
      },
      {
        group: 'Intelligence', name: 'Trade plan engine',
        desc: 'POST /api/intel?action=trade_plan',
        fn: () => hit('POST', '/api/intel?action=trade_plan', { opportunities: MOCK_OPPORTUNITY }),
        validate: r => Array.isArray(r.raw?.plans),
        validateMsg: 'must return plans[]',
      },
      {
        group: 'Intelligence', name: 'Legacy trade plan',
        desc: 'POST /api/intel?action=plan',
        fn: () => hit('POST', '/api/intel?action=plan', { symbol: 'RELIANCE', ltp: 2870, exchange: 'NSE' }),
        validate: r => r.raw?.entry != null || r.raw?.plan != null || r.ok,
        validateMsg: 'must return a plan object',
      },
      {
        group: 'Intelligence', name: 'Stock analysis (LLM)',
        desc: 'POST /api/intel?action=analyze — skipped by default (costs LLM credit)',
        fn: () => skip('Skipped — costs LLM credit. Test manually via Research Desk.'),
        validate: () => true,
      },
      {
        group: 'Intelligence', name: 'Allocate cycle',
        desc: 'POST /api/intel?action=allocate',
        fn: () => hit('POST', '/api/intel?action=allocate', {
          opportunities: MOCK_OPPORTUNITY,
          capital: 10000, maxRiskPct: 10, targetRMultiple: 2, maxTrades: 5,
          minEV: 0.05, minScore: 0.50,
        }),
        validate: r => r.raw?.session !== undefined,
        validateMsg: 'must return session object',
      },
      {
        group: 'Intelligence', name: 'Allocator session read',
        desc: 'GET /api/intel?action=allocate_session',
        fn: () => hit('GET', '/api/intel?action=allocate_session'),
        validate: r => r.ok || r.status === 404,
        validateMsg: 'must return session or 404',
      },
      {
        group: 'Intelligence', name: 'Allocator reset',
        desc: 'POST /api/intel?action=allocate_reset',
        fn: () => hit('POST', '/api/intel?action=allocate_reset'),
        validate: r => r.raw?.reset === true,
        validateMsg: 'must return reset: true',
      },
      {
        group: 'Intelligence', name: 'Allocate update (close trade)',
        desc: 'POST /api/intel?action=allocate_update — 404 expected (no open session)',
        fn: () => hit('POST', '/api/intel?action=allocate_update', {
          tradeId: 'test-id-000', exitPrice: 2900, exitReason: 't1_hit',
        }),
        validate: r => r.ok || r.status === 404 || r.raw?.error !== undefined,
        validateMsg: 'must respond (404 or error — no open session is fine)',
      },

      // ── Kite ─────────────────────────────────────────────────────────────────
      {
        group: 'Kite', name: 'Holdings',
        desc: 'GET /api/kite?action=holdings',
        fn: () => enc ? hit('GET', '/api/kite?action=holdings') : skip('No enctoken'),
        validate: r => kiteSkipIf(r) || Array.isArray(r.raw?.data),
        validateMsg: 'must return data[]',
        skipIf: kiteSkipIf, skipMsg: kiteSkipMsg,
      },
      {
        group: 'Kite', name: 'Margins',
        desc: 'GET /api/kite?action=margins',
        fn: () => enc ? hit('GET', '/api/kite?action=margins') : skip('No enctoken'),
        validate: r => kiteSkipIf(r) || r.raw?.equity !== undefined,
        validateMsg: 'must return equity margin',
        skipIf: kiteSkipIf, skipMsg: kiteSkipMsg,
      },
      {
        group: 'Kite', name: 'Positions',
        desc: 'GET /api/kite?action=positions',
        fn: () => enc ? hit('GET', '/api/kite?action=positions') : skip('No enctoken'),
        validate: r => kiteSkipIf(r) || r.raw?.net !== undefined || Array.isArray(r.raw?.data),
        validateMsg: 'must return net positions',
        skipIf: kiteSkipIf, skipMsg: kiteSkipMsg,
      },
      {
        group: 'Kite', name: 'Live quotes',
        desc: 'GET /api/kite?action=quotes&symbols=NSE:RELIANCE',
        fn: () => enc ? hit('GET', '/api/kite?action=quotes&symbols=NSE:RELIANCE') : skip('No enctoken'),
        validate: r => kiteSkipIf(r) || r.raw?.data !== undefined || r.ok,
        validateMsg: 'must return quote data',
        skipIf: kiteSkipIf, skipMsg: kiteSkipMsg,
      },
      {
        group: 'Kite', name: 'Historical candles',
        desc: 'GET /api/kite?action=historical&symbol=RELIANCE',
        fn: () => enc ? hit('GET', '/api/kite?action=historical&symbol=RELIANCE&interval=day&days=5') : skip('No enctoken'),
        validate: r => kiteSkipIf(r) || Array.isArray(r.raw?.data) || r.ok,
        validateMsg: 'must return candles',
        skipIf: kiteSkipIf, skipMsg: kiteSkipMsg,
      },

      // ── Research ──────────────────────────────────────────────────────────────
      {
        group: 'Research', name: 'Research router',
        desc: 'GET /api/research?action=quotes — router reachable check',
        fn: () => hit('GET', '/api/research?action=quotes'),
        validate: r => r.ok || r.status === 400,
        validateMsg: 'router must respond (not 500)',
      },
      {
        group: 'Research', name: 'Symbol search',
        desc: 'POST /api/research?action=symbol',
        fn: () => hit('POST', '/api/research?action=symbol', { query: 'RELIANCE' }),
        validate: r => r.ok || r.status === 400 || Array.isArray(r.raw),
        validateMsg: 'must respond without 500',
      },
      {
        group: 'Research', name: 'Alpha signals',
        desc: 'POST /api/research?action=alpha',
        fn: () => hit('POST', '/api/research?action=alpha', { symbol: 'RELIANCE', exchange: 'NSE' }),
        validate: r => r.ok || r.status === 400,
        validateMsg: 'must respond without 500',
      },
      {
        group: 'Research', name: 'Trigger engine (Step 2)',
        desc: 'GET /api/research?action=triggers',
        fn: () => hit('GET', '/api/research?action=triggers'),
        validate: r => r.ok || r.status === 400,
        validateMsg: 'must respond without 500',
      },

      // ── Journal ───────────────────────────────────────────────────────────────
      {
        group: 'Journal', name: 'Trade list',
        desc: 'GET /api/orders?action=journal',
        fn: () => hit('GET', '/api/orders?action=journal'),
        validate: r => r.ok && Array.isArray(r.raw?.trades),
        validateMsg: 'must return trades[]',
      },
      {
        group: 'Journal', name: 'Add trade',
        desc: 'POST /api/orders?action=journal',
        fn: () => hit('POST', '/api/orders?action=journal', {
          symbol: '_HEALTH_TEST', exchange: 'NSE', direction: 'long',
          entry: 100, sl: 95, t1: 110, t2: 120, qty: 1,
          risk: 5, capital_allocated: 100, ev: 0.25, final_score: 0.80,
          setup_type: 'health_check', confidence: 'low',
        }),
        validate: r => r.ok || r.status === 400,
        validateMsg: 'must respond without 500',
      },
      {
        group: 'Journal', name: 'Snapshot upsert',
        desc: 'POST /api/orders?action=journal (_action=upsert_snapshot)',
        fn: () => hit('POST', '/api/orders?action=journal', {
          _action: 'upsert_snapshot',
          date: new Date().toISOString().slice(0, 10),
          totalInvested: 100000, currentValue: 102000,
          totalPnl: 2000, totalPnlPct: 2.0, holdings: [],
        }),
        validate: r => r.ok || r.status === 400,
        validateMsg: 'must respond without 500',
      },

      // ── Pages ─────────────────────────────────────────────────────────────────
      {
        group: 'Pages', name: 'Dashboard',
        desc: 'GET /',
        fn: () => hit('GET', '/'),
        validate: r => r.ok,
        validateMsg: 'dashboard must be reachable',
      },
      {
        group: 'Pages', name: 'Login',
        desc: 'GET /login',
        fn: () => hit('GET', '/login'),
        validate: r => r.ok,
        validateMsg: 'login page must be reachable',
      },
      {
        group: 'Pages', name: 'Research Desk',
        desc: 'GET /research.html',
        fn: () => hit('GET', '/research.html'),
        validate: r => r.ok,
        validateMsg: 'research page must be reachable',
      },
      {
        group: 'Pages', name: 'Trades Journal',
        desc: 'GET /trades.html',
        fn: () => hit('GET', '/trades.html'),
        validate: r => r.ok,
        validateMsg: 'trades page must be reachable',
      },
      {
        group: 'Pages', name: 'Intraday Scanner',
        desc: 'GET /intraday.html',
        fn: () => hit('GET', '/intraday.html'),
        validate: r => r.ok,
        validateMsg: 'intraday page must be reachable',
      },
      {
        group: 'Pages', name: 'Connect (Kite auth)',
        desc: 'GET /connect.html',
        fn: () => hit('GET', '/connect.html'),
        validate: r => r.ok,
        validateMsg: 'connect page must be reachable',
      },
      {
        group: 'Pages', name: 'Alpha Finder',
        desc: 'GET /alpha',
        fn: () => hit('GET', '/alpha'),
        validate: r => r.ok || r.status === 404,
        validateMsg: 'alpha page must be reachable (404 acceptable if not deployed)',
      },
    ];
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  function renderRow(mount, idx, name, group, desc, state) {
    const rowId    = `hr-${mount.id}-${idx}`;
    const detailId = `hd-${mount.id}-${idx}`;
    let row = document.getElementById(rowId);
    if (!row) {
      row = document.createElement('div');
      row.id = rowId;
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 14px;background:#1a1f2e;border:1px solid #2d3748;border-radius:8px;cursor:pointer;user-select:none;transition:border-color 0.15s;';
      row.onclick = () => { const d = document.getElementById(detailId); if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none'; };
      mount.appendChild(row);
      const detail = document.createElement('div');
      detail.id = detailId;
      detail.style.cssText = 'display:none;margin-top:-4px;padding:10px 14px;background:#111827;border:1px solid #2d3748;border-top:none;border-radius:0 0 8px 8px;font-size:11px;color:#a0aec0;font-family:monospace;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow-y:auto;';
      mount.appendChild(detail);
    }

    const icons  = { pending: '·', running: '⟳', pass: '✓', fail: '✗', skip: '—' };
    const colors = { pending: '#4a5568', running: '#63b3ed', pass: '#68d391', fail: '#fc8181', skip: '#718096' };
    const ic = icons[state.status] ?? '?';
    const co = colors[state.status] ?? '#718096';

    row.style.borderColor = state.status === 'fail' ? '#9b2c2c' : state.status === 'pass' ? '#1c4532' : '#2d3748';
    row.innerHTML = `
      <span style="font-size:13px;width:16px;text-align:center;color:${co};font-weight:700;flex-shrink:0;">${ic}</span>
      <span style="font-size:10px;color:#4a5568;min-width:86px;flex-shrink:0;">${group}</span>
      <span style="font-size:12px;color:#e2e8f0;flex:1;min-width:0;">${name}</span>
      ${state.ms != null ? `<span style="font-size:10px;color:#4a5568;">${state.ms}ms</span>` : ''}
      ${state.status === 'fail' ? `<span style="font-size:10px;color:#fc8181;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(state.error||'').replace(/"/g,'&quot;')}">${state.error||''}</span>` : ''}
      ${state.status === 'skip' ? `<span style="font-size:10px;color:#718096;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${state.error||''}</span>` : ''}
    `;

    const detail = document.getElementById(detailId);
    if (detail && (state.raw != null || state.error)) {
      detail.textContent = state.raw != null ? JSON.stringify(state.raw, null, 2) : (state.error || '');
    }
  }

  // ── Global results store (per page load) ──────────────────────────────────────
  let _results = [];

  // ── Main runner ───────────────────────────────────────────────────────────────
  async function runTests(mountId) {
    const mount   = document.getElementById(mountId + '-rows');
    const btn     = document.getElementById(mountId + '-btn');
    const summary = document.getElementById(mountId + '-summary');
    if (!mount || !btn) return;

    btn.disabled = true;
    btn.textContent = '⟳ Running…';
    mount.innerHTML = '';
    if (summary) summary.style.display = 'none';
    _results = [];

    const suite = buildSuite();
    const t0    = Date.now();

    // Render all pending rows first
    suite.forEach((t, i) => renderRow(mount, i, t.name, t.group, t.desc, { status: 'pending' }));

    let passed = 0, failed = 0, skipped = 0;

    for (let i = 0; i < suite.length; i++) {
      const t = suite[i];
      renderRow(mount, i, t.name, t.group, t.desc, { status: 'running' });

      let result;
      try { result = await t.fn(); }
      catch (e) { result = { ok: false, status: 0, ms: 0, error: e.message, raw: null }; }

      let state;
      const shouldSkip = result.skipped || (t.skipIf && t.skipIf(result));
      if (shouldSkip) {
        const msg = t.skipMsg ? (typeof t.skipMsg === 'function' ? t.skipMsg(result) : t.skipMsg) : (result.error || 'skipped');
        state = { status: 'skip', ms: result.ms ?? null, error: msg, raw: null };
        skipped++;
      } else {
        const valid = result.ok && (!t.validate || t.validate(result));
        state = {
          status: valid ? 'pass' : 'fail',
          ms: result.ms,
          error: valid ? null : (result.error ?? t.validateMsg ?? 'Validation failed'),
          raw: result.raw,
        };
        if (valid) passed++; else failed++;
      }

      renderRow(mount, i, t.name, t.group, t.desc, state);
      _results.push({ name: t.name, group: t.group, desc: t.desc, ...state, httpStatus: result.status });
    }

    const totalMs = Date.now() - t0;
    btn.disabled = false;
    btn.textContent = '↻ Re-run';

    if (summary) {
      summary.style.display = 'flex';
      const passEl  = summary.querySelector('[data-h="pass"]');
      const failEl  = summary.querySelector('[data-h="fail"]');
      const skipEl  = summary.querySelector('[data-h="skip"]');
      const timeEl  = summary.querySelector('[data-h="time"]');
      if (passEl) passEl.textContent = `✓ ${passed} passed`;
      if (failEl) failEl.textContent = `✗ ${failed} failed`;
      if (skipEl) skipEl.textContent = `— ${skipped} skipped`;
      if (timeEl) timeEl.textContent = `${(totalMs / 1000).toFixed(1)}s · ${new Date().toLocaleTimeString('en-IN')}`;
      summary.style.borderColor = failed > 0 ? '#9b2c2c' : '#276749';
    }
  }

  function copyReport() {
    const report = {
      generated_at: new Date().toISOString(),
      environment:  BASE,
      summary: {
        passed:  _results.filter(r => r.status === 'pass').length,
        failed:  _results.filter(r => r.status === 'fail').length,
        skipped: _results.filter(r => r.status === 'skip').length,
      },
      results: _results,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      .then(() => {
        const b = document.querySelector('[onclick="HealthPanel.copy()"]');
        if (b) { b.textContent = 'Copied!'; setTimeout(() => b.textContent = 'Copy Debug JSON', 2000); }
      })
      .catch(() => alert(JSON.stringify(report, null, 2)));
  }

  // ── Panel injection ───────────────────────────────────────────────────────────
  const PANEL_CSS = `
    #health-panel { margin-top: 40px; padding: 0 40px 40px; max-width: 1200px; margin-left: auto; margin-right: auto; }
    #health-panel h2.health-title { font-size: 13px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #2d3748; display: flex; align-items: center; justify-content: space-between; }
    #health-panel .health-summary { display: none; margin-bottom: 12px; padding: 10px 16px; background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; align-items: center; gap: 20px; flex-wrap: wrap; font-size: 12px; }
    #health-panel .health-summary [data-h="pass"]  { color: #68d391; font-weight: 700; }
    #health-panel .health-summary [data-h="fail"]  { color: #fc8181; font-weight: 700; }
    #health-panel .health-summary [data-h="skip"]  { color: #718096; }
    #health-panel .health-summary [data-h="time"]  { color: #4a5568; margin-left: auto; }
    #health-panel .health-rows   { display: flex; flex-direction: column; gap: 5px; }
    #health-panel .health-run-btn { font-size: 11px; padding: 4px 14px; background: #2d3748; border: 1px solid #4a5568; color: #e2e8f0; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap; }
    #health-panel .health-run-btn:hover { background: #4a5568; }
    @media (max-width: 640px) { #health-panel { padding: 0 16px 32px; } }
  `;

  function inject(mountId) {
    // CSS (once per page)
    if (!document.getElementById('health-panel-css')) {
      const style = document.createElement('style');
      style.id = 'health-panel-css';
      style.textContent = PANEL_CSS;
      document.head.appendChild(style);
    }

    const anchor = document.getElementById(mountId);
    if (!anchor) return;

    anchor.id = 'health-panel';
    anchor.innerHTML = `
      <h2 class="health-title">
        System Health
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="health-run-btn" id="${mountId}-btn" onclick="HealthPanel.run('${mountId}')">▶ Run Tests</button>
          <button class="health-run-btn" onclick="HealthPanel.copy()" style="color:#718096;">Copy Debug JSON</button>
        </div>
      </h2>
      <div class="health-summary" id="${mountId}-summary">
        <span data-h="pass"></span>
        <span data-h="fail"></span>
        <span data-h="skip"></span>
        <span data-h="time"></span>
      </div>
      <div class="health-rows" id="${mountId}-rows"></div>
    `;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.HealthPanel = {
    init: function (mountId) { inject(mountId || 'health-panel'); },
    run:  function (mountId) { runTests(mountId || 'health-panel'); },
    copy: copyReport,
  };
})();
