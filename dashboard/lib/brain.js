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
  macro:              0.9,  // applied as global modifier, not per-stock boost
  media:              0.8,
};

// Macro signal_type articles are not stock-specific — they set a global sector modifier.
// All other signal_types contribute to per-stock conviction scores.
const MACRO_BOOST_SECTORS    = ['Energy', 'Metals', 'IT', 'Pharma', 'Banking', 'Auto'];
const MACRO_PENALISE_SECTORS = ['Aviation', 'NBFC', 'Paint', 'Realty'];

function recencyDecay(hoursAgo) {
  if (hoursAgo <  6) return 1.00;
  if (hoursAgo < 12) return 0.90;
  if (hoursAgo < 24) return 0.75;
  if (hoursAgo < 48) return 0.55;
  if (hoursAgo < 72) return 0.40;
  return 0.25;
}

function consensusMultiplier(mentions) {
  const n = mentions.length;
  const base = n === 1 ? 1.0 : n === 2 ? 1.8 : n === 3 ? 3.0 : 5.0;
  const types = [...new Set(mentions.map(m => m.signal_type))];
  // Cross-type bonus: smart_money + derivatives on same stock
  const crossBonus = types.includes('smart_money') && types.includes('derivatives') ? 1.5 : 1.0;
  return base * crossBonus;
}

// Build a map of { SYMBOL → [article, ...] } from all articles that name a stock.
// The LLM tells us which symbols appear — this map is pre-built for the scorer.
function buildSymbolMentions(articles) {
  // Returns the raw articles array; scorer joins against LLM extractions by symbol.
  // We keep the full article objects so scorer has signal_type, reliability, hoursAgo.
  return articles;
}

// Score a single extracted stock against all articles that mention it.
function scoreExtraction(symbol, sentiment, mentions, macroContext) {
  if (!mentions.length) return 0;

  let totalScore = 0;
  for (const m of mentions) {
    const typeWeight    = SIGNAL_TYPE_WEIGHTS[m.signal_type] ?? 1.0;
    const reliability   = (m.reliability ?? 5) / 10;
    const decay         = recencyDecay(m.hoursAgo ?? 24);
    // Sentiment alignment: bearish article on a bearish extraction scores positively
    const sentimentSign = m.sentiment_bias === 'bearish'
      ? (sentiment === 'bearish' ? 1 : -0.5)
      : m.sentiment_bias === 'bullish'
      ? (sentiment === 'bullish' ? 1 : -0.3)
      : 0.7; // neutral articles always contribute positively, but at reduced weight
    totalScore += typeWeight * reliability * decay * sentimentSign;
  }

  const consensus = consensusMultiplier(mentions);
  let score = totalScore * consensus;

  // Apply macro sector modifier if LLM extracted a sector for this stock
  // macroContext.boost / penalise are sector keyword arrays
  return +score.toFixed(3);
}

// ── LLM — extraction only ────────────────────────────────────────────────────
async function extractWithLLM(articles) {
  const key = process.env.GROQ_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('No LLM API key set (GROQ_API_KEY or GOOGLE_API_KEY)');

  const today      = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dayOfWeek  = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  const block = articles.map(a =>
    `[${a.signal_type}·R${a.reliability}·${a.hoursAgo}h·${a.sentiment_bias}·${a.source}]: ${a.text}`
  ).join('\n');

  const prompt = `You are an intelligence extraction engine for an Indian equity trading system. Today is ${today} (${dayOfWeek}).

Your ONLY job is to READ the news feed below and EXTRACT structured data. Do NOT score, rank, or decide picks — that is handled by a separate deterministic engine. Extract accurately; do not hallucinate stocks not present in the feed.

INTELLIGENCE FEED (${articles.length} signals):
${block}

Extract and return ONLY valid JSON:

{
  "extractions": [
    {
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "company": "Reliance Industries Ltd",
      "sector": "Energy",
      "sentiment": "bullish",
      "reason": "One crisp sentence: what the signal says about this stock",
      "detailed_reasoning": "2-3 sentences covering what was reported, by whom, and why it matters for today",
      "key_risk": "One sentence: what could invalidate this signal today",
      "mentioned_by": ["FII DII Net Flow", "Goldman India"],
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
- Extract EVERY stock mentioned with a specific buy/sell/short/downgrade/upgrade/earnings signal
- sentiment per stock: "bullish" | "bearish" | "neutral"
- gift_nifty_bias: "gap-up" | "gap-down" | "flat" | "unknown"
- vix_state: "low" | "elevated" | "spiking" | "unknown"
- macro_risk: "low" | "medium" | "high"
- Only NSE/BSE listed Indian stocks
- If a stock is mentioned negatively (downgrade, miss, fraud) → sentiment: "bearish"
- Do not invent stocks not present in the feed
- ${dayOfWeek === 'Monday' ? 'Note: Monday — flag any weekend gap-up catalysts.' : ''}
- ${dayOfWeek === 'Thursday' ? 'Note: Expiry day — flag any max pain or options pinning signals.' : ''}
- ${dayOfWeek === 'Friday' ? 'Note: Friday — flag any position-squaring or weekend-risk signals.' : ''}`;

  const { result, provider } = await callLLM(prompt);
  return { result, provider };
}

