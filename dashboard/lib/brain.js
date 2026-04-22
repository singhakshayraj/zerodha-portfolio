// Market Brain — named exports consumed by api/intel.js

// ── Source registry — grouped by tier for LLM weighting ──────────────────────
// Each entry: { label, q (Google News query), tier, category }
// tier: 1=legend investors, 2=professional analysts, 3=fin-educators,
//       4=options/derivatives, 5=data/official, 6=global macro
const SOURCES = [
  // ── Tier 1 · Legend investors (weight 1.5×) ───────────────────────────────
  { label: 'Vijay Kedia',       q: '"Vijay Kedia" stock portfolio NSE buy', tier: 1, cat: 'Legend Investor' },
  { label: 'Basant Maheshwari', q: '"Basant Maheshwari" equity stock picks NSE', tier: 1, cat: 'Legend Investor' },
  { label: 'Ramesh Damani',     q: '"Ramesh Damani" NSE stock recommendation', tier: 1, cat: 'Legend Investor' },
  { label: 'Porinju Veliyath',  q: '"Porinju" stock multibagger portfolio India', tier: 1, cat: 'Legend Investor' },
  { label: 'Nilesh Shah',       q: '"Nilesh Shah" stock market India', tier: 1, cat: 'Legend Investor' },
  { label: 'Sanjay Bakshi',     q: '"Sanjay Bakshi" value investing India', tier: 1, cat: 'Legend Investor' },
  { label: 'Mohnish Pabrai',    q: '"Pabrai" India stock investment', tier: 1, cat: 'Legend Investor' },
  { label: 'Deepak Shenoy',     q: '"Deepak Shenoy" OR "Capital Mind" stock analysis India', tier: 1, cat: 'Legend Investor' },
  { label: 'Mitesh Engineer',   q: '"Mitesh Engineer" OR "@Mitesh_Engr" stock buy India', tier: 1, cat: 'Legend Investor' },
  { label: 'Raoul Pal',         q: '"Raoul Pal" emerging markets India macro', tier: 1, cat: 'Global Macro' },

  // ── Tier 2 · Professional analysts & educators (weight 1.0×) ─────────────
  { label: 'CA Rachana Ranade', q: '"Rachana Ranade" stock analysis fundamental NSE', tier: 2, cat: 'Analyst' },
  { label: 'Pranjal Kamra',     q: '"Pranjal Kamra" stock pick India Finology', tier: 2, cat: 'Analyst' },
  { label: 'Sharan Hegde',      q: '"Sharan Hegde" personal finance India stock', tier: 2, cat: 'Analyst' },
  { label: 'Ankur Warikoo',     q: '"Ankur Warikoo" invest stock India', tier: 2, cat: 'Educator' },
  { label: 'Varsity Zerodha',   q: '"Zerodha Varsity" stock market education India', tier: 2, cat: 'Educator' },
  { label: 'QuantInsti',        q: '"QuantInsti" algorithmic trading India NSE strategy', tier: 2, cat: 'Quant' },
  { label: 'ValuePickr',        q: 'ValuePickr stock research India fundamental', tier: 2, cat: 'Community' },
  { label: 'El-Erian',          q: '"El-Erian" OR "Mohamed El Erian" emerging markets India', tier: 2, cat: 'Global Macro' },

  // ── Tier 3 · Stock research community (weight 0.8×) ──────────────────────
  { label: 'Investyadnya',      q: '"Investyadnya" stock pick India NSE BSE', tier: 3, cat: 'Research' },
  { label: 'Alpha Ideas',       q: '"Alpha Ideas" OR "AlphaIdeas" stock India NSE', tier: 3, cat: 'Research' },
  { label: 'StockMarketNerd',   q: '"StockMarketNerd" India stock analysis', tier: 3, cat: 'Research' },
  { label: 'InvestingDaddy',    q: '"InvestingDaddy" stock India NSE recommendation', tier: 3, cat: 'Research' },
  { label: 'EquityRush',        q: 'EquityRush India NSE stock momentum', tier: 3, cat: 'Research' },
  { label: 'TradeSmartLive',    q: '"TradeSmartLive" OR "TradeSmart" India stock trade', tier: 3, cat: 'Research' },
  { label: 'FundamentalCap',    q: 'Fundamental Capital India stock NSE analysis', tier: 3, cat: 'Research' },
  { label: 'FI InvestIndia',    q: '"Invest India" FII FDI sector stock news', tier: 3, cat: 'Research' },

  // ── Tier 4 · Options & derivatives (weight 1.1× for intraday) ────────────
  { label: 'Options Signals',   q: 'Nifty BankNifty options OI unusual activity call put today', tier: 4, cat: 'Options' },
  { label: 'BankNifty Flow',    q: 'BankNifty options strategy PCR OI today India', tier: 4, cat: 'Options' },
  { label: 'Derivatives Flow',  q: 'NSE derivatives open interest buildup India stock', tier: 4, cat: 'Options' },
  { label: 'Volatility',        q: 'India VIX volatility options theta strategy NSE', tier: 4, cat: 'Options' },

  // ── Tier 5 · Official & data sources (weight 1.3×) ───────────────────────
  { label: 'NSE Official',      q: 'NSE India official announcement stock circuit today', tier: 5, cat: 'Official' },
  { label: 'BSE Official',      q: 'BSE India official announcement stock result today', tier: 5, cat: 'Official' },
  { label: 'Stats of India',    q: 'India economic data GDP inflation RBI stock market impact', tier: 5, cat: 'Data' },
  { label: 'India Data Hub',    q: 'India sector data FII DII flow stock market', tier: 5, cat: 'Data' },
  { label: 'FII DII Flow',      q: 'FII DII buying selling India stock today NSE BSE', tier: 5, cat: 'Data' },

  // ── Tier 6 · Global macro (weight 0.9× applied as risk filter) ───────────
  { label: 'Goldman Sachs',     q: '"Goldman Sachs" India emerging markets stock outlook', tier: 6, cat: 'Global Macro' },
  { label: 'JPMorgan',          q: '"JPMorgan" India stock market emerging markets', tier: 6, cat: 'Global Macro' },
  { label: 'ZeroHedge',         q: 'ZeroHedge India emerging markets risk macro', tier: 6, cat: 'Global Macro' },
  { label: 'Global Macro Risk', q: 'US Fed dollar DXY crude oil impact India NSE today', tier: 6, cat: 'Global Macro' },
  { label: 'GIFT Nifty Signal', q: 'GIFT Nifty SGX Nifty premium discount gap up gap down NSE opening today', tier: 5, cat: 'Leading Indicator' },

  // ── Momentum & technicals ─────────────────────────────────────────────────
  { label: 'NSE Breakout',      q: 'NSE stock 52-week high breakout momentum rally today', tier: 3, cat: 'Technical' },
  { label: 'Midcap Momentum',   q: 'Indian midcap smallcap stock breakout rally today NSE BSE', tier: 3, cat: 'Technical' },
  { label: 'Results Season',    q: 'India quarterly results earnings beat stock NSE today', tier: 3, cat: 'Fundamental' },
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

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null && items.length < maxItems) {
      const block = m[1];
      const dateStr = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1];
      const ts = dateStr ? new Date(dateStr).getTime() : Date.now();
      if (ts < oneWeekAgo) continue;

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
        source: source.label,
        tier: source.tier,
        cat: source.cat,
        outlet: clean(outletRaw),
        text: trimmed,
        daysAgo: Math.round((Date.now() - ts) / 86400000),
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
    `[T${a.tier}·${a.cat}·${a.daysAgo}d·${a.source}·${a.outlet}]: ${a.text}`
  ).join('\n\n');

  const prompt = `You are the CIO of a top Indian quant hedge fund. Today is ${today} (${dayOfWeek}). Your job is to identify the TOP 10 Indian NSE/BSE stocks with the highest probability of POSITIVE intraday price movement today.

You have ${articles.length} intelligence signals below, tagged with:
- T1=Legend Investors (1.5× weight) · T2=Professional Analysts (1.0×) · T3=Community Research (0.8×)
- T4=Options/Derivatives (1.1× for intraday) · T5=Official/Data (1.3×) · T6=Global Macro (risk filter)
- Days-ago field = signal recency (0d=today=1.0×, 1d=0.85×, 2-3d=0.65×, 4-7d=0.4×)

═══════════════════════════════════════════════════════════
INTELLIGENCE FEED:
${block}
═══════════════════════════════════════════════════════════

ALGORITHM — apply ALL 7 factors for each stock candidate:

FACTOR 1 · EXPERT CREDIBILITY (use tier weights above)
  Score each mention by the source tier and multiply.

FACTOR 2 · SIGNAL STRENGTH
  Explicit buy/accumulate: +5 | Price target raised: +4 | Earnings beat/strong results: +4
  Technical breakout (52wk high, volume surge): +3 | Sector rotation inflow: +3
  Unusual options activity / high OI buildup: +4 | FII/DII net buying: +3
  Analyst upgrade: +3 | General mention/bullish commentary: +1

FACTOR 3 · RECENCY DECAY
  Apply: 0d=1.0 · 1d=0.85 · 2-3d=0.65 · 4-7d=0.4 multiplier to raw score.

FACTOR 4 · CONSENSUS MULTIPLIER
  1 expert=1× · 2 experts=1.8× · 3=3× · 4+=5×
  Cross-tier consensus (T1 + T4 options signal on same stock) = extra 1.5× bonus.

FACTOR 5 · TECHNICAL & OPTIONS OVERLAY
  If options signals (T4) show high PCR, unusual call buying, max pain above CMP → +2
  If stock near 52-week high breakout → +2 · If stock in oversold bounce zone → +1
  High delivery % + volume surge → +2

FACTOR 5b · GIFT NIFTY LEADING SIGNAL (apply before other factors)
  GIFT Nifty trades ~16 hrs/day before Indian market opens — it's the single best gap predictor.
  If GIFT Nifty premium > +0.5% vs prev Nifty close → expect gap-up; boost high-beta stocks (banks, autos, metals)
  If GIFT Nifty discount > -0.5% → expect gap-down; prefer defensive (pharma, FMCG, IT exporters)
  If GIFT Nifty flat (±0.2%) → range-bound day likely; favour mean-reversion and options theta plays
  Use any GIFT Nifty news/signal found in T5 sources to confirm or contradict the macro picture.

FACTOR 6 · GLOBAL MACRO FILTER (T6 signals)
  If global risk-off (DXY up, crude spike, US yields spiking): penalise rate-sensitive (IT, NBFCs) by 0.7×
  If risk-on (global rally, FII inflows): boost export IT, metals, pharma by 1.2×
  If crude oil rising: boost energy/OMC but penalise aviation/paint cos.
  Apply this as a sector-level multiplier to all individual scores.

FACTOR 7 · INTRADAY TIMING FIT
  ${dayOfWeek === 'Monday' ? 'MONDAY: favour gap-up plays, weekend news catalysts, short covering candidates.' : ''}
  ${dayOfWeek === 'Friday' ? 'FRIDAY: avoid illiquid mid/smallcaps, favour large-cap defensive — weekend risk.' : ''}
  Prefer high-liquidity large/midcap for confidence≥4; smallcap only for confidence≤2.
  Expiry week (Thu): boost stocks with high options OI as max pain targets.

FINAL SCORE = (CredibilityWeight × SignalStrength × RecencyDecay × ConsensusMultiplier × MacroFilter × TimingFit)

REASONING TYPES TO APPLY FOR EACH PICK:
  a) Fundamental: earnings quality, revenue growth, promoter holding
  b) Technical: price action, volume, moving averages, breakout levels
  c) Sentiment: expert conviction, social consensus, news momentum
  d) Quantitative: OI data, PCR, FII/DII flows, delivery percentage
  e) Macro: sector tailwinds, currency impact, global peer moves
  f) Contrarian: oversold quality stocks, negative news overreaction

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
      "reasoning_types": ["Fundamental", "Sentiment", "Technical"],
      "reason": "One crisp sentence with the primary signal",
      "detailed_reasoning": "2-3 sentence breakdown covering signal source, factor scores, and why intraday upside is likely",
      "key_risk": "One sentence: what could invalidate this pick today",
      "mentioned_by": ["Basant Maheshwari", "Deepak Shenoy"],
      "signal_types": ["Earnings Beat", "FII Buying"],
      "intraday_note": "Watch for breakout above 2950; stop-loss at 2890"
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
- confidence: 1–5 integer · score: float (raw algorithm output)
- macro_risk: "low" | "medium" | "high"
- Only NSE/BSE listed Indian stocks
- If fewer than 10 are explicitly signalled, infer additional from sector/macro themes — mark intraday_note as "Thematic — no explicit signal"`;

  const { result, provider } = await callLLM(prompt);
  return { ...result, _provider: provider };
}

// ── Cache — /tmp persists across warm Lambda invocations on Vercel ────────────
import fs   from 'fs';
import path from 'path';

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
  const result = {
    ...analysis,
    article_count:   articles.length,
    sources_fetched: [...new Set(articles.map(a => a.source))],
    tier_breakdown:  Object.fromEntries(
      [1,2,3,4,5,6].map(t => [`tier_${t}`, articles.filter(a => a.tier === t).length])
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
