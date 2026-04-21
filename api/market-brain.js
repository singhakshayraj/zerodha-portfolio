/**
 * AI Market Brain — Google News RSS edition
 * ─────────────────────────────────────────────────────────────────────────────
 * Searches Google News for recent articles quoting each expert investor,
 * plus general Indian market news. Feeds all text to Groq to extract stock
 * mentions, score sentiment, and return top 10 intraday picks.
 *
 * No API key needed for data fetch — Google News RSS is public.
 * Groq API key required for LLM analysis (GROQ_API_KEY env var).
 *
 * Cache: 30 min in memory. Force refresh with ?bust=1.
 */

export const config = { maxDuration: 30 };

// ── Search queries: one per expert + general market signals ───────────────────
const SOURCES = [
  { label: 'Vijay Kedia',       q: '"Vijay Kedia" stock buy portfolio NSE' },
  { label: 'Basant Maheshwari', q: '"Basant Maheshwari" stock equity recommendation' },
  { label: 'Ramesh Damani',     q: '"Ramesh Damani" stock picks NSE BSE' },
  { label: 'Porinju Veliyath',  q: '"Porinju" stock portfolio multibagger' },
  { label: 'Nilesh Shah',       q: '"Nilesh Shah" stock market India' },
  { label: 'Sanjay Bakshi',     q: '"Sanjay Bakshi" value investing India stock' },
  { label: 'Mohnish Pabrai',    q: '"Pabrai" India stock investment' },
  { label: 'Vishal Khandelwal', q: '"Safal Niveshak" stock analysis India' },
  { label: 'NSE Momentum',      q: 'NSE BSE breakout momentum stock rally India today' },
  { label: 'Midcap Picks',      q: 'Indian midcap smallcap stock buy recommendation today' },
];

const NEWS_BASE = 'https://news.google.com/rss/search';

// ── Fetch + parse Google News RSS ─────────────────────────────────────────────
async function fetchNewsItems(source, maxItems = 5) {
  const url = `${NEWS_BASE}?q=${encodeURIComponent(source.q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(7000),
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

      const titleRaw   = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const descRaw    = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
      const sourceRaw  = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';

      const clean = (s) => s
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();

      const title = clean(titleRaw);
      const desc  = clean(descRaw);
      const text  = desc.length > title.length ? `${title}. ${desc}` : title;

      if (text.length > 40) {
        items.push({
          source: source.label,
          outlet: clean(sourceRaw),
          text,
          date: new Date(ts).toISOString().slice(0, 10),
        });
      }
    }
    return items;
  } catch (_) {
    return [];
  }
}

// ── Groq LLM analysis ─────────────────────────────────────────────────────────
async function analyzeWithGroq(articles) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in Vercel environment variables');

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const articleBlock = articles
    .map(a => `[${a.source} · ${a.outlet} · ${a.date}]: ${a.text}`)
    .join('\n\n');

  const prompt = `You are an expert Indian equity analyst and intraday trader. Today is ${today}.

Below are recent news articles and headlines mentioning prominent Indian investors (Vijay Kedia, Basant Maheshwari, Ramesh Damani, Porinju Veliyath, Nilesh Shah, Sanjay Bakshi, Mohnish Pabrai, etc.) and general Indian market momentum signals. These were collected from Google News over the past 7 days.

Your task:
1. Extract all Indian NSE/BSE stock mentions — both ticker symbols (INFY, RELIANCE) and company names
2. Identify bullish signals: buy calls, target price upgrades, strong results, accumulation news
3. Identify bearish signals: sell recommendations, downgrades, fraud/regulatory concerns
4. Rank stocks by: strength of signal + expert credibility + recency
5. Select TOP 10 stocks most likely to see POSITIVE intraday price movement TODAY
6. If fewer than 10 are clearly mentioned, infer additional picks from sector/macro themes discussed

NEWS ARTICLES (${articles.length} articles from ${[...new Set(articles.map(a => a.source))].length} search categories):
────────────────────────────────────────
${articleBlock}
────────────────────────────────────────

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "picks": [
    {
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "company": "Reliance Industries Ltd",
      "sentiment": "bullish",
      "confidence": 4,
      "reason": "One crisp sentence citing the news signal",
      "mentioned_by": ["Basant Maheshwari", "Ramesh Damani"]
    }
  ],
  "market_sentiment": "bullish",
  "summary": "One sentence overall Indian market mood based on these articles"
}

Rules:
- confidence: integer 1–5 (5 = multiple experts + strong signal; 1 = single weak mention)
- sentiment: "bullish" | "bearish" | "neutral"
- market_sentiment: "bullish" | "bearish" | "neutral"
- mentioned_by: list of expert names (empty [] if derived from sector theme)
- Return exactly 10 picks sorted by confidence descending
- Only include stocks listed on NSE or BSE`;

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

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('LLM returned non-JSON: ' + content.slice(0, 300));
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30 * 60 * 1000;

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const bust = new URL(req.url, 'https://x.com').searchParams.get('bust');
  if (!bust && _cache && Date.now() - _cacheAt < CACHE_TTL) {
    return res.status(200).json({ ..._cache, cached: true });
  }

  try {
    // Fetch all search categories in parallel
    const allResults = await Promise.allSettled(SOURCES.map(s => fetchNewsItems(s, 5)));
    const articles = allResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    if (articles.length === 0) {
      return res.status(503).json({
        error: 'Could not fetch any news articles. Check network connectivity.',
        tip: 'Google News RSS may be temporarily unavailable.',
      });
    }

    const analysis = await analyzeWithGroq(articles);

    const result = {
      ...analysis,
      article_count: articles.length,
      sources_fetched: [...new Set(articles.map(a => a.source))],
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
