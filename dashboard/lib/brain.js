// Market Brain — named exports consumed by api/intel.js
import fs   from 'fs';
import path from 'path';
import { fetchCalibration, persistPicks, recordOutcomes, refreshSourceStats, buildMonitor, resolveCalibration, vixBucket, timeBucket } from './outcomes.js';

// ── Source registry ───────────────────────────────────────────────────────────
// Direct RSS feeds from Indian financial publishers — reliable from cloud IPs.
// baseline_rate: expected article density for this signal_type (0–1).
//   High = naturally voluminous (media), low = rare and precious (smart_money).
const SOURCES = [
  // ── Market Direction — broad market news ─────────────────────────────────
  {
    label: 'ET Markets', tier: 1,
    url: 'https://economictimes.indiatimes.com/markets/rss.cms',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.60,
  },
  {
    label: 'ET Stocks', tier: 1,
    url: 'https://economictimes.indiatimes.com/markets/stocks/rss.cms',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.60,
  },
  {
    label: 'Business Standard Markets', tier: 1,
    url: 'https://www.business-standard.com/rss/markets-106.rss',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.55,
  },
  {
    label: 'Moneycontrol Top News', tier: 2,
    url: 'https://www.moneycontrol.com/rss/MCtopnews.xml',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.65,
  },
  {
    label: 'Mint Markets', tier: 2,
    url: 'https://www.livemint.com/rss/markets',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.55,
  },
  {
    label: 'Financial Express Markets', tier: 2,
    url: 'https://www.financialexpress.com/market/feed/',
    signal_type: 'market_direction', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.55,
  },

  // ── Institutional Flow — FII/DII, block deals, analyst calls ─────────────
  {
    label: 'ET FII DII', tier: 2,
    url: 'https://economictimes.indiatimes.com/markets/stocks/fii-dii/rss.cms',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 9, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.40,
  },
  {
    label: 'BS FII Data', tier: 2,
    url: 'https://www.business-standard.com/rss/finance-109.rss',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.35,
  },
  {
    label: 'MC FII Activity', tier: 2,
    url: 'https://www.moneycontrol.com/rss/fiis.xml',
    signal_type: 'institutional_flow', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.35,
  },

  // ── Derivatives ───────────────────────────────────────────────────────────
  {
    label: 'ET Derivatives', tier: 3,
    url: 'https://economictimes.indiatimes.com/markets/derivatives/rss.cms',
    signal_type: 'derivatives', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 12, baseline_rate: 0.45,
  },
  {
    label: 'MC F&O', tier: 3,
    url: 'https://www.moneycontrol.com/rss/fo.xml',
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
  // ── Earnings / Results ───────────────────────────────────────────────────
  {
    label: 'ET Earnings', tier: 2,
    url: 'https://economictimes.indiatimes.com/markets/earnings/rss.cms',
    signal_type: 'media', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.70,
  },
  {
    label: 'MC Results', tier: 2,
    url: 'https://www.moneycontrol.com/rss/results.xml',
    signal_type: 'media', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.70,
  },
  {
    label: 'BS Results', tier: 2,
    url: 'https://www.business-standard.com/rss/results-announcements-110.rss',
    signal_type: 'media', sentiment_bias: 'neutral',
    reliability_score: 8, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.65,
  },

  // ── Macro / Economy ──────────────────────────────────────────────────────
  {
    label: 'ET Economy', tier: 3,
    url: 'https://economictimes.indiatimes.com/news/economy/rss.cms',
    signal_type: 'macro', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.40,
  },
  {
    label: 'MC Economy', tier: 3,
    url: 'https://www.moneycontrol.com/rss/economy.xml',
    signal_type: 'macro', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 48, baseline_rate: 0.40,
  },

  // ── Negative Events ──────────────────────────────────────────────────────
  {
    label: 'ET Expert Views', tier: 2,
    url: 'https://economictimes.indiatimes.com/markets/expert-views/rss.cms',
    signal_type: 'negative_events', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.50,
  },
  {
    label: 'BS Companies', tier: 2,
    url: 'https://www.business-standard.com/rss/companies-101.rss',
    signal_type: 'negative_events', sentiment_bias: 'neutral',
    reliability_score: 7, dynamic_weight: 1.0, max_age_hours: 24, baseline_rate: 0.45,
  },
];

// ── Fetch RSS feed ────────────────────────────────────────────────────────────
async function fetchNewsItems(source, maxItems = 6) {
  const url = source.url;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0' },
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

      const title  = clean(titleRaw);
      const desc   = clean(descRaw);
      // For direct RSS feeds desc often repeats title; prefer whichever is longer and distinct
      const text   = desc.length > title.length + 20 ? `${title}. ${desc}` : title;
      const outlet = clean(outletRaw) || source.label;

      // Cap text at 260 chars — direct RSS articles are longer than Google News snippets
      const trimmed = text.length > 260 ? text.slice(0, 257) + '…' : text;
      if (trimmed.length > 40) items.push({
        source:         source.label,
        tier:           source.tier,
        signal_type:    source.signal_type,
        sentiment_bias: source.sentiment_bias,
        reliability:    source.reliability_score,
        outlet,
        text:           trimmed,
        daysAgo:        Math.round((Date.now() - ts) / 86400000),
        hoursAgo:       Math.round((Date.now() - ts) / 3600000),
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
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
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
      return { result, provider: `Gemini (${process.env.GEMINI_MODEL || 'gemini-2.0-flash'})` };
    }
    throw err;
  }
}

// ── Deterministic scoring layer ───────────────────────────────────────────────
// All multipliers bounded. No single factor can dominate the final score.

// Bounded 0.80–1.20. Tight range prevents signal_type from overwhelming
// reliability, novelty, and baseline contributions.
const SIGNAL_TYPE_WEIGHTS = {
  smart_money:        1.20,
  institutional_flow: 1.15,
  market_direction:   1.10,
  negative_events:    1.10,
  derivatives:        1.05,
  macro:              0.00, // excluded from per-stock scoring; global modifier only
  media:              0.80,
};

// ── Reliability blending hook ─────────────────────────────────────────────────
// Blends prior reliability_score with observed win_rate from outcome calibration.
// Prior floor of 20% is always retained — observed data can capture at most 80%
// weight even at very high sample sizes, preventing overfitting to recent regimes.
// Observed weight grows linearly: 5% at n=5 samples, 50% at n=50, 80% at n=100+.
// resolveCalibration() picks the most specific segment available; if no segment
// qualifies (too few samples or missing), outcomeRate stays null → pure prior.
function blendedReliability(priorScore, outcomeRate = null, sampleSize = 0) {
  const prior = priorScore / 10; // normalise 0–10 → 0–1
  if (outcomeRate === null || sampleSize < 5) return prior;
  const PRIOR_FLOOR    = 0.20;                           // always retain at least 20% prior
  const observedWeight = Math.min(1 - PRIOR_FLOOR, sampleSize / 100); // max 0.80 at n≥100
  return prior * (1 - observedWeight) + outcomeRate * observedWeight;
}

// ── Continuous exponential recency decay — defined by half-life per type ──────
// f(h) = max(FLOOR, 0.5 ^ (h / half_life))
// Smooth and tunable: at h=0 → 1.0, at h=half_life → 0.5, at h=2×half_life → 0.25.
// max_age_hours in SOURCES provides the hard cutoff; decay provides the gradient.
// Fast signals (derivatives=4h) lose ~90% weight by 12h; smart_money (36h) retains
// 65% at 24h. Decay floor of 0.05 prevents complete exclusion before max_age_hours.
const RECENCY_HALF_LIFE = {
  derivatives:        4,   // loses half weight every 4 hours
  market_direction:   6,
  institutional_flow: 18,
  negative_events:    18,
  media:              12,
  smart_money:        36,  // retains half weight for 36 hours
  macro:              Infinity, // macro is always current context
};

function recencyDecay(signalType, hoursAgo) {
  const halfLife = RECENCY_HALF_LIFE[signalType] ?? 16;
  if (!isFinite(halfLife)) return 1.0;
  return Math.max(0.05, Math.pow(0.5, Math.max(hoursAgo ?? 0, 0) / halfLife));
}

// ── Score constants ───────────────────────────────────────────────────────────
const PER_ARTICLE_CAP  = 2.5;  // per-article contribution cap before aggregation
const FINAL_SCORE_CAP  = 8.0;  // post-aggregation cap — guards unforeseen interactions
const SCORE_FLOOR      = 0.50; // picks below this are dropped, not ranked
// Events strong enough that a single mention counts as primary evidence
const HIGH_STRENGTH_EVENTS = new Set([
  'earnings_beat','earnings_miss','block_deal','sebi_action',
]);

// Baseline normalization — floored at 0.15 and output capped at 2.5×.
// Floor prevents rare signals from exploding into unbounded values.
function baselineNorm(baselineRate) {
  const floored = Math.max(baselineRate ?? 0.5, 0.15);
  return Math.min(1 / floored, 2.5);
}

// ── Outlet families — hidden duplication guard ────────────────────────────────
// Articles from the same media group are treated as one source family so that
// ET Markets + ET Now + Economic Times don't count as three independent voices.
const OUTLET_FAMILIES = {
  economic_times:      ['Economic Times', 'ET Markets', 'ET Now', 'ETAuto', 'ETtech'],
  ndtv:                ['NDTV', 'NDTV Profit', 'NDTV Business'],
  business_standard:   ['Business Standard', 'BS Markets'],
  mint:                ['Mint', 'Livemint', 'HT Media'],
  moneycontrol:        ['Moneycontrol', 'Money Control', 'MC Pro'],
  reuters:             ['Reuters', 'Reuters India'],
  bloomberg:           ['Bloomberg', 'Bloomberg Quint', 'BQ Prime'],
  cnbc:                ['CNBC TV18', 'CNBCTV18', 'CNBC'],
};

const OUTLET_TO_FAMILY = {};
for (const [family, outlets] of Object.entries(OUTLET_FAMILIES)) {
  for (const o of outlets) OUTLET_TO_FAMILY[o.toLowerCase()] = family;
}

function outletFamily(article) {
  const o = (article.outlet || article.source || '').toLowerCase();
  for (const [key, family] of Object.entries(OUTLET_TO_FAMILY)) {
    if (o.includes(key.replace(/_/g, ' '))) return family;
  }
  return o;
}

// ── Novelty scoring — time-aware, per signal_type ─────────────────────────────
// Novelty windows differ by signal_type so a derivatives cluster resets every 6h
// while a smart_money cluster spans 48h. Articles from the same outlet family
// within a cluster receive an additional 0.5× same-family penalty.
const NOVELTY_WINDOW_BY_TYPE = {
  derivatives:        6,
  market_direction:   8,
  smart_money:        48,
  institutional_flow: 24,
  negative_events:    24,
  media:              24,
  macro:              48,
};

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
  // Sort by hoursAgo ascending (newest first) so fast-signal novelty resets
  // work correctly: articles beyond the type's window start a fresh cluster
  // with full novelty weight rather than being grafted onto a stale one.
  const order   = articles.map((_, i) => i).sort((a, b) => (articles[a].hoursAgo ?? 0) - (articles[b].hoursAgo ?? 0));
  const weights  = new Array(articles.length).fill(1.0);
  const tgs      = articles.map(a => trigrams(a.text));
  const NOVELTY_DECAY = [1.0, 0.6, 0.3, 0.15];
  const assigned = new Set();

  for (const i of order) {
    if (assigned.has(i)) continue;
    const windowHours = NOVELTY_WINDOW_BY_TYPE[articles[i].signal_type] ?? 24;
    const seedHours   = articles[i].hoursAgo ?? 0;
    const cluster     = [i];

    for (const j of order) {
      if (j === i || assigned.has(j)) continue;
      const sameType     = articles[j].signal_type === articles[i].signal_type;
      // Use absolute offset from seed — articles outside the window start fresh
      const withinWindow = Math.abs((articles[j].hoursAgo ?? 0) - seedHours) <= windowHours;
      const similar      = jaccard(tgs[i], tgs[j]) > 0.45;
      if (sameType && withinWindow && similar) cluster.push(j);
    }

    const seedFamily = outletFamily(articles[cluster[0]]);
    cluster.forEach((idx, rank) => {
      const baseNovelty = NOVELTY_DECAY[Math.min(rank, NOVELTY_DECAY.length - 1)];
      const sameFamily  = rank > 0 && outletFamily(articles[idx]) === seedFamily;
      weights[idx]      = baseNovelty * (sameFamily ? 0.5 : 1.0);
      assigned.add(idx);
    });
  }
  return weights;
}