// ── Deterministic scorer — runs after LLM extraction ─────────────────────────
function scoreAndRank(extractions, articles, marketContext) {
  // Index articles by every word 3+ chars — used for fuzzy symbol matching
  // Simple approach: check if article text or source references the symbol/company
  const scored = extractions.map(ext => {
    const sym = (ext.symbol || '').toUpperCase();
    const co  = (ext.company || '').toLowerCase();

    // Find articles that are likely about this stock
    const mentions = articles.filter(a => {
      const t = a.text.toLowerCase();
      return t.includes(sym.toLowerCase()) || (co.length > 4 && t.includes(co.slice(0, Math.min(co.length, 12))));
    });

    const score = scoreExtraction(sym, ext.sentiment, mentions, marketContext);

    // Macro sector modifier: boost/penalise based on LLM's market_context
    const sector = (ext.sector || '').toLowerCase();
    const boostMatch    = (marketContext.boost_sectors    || []).some(s => sector.includes(s.toLowerCase()));
    const penaliseMatch = (marketContext.penalise_sectors || []).some(s => sector.includes(s.toLowerCase()));
    const macroMod = boostMatch ? 1.2 : penaliseMatch ? 0.7 : 1.0;

    // Day-of-week timing modifier
    const dow = new Date().toLocaleDateString('en-IN', { weekday: 'long' });
    const timingMod = dow === 'Monday' && ext.sentiment === 'bullish' ? 1.1
                    : dow === 'Friday' && ext.sentiment === 'bullish' ? 0.85
                    : 1.0;

    const finalScore = +(score * macroMod * timingMod).toFixed(3);

    return {
      ...ext,
      score:         finalScore,
      mention_count: mentions.length,
      signal_types:  [...new Set(mentions.map(m => m.signal_type))],
    };
  });

  // Sort by score desc, deduplicate by symbol (keep highest score), take top 10
  const seen = new Set();
  const ranked = scored
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .filter(p => { if (seen.has(p.symbol)) return false; seen.add(p.symbol); return true; })
    .slice(0, 10)
    .map((p, i) => ({
      rank:               i + 1,
      symbol:             p.symbol,
      exchange:           p.exchange || 'NSE',
      company:            p.company,
      sector:             p.sector,
      sentiment:          p.sentiment,
      confidence:         Math.min(5, Math.max(1, Math.round(Math.abs(p.score) * 2))),
      score:              p.score,
      reason:             p.reason,
      detailed_reasoning: p.detailed_reasoning,
      key_risk:           p.key_risk,
      mentioned_by:       p.mentioned_by || [],
      signal_types:       p.signal_types,
      mention_count:      p.mention_count,
      intraday_note:      p.intraday_note || '',
    }));

  return ranked;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
async function analyzeWithGroq(articles) {
  const { result: extracted, provider } = await extractWithLLM(articles);

  const extractions   = extracted.extractions   || [];
  const marketContext = extracted.market_context || {};

  const picks = scoreAndRank(extractions, articles, marketContext);

  return {
    picks,
    market_sentiment: marketContext.market_sentiment || 'neutral',
    macro_risk:       marketContext.macro_risk       || 'medium',
    top_sectors:      marketContext.top_sectors      || [],
    avoid_sectors:    marketContext.avoid_sectors    || [],
    summary:          marketContext.summary          || '',
    algo_note:        `Scored by backend: signal_type × reliability × recency_decay × consensus. LLM used for extraction only.`,
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
