// Market Brain — named exports consumed by api/intel.js
import fs   from 'fs';
import path from 'path';

// ── Source registry ───────────────────────────────────────────────────────────
// signal_type: smart_money | institutional_flow | derivatives | market_direction
//              macro | media | negative_events
// sentiment_bias: bullish | bearish | neutral
// reliability_score: 1–10 (how often this source leads to real price moves)
// dynamic_weight: multiplier applied to each article's base score (start at 1.0)
// max_age_hours: articles older than this are dropped per signal_type
const SOURCES = [
  // ── Smart Money — legend investors with disclosed/rumoured positions ────────
  {
    label: 'Vijay Kedia', tier: 1,
    q: '"Vijay Kedia" stock buy accumulate NSE portfolio 2024 2025',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 72,
  },
  {
    label: 'Basant Maheshwari', tier: 1,
    q: '"Basant Maheshwari" equity picks NSE accumulate strong buy',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 72,
  },
  {
    label: 'Deepak Shenoy', tier: 1,
    q: '"Deepak Shenoy" OR "Capital Mind" stock buy NSE analysis 2025',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48,
  },
  {
    label: 'Mitesh Engineer', tier: 1,
    q: '"Mitesh Engineer" OR "@Mitesh_Engr" stock buy target NSE intraday',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24,
  },
  {
    label: 'Porinju Veliyath', tier: 1,
    q: '"Porinju Veliyath" stock portfolio NSE smallcap multibagger',
    signal_type: 'smart_money', sentiment_bias: 'bullish',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 96,
  },

  // ── Institutional Flow — FII/DII/broker block deals ──────────────────────
  {
    label: 'FII DII Net Flow', tier: 5,
    q: 'FII DII net buying selling India NSE BSE crore today 2025',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 24,
  },
  {
    label: 'Block Deals', tier: 5,
    q: 'NSE BSE block deal bulk deal FII institutional buy sell today India',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24,
  },
  {
    label: 'Goldman India', tier: 6,
    q: '"Goldman Sachs" India stock upgrade target raise NSE sector 2025',
    signal_type: 'institutional_flow', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 72,
  },
  {
    label: 'JPMorgan India', tier: 6,
    q: '"JPMorgan" India stock overweight upgrade price target 2025',
    signal_type: 'institutional_flow', sentiment_bias: 'bullish',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 72,
  },

  // ── Derivatives — OI buildup, PCR, unusual options activity ─────────────
  {
    label: 'Nifty Options OI', tier: 4,
    q: 'Nifty options OI buildup call put PCR unusual activity today NSE',
    signal_type: 'derivatives', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12,
  },
  {
    label: 'BankNifty Flow', tier: 4,
    q: 'BankNifty options OI max pain support resistance expiry today',
    signal_type: 'derivatives', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12,
  },
  {
    label: 'Stock OI Buildup', tier: 4,
    q: 'NSE stock options open interest long buildup short covering today India',
    signal_type: 'derivatives', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12,
  },

  // ── Market Direction — GIFT Nifty, VIX, breadth ──────────────────────────
  {
    label: 'GIFT Nifty Signal', tier: 5,
    q: 'GIFT Nifty SGX gap up gap down premium discount NSE opening today',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 8,
  },
  {
    label: 'India VIX', tier: 5,
    q: 'India VIX fear greed NSE volatility index spike fall today',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12,
  },
  {
    label: 'NSE Breakouts', tier: 3,
    q: 'NSE stock 52-week high breakout volume surge momentum rally today India',
    signal_type: 'market_direction', sentiment_bias: 'bullish',
    reliability_score: 6, dynamic_weight: 1.0, max_age_hours: 24,
  },

  // ── Macro — RBI, budget, policy, global risk ─────────────────────────────
  {
    label: 'RBI Policy', tier: 5,
    q: 'RBI repo rate policy decision India inflation banking stock impact 2025',
    signal_type: 'macro', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48,
  },
  {
    label: 'Global Macro Risk', tier: 6,
    q: 'US Fed DXY dollar crude oil treasury yield India NSE impact today',
    signal_type: 'macro', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 24,
  },

  // ── Media — earnings, upgrades, analyst targets ───────────────────────────
  {
    label: 'Earnings Beats', tier: 5,
    q: 'India quarterly results earnings beat profit above estimate NSE stock today',
    signal_type: 'media', sentiment_bias: 'bullish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48,
  },
  {
    label: 'Analyst Upgrades', tier: 2,
    q: 'India NSE stock analyst upgrade buy strong buy target raised ICICI Morgan Motilal 2025',
    signal_type: 'media', sentiment_bias: 'bullish',
    reliability_score: 6, dynamic_weight: 1.0, max_age_hours: 48,
  },

  // ── Negative Events — downgrades, warnings, weak guidance ────────────────
  {
    label: 'Earnings Misses', tier: 5,
    q: 'India quarterly results earnings miss profit below estimate NSE stock today',
    signal_type: 'negative_events', sentiment_bias: 'bearish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48,
  },
  {
    label: 'Analyst Downgrades', tier: 2,
    q: 'India NSE stock analyst downgrade sell reduce underperform target cut 2025',
    signal_type: 'negative_events', sentiment_bias: 'bearish',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 48,
  },
  {
    label: 'Regulatory Risk', tier: 5,
    q: 'India NSE stock SEBI penalty fraud promoter pledge warning circuit today',
    signal_type: 'negative_events', sentiment_bias: 'bearish',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24,
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
  macro:              0.0,  // macro never scores per-stock; it's a global cap/modifier only
  media:              0.8,
};

// Per-signal-type recency decay curves.
// derivatives and market_direction are intraday signals — stale in hours.
// smart_money and institutional_flow persist for days.
// media and negative_events decay at a medium rate.
const RECENCY_DECAY_BY_TYPE = {
  derivatives:        h => h <  4 ? 1.00 : h <  8 ? 0.80 : h < 12 ? 0.50 : h < 24 ? 0.20 : 0.05,
  market_direction:   h => h <  4 ? 1.00 : h <  8 ? 0.85 : h < 12 ? 0.65 : h < 24 ? 0.30 : 0.10,
  smart_money:        h => h < 24 ? 1.00 : h < 48 ? 0.85 : h < 72 ? 0.65 : h < 96 ? 0.45 : 0.25,
  institutional_flow: h => h < 12 ? 1.00 : h < 24 ? 0.80 : h < 48 ? 0.55 : h < 72 ? 0.35 : 0.15,
  negative_events:    h => h < 12 ? 1.00 : h < 24 ? 0.80 : h < 48 ? 0.55 : h < 72 ? 0.35 : 0.15,
  media:              h => h < 12 ? 1.00 : h < 24 ? 0.75 : h < 48 ? 0.50 : h < 72 ? 0.30 : 0.15,
  macro:              h => 1.0, // macro is always current context; decay handled by max_age_hours
};

function recencyDecay(signalType, hoursAgo) {
  const fn = RECENCY_DECAY_BY_TYPE[signalType] ?? (h => h < 24 ? 0.8 : 0.4);
  return fn(hoursAgo ?? 24);
}

// Consensus is based on SOURCE diversity and SIGNAL-TYPE diversity, not raw count.
// Duplicate articles from the same source on the same signal_type count as one.
function consensusMultiplier(mentions) {
  const distinctSources = new Set(mentions.map(m => m.source)).size;
  const distinctTypes   = new Set(mentions.map(m => m.signal_type)).size;

  // Base: source diversity (each unique source adds diminishing returns)
  const sourceBase = distinctSources === 1 ? 1.0
                   : distinctSources === 2 ? 1.6
                   : distinctSources === 3 ? 2.5
                   : 3.5;

  // Type diversity bonus: each additional signal_type adds 0.3× up to 1.5×
  const typeDiversityBonus = Math.min(1.5, 1.0 + (distinctTypes - 1) * 0.3);

  // High-conviction cross-type bonus: smart_money + derivatives = strongest combo
  const types = [...new Set(mentions.map(m => m.signal_type))];
  const crossBonus = types.includes('smart_money') && types.includes('derivatives') ? 1.5
                   : types.includes('institutional_flow') && types.includes('derivatives') ? 1.3
                   : 1.0;

  return sourceBase * typeDiversityBonus * crossBonus;
}

// ── Symbol normalisation ──────────────────────────────────────────────────────
// Maps common LLM output variants to canonical NSE tickers.
// Prevents "HDFC Bank", "HDFCBank", "HDFCBANK" from fragmenting into 3 buckets.
const SYMBOL_ALIASES = {
  'HDFCBANK':  ['HDFC BANK', 'HDFCBANK', 'HDFC BANK LTD'],
  'ICICIBANK': ['ICICI BANK', 'ICICIBANK'],
  'RELIANCE':  ['RELIANCE INDUSTRIES', 'RIL'],
  'TCS':       ['TATA CONSULTANCY', 'TATA CONSULTANCY SERVICES'],
  'INFY':      ['INFOSYS', 'INFOSYS LTD'],
  'WIPRO':     ['WIPRO LTD', 'WIPRO LIMITED'],
  'SBIN':      ['SBI', 'STATE BANK', 'STATE BANK OF INDIA'],
  'BAJFINANCE':['BAJAJ FINANCE', 'BAJFINANCE'],
  'BHARTIARTL':['BHARTI AIRTEL', 'AIRTEL'],
  'HINDUNILVR':['HUL', 'HINDUSTAN UNILEVER'],
  'KOTAKBANK': ['KOTAK BANK', 'KOTAK MAHINDRA BANK'],
  'AXISBANK':  ['AXIS BANK', 'AXISBANK'],
  'LT':        ['LARSEN', 'L&T', 'LARSEN AND TOUBRO'],
  'TATAMOTORS':['TATA MOTORS', 'TATAMOTORS'],
  'TATASTEEL': ['TATA STEEL', 'TATASTEEL'],
  'MARUTI':    ['MARUTI SUZUKI', 'MARUTI SUZUKI INDIA'],
  'SUNPHARMA': ['SUN PHARMA', 'SUN PHARMACEUTICAL'],
  'DRREDDY':   ['DR REDDYS', "DR. REDDY'S", 'DR REDDYS LABORATORIES'],
  'NTPC':      ['NTPC LTD', 'NTPC LIMITED'],
  'POWERGRID': ['POWER GRID', 'POWER GRID CORP'],
  'ONGC':      ['ONGC LTD', 'OIL AND NATURAL GAS'],
  'COALINDIA': ['COAL INDIA', 'COALINDIA'],
  'ADANIENT':  ['ADANI ENTERPRISES', 'ADANI ENT'],
  'ADANIPORTS':['ADANI PORTS', 'APSEZ'],
};

const ALIAS_LOOKUP = {};
for (const [canonical, aliases] of Object.entries(SYMBOL_ALIASES)) {
  for (const alias of aliases) ALIAS_LOOKUP[alias.toUpperCase()] = canonical;
}

function normaliseSymbol(raw) {
  const up = (raw || '').toUpperCase().trim();
  return ALIAS_LOOKUP[up] ?? up;
}

// Event strength: LLM extracts this; we translate to a 1–5 multiplier.
// Weak mention = 1.0, strong event (earnings beat, block deal, SEBI action) = up to 2.5
const EVENT_STRENGTH_MAP = {
  earnings_beat:    2.5,
  earnings_miss:    2.5,  // strong negative event
  block_deal:       2.2,
  analyst_upgrade:  1.8,
  analyst_downgrade:1.8,
  price_target_raise: 1.6,
  price_target_cut:   1.6,
  breakout_52wk:    1.5,
  fii_buying:       1.4,
  fii_selling:      1.4,
  sebi_action:      2.0,
  results_guidance: 1.3,
  general_mention:  1.0,
};

function eventStrengthMultiplier(eventType) {
  return EVENT_STRENGTH_MAP[eventType] ?? 1.0;
}

// ── Macro risk cap ────────────────────────────────────────────────────────────
// When macro risk is high or GIFT Nifty signals a gap-down, impose hard caps
// on bullish scores rather than soft multipliers — this enforces the global
// environment as a structural constraint, not just a nudge.
function applyMacroCap(score, sentiment, macroRisk, giftNiftyBias) {
  const isHighRisk = macroRisk === 'high';
  const isGapDown  = giftNiftyBias === 'gap-down';

  if (sentiment === 'bullish') {
    if (isHighRisk && isGapDown) return Math.min(score, score * 0.30); // hard cap: 30%
    if (isHighRisk)              return Math.min(score, score * 0.50); // hard cap: 50%
    if (isGapDown)               return Math.min(score, score * 0.60); // hard cap: 60%
  }
  if (sentiment === 'bearish') {
    // Bearish picks get a tailwind when macro risk is high
    if (isHighRisk) return score * 1.4;
    if (isGapDown)  return score * 1.2;
  }
  return score;
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

Your ONLY job is to READ the news feed and EXTRACT structured data. Do NOT score, rank, or decide which stocks to buy. A separate deterministic scoring engine handles that. Extract accurately — do not hallucinate stocks not present in the feed.

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
      "detailed_reasoning": "2-3 sentences: what was reported, by whom, why it matters today",
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
- symbol must be the canonical NSE ticker (e.g. HDFCBANK not "HDFC Bank")
- Extract EVERY stock with a specific signal: buy/sell/short/downgrade/upgrade/earnings/block deal/OI buildup
- sentiment: "bullish" | "bearish" | "neutral"
- event_type: one of — earnings_beat | earnings_miss | analyst_upgrade | analyst_downgrade |
  price_target_raise | price_target_cut | block_deal | breakout_52wk | fii_buying | fii_selling |
  sebi_action | results_guidance | general_mention
- gift_nifty_bias: "gap-up" | "gap-down" | "flat" | "unknown"
- vix_state: "low" | "elevated" | "spiking" | "unknown"
- macro_risk: "low" | "medium" | "high"
- Negative signals (downgrade, miss, SEBI, fraud) → sentiment: "bearish"
- Do not invent stocks absent from the feed
- This layer is a CONTEXT INTELLIGENCE ENGINE — it captures what is being talked about.
  Whether a stock actually moves is determined by price/volume triggers in a separate layer.
- ${dayOfWeek === 'Monday'   ? 'Monday: flag weekend gap-up catalysts and short-covering candidates.' : ''}
- ${dayOfWeek === 'Thursday' ? 'Thursday expiry: flag max pain levels and options-pinning signals.' : ''}
- ${dayOfWeek === 'Friday'   ? 'Friday: flag position-squaring and weekend-risk signals.' : ''}`;

  const { result, provider } = await callLLM(prompt);
  return { result, provider };
}

// ── Deterministic scorer ───────────────────────────────────────────────────────
function scoreAndRank(extractions, articles, marketContext) {
  const macroRisk    = marketContext.macro_risk     || 'low';
  const giftBias     = marketContext.gift_nifty_bias || 'unknown';
  const dow          = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  const scored = extractions.map(ext => {
    const sym = normaliseSymbol(ext.symbol);
    const co  = (ext.company || '').toLowerCase();

    // Match articles to this stock by symbol or first 12 chars of company name
    const mentions = articles.filter(a => {
      if (a.signal_type === 'macro') return false; // macro never scores per-stock
      const t = a.text.toLowerCase();
      return t.includes(sym.toLowerCase())
          || (co.length > 4 && t.includes(co.slice(0, Math.min(co.length, 12))));
    });

    // Per-article score
    let totalScore = 0;
    for (const m of mentions) {
      const typeWeight    = SIGNAL_TYPE_WEIGHTS[m.signal_type] ?? 1.0;
      const reliability   = (m.reliability ?? 5) / 10;
      const decay         = recencyDecay(m.signal_type, m.hoursAgo ?? 24);
      const sentimentSign = m.sentiment_bias === 'bearish'
        ? (ext.sentiment === 'bearish' ?  1.0 : -0.5)
        : m.sentiment_bias === 'bullish'
        ? (ext.sentiment === 'bullish' ?  1.0 : -0.3)
        : 0.7;
      totalScore += typeWeight * reliability * decay * sentimentSign;
    }

    // Event strength multiplier (from LLM-extracted event_type)
    const eventMult = eventStrengthMultiplier(ext.event_type || 'general_mention');

    // Consensus based on source + signal-type diversity, not raw count
    const consensus = mentions.length ? consensusMultiplier(mentions) : 1.0;

    let score = totalScore * eventMult * consensus;

    // Sector modifier from macro context (soft)
    const sector = (ext.sector || '').toLowerCase();
    const boosted    = (marketContext.boost_sectors    || []).some(s => sector.includes(s.toLowerCase()));
    const penalised  = (marketContext.penalise_sectors || []).some(s => sector.includes(s.toLowerCase()));
    score *= boosted ? 1.2 : penalised ? 0.7 : 1.0;

    // Day-of-week timing
    score *= dow === 'Monday' && ext.sentiment === 'bullish' ? 1.10
           : dow === 'Friday' && ext.sentiment === 'bullish' ? 0.85
           : 1.0;

    // Macro hard cap — enforces global environment as a structural constraint
    score = applyMacroCap(score, ext.sentiment, macroRisk, giftBias);

    return {
      ...ext,
      symbol:        sym,
      score:         +score.toFixed(3),
      mention_count: mentions.length,
      signal_types:  [...new Set(mentions.map(m => m.signal_type))],
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
      rank:               i + 1,
      symbol:             p.symbol,
      exchange:           p.exchange || 'NSE',
      company:            p.company,
      sector:             p.sector,
      sentiment:          p.sentiment,
      event_type:         p.event_type || 'general_mention',
      confidence:         Math.min(5, Math.max(1, Math.round(Math.abs(p.score) * 1.5))),
      score:              p.score,
      reason:             p.reason,
      detailed_reasoning: p.detailed_reasoning,
      key_risk:           p.key_risk,
      mentioned_by:       p.mentioned_by || [],
      signal_types:       p.signal_types,
      mention_count:      p.mention_count,
      distinct_sources:   p.distinct_sources,
      intraday_note:      p.intraday_note || '',
      context_only:       true, // this layer captures what is talked about; price/volume trigger is the execution gate
    }));
}

// ── Orchestrator ───────────────────────────────────────────────────────────────
async function analyzeWithGroq(articles) {
  const { result: extracted, provider } = await extractWithLLM(articles);

  const extractions   = extracted.extractions   || [];
  const marketContext = extracted.market_context || {};

  const picks = scoreAndRank(extractions, articles, marketContext);

  return {
    picks,
    market_sentiment: marketContext.market_sentiment || 'neutral',
    macro_risk:       marketContext.macro_risk       || 'medium',
    gift_nifty_bias:  marketContext.gift_nifty_bias  || 'unknown',
    vix_state:        marketContext.vix_state        || 'unknown',
    top_sectors:      marketContext.top_sectors      || [],
    avoid_sectors:    marketContext.avoid_sectors    || [],
    summary:          marketContext.summary          || '',
    algo_note:        'Backend scorer: signal_type_weight × (reliability/10) × signal_type_recency_decay × event_strength × consensus(source+type diversity) × macro_hard_cap. LLM extracts only.',
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
