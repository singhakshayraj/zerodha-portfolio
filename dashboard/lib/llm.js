import { config } from '../config.js';

const STOCK_ANALYSIS_PROMPT = (company) => `You are a stock analyst specializing in Indian equities.
Analyze the Indian stock or company: "${company}".

Return ONLY a valid raw JSON object (no markdown, no code blocks) with exactly these fields:
{
  "symbol": "NSE ticker symbol",
  "name": "Full company name",
  "sector": "one of: fmcg, banking, psu, energy, pharma, it, infra, etf, chemicals, insurance, auto, other",
  "aiScore": <integer 0-100>,
  "verdict": "one of: Buy / Hold / Sell / Review",
  "bullCase": ["reason 1", "reason 2", "reason 3"],
  "bearCase": ["reason 1", "reason 2", "reason 3"],
  "ratios": { "pe": <number>, "roe": <number>, "roce": <number>, "debtEquity": <number>, "dividendYield": <number> },
  "redFlags": ["flag 1"],
  "summary": "One sentence verdict with reasoning.",
  "buy_price": <number — ideal entry/accumulation price in INR based on current technicals and valuation>,
  "sell_price": <number — price target or exit level in INR for the next 6–12 months>
}`;

async function analyzeWithGroq(company) {
  const { default: Groq } = await import('groq-sdk');
  const client = new Groq({ apiKey: config.llm.groqApiKey });
  const message = await client.chat.completions.create({
    model: config.llm.groqModel,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: STOCK_ANALYSIS_PROMPT(company) }],
  });
  return JSON.parse(message.choices[0].message.content.trim());
}

async function analyzeWithClaude(company) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
  const message = await client.messages.create({
    model: config.llm.anthropicModel,
    max_tokens: 1024,
    messages: [{ role: 'user', content: STOCK_ANALYSIS_PROMPT(company) }],
  });
  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  // Claude may wrap in markdown — strip it
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

async function analyzeWithOpenAI(company) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.llm.openaiApiKey });
  const message = await client.chat.completions.create({
    model: config.llm.openaiModel,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: STOCK_ANALYSIS_PROMPT(company) }],
  });
  return JSON.parse(message.choices[0].message.content.trim());
}

async function analyzeWithGemini(company) {
  const apiKey = config.llm.googleApiKey;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
  const model = config.llm.geminiModel || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: STOCK_ANALYSIS_PROMPT(company) }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1024, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

/**
 * Analyze a stock — tries primary provider, falls back to Gemini on rate-limit.
 * Returns { ...result, _provider: 'groq'|'gemini'|'claude'|'openai' }
 */
export async function analyzeStock(company) {
  const provider = config.llm.provider;
  const providerFn = {
    claude:  () => analyzeWithClaude(company),
    openai:  () => analyzeWithOpenAI(company),
    gemini:  () => analyzeWithGemini(company),
    groq:    () => analyzeWithGroq(company),
  };
  const primaryFn = providerFn[provider] ?? providerFn.groq;

  try {
    const result = await primaryFn();
    return { ...result, _provider: provider || 'groq' };
  } catch (err) {
    const isRateLimit = err.message?.includes('429') || err.message?.toLowerCase().includes('rate') || err.status === 429;
    const hasGemini   = !!(config.llm.googleApiKey);
    if (isRateLimit && hasGemini && provider !== 'gemini') {
      const result = await analyzeWithGemini(company);
      return { ...result, _provider: 'gemini' };
    }
    throw err;
  }
}

// ── Event-aware multi-stock scorer ───────────────────────────────────────────
// Single LLM call for all stocks in event context. Returns per-symbol scores.
const EVENT_STOCKS_PROMPT = (symbols, eventContext, scenarioLabel) =>
`You are an Indian equity analyst scoring stocks for event-driven trading.

EVENT: ${eventContext}
SCENARIO: ${scenarioLabel}

Score each stock on how directly it benefits (or is hurt by) this specific event outcome.
Focus on: policy tailwind/headwind, order book sensitivity, sector exposure, near-term catalyst.

Stocks to score: ${symbols.join(', ')}

Return ONLY raw JSON — no markdown, no explanation outside JSON:
{
  "SYMBOL": {
    "event_score": <integer 0-10>,
    "verdict": "BUY" | "HOLD" | "AVOID",
    "reason": "<max 12 words — specific to this event>"
  },
  ...
}

event_score rubric:
  9-10 = primary policy beneficiary, direct orderbook/revenue impact
  7-8  = strong indirect beneficiary, sector tailwind
  5-6  = moderate benefit, broader market play
  3-4  = neutral to slight positive
  1-2  = minimal connection to this event
  0    = no connection or negatively affected`;

async function scoreEventStocksWithGroq(symbols, eventContext, scenarioLabel) {
  const { default: Groq } = await import('groq-sdk');
  const client = new Groq({ apiKey: config.llm.groqApiKey });
  const msg = await client.chat.completions.create({
    model: config.llm.groqModel,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: EVENT_STOCKS_PROMPT(symbols, eventContext, scenarioLabel) }],
  });
  return JSON.parse(msg.choices[0].message.content.trim());
}