// ── Symbol normalisation — confidence-based with drop threshold ───────────────
// Exact alias hits = 1.0. LIQUID_NSE member = 1.0. Unknown ≥5 chars = 0.75.
// Short unknown tokens = 0.50. Anything below CONFIDENCE_DROP_THRESHOLD is
// dropped before scoring, not penalised — uncertain mappings corrupt aggregation.
const CONFIDENCE_DROP_THRESHOLD = 0.60;

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

// ── Event strength — versioned, regime-aware, bounded ────────────────────────
const EVENT_STRENGTH_VERSION = '1.1';
// Base strengths bounded 1.0–2.5. Output additionally bounded to 0.8–2.5.
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
const BULLISH_EVENTS = new Set(['earnings_beat','analyst_upgrade','price_target_raise','breakout_52wk','fii_buying','block_deal']);
const BEARISH_EVENTS = new Set(['earnings_miss','analyst_downgrade','price_target_cut','fii_selling','sebi_action']);

function eventStrengthMultiplier(eventType, regime) {
  const base = EVENT_STRENGTH_BASE[eventType] ?? 1.0;
  let adjusted = base;
  if ((regime === 'strong_bear' || regime === 'bear') && BULLISH_EVENTS.has(eventType)) adjusted = base * 0.6;
  if (regime === 'strong_bull' && BEARISH_EVENTS.has(eventType)) adjusted = base * 0.7;
  return Math.max(0.8, Math.min(adjusted, 2.5));
}

