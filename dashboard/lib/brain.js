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

// ── Multi-factor analysis ─────────────────────────────────────────────────────
async function analyzeWithGroq(articles) {
  // kept for compat — now delegates to callLLM
  const key = process.env.GROQ_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('No LLM API key set (GROQ_API_KEY or GOOGLE_API_KEY)');

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const dayOfWeek = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

  const block = articles.map(a =>
    `[${a.signal_type}·R${a.reliability}·${a.hoursAgo}h·${a.sentiment_bias}·${a.source}·${a.outlet}]: ${a.text}`
  ).join('\n\n');

  const prompt = `You are the CIO of a top Indian quant hedge fund. Today is ${today} (${dayOfWeek}). Identify the TOP 10 Indian NSE/BSE stocks with the highest probability of SIGNIFICANT intraday price movement today — long OR short.

You have ${articles.length} intelligence signals tagged with:
  signal_type · reliability (R1–R10) · age in hours · sentiment_bias · source name · outlet

SIGNAL TYPES AND BASE WEIGHTS:
  smart_money       = 1.5× (legend investors with skin in the game)
  institutional_flow= 1.4× (FII/DII/block deals — real money moving)
  derivatives       = 1.2× (OI buildup, PCR — forward-looking)
  market_direction  = 1.3× (GIFT Nifty, VIX — market-wide setup)
  macro             = 0.9× (RBI, global — risk filter, not alpha source)
  media             = 0.8× (analyst reports, news — lagging, lower weight)
  negative_events   = 1.3× (downgrades, misses, fraud — SHORT candidates)

RELIABILITY SCORE: multiply base weight by (R / 10). R10 source = full weight, R5 = half.

═══════════════════════════════════════════════════════════
INTELLIGENCE FEED:
${block}
═══════════════════════════════════════════════════════════

SCORING ALGORITHM — apply all factors:

FACTOR 1 · SIGNAL TYPE WEIGHT × RELIABILITY
  Use table above. A smart_money R9 source = 1.5 × 0.9 = 1.35 multiplier.

FACTOR 2 · SIGNAL STRENGTH (per article)
  BULLISH signals: Explicit buy/accumulate +5 | Target raised +4 | Earnings beat +4
    52wk breakout/volume surge +3 | FII net buying +3 | Unusual call OI +4 | Upgrade +3
  BEARISH signals (negative_events bias): Earnings miss −4 | Downgrade/target cut −4
    SEBI action/fraud −5 | Profit booking / weak guidance −3 | Short buildup OI −3
  Neutral: general mention ±1

FACTOR 3 · RECENCY DECAY (use hoursAgo field)
  <6h=1.0 · 6–12h=0.9 · 12–24h=0.75 · 24–48h=0.55 · 48–72h=0.4 · >72h=0.25

FACTOR 4 · CONSENSUS MULTIPLIER
  1 source=1× · 2 sources=1.8× · 3=3× · 4+=5×
  Cross-type consensus (smart_money + derivatives on same stock) = +1.5× bonus.

FACTOR 5 · DERIVATIVES & MARKET DIRECTION OVERLAY
  market_direction: If GIFT Nifty premium >+0.5% → gap-up day; boost high-beta (banks, autos, metals)
                    If GIFT Nifty discount >−0.5% → gap-down; prefer defensive (pharma, FMCG, IT exporters)
                    If VIX spiking → reduce position size on all picks; favour put-side
  derivatives:      High PCR + unusual call buying + max pain above CMP → +2
                    High put OI buildup / short interest rising → bearish signal −2

FACTOR 6 · MACRO RISK FILTER (macro signal_type)
  Risk-off (DXY up, crude spike, US yields high): penalise rate-sensitive (IT, NBFCs) ×0.7
  Risk-on (global rally, FII inflows): boost export IT, metals, pharma ×1.2
  Crude rising: boost energy/OMC; penalise aviation, paints

FACTOR 7 · INTRADAY TIMING
  ${dayOfWeek === 'Monday' ? 'MONDAY: gap-up plays, weekend catalysts, short covering.' : ''}
  ${dayOfWeek === 'Friday' ? 'FRIDAY: avoid illiquid mid/smallcap; favour large-cap defensive — weekend risk.' : ''}
  ${dayOfWeek === 'Thursday' ? 'THURSDAY EXPIRY: max pain targeting; options OI drives intraday pinning.' : ''}
  confidence≥4 → large/midcap only · confidence≤2 → smallcap acceptable

NEGATIVE EVENTS HANDLING:
  Stocks with negative_events signals should appear as "bearish" picks (short/avoid candidates).
  They are valid picks if the signal is strong and fresh — mark sentiment: "bearish", confidence reflects short conviction.

FINAL SCORE = SignalTypeWeight × Reliability × SignalStrength × RecencyDecay × ConsensusMultiplier × MacroFilter × TimingFit

Return ONLY valid JSON — no markdown, no text outside the JSON object:

{
  "picks": [
    {
      "rank": 1,
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "company": "Reliance Industries Ltd",
      "sector": "Energy / Telecom",
      "sentiment": "bullish",
      "confidence": 5,
      "score": 42.5,
      "reasoning_types": ["Institutional Flow", "Derivatives"],
      "reason": "One crisp sentence with the primary signal",
      "detailed_reasoning": "2-3 sentences: signal source, factor scores, why intraday move is likely",
      "key_risk": "One sentence: what invalidates this pick today",
      "mentioned_by": ["FII DII Net Flow", "Stock OI Buildup"],
      "signal_types": ["institutional_flow", "derivatives"],
      "intraday_note": "Watch breakout above 2950; stop-loss at 2890"
    }
  ],
  "market_sentiment": "bullish",
  "macro_risk": "low",
  "top_sectors": ["Banking", "IT", "Energy"],
  "avoid_sectors": ["Aviation"],
  "summary": "Two sentences: overall market mood + key macro theme driving today's picks",
  "algo_note": "One sentence on which factor dominated today's selection"
}

Rules:
- Return exactly 10 picks sorted by score descending (rank 1=highest score)
- sentiment: "bullish" | "bearish" | "neutral"
- confidence: 1–5 integer · score: float
- macro_risk: "low" | "medium" | "high"
- Bearish picks (negative_events) are valid — they are short/avoid candidates
- Only NSE/BSE listed Indian stocks
- If fewer than 10 are explicitly signalled, infer from sector/macro themes — mark intraday_note: "Thematic — no explicit signal"`;

  const { result, provider } = await callLLM(prompt);
  return { ...result, _provider: provider };
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
