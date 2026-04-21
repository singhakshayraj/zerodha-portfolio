/**
 * AI Market Brain
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Fetches recent posts from expert investor Twitter/X handles via Nitter RSS
 *    (public, no API key needed — falls back across multiple instances)
 * 2. Builds a runtime prompt with all gathered text
 * 3. Sends to Groq LLM to extract stock mentions, score sentiment, pick top 10
 * 4. Returns structured JSON: picks + market summary
 *
 * Configurable: add/remove handles in HANDLES array.
 * Cache: results cached 30 min in memory to avoid repeated API calls.
 */

export const config = { maxDuration: 30 }; // Vercel Pro: 30s. Free: 10s (may timeout on cold)

// ── Expert handles (Twitter/X) ────────────────────────────────────────────────
const HANDLES = [
  'VijayKedia1',
  'safalniveshak',
  'BMTheEquityDesk',
  'NileshShah68',
  'Sanjay_Bakshi',
  'SunilSingi',
  'RameshDamani1',
  'Porinju',
  'AtulKumarAnand',
  'PabraiMohnish',
];

// ── Nitter RSS instances (tried in order, first success wins per handle) ──────
const NITTER = [
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.1d4.us',
  'https://nitter.kavin.rocks',
  'https://nitter.moomoo.me',
];

// ── Result cache ──────────────────────────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── RSS fetch + parse ─────────────────────────────────────────────────────────
async function fetchHandleTweets(handle, maxTweets = 5) {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const base of NITTER) {
    try {
      const res = await fetch(`${base}/${handle}/rss`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const xml = await res.text();

      const tweets = [];
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(xml)) !== null && tweets.length < maxTweets) {
        const block = m[1];

        // Extract date first — skip tweets older than 1 week
        const dateStr = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1];
        const ts = dateStr ? new Date(dateStr).getTime() : Date.now();
        if (ts < oneWeekAgo) continue;

        // Extract text (prefer description CDATA, fall back to title)
        const cdataRe = /<description><!\[CDATA\[([\s\S]*?)\]\]>/;
        const titleRe  = /<title><!\[CDATA\[([\s\S]*?)\]\]>/;
        const raw = ((block.match(cdataRe) || block.match(titleRe) || [])[1] || '');
        const text = raw
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ').trim();

        if (text.length > 30) tweets.push({ handle, text, date: new Date(ts).toISOString().slice(0, 10) });
      }
      if (tweets.length > 0) return tweets;
    } catch (_) { /* try next instance */ }
  }
  return []; // all instances failed for this handle
}

// ── Groq analysis ─────────────────────────────────────────────────────────────
async function analyzeWithGroq(tweets) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in environment');

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const tweetBlock = tweets.map(t => `[@${t.handle} on ${t.date}]: ${t.text}`).join('\n\n');

  const prompt = `You are a seasoned Indian equity analyst and quantitative trader. Today is ${today}.

Below are recent social media posts from prominent Indian investors and market experts, collected over the past 7 days. Your job:

1. Read every post carefully and extract all mentions of Indian stocks (NSE/BSE listed) — both ticker symbols (INFY, RELIANCE, HDFC) and company names (Infosys, Tata Motors, etc.)
2. Assess sentiment for each mention: bullish signals (buy recommendation, undervalued, strong results, accumulating), bearish signals (avoid, overbought, sell), or neutral
3. Score each stock by: number of expert mentions, sentiment strength, and recency
4. Identify the TOP 10 stocks most likely to see POSITIVE price movement TODAY (intraday context)
5. If fewer than 10 stocks are explicitly named, use thematic cues (sector trends, macro comments) to suggest additional relevant NSE-listed stocks

EXPERT POSTS (${tweets.length} posts from ${[...new Set(tweets.map(t => t.handle))].length} experts):
────────────────────────────────────────
${tweetBlock}
────────────────────────────────────────

Return ONLY valid JSON — no markdown fences, no explanation before or after. Exact format:
{
  "picks": [
    {
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "company": "Reliance Industries",
      "sentiment": "bullish",
      "confidence": 4,
      "reason": "One crisp sentence: why this stock, what the expert said",
      "mentioned_by": ["BMTheEquityDesk", "VijayKedia1"]
    }
  ],
  "market_sentiment": "bullish",
  "summary": "One sentence overall market mood from these experts today"
}

Rules:
- confidence: integer 1–5 (5 = multiple experts, strong conviction; 1 = single mention, speculative)
- sentiment: "bullish" | "bearish" | "neutral"
- market_sentiment: "bullish" | "bearish" | "neutral"
- mentioned_by: list of handle strings (empty array [] if derived thematically, not explicitly)
- Return exactly 10 picks sorted by confidence descending
- Only NSE or BSE listed Indian stocks`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = (data.choices?.[0]?.message?.content || '').trim();

  // Parse JSON — handle cases where LLM wraps in ```json
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('LLM returned non-JSON: ' + content.slice(0, 300));
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  // Serve cache if fresh
  const bust = new URL(req.url, 'https://x.com').searchParams.get('bust');
  if (!bust && _cache && Date.now() - _cacheAt < CACHE_TTL) {
    return res.status(200).json({ ..._cache, cached: true });
  }

  try {
    // Fetch all handles in parallel (each with per-instance fallback)
    const allResults = await Promise.allSettled(HANDLES.map(h => fetchHandleTweets(h, 5)));
    const tweets = allResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    const successHandles = [...new Set(tweets.map(t => t.handle))];

    if (tweets.length === 0) {
      return res.status(503).json({
        error: 'Could not fetch posts from any expert — Nitter instances may be down.',
        tip: 'This is a third-party RSS dependency. Try again in a few minutes.',
        handles: HANDLES,
      });
    }

    const analysis = await analyzeWithGroq(tweets);

    const result = {
      ...analysis,
      tweet_count: tweets.length,
      handles_fetched: successHandles,
      handles_missed: HANDLES.filter(h => !successHandles.includes(h)),
      generated_at: new Date().toISOString(),
      cached: false,
    };

    _cache = result;
    _cacheAt = Date.now();

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