// ── Market regime engine ──────────────────────────────────────────────────────
function deriveRegime(macroRisk, giftBias, vixState) {
  const riskHigh   = macroRisk === 'high';
  const gapDown    = giftBias  === 'gap-down';
  const gapUp      = giftBias  === 'gap-up';
  const vixSpiking = vixState  === 'spiking';
  const vixLow     = vixState  === 'low';
  if (riskHigh && gapDown)                 return 'strong_bear';
  if (riskHigh || (gapDown && vixSpiking)) return 'bear';
  if (!riskHigh && gapUp && vixLow)        return 'strong_bull';
  if (!riskHigh && (gapUp || vixLow))      return 'bull';
  return 'neutral';
}

function applyRegimeCap(score, directionalBias, regime) {
  if (directionalBias === 'long') {
    if (regime === 'strong_bear') return score * 0.25;
    if (regime === 'bear')        return score * 0.50;
    if (regime === 'neutral')     return score * 0.90;
    if (regime === 'bull')        return score * 1.05;
    if (regime === 'strong_bull') return score * 1.15;
  }
  if (directionalBias === 'short') {
    if (regime === 'strong_bear') return score * 1.35;
    if (regime === 'bear')        return score * 1.15;
    if (regime === 'strong_bull') return score * 0.50;
    if (regime === 'bull')        return score * 0.75;
  }
  return score;
}

