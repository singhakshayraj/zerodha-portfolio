// Market Brain — named exports consumed by api/intel.js
import fs   from 'fs';
import path from 'path';

// ── Source registry ───────────────────────────────────────────────────────────
// baseline_rate: expected article density for this signal_type (0–1).
//   High = naturally voluminous (media), low = rare and precious (smart_money).
//   Used to normalize scores so high-volume types don't dominate by sheer count.
const SOURCES = [
  // ── Smart Money ───────────────────────────────────────────────────────────
  {
    label: 'Vijay Kedia', tier: 1,
    q: '"Vijay Kedia" stock buy accumulate NSE portfolio 2024 2025',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 72, baseline_rate: 0.15,
  },
  {
    label: 'Basant Maheshwari', tier: 1,
    q: '"Basant Maheshwari" equity picks NSE accumulate strong buy',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 72, baseline_rate: 0.15,
  },
  {
    label: 'Deepak Shenoy', tier: 1,
    q: '"Deepak Shenoy" OR "Capital Mind" stock buy NSE analysis 2025',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.20,
  },
  {
    label: 'Mitesh Engineer', tier: 1,
    q: '"Mitesh Engineer" OR "@Mitesh_Engr" stock buy target NSE intraday',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.15,
  },
  {
    label: 'Porinju Veliyath', tier: 1,
    q: '"Porinju Veliyath" stock portfolio NSE smallcap multibagger',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 96, baseline_rate: 0.15,
  },

  // ── Institutional Flow ────────────────────────────────────────────────────
  {
    label: 'FII DII Net Flow', tier: 5,
    q: 'FII DII net buying selling India NSE BSE crore today 2025',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.40,
  },
  {
    label: 'Block Deals', tier: 5,
    q: 'NSE BSE block deal bulk deal FII institutional buy sell today India',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.35,
  },
  {
    label: 'Goldman India', tier: 6,
    q: '"Goldman Sachs" India stock upgrade target raise NSE sector 2025',
    signal_type: 'institutional_flow', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 72, baseline_rate: 0.25,
  },
  {
    label: 'JPMorgan India', tier: 6,
    q: '"JPMorgan" India stock overweight upgrade price target 2025',
    signal_type: 'institutional_flow', sentiment_bias: 'bullish',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 72, baseline_rate: 0.25,
  },

  // ── Derivatives ───────────────────────────────────────────────────────────
  {
    label: 'Nifty Options OI', tier: 4,
    q: 'Nifty options OI buildup call put PCR unusual activity today NSE',
    signal_type: 'derivatives', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.45,
  },
  {
    label: 'BankNifty Flow', tier: 4,
    q: 'BankNifty options OI max pain support resistance expiry today',
    signal_type: 'derivatives', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.40,
  },
  {
    label: 'Stock OI Buildup', tier: 4,
    q: 'NSE stock options open interest long buildup short covering today India',
    signal_type: 'derivatives', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.40,
  },

  // ── Market Direction ──────────────────────────────────────────────────────
  {
    label: 'GIFT Nifty Signal', tier: 5,
    q: 'GIFT Nifty SGX gap up gap down premium discount NSE opening today',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 8, baseline_rate: 0.50,
  },
  {
    label: 'India VIX', tier: 5,
    q: 'India VIX fear greed NSE volatility index spike fall today',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.35,
  },
  {
    label: 'NSE Breakouts', tier: 3,
    q: 'NSE stock 52-week high breakout volume surge momentum rally today India',
    signal_type: 'market_direction', sentiment_bias: 'bullish',
    reliability_score: 6, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.55,
  },

  // ── Macro ─────────────────────────────────────────────────────────────────
  {
    label: 'RBI Policy', tier: 5,
    q: 'RBI repo rate policy decision India inflation banking stock impact 2025',
    signal_type: 'macro', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.30,
  },
  {
    label: 'Global Macro Risk', tier: 6,
    q: 'US Fed DXY dollar crude oil treasury yield India NSE impact today',
    signal_type: 'macro', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.45,
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  {
    label: 'Earnings Beats', tier: 5,
    q: 'India quarterly results earnings beat profit above estimate NSE stock today',
    signal_type: 'media', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.70,
  },
  {
    label: 'Analyst Upgrades', tier: 2,
    q: 'India NSE stock analyst upgrade buy strong buy target raised ICICI Morgan Motilal 2025',
    signal_type: 'media', sentiment_bias: 'bullish',
    reliability_score: 6, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.65,
  },

  // ── Negative Events ───────────────────────────────────────────────────────
  {
    label: 'Earnings Misses', tier: 5,
    q: 'India quarterly results earnings miss profit below estimate NSE stock today',
    signal_type: 'negative_events', sentiment_bias: 'bearish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.55,
  },
  {
    label: 'Analyst Downgrades', tier: 2,
    q: 'India NSE stock analyst downgrade sell reduce underperform target cut 2025',
    signal_type: 'negative_events', sentiment_bias: 'bearish',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.50,
  },
  {
    label: 'Regulatory Risk', tier: 5,
    q: 'India NSE stock SEBI penalty fraud promoter pledge warning circuit today',
    signal_type: 'negative_events', sentiment_bias: 'bearish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.30,
  },
];

const NEWS_BASE = 'https://news.google.com/rss/search';

// ── Fetch Google News RSS ─────────────────────────────────────────────────────
async function fetchNewsItems(source, maxItems = 4) {
  const url = `${NEWS_BASE}?q=${encodeURIComponent(source.q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const maxAgeMs = (source.max_age_hours ?? 168) * 60 * 60 * 1000;
    const cutoff   = Date.now() - maxAgeMs;
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null && items.length < maxItems) {
      const block = m[1];
      const dateStr = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1];
      const ts = dateStr ? new Date(dateStr).getTime() : Date.now();
      if (ts < cutoff) continue;

      const titleRaw = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const descRaw  = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
      const outletRaw= (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';

      const clean = s => s
        .replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();

      const title = clean(titleRaw);
      const desc  = clean(descRaw);
      const text  = desc.length > title.length ? `${title}. ${desc}` : title;

      // Cap text at 220 chars to keep total prompt under Groq's 12k TPM limit
      const trimmed = text.length > 220 ? text.slice(0, 217) + '…' : text;
      if (trimmed.length > 40) items.push({
        source:      source.label,
        tier:        source.tier,
        signal_type: source.signal_type,
        sentiment_bias: source.sentiment_bias,
        reliability: source.reliability_score,
        outlet:      clean(outletRaw),
        text:        trimmed,
        daysAgo:     Math.round((Date.now() - ts) / 86400000),
        hoursAgo:    Math.round((Date.now() - ts) / 3600000),
      });
    }
    return items;
  } catch { return []; }
}

// ── LLM helpers ───────────────────────────────────────────────────────────────
function parseJsonResponse(content) {
  const text = (content || '').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('LLM returned non-JSON: ' + text.slice(0, 200));
  }
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.15, max_tokens: 3000,
    }),
  });
  // 429 = rate limit, 413 = prompt too large — both should fall back to Gemini
  if (res.status === 429 || res.status === 413) {
    const body = await res.text();
    throw Object.assign(new Error(`Groq ${res.status}: ${body.slice(0, 120)}`), { status: res.status });
  }
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return parseJsonResponse(data.choices?.[0]?.message?.content);
}

async function callGemini(prompt) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY not set');
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 4000 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return parseJsonResponse(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

// Try Groq → fall back to Gemini on rate-limit
async function callLLM(prompt) {
  try {
    const result = await callGroq(prompt);
    return { result, provider: 'Groq (llama-3.3-70b)' };
  } catch (err) {
    const isRateLimit = err.status === 429 || err.status === 413 || err.message?.includes('429') || err.message?.includes('413') || err.message?.toLowerCase().includes('rate') || err.message?.toLowerCase().includes('too large');
    if (isRateLimit && process.env.GOOGLE_API_KEY) {
      const result = await callGemini(prompt);
      return { result, provider: `Gemini (${process.env.GEMINI_MODEL || 'gemini-1.5-flash'})` };
    }
    throw err;
  }
}

// ── Deterministic scoring layer ───────────────────────────────────────────────

const SIGNAL_TYPE_WEIGHTS = {
  smart_money:        1.5,
  institutional_flow: 1.4,
  market_direction:   1.3,
  negative_events:    1.3,
  derivatives:        1.2,
  macro:              0.0,  // macro never scores per-stock; global cap/modifier only
  media:              0.8,
};

// ── Signal-type-aware recency decay ──────────────────────────────────────────
// Fast-moving signals (derivatives, market_direction) decay within hours.
// High-conviction signals (smart_money) persist for days.
const RECENCY_DECAY_BY_TYPE = {
  derivatives:        h => h <  4 ? 1.00 : h <  8 ? 0.80 : h < 12 ? 0.50 : h < 24 ? 0.20 : 0.05,
  market_direction:   h => h <  4 ? 1.00 : h <  8 ? 0.85 : h < 12 ? 0.65 : h < 24 ? 0.30 : 0.10,
  smart_money:        h => h < 24 ? 1.00 : h < 48 ? 0.85 : h < 72 ? 0.65 : h < 96 ? 0.45 : 0.25,
  institutional_flow: h => h < 12 ? 1.00 : h < 24 ? 0.80 : h < 48 ? 0.55 : h < 72 ? 0.35 : 0.15,
  negative_events:    h => h < 12 ? 1.00 : h < 24 ? 0.80 : h < 48 ? 0.55 : h < 72 ? 0.35 : 0.15,
  media:              h => h < 12 ? 1.00 : h < 24 ? 0.75 : h < 48 ? 0.50 : h < 72 ? 0.30 : 0.15,
  macro:              _h => 1.0,
};

function recencyDecay(signalType, hoursAgo) {
  const fn = RECENCY_DECAY_BY_TYPE[signalType] ?? (h => h < 24 ? 0.8 : 0.4);
  return fn(hoursAgo ?? 24);
}

// ── Novelty scoring ───────────────────────────────────────────────────────────
// Same story repeated across outlets inflates count without adding information.
// We cluster articles by text similarity (Jaccard on trigrams) and apply
// diminishing weights within each cluster: 1st = 1.0, 2nd = 0.6, 3rd = 0.3, 4th+ = 0.15
function trigrams(text) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const words = t.split(/\s+/).filter(w => w.length > 2);
  const tg = new Set();
  for (let i = 0; i < words.length - 2; i++) tg.add(`${words[i]}_${words[i+1]}_${words[i+2]}`);
  return tg;
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  return intersection / (setA.size + setB.size - intersection);
}

function assignNoveltyWeights(articles) {
  const weights = new Array(articles.length).fill(1.0);
  const tgs = articles.map(a => trigrams(a.text));
  const NOVELTY_DECAY = [1.0, 0.6, 0.3, 0.15];

  const assigned = new Set();
  for (let i = 0; i < articles.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    for (let j = i + 1; j < articles.length; j++) {
      if (!assigned.has(j) && jaccard(tgs[i], tgs[j]) > 0.45) cluster.push(j);
    }
    cluster.forEach((idx, rank) => {
      weights[idx] = NOVELTY_DECAY[Math.min(rank, NOVELTY_DECAY.length - 1)];
      assigned.add(idx);
    });
  }
  return weights;
}

// ── Symbol normalisation with confidence ─────────────────────────────────────
// Maps known LLM variants to canonical NSE tickers (exact = 1.0 confidence).
// Unknown symbols get a fuzzy fallback — short names (<4 chars) that don't
// match any known ticker are flagged low-confidence (0.6) and penalised.
const SYMBOL_ALIASES = {
  'HDFCBANK':   ['HDFC BANK', 'HDFCBANK', 'HDFC BANK LTD'],
  'ICICIBANK':  ['ICICI BANK', 'ICICIBANK'],
  'RELIANCE':   ['RELIANCE INDUSTRIES', 'RIL', 'RELIANCE IND'],
  'TCS':        ['TATA CONSULTANCY', 'TATA CONSULTANCY SERVICES'],
  'INFY':       ['INFOSYS', 'INFOSYS LTD'],
  'WIPRO':      ['WIPRO LTD', 'WIPRO LIMITED'],
  'SBIN':       ['SBI', 'STATE BANK', 'STATE BANK OF INDIA'],
  'BAJFINANCE': ['BAJAJ FINANCE', 'BAJFINANCE'],
  'BHARTIARTL': ['BHARTI AIRTEL', 'AIRTEL'],
  'HINDUNILVR': ['HUL', 'HINDUSTAN UNILEVER', 'HINDUSTAN UNILEVER LTD'],
  'KOTAKBANK':  ['KOTAK BANK', 'KOTAK MAHINDRA BANK'],
  'AXISBANK':   ['AXIS BANK', 'AXISBANK'],
  'LT':         ['LARSEN', 'L&T', 'LARSEN AND TOUBRO', 'LARSEN & TOUBRO'],
  'TATAMOTORS': ['TATA MOTORS', 'TATAMOTORS'],
  'TATASTEEL':  ['TATA STEEL', 'TATASTEEL'],
  'MARUTI':     ['MARUTI SUZUKI', 'MARUTI SUZUKI INDIA'],
  'SUNPHARMA':  ['SUN PHARMA', 'SUN PHARMACEUTICAL', 'SUN PHARMA IND'],
  'DRREDDY':    ['DR REDDYS', "DR. REDDY'S", 'DR REDDYS LABORATORIES'],
  'NTPC':       ['NTPC LTD', 'NTPC LIMITED'],
  'POWERGRID':  ['POWER GRID', 'POWER GRID CORP', 'PGCIL'],
  'ONGC':       ['ONGC LTD', 'OIL AND NATURAL GAS', 'OIL & NATURAL GAS'],
  'COALINDIA':  ['COAL INDIA', 'COALINDIA', 'CIL'],
  'ADANIENT':   ['ADANI ENTERPRISES', 'ADANI ENT'],
  'ADANIPORTS': ['ADANI PORTS', 'APSEZ'],
  'BAJAJFINSV': ['BAJAJ FINSERV', 'BAJAJFINSV'],
  'HCLTECH':    ['HCL TECH', 'HCL TECHNOLOGIES'],
  'TECHM':      ['TECH MAHINDRA', 'TECHM'],
  'ULTRACEMCO': ['ULTRATECH CEMENT', 'ULTRATECH'],
  'TITAN':      ['TITAN COMPANY', 'TITAN CO'],
  'NESTLEIND':  ['NESTLE INDIA', 'NESTLE'],
  'DIVISLAB':   ["DIVI'S LABORATORIES", 'DIVI LAB', 'DIVISLAB'],
  'CIPLA':      ['CIPLA LTD', 'CIPLA LIMITED'],
  'EICHERMOT':  ['EICHER MOTORS', 'EICHERMOT'],
  'HEROMOTOCO': ['HERO MOTOCORP', 'HERO MOTO'],
  'BPCL':       ['BHARAT PETROLEUM', 'BPCL'],
  'IOC':        ['INDIAN OIL', 'IOCL'],
};

// Liquid Nifty-100 universe — stocks outside this set get a confidence penalty.
const LIQUID_NSE = new Set([
  'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','SBIN','BHARTIARTL',
  'KOTAKBANK','LT','AXISBANK','BAJFINANCE','WIPRO','HCLTECH','ASIANPAINT','MARUTI',
  'ULTRACEMCO','TITAN','SUNPHARMA','NTPC','POWERGRID','ONGC','TATAMOTORS','TATASTEEL',
  'COALINDIA','ADANIENT','ADANIPORTS','BAJAJFINSV','TECHM','NESTLEIND','DIVISLAB',
  'CIPLA','DRREDDY','EICHERMOT','HEROMOTOCO','BPCL','IOC','INDUSINDBK','M&M',
  'BRITANNIA','SHREECEM','GRASIM','JSWSTEEL','HINDALCO','VEDL','APOLLOHOSP',
  'DMART','TATACONSUM','DABUR','GODREJCP','BERGEPAINT','PIDILITIND','HAVELLS',
  'VOLTAS','WHIRLPOOL','ABB','SIEMENS','BOSCH','CUMMINSIND','THERMAX',
  'MPHASIS','LTIM','PERSISTENT','COFORGE','OFSS','NAUKRI','ZOMATO','PAYTM',
  'IRCTC','HDFCLIFE','SBILIFE','ICICIPRULI','ICICIGI','BAJAJHLDNG','CHOLAFIN',
  'MFIN','MANAPPURAM','AAVAS','HOMEFIRST','CREDITACC','SBICARD','PNB','BANKBARODA',
  'CANBK','UNIONBANK','IDFCFIRSTB','FEDERALBNK','BANDHANBNK','RBLBANK',
]);

const ALIAS_LOOKUP = {};
for (const [canonical, aliases] of Object.entries(SYMBOL_ALIASES)) {
  ALIAS_LOOKUP[canonical] = canonical; // self-map
  for (const alias of aliases) ALIAS_LOOKUP[alias.toUpperCase()] = canonical;
}

function normaliseSymbol(raw) {
  const up = (raw || '').toUpperCase().trim().replace(/\s+/g, ' ');
  const exact = ALIAS_LOOKUP[up];
  if (exact) return { symbol: exact, confidence: 1.0 };

  // Fuzzy fallback: check if raw is already a known NSE ticker
  if (LIQUID_NSE.has(up)) return { symbol: up, confidence: 1.0 };

  // Short unknown tokens are likely noise; longer ones may be valid smallcap tickers
  const confidence = up.length >= 5 ? 0.75 : 0.50;
  return { symbol: up, confidence };
}

// ── Event strength — macro-context-aware ─────────────────────────────────────
const EVENT_STRENGTH_BASE = {
  earnings_beat:      2.5,
  earnings_miss:      2.5,
  block_deal:         2.2,
  sebi_action:        2.0,
  analyst_upgrade:    1.8,
  analyst_downgrade:  1.8,
  price_target_raise: 1.6,
  price_target_cut:   1.6,
  breakout_52wk:      1.5,
  fii_buying:         1.4,
  fii_selling:        1.4,
  results_guidance:   1.3,
  general_mention:    1.0,
};

function eventStrengthMultiplier(eventType, regime) {
  const base = EVENT_STRENGTH_BASE[eventType] ?? 1.0;
  // On high-risk / bear regimes, bullish event strength is dampened
  if (regime === 'strong_bear' || regime === 'bear') {
    const bullishEvents = ['earnings_beat','analyst_upgrade','price_target_raise','breakout_52wk','fii_buying'];
    if (bullishEvents.includes(eventType)) return base * 0.6;
  }
  // On strong-bull regimes, bearish event strength is dampened
  if (regime === 'strong_bull') {
    const bearishEvents = ['earnings_miss','analyst_downgrade','price_target_cut','fii_selling','sebi_action'];
    if (bearishEvents.includes(eventType)) return base * 0.7;
  }
  return base;
}

// ── Market regime engine ──────────────────────────────────────────────────────
// Consolidates macro signals into a discrete regime used for caps and event dampening.
function deriveRegime(macroRisk, giftBias, vixState) {
  const riskHigh   = macroRisk === 'high';
  const riskMed    = macroRisk === 'medium';
  const gapDown    = giftBias  === 'gap-down';
  const gapUp      = giftBias  === 'gap-up';
  const vixSpiking = vixState  === 'spiking';
  const vixLow     = vixState  === 'low';

  if (riskHigh && gapDown)              return 'strong_bear';
  if (riskHigh || (gapDown && vixSpiking)) return 'bear';
  if (!riskHigh && gapUp && vixLow)    return 'strong_bull';
  if (!riskHigh && (gapUp || vixLow))  return 'bull';
  return 'neutral';
}

// ── Market regime caps / tailwinds ────────────────────────────────────────────
// Hard caps enforce the regime as a structural constraint, not a nudge.
function applyRegimeCap(score, directionalBias, regime) {
  if (directionalBias === 'long') {
    if (regime === 'strong_bear') return score * 0.25;
    if (regime === 'bear')        return score * 0.50;
    if (regime === 'neutral')     return score * 0.80;
    if (regime === 'strong_bull') return score * 1.20;
  }
  if (directionalBias === 'short') {
    if (regime === 'strong_bear') return score * 1.40;
    if (regime === 'bear')        return score * 1.20;
    if (regime === 'strong_bull') return score * 0.50;
    if (regime === 'bull')        return score * 0.70;
  }
  return score;
}

// ── Directional bias derivation ───────────────────────────────────────────────
// Separates textual sentiment from actual trade direction.
// Nuanced cases: "profit booking" is bearish price action even if framed neutrally.
const BEARISH_EVENT_TYPES = new Set([
  'earnings_miss','analyst_downgrade','price_target_cut','fii_selling','sebi_action',
]);
const BULLISH_EVENT_TYPES = new Set([
  'earnings_beat','analyst_upgrade','price_target_raise','fii_buying','breakout_52wk','block_deal',
]);

function deriveDirectionalBias(sentiment, eventType, regime) {
  // Event type is stronger than sentiment label in ambiguous cases
  if (BEARISH_EVENT_TYPES.has(eventType)) return 'short';
  if (BULLISH_EVENT_TYPES.has(eventType)) return 'long';
  // Fall back to sentiment
  if (sentiment === 'bearish') return 'short';
  if (sentiment === 'bullish') return 'long';
  return 'neutral';
}

// ── Consensus — source + type diversity, log-capped ──────────────────────────
// Beyond 3 unique sources, growth is logarithmic to prevent runaway amplification.
// A diversity quality factor rewards high-reliability cross-type agreement
// and penalises redundant same-outlet repetition.
function consensusMultiplier(mentions) {
  const distinctSources = new Set(mentions.map(m => m.source)).size;
  const distinctTypes   = new Set(mentions.map(m => m.signal_type)).size;

  // Log-capped source base: 1 → 1.0, 2 → 1.6, 3 → 2.4, 4+ → 2.4 + log(n-3) × 0.4
  const sourceBase = distinctSources <= 1 ? 1.0
                   : distinctSources === 2 ? 1.6
                   : distinctSources === 3 ? 2.4
                   : 2.4 + Math.log(distinctSources - 2) * 0.4;

  // Type diversity bonus — capped at 1.5×
  const typeDiversityBonus = Math.min(1.5, 1.0 + (distinctTypes - 1) * 0.3);

  // Cross-type conviction bonus
  const types = [...new Set(mentions.map(m => m.signal_type))];
  const crossBonus = types.includes('smart_money') && types.includes('derivatives') ? 1.5
                   : types.includes('institutional_flow') && types.includes('derivatives') ? 1.3
                   : types.includes('smart_money') && types.includes('institutional_flow') ? 1.2
                   : 1.0;

  // Diversity quality factor: penalise if >60% of mentions from same outlet
  const outletCounts = {};
  for (const m of mentions) outletCounts[m.outlet || m.source] = (outletCounts[m.outlet || m.source] || 0) + 1;
  const maxOutletShare = Math.max(...Object.values(outletCounts)) / mentions.length;
  const diversityQuality = maxOutletShare > 0.6 ? 0.7 : 1.0;

  return sourceBase * typeDiversityBonus * crossBonus * diversityQuality;
}

// ── Baseline normalization ────────────────────────────────────────────────────
// Divides per-article contribution by the source's baseline_rate so high-volume
// signal_types (media, market_direction) don't dominate over rare, precious ones
// (smart_money) purely due to article density.
// baseline_rate is sourced from the SOURCES registry per article.
function baselineNorm(baselineRate) {
  // Invert and clamp: low baseline (rare signal) → higher normalised weight
  return 1 / Math.max(baselineRate ?? 0.5, 0.10);
}

// ── LLM — extraction only ─────────────────────────────────────────────────────
async function extractWithLLM(articles) {
  const key = process.env.GROQ_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('No LLM API key set (GROQ_API_KEY or GOOGLE_API_KEY)');

  const today     = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dayOfWeek = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  const block = articles.map(a =>
    `[${a.signal_type}·R${a.reliability}·${a.hoursAgo}h·${a.sentiment_bias}·${a.source}]: ${a.text}`
  ).join('\n');

  const prompt = `You are an intelligence extraction engine for an Indian equity trading system. Today is ${today} (${dayOfWeek}).

Your ONLY job is to READ the news feed and EXTRACT structured data. Do NOT score, rank, or decide which stocks to buy or sell. A separate deterministic engine handles scoring. Extract accurately — do not hallucinate stocks not present in the feed.

INTELLIGENCE FEED (${articles.length} signals):
${block}

Return ONLY valid JSON:

{
  "extractions": [
    {
      "symbol": "HDFCBANK",
      "exchange": "NSE",
      "company": "HDFC Bank Ltd",
      "sector": "Banking",
      "sentiment": "bullish",
      "event_type": "analyst_upgrade",
      "reason": "One crisp sentence: what the signal says about this stock",
      "detailed_reasoning": "2-3 sentences: what was reported, by whom, and why it matters today",
      "key_risk": "One sentence: what could invalidate this signal today",
      "mentioned_by": ["Goldman India", "FII DII Net Flow"],
      "signal_types_seen": ["institutional_flow"],
      "intraday_note": "Specific price level or setup to watch, if mentioned in the feed"
    }
  ],
  "market_context": {
    "gift_nifty_bias": "gap-up",
    "vix_state": "low",
    "macro_risk": "low",
    "boost_sectors": ["Banking", "Metals"],
    "penalise_sectors": ["IT", "Aviation"],
    "top_sectors": ["Banking", "Metals", "Energy"],
    "avoid_sectors": ["Aviation"],
    "summary": "Two sentences: overall market mood and key macro theme today",
    "market_sentiment": "bullish"
  }
}

Rules:
- symbol: use best-known NSE ticker (e.g. HDFCBANK, RELIANCE, SBIN)
- Extract EVERY stock with a specific signal: buy/sell/short/upgrade/downgrade/earnings/block deal/OI buildup
- sentiment: "bullish" | "bearish" | "neutral"
- event_type: earnings_beat | earnings_miss | analyst_upgrade | analyst_downgrade |
  price_target_raise | price_target_cut | block_deal | breakout_52wk | fii_buying | fii_selling |
  sebi_action | results_guidance | general_mention
- gift_nifty_bias: "gap-up" | "gap-down" | "flat" | "unknown"
- vix_state: "low" | "elevated" | "spiking" | "unknown"
- macro_risk: "low" | "medium" | "high"
- Negative signals → sentiment: "bearish"
- Do not invent stocks absent from the feed
- This layer is a CONTEXT INTELLIGENCE ENGINE: it captures what is being discussed.
  Price and volume triggers in a separate layer determine actual trade execution.
- ${dayOfWeek === 'Monday'   ? 'Monday: flag weekend gap-up catalysts and short-covering candidates.' : ''}
- ${dayOfWeek === 'Thursday' ? 'Thursday expiry: flag max pain levels and options-pinning signals.' : ''}
- ${dayOfWeek === 'Friday'   ? 'Friday: flag position-squaring and weekend-risk signals.' : ''}`;

  const { result, provider } = await callLLM(prompt);
  return { result, provider };
}

// ── Deterministic scorer ───────────────────────────────────────────────────────
function scoreAndRank(extractions, articles, marketContext) {
  const macroRisk = marketContext.macro_risk      || 'low';
  const giftBias  = marketContext.gift_nifty_bias || 'unknown';
  const vixState  = marketContext.vix_state       || 'unknown';
  const regime    = deriveRegime(macroRisk, giftBias, vixState);
  const dow       = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  // Assign novelty weights to all articles before scoring
  const noveltyWeights = assignNoveltyWeights(articles);

  const scored = extractions.map(ext => {
    const { symbol: sym, confidence } = normaliseSymbol(ext.symbol);
    const co = (ext.company || '').toLowerCase();

    // Derive directional bias from event_type + sentiment + regime
    const directionalBias = deriveDirectionalBias(ext.sentiment, ext.event_type, regime);

    // Match articles (excluding macro) to this stock
    const matchedIdxs = [];
    articles.forEach((a, idx) => {
      if (a.signal_type === 'macro') return;
      const t = a.text.toLowerCase();
      if (t.includes(sym.toLowerCase()) || (co.length > 4 && t.includes(co.slice(0, Math.min(co.length, 12))))) {
        matchedIdxs.push(idx);
      }
    });
    const mentions = matchedIdxs.map(i => articles[i]);

    // Per-article score with novelty weight and baseline normalisation
    let totalScore = 0;
    matchedIdxs.forEach((articleIdx, i) => {
      const m            = articles[articleIdx];
      const typeWeight   = SIGNAL_TYPE_WEIGHTS[m.signal_type] ?? 1.0;
      const reliability  = (m.reliability ?? 5) / 10;
      const decay        = recencyDecay(m.signal_type, m.hoursAgo ?? 24);
      const novelty      = noveltyWeights[articleIdx];
      const baseline     = baselineNorm(m.baseline_rate);
      const sentimentAlign = m.sentiment_bias === 'bearish'
        ? (directionalBias === 'short' ?  1.0 : -0.5)
        : m.sentiment_bias === 'bullish'
        ? (directionalBias === 'long'  ?  1.0 : -0.3)
        : 0.7;
      totalScore += typeWeight * reliability * decay * novelty * baseline * sentimentAlign;
    });

    // Event strength — context-aware (dampened in adverse regimes)
    const eventMult = eventStrengthMultiplier(ext.event_type || 'general_mention', regime);

    // Consensus — log-capped, diversity-quality-adjusted
    const consensus = mentions.length ? consensusMultiplier(mentions) : 1.0;

    let score = totalScore * eventMult * consensus;

    // Symbol confidence penalty — uncertain normalisations score less
    score *= confidence;

    // Sector-level macro modifier (soft)
    const sector   = (ext.sector || '').toLowerCase();
    const boosted  = (marketContext.boost_sectors    || []).some(s => sector.includes(s.toLowerCase()));
    const penalise = (marketContext.penalise_sectors || []).some(s => sector.includes(s.toLowerCase()));
    score *= boosted ? 1.2 : penalise ? 0.7 : 1.0;

    // Day-of-week timing
    score *= dow === 'Monday' && directionalBias === 'long' ? 1.10
           : dow === 'Friday' && directionalBias === 'long' ? 0.85
           : 1.0;

    // Regime hard cap / tailwind — structural constraint not nudge
    score = applyRegimeCap(score, directionalBias, regime);

    return {
      ...ext,
      symbol:          sym,
      sym_confidence:  confidence,
      directional_bias: directionalBias,
      regime,
      score:           +score.toFixed(3),
      mention_count:   mentions.length,
      signal_types:    [...new Set(mentions.map(m => m.signal_type))],
      distinct_sources: new Set(mentions.map(m => m.source)).size,
    };
  });

  // Deduplicate by canonical symbol (keep highest |score|), sort, top 10
  const bySymbol = new Map();
  for (const p of scored) {
    const existing = bySymbol.get(p.symbol);
    if (!existing || Math.abs(p.score) > Math.abs(existing.score)) bySymbol.set(p.symbol, p);
  }

  return [...bySymbol.values()]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 10)
    .map((p, i) => ({
      rank:             i + 1,
      symbol:           p.symbol,
      exchange:         p.exchange || 'NSE',
      company:          p.company,
      sector:           p.sector,
      sentiment:        p.sentiment,
      directional_bias: p.directional_bias,
      event_type:       p.event_type || 'general_mention',
      regime,
      confidence:       Math.min(5, Math.max(1, Math.round(Math.abs(p.score) * 1.5))),
      score:            p.score,
      sym_confidence:   p.sym_confidence,
      reason:           p.reason,
      detailed_reasoning: p.detailed_reasoning,
      key_risk:         p.key_risk,
      mentioned_by:     p.mentioned_by || [],
      signal_types:     p.signal_types,
      mention_count:    p.mention_count,
      distinct_sources: p.distinct_sources,
      intraday_note:    p.intraday_note || '',
      context_only:     true,
    }));
}

// ── Orchestrator ───────────────────────────────────────────────────────────────
async function analyzeWithGroq(articles) {
  const { result: extracted, provider } = await extractWithLLM(articles);

  const extractions   = extracted.extractions   || [];
  const marketContext = extracted.market_context || {};

  const picks = scoreAndRank(extractions, articles, marketContext);
  const regime = picks[0]?.regime || deriveRegime(
    marketContext.macro_risk || 'low',
    marketContext.gift_nifty_bias || 'unknown',
    marketContext.vix_state || 'unknown',
  );

  return {
    picks,
    market_sentiment: marketContext.market_sentiment || 'neutral',
    macro_risk:       marketContext.macro_risk       || 'medium',
    gift_nifty_bias:  marketContext.gift_nifty_bias  || 'unknown',
    vix_state:        marketContext.vix_state        || 'unknown',
    regime,
    top_sectors:      marketContext.top_sectors      || [],
    avoid_sectors:    marketContext.avoid_sectors    || [],
    summary:          marketContext.summary          || '',
    algo_note:        'Backend scorer: (typeWeight × reliability × recencyDecay × novelty × baselineNorm × sentimentAlign) × eventStrength(regime) × consensus(log-capped, diversity-quality) × symConfidence × sectorMod × regimeCap. LLM extracts only.',
    _provider:        provider,
  };
}

// ── Cache — /tmp persists across warm Lambda invocations on Vercel ────────────
const CACHE_FILE   = '/tmp/brain-cache.json';
const CACHE_FRESH  = 30 * 60 * 1000;   // 30 min — return as fresh
const CACHE_STALE  = 4  * 60 * 60 * 1000; // 4 hr  — serve stale, still fast

// In-memory mirror so repeated requests within same invocation skip disk I/O
let _mem = null;

function readCache() {
  if (_mem) return _mem;
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    _mem = JSON.parse(raw);
    return _mem;
  } catch { return null; }
}

function writeCache(data) {
  _mem = data;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch {}
}

async function fetchFresh() {
  const results  = await Promise.allSettled(SOURCES.map(s => fetchNewsItems(s, 3)));
  const articles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  if (articles.length === 0) throw new Error('No articles fetched');

  const analysis = await analyzeWithGroq(articles);
  const signalTypes = ['smart_money','institutional_flow','derivatives','market_direction','macro','media','negative_events'];
  const result = {
    ...analysis,
    article_count:       articles.length,
    sources_fetched:     [...new Set(articles.map(a => a.source))],
    signal_breakdown:    Object.fromEntries(
      signalTypes.map(t => [t, articles.filter(a => a.signal_type === t).length])
    ),
    powered_by:   analysis._provider || 'Groq (llama-3.3-70b)',
    generated_at: new Date().toISOString(),
  };
  delete result._provider;
  writeCache(result);
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function getBrainResult(bust = false) {
  if (!bust) {
    const cached = readCache();
    if (cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_FRESH)
        return { ...cached, cached: true, cache_age_min: Math.round(age / 60000) };
      if (age < CACHE_STALE)
        return { ...cached, cached: true, cache_age_min: Math.round(age / 60000),
          stale_note: 'Serving cached result. Click Refresh to update.' };
    }
  }
  try {
    const result = await fetchFresh();
    return { ...result, cached: false, cache_age_min: 0 };
  } catch (e) {
    const stale = readCache();
    if (stale) {
      const age = Math.round((Date.now() - new Date(stale.generated_at).getTime()) / 60000);
      return { ...stale, cached: true, cache_age_min: age,
        stale_note: `Live fetch failed (${e.message}). Serving ${age}min old cache.` };
    }
    throw e;
  }
}
