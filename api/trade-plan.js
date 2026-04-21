/**
 * Adaptive Trade Plan Engine
 * Computes entry / target / stop-loss / position-size for a stock pick
 * using 7 live factors: ATR%, VIX, sector beta, AI confidence,
 * market trend, day-of-week, and time-of-day.
 */

import https from 'https';

// ── Sector beta table (intraday volatility multiplier) ────────────────────────
const SECTOR_BETA = {
  'Banking':           1.25,
  'Financial Services':1.20,
  'IT':                0.90,
  'Technology':        0.90,
  'Pharma':            0.95,
  'Healthcare':        0.95,
  'Auto':              1.05,
  'Metal':             1.30,
  'Energy':            1.10,
  'Oil & Gas':         1.10,
  'FMCG':              0.70,
  'Consumer':          0.75,
  'Realty':            1.35,
  'Infrastructure':    1.15,
  'Telecom':           0.85,
  'Media':             1.20,
  'Chemicals':         1.00,
  'Defence':           1.10,
  'PSU':               1.10,
  'default':           1.00,
};

function sectorBeta(sector) {
  if (!sector) return SECTOR_BETA.default;
  for (const [key, beta] of Object.entries(SECTOR_BETA)) {
    if (sector.toLowerCase().includes(key.toLowerCase())) return beta;
  }
  return SECTOR_BETA.default;
}

// ── Fetch VIX + Nifty from NSE (cached per request, no warm cache here) ──────
let _nseCache = null;
let _nseCacheAt = 0;
const NSE_TTL = 5 * 60 * 1000;

async function getNseSnapshot() {
  if (_nseCache && Date.now() - _nseCacheAt < NSE_TTL) return _nseCache;
  const data = await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'www.nseindia.com',
      path: '/api/allIndices',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/',
      },
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end();
  });
  if (!data?.data) return { vix: 15, niftyChgPct: 0 };
  const vixRow   = data.data.find(r => r.indexSymbol === 'INDIA VIX');
  const niftyRow = data.data.find(r => r.indexSymbol === 'NIFTY 50');
  _nseCache = {
    vix:         parseFloat(vixRow?.last  ?? vixRow?.lastPrice ?? 15),
    niftyChgPct: parseFloat(niftyRow?.percentChange ?? 0),
  };
  _nseCacheAt = Date.now();
  return _nseCache;
}

// ── Core plan calculator ──────────────────────────────────────────────────────
function buildPlan({ ltp, open, high, low, sector, confidence, score, vix, niftyChgPct }) {
  // 1. ATR% — today's range relative to price
  const atrRaw  = (high - low) / ltp;
  const atrPct  = Math.max(atrRaw, 0.003); // floor at 0.3%

  // 2. VIX multiplier — base VIX 15 = 1.0×
  const vixMul  = 0.7 + (vix / 15) * 0.3;  // VIX 15→1.0, VIX 25→1.2, VIX 10→0.9

  // 3. Sector beta
  const beta    = sectorBeta(sector);

  // 4. Market trend penalty — if market down >0.5%, reduce target, tighten SL
  const trendPenalty = niftyChgPct < -0.5 ? 0.85 : niftyChgPct > 0.5 ? 1.10 : 1.0;

  // 5. Confidence multiplier (score 0–100 → 0.5× to 1.5×)
  const confScore  = Math.min(Math.max(score || confidence || 50, 0), 100);
  const confMul    = 0.5 + (confScore / 100);  // 50→1.0, 80→1.3, 30→0.8

  // 6. Day-of-week factor
  const dow = new Date().getDay();  // 0=Sun,1=Mon,...,4=Thu,5=Fri
  const dayFactor = dow === 4 ? 1.15   // Thursday expiry — higher vol
                  : dow === 1 ? 0.90   // Monday — gap risk, be cautious
                  : 1.0;

  // 7. Time-of-day — first 15 min (gap noise), last 30 min (illiquid)
  const nowIST   = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hhmm     = nowIST.getUTCHours() * 100 + nowIST.getUTCMinutes();
  const timeWarn = hhmm < 930 ? 'early-session' : hhmm > 1500 ? 'late-session' : null;

  // ── Composite swing % ──────────────────────────────────────────────────────
  // Base = ATR%, scaled by beta, VIX, trend, day
  const swingPct = atrPct * beta * vixMul * trendFactor(trendPenalty) * dayFactor;

  // Target = entry + swing; SL = entry - swing * 0.8  (R:R ≈ 1.25)
  const targetPct = swingPct;
  const slPct     = swingPct * 0.80;

  const target  = Math.round((ltp * (1 + targetPct)) * 20) / 20;  // round to 0.05
  const sl      = Math.round((ltp * (1 - slPct))     * 20) / 20;

  // ── Position sizing — fixed ₹25,000 capital × confidence multiplier ───────
  const capitalBase = 25000;
  const capital     = Math.round(capitalBase * confMul);
  const qty         = Math.max(1, Math.floor(capital / ltp));
  const riskRs      = Math.round(qty * (ltp - sl));
  const rewardRs    = Math.round(qty * (target - ltp));
  const rr          = rewardRs / (riskRs || 1);

  return {
    ltp,
    entry:       ltp,
    target,
    sl,
    target_pct:  +(targetPct * 100).toFixed(2),
    sl_pct:      +(slPct     * 100).toFixed(2),
    qty,
    capital,
    risk_rs:     riskRs,
    reward_rs:   rewardRs,
    rr:          +rr.toFixed(2),
    time_warn:   timeWarn,
    factors: {
      atr_pct:      +(atrPct  * 100).toFixed(2),
      vix,
      vix_mul:      +vixMul.toFixed(2),
      sector_beta:  beta,
      trend_pct:    +niftyChgPct.toFixed(2),
      trend_factor: +trendFactor(trendPenalty).toFixed(2),
      day_factor:   dayFactor,
      conf_score:   confScore,
      conf_mul:     +confMul.toFixed(2),
    },
  };
}

function trendFactor(p) { return p; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.status(405).end(); return; }

  try {
    const { symbol, exchange = 'NSE', sector = '', confidence = 70, score = 70,
            ltp, open = ltp, high = ltp, low = ltp } = req.body ?? {};

    if (!symbol || !ltp) {
      res.status(400).json({ error: 'symbol and ltp are required' }); return;
    }

    const { vix, niftyChgPct } = await getNseSnapshot();
    const plan = buildPlan({ ltp: +ltp, open: +open, high: +high, low: +low,
                              sector, confidence: +confidence, score: +score,
                              vix, niftyChgPct });

    res.status(200).json({ symbol, exchange, sector, ...plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