// ── Directional bias — strict precedence: event_type → sentiment → neutral ────
// direction_conflict logged for audit and future learning when layers disagree.
function deriveDirectionalBias(sentiment, eventType) {
  const eventDir = BEARISH_EVENTS.has(eventType) ? 'short'
                 : BULLISH_EVENTS.has(eventType)  ? 'long'
                 : null;
  const sentDir  = sentiment === 'bearish' ? 'short'
                 : sentiment === 'bullish'  ? 'long'
                 : 'neutral';
  if (eventDir) {
    const conflict = sentDir !== 'neutral' && eventDir !== sentDir;
    return { bias: eventDir, mismatch: conflict, direction_conflict: conflict };
  }
  return { bias: sentDir, mismatch: false, direction_conflict: false };
}

// ── Consensus — (outlet-family, signal_type) deduplicated, log-capped ─────────
function consensusMultiplier(mentions) {
  const dedupKey  = m => `${outletFamily(m)}::${m.signal_type}`;
  const deduped   = [...new Map(mentions.map(m => [dedupKey(m), m])).values()];
  const distSrc   = new Set(deduped.map(m => m.source)).size;
  const distTypes = new Set(deduped.map(m => m.signal_type)).size;

  const sourceBase = distSrc <= 1 ? 1.0
                   : distSrc === 2 ? 1.5
                   : distSrc === 3 ? 2.2
                   : Math.min(3.5, 2.2 + Math.log(distSrc - 2) * 0.5);

  const typeDiversityBonus = Math.min(1.4, 1.0 + (distTypes - 1) * 0.25);

  // Cross-type bonus: only the single highest qualifying combo is applied —
  // no stacking, so multiple co-occurring combos don't compound unboundedly.
  const types = [...new Set(deduped.map(m => m.signal_type))];
  const crossBonus = types.includes('smart_money')        && types.includes('derivatives')        ? 1.40
                   : types.includes('institutional_flow') && types.includes('derivatives')        ? 1.25
                   : types.includes('smart_money')        && types.includes('institutional_flow') ? 1.15
                   : 1.0;

  const familyCounts = {};
  for (const m of deduped) { const f = outletFamily(m); familyCounts[f] = (familyCounts[f] || 0) + 1; }
  const maxShare         = Math.max(...Object.values(familyCounts)) / deduped.length;
  const diversityQuality = maxShare > 0.6 ? 0.70 : maxShare > 0.4 ? 0.85 : 1.0;

  return Math.min(4.0, sourceBase * typeDiversityBonus * crossBonus * diversityQuality);
}