async function scoreEventStocksWithGemini(symbols, eventContext, scenarioLabel) {
  const apiKey = config.llm.googleApiKey;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
  const model = config.llm.geminiModel || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: EVENT_STOCKS_PROMPT(symbols, eventContext, scenarioLabel) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

/**
 * Score multiple stocks for a specific event scenario in one LLM call.
 * @param {string[]} symbols  NSE symbols
 * @param {string}   eventContext  e.g. "BJP wins West Bengal 2026 assembly election"
 * @param {string}   scenarioLabel  e.g. "BJP Wave — Wins WB + Retains Assam"
 * @returns {Record<string, {event_score:number, verdict:string, reason:string}>}
 */
export async function analyzeEventStocks(symbols, eventContext, scenarioLabel) {
  const provider = config.llm.provider;
  try {
    if (provider === 'gemini') {
      return await scoreEventStocksWithGemini(symbols, eventContext, scenarioLabel);
    }
    return await scoreEventStocksWithGroq(symbols, eventContext, scenarioLabel);
  } catch (err) {
    const isRateLimit = err.message?.includes('429') || err.status === 429;
    if (isRateLimit && config.llm.googleApiKey) {
      return await scoreEventStocksWithGemini(symbols, eventContext, scenarioLabel);
    }
    throw err;
  }
}

// ── Full event scenario generator ────────────────────────────────────────────
// Ask LLM to generate sectors + stocks + rationale from scratch for given scenario.
// One large call; returns structured JSON with 5 sectors × 5 stocks each.
const EVENT_SCENARIO_PROMPT = (eventContext, scenarioLabel, today) =>
`You are a senior Indian equity research analyst specialising in event-driven and political-economy investing.

EVENT CONTEXT: ${eventContext}
SCENARIO: ${scenarioLabel}
ANALYSIS DATE: ${today}

Using your knowledge of Indian corporate fundamentals, government project pipelines, and political economy, generate a fresh investment analysis for this specific scenario.

Rules:
- Only NSE-listed stocks (liquid, mid/large cap preferred — avoid illiquid micro-caps)
- For each stock: cite the SPECIFIC contract, project, order book, regulatory change, or balance sheet factor that links it to this event
- Reference historical precedent where relevant (past elections, past policy changes, past WB/state events)
- 5 sectors, 5 stocks per sector
- Sectors should be distinct — no overlap in stocks across sectors
- expected_move_pct is your estimated % move on event day + 3 days, signed (positive = up, negative = down)

Return ONLY raw JSON, no markdown, no explanation outside JSON:
{
  "sectors": [
    {
      "name": "Sector Name",
      "thesis": "2-3 sentences: why this sector moves, what policy/project/regulatory mechanism, historical precedent",
      "direction": "bullish",
      "expected_move_pct": 12,
      "conviction": "high",
      "stocks": [
        {
          "symbol": "NSE_SYMBOL",
          "name": "Full Company Name",
          "direction": "bullish",
          "expected_move_pct": 15,
          "conviction": "high",
          "rationale": "2-3 sentences: specific project or contract at stake, financial impact (revenue/earnings), historical analogue"
        }
      ]
    }
  ],
  "summary": "2-3 sentence overall market read: what opens up, what sells off, what is the dominant narrative",
  "key_risk": "One sentence — what single outcome could invalidate the entire bullish/bearish thesis"
}`;

async function generateScenarioWithGroq(eventContext, scenarioLabel, today) {
  const { default: Groq } = await import('groq-sdk');
  const client = new Groq({ apiKey: config.llm.groqApiKey });
  const msg = await client.chat.completions.create({
    model: config.llm.groqModel,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: EVENT_SCENARIO_PROMPT(eventContext, scenarioLabel, today) }],
  });
  return JSON.parse(msg.choices[0].message.content.trim());
}

async function generateScenarioWithGemini(eventContext, scenarioLabel, today) {
  const apiKey = config.llm.googleApiKey;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
  const model = config.llm.geminiModel || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: EVENT_SCENARIO_PROMPT(eventContext, scenarioLabel, today) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

/**
 * Generate fresh event scenario analysis — sectors, stocks, rationale — from LLM.
 * @param {string} eventContext  Full event description
 * @param {string} scenarioLabel  e.g. "BJP Wave — Wins WB + Retains Assam"
 * @param {string} today  ISO date string
 * @returns {{ sectors, summary, key_risk }}
 */
export async function analyzeEventScenario(eventContext, scenarioLabel, today) {
  const provider = config.llm.provider;
  try {
    if (provider === 'gemini') return await generateScenarioWithGemini(eventContext, scenarioLabel, today);
    return await generateScenarioWithGroq(eventContext, scenarioLabel, today);
  } catch (err) {
    const isRateLimit = err.message?.includes('429') || err.status === 429;
    if (isRateLimit && config.llm.googleApiKey) {
      return await generateScenarioWithGemini(eventContext, scenarioLabel, today);
    }
    throw err;
  }
}

export { STOCK_ANALYSIS_PROMPT };