// ── LLM — extraction only ─────────────────────────────────────────────────────
async function extractWithLLM(articles) {
  const key = process.env.GROQ_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('No LLM API key set (GROQ_API_KEY or GOOGLE_API_KEY)');

  const today     = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dayOfWeek = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  // Cap at 60 articles to stay comfortably within Groq's 6k-token context window.
  // Newest articles (lowest hoursAgo) are prioritised; excess tail is trimmed.
  const sorted  = [...articles].sort((a, b) => (a.hoursAgo ?? 0) - (b.hoursAgo ?? 0));
  const capped  = sorted.slice(0, 60);

  const block = capped.map(a =>
    `[${a.signal_type}·R${a.reliability}·${a.hoursAgo}h·${a.source}]: ${a.text}`
  ).join('\n');

  const prompt = `You are an intelligence extraction engine for an Indian equity trading system. Today is ${today} (${dayOfWeek}).

Your ONLY job is to READ the news feed and EXTRACT structured data. Do NOT score, rank, or decide which stocks to buy or sell. A separate deterministic engine handles scoring. Extract accurately — do not hallucinate stocks not present in the feed.

INTELLIGENCE FEED (${capped.length} signals):
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
function scoreAndRank(extractions, articles, marketContext, calibrationMap = new Map()) {
  const macroRisk = marketContext.macro_risk      || 'low';
  const giftBias  = marketContext.gift_nifty_bias || 'unknown';
  const vixState  = marketContext.vix_state       || 'unknown';
  const regime    = deriveRegime(macroRisk, giftBias, vixState);
  const dow       = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  // Context buckets — shared across all articles in this cycle
  const vixBkt  = vixBucket(vixState);
  const timeBkt = timeBucket();

  const noveltyWeights = assignNoveltyWeights(articles);

  // Strict universe filter: drop extractions below confidence threshold
  let droppedLowConf = 0;
  const candidates = extractions
    .map(ext => ({ ...ext, ...normaliseSymbol(ext.symbol) }))
    .filter(ext => {
      if (ext.confidence >= CONFIDENCE_DROP_THRESHOLD) return true;
      droppedLowConf++;
      return false;
    });

  const scored = candidates.map(ext => {
    const { bias: directionalBias, mismatch, direction_conflict } = deriveDirectionalBias(ext.sentiment, ext.event_type);
    const co = (ext.company || '').toLowerCase();

    // Match articles to this stock (macro excluded — never per-stock)
    const matchedIdxs = [];
    articles.forEach((a, idx) => {
      if (a.signal_type === 'macro') return;
      const t = a.text.toLowerCase();
      if (t.includes(ext.symbol.toLowerCase()) || (co.length > 4 && t.includes(co.slice(0, Math.min(co.length, 12))))) {
        matchedIdxs.push(idx);
      }
    });
    const mentions = matchedIdxs.map(i => articles[i]);

    // Per-article contributions — each capped at PER_ARTICLE_CAP before aggregation
    const articleFactors = [];
    let totalScore = 0;
    matchedIdxs.forEach(articleIdx => {
      const m            = articles[articleIdx];
      const typeWeight   = SIGNAL_TYPE_WEIGHTS[m.signal_type] ?? 1.0;
      // Hierarchical segment resolution: full context → partial → prior fallback
      const calSeg = resolveCalibration(
        calibrationMap, m.source, m.signal_type,
        ext.event_type, regime, vixBkt, timeBkt,
      );
      const reliability  = blendedReliability(
        m.reliability ?? 5,
        calSeg?.win_rate   ?? null,
        calSeg?.sample_size ?? 0,
      );
      const decay        = recencyDecay(m.signal_type, m.hoursAgo ?? 24);
      const novelty      = noveltyWeights[articleIdx];
      const baseline     = baselineNorm(m.baseline_rate);
      const sentimentAlign = m.sentiment_bias === 'bearish'
        ? (directionalBias === 'short' ?  1.0 : -0.5)
        : m.sentiment_bias === 'bullish'
        ? (directionalBias === 'long'  ?  1.0 : -0.3)
        : 0.7;

      const raw    = typeWeight * reliability * decay * novelty * baseline * sentimentAlign;
      const capped = Math.min(Math.abs(raw), PER_ARTICLE_CAP) * Math.sign(raw || 1);
      totalScore  += capped;

      articleFactors.push({
        source: m.source, signal_type: m.signal_type,
        typeWeight, reliability: +reliability.toFixed(3),
        decay: +decay.toFixed(3), novelty: +novelty.toFixed(3),
        baseline: +baseline.toFixed(3), sentimentAlign,
        contribution: +capped.toFixed(3),
      });
    });

    // Small mismatch penalty when event_type contradicts sentiment label
    const mismatchPenalty = mismatch ? 0.90 : 1.0;

    const eventMult = eventStrengthMultiplier(ext.event_type || 'general_mention', regime);
    const consensus = mentions.length ? consensusMultiplier(mentions) : 1.0;

    // Sector modifier — strictly bounded ±20%
    const sector    = (ext.sector || '').toLowerCase();
    const boosted   = (marketContext.boost_sectors    || []).some(s => sector.includes(s.toLowerCase()));
    const penalised = (marketContext.penalise_sectors || []).some(s => sector.includes(s.toLowerCase()));
    const sectorMod = boosted ? 1.20 : penalised ? 0.80 : 1.0;

    // Timing modifier — subtle ±6% only
    const timingMod = dow === 'Monday' && directionalBias === 'long' ? 1.06
                    : dow === 'Friday' && directionalBias === 'long' ? 0.94
                    : 1.0;

    let score = totalScore * mismatchPenalty * eventMult * consensus * ext.confidence * sectorMod * timingMod;
    score = applyRegimeCap(score, directionalBias, regime);
    // Post-aggregation cap: guards against unforeseen multiplier interactions
    score = Math.min(Math.abs(score), FINAL_SCORE_CAP) * Math.sign(score || 1);

    return {
      ...ext,
      directional_bias:  directionalBias,
      regime,
      score:             +score.toFixed(3),
      mention_count:     mentions.length,
      signal_types:      [...new Set(mentions.map(m => m.signal_type))],
      distinct_sources:  new Set(mentions.map(m => m.source)).size,
      score_factors: {
        event_type:             ext.event_type || 'general_mention',
        event_strength:         +eventMult.toFixed(3),
        consensus:              +consensus.toFixed(3),
        sym_confidence:         ext.confidence,
        mismatch_penalty:       mismatchPenalty,
        sector_mod:             sectorMod,   // applied once, not compounded
        timing_mod:             timingMod,
        direction_conflict,
        regime,
        regime_cap_applied:     regime !== 'neutral',
        event_strength_version: EVENT_STRENGTH_VERSION,
        article_contributions:  articleFactors,
      },
    };
  });

  // Deduplicate by canonical symbol (keep highest |score|), sort, top 10
  const bySymbol = new Map();
  for (const p of scored) {
    const existing = bySymbol.get(p.symbol);
    if (!existing || Math.abs(p.score) > Math.abs(existing.score)) bySymbol.set(p.symbol, p);
  }

  // Evidence gate: require ≥2 distinct outlet families OR high-strength event + ≥1 secondary
  function passesEvidenceGate(p) {
    const families = new Set(p.score_factors.article_contributions.map(a => outletFamily(a.source)));
    if (families.size >= 2) return true;
    if (HIGH_STRENGTH_EVENTS.has(p.score_factors.event_type) && p.mention_count >= 2) return true;
    return false;
  }

  const deduped = [...bySymbol.values()];
  let evidenceGateDropped = 0, scoreFloorDropped = 0;
  const afterEvidenceGate = deduped.filter(p => { if (passesEvidenceGate(p)) return true; evidenceGateDropped++; return false; });
  const afterScoreFloor   = afterEvidenceGate.filter(p => { if (Math.abs(p.score) >= SCORE_FLOOR) return true; scoreFloorDropped++; return false; });

  const ranked = afterScoreFloor
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 10);

  // Attach monitoring counters to ranked list for orchestrator to consume
  ranked._monitor = {
    droppedLowConf, evidenceGateDropped, scoreFloorDropped,
    totalExtractions: extractions.length,
    emittedPicks: ranked.length,
  };

  return ranked
    .slice(0, 10)
    .map((p, i) => ({
      rank:               i + 1,
      symbol:             p.symbol,
      exchange:           p.exchange || 'NSE',
      company:            p.company,
      sector:             p.sector,
      sentiment:          p.sentiment,
      directional_bias:   p.directional_bias,
      event_type:         p.event_type || 'general_mention',
      regime,
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
      score_factors:      p.score_factors,
      context_only:       true,
    }));
}

// ── Orchestrator ───────────────────────────────────────────────────────────────
async function analyzeWithGroq(articles) {
  const { result: extracted, provider } = await extractWithLLM(articles);

  const extractions   = extracted.extractions   || [];
  const marketContext = extracted.market_context || {};

  // Data quality guard: if too many symbols dropped or event_types missing, return null → caller falls back to cache
  if (extractions.length > 0) {
    const normalized    = extractions.map(e => normaliseSymbol(e.symbol));
    const dropRate      = normalized.filter(n => n.confidence < CONFIDENCE_DROP_THRESHOLD).length / extractions.length;
    const missingEvents = extractions.filter(e => !e.event_type || e.event_type === 'general_mention').length / extractions.length;
    if (dropRate > 0.70 || missingEvents > 0.85) return null;
  }

  // Fetch outcome-based calibration (non-blocking: empty Map on failure = no-op)
  const calibrationMap = await fetchCalibration().catch(() => new Map());

  // Derive context buckets here so monitor can report them
  const vixBkt  = vixBucket(marketContext.vix_state || '');
  const timeBkt = timeBucket();

  const picks         = scoreAndRank(extractions, articles, marketContext, calibrationMap);
  const monitorRaw    = picks._monitor ?? {};
  delete picks._monitor;
  const regime        = picks[0]?.regime || deriveRegime(
    marketContext.macro_risk || 'low',
    marketContext.gift_nifty_bias || 'unknown',
    marketContext.vix_state || 'unknown',
  );

  const monitor = buildMonitor({
    totalExtractions:    monitorRaw.totalExtractions    ?? extractions.length,
    dropped:             monitorRaw.droppedLowConf      ?? 0,
    evidenceGateDropped: monitorRaw.evidenceGateDropped ?? 0,
    scoreFloorDropped:   monitorRaw.scoreFloorDropped   ?? 0,
    emittedPicks:        picks.length,
    articles,
    calibrationMap,
    vixBkt,
    timeBkt,
  });

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
    algo_note:        `v${EVENT_STRENGTH_VERSION} | (typeWeight[0.8–1.2] × blendedReliability[calibrated] × recencyDecay[type-aware] × novelty[window+outlet] × baselineNorm[floored,capped]) × eventStrength[regime-aware,bounded] × consensus[dedup,log-cap,≤4.0] × symConfidence × sectorMod[±20%] × timing[±6%] → regimeCap → FINAL_SCORE_CAP. LLM extracts only.`,
    _monitor:         monitor,
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
  const results  = await Promise.allSettled(SOURCES.map(s => fetchNewsItems(s, 6)));
  const articles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  if (articles.length === 0) throw new Error('No articles fetched from any RSS source');

  const analysis = await analyzeWithGroq(articles);
  // Data quality guard returned null — serve stale cache rather than empty picks
  if (analysis === null) {
    const stale = readCache();
    if (stale) return { ...stale, cached: true, stale_note: 'Low-quality extraction cycle; serving last good cache.' };
    throw new Error('Data quality guard triggered and no cache available');
  }

  const signalTypes = ['smart_money','institutional_flow','derivatives','market_direction','macro','media','negative_events'];
  const result = {
    ...analysis,
    article_count:       articles.length,
    sources_fetched:     [...new Set(articles.map(a => a.source))],
    feeds_attempted:     SOURCES.length,
    signal_breakdown:    Object.fromEntries(
      signalTypes.map(t => [t, articles.filter(a => a.signal_type === t).length])
    ),
    monitor:      analysis._monitor,
    powered_by:   analysis._provider || 'Groq (llama-3.3-70b)',
    generated_at: new Date().toISOString(),
  };
  delete result._provider;
  delete result._monitor;
  writeCache(result);

  // Non-blocking: persist picks for outcome tracking, then check elapsed windows
  persistPicks(result.picks).catch(() => {});
  recordOutcomes(async symbols => {
    // LTP lookup via Kite NSE quotes — best-effort, no enctoken available here
    // intel.js ?action=record_outcome can pass enctoken-backed prices
    return {};
  }).catch(() => {});
  refreshSourceStats().catch(() => {});

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
