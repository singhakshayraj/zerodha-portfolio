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
const EVENT_SCENARIO_PROMPT = (eventContext, scenarioLabel, quantContext, today) => {
  const { scenario_probabilities: probs, regime_multiplier, regime_context, top_sectors } = quantContext;
  const probLines = Object.entries(probs).map(([sc, p]) => `  ${sc}: ${(p*100).toFixed(0)}%`).join('\n');
  const sectorLines = top_sectors.slice(0, 5).map(s =>
    `  ${s.name}: adj_EV=${s.adj_ev}% | consistency=${(s.consistency*100).toFixed(0)}% | direction=${s.direction}`
  ).join('\n');
  const regimeNote = regime_context
    ? `VIX=${regime_context.vix_state}, Regime=${regime_context.regime}, Sentiment=${regime_context.sentiment}, GIFT Nifty=${regime_context.gift_nifty || '—'}`
    : 'Brain cache unavailable — use neutral regime assumptions';

  return `You are a senior Indian equity research analyst. Your role is SYNTHESIS and EXPLANATION only — the quantitative ranking has already been computed. Do not change sector ordering or EV numbers.

EVENT: ${eventContext}
SCENARIO: ${scenarioLabel}
DATE: ${today}

─── QUANTITATIVE CONTEXT (pre-computed, authoritative) ───────────────────────
Scenario Probabilities:
${probLines}

Market Regime: ${regimeNote}
Regime Multiplier: ${regime_multiplier}x (scales all EV estimates — <1.0 = compress, >1.0 = expand)

Top Sectors by Probability-Weighted EV (T+7, regime-adjusted):
${sectorLines}
──────────────────────────────────────────────────────────────────────────────

INSTRUCTIONS:
1. Cover the top 5 sectors from the list above (in order — do not reorder)
2. For each sector: write a 2-3 sentence thesis tied to the SPECIFIC event mechanism
3. For each sector: pick 5 NSE-listed liquid mid/large-cap stocks
4. For each stock: provide 2-3 sentence rationale citing:
   - Specific contract, project, or policy mechanism that links it to this event
   - A historical precedent (year + event, e.g. "In 2014 when BJP won...")
   - One balance-sheet / earnings sensitivity fact (revenue %, order book size, margin impact)
5. expected_move_pct for stocks: use the sector's adj_ev as anchor, adjust ±30% for stock-specific factors
6. Do NOT hallucinate stock symbols — only use well-known NSE-listed tickers

Return ONLY raw JSON (no markdown, no text outside JSON):
{
  "sectors": [
    {
      "name": "exact name from sector list above",
      "thesis": "2-3 sentences: mechanism + historical precedent + why NOW",
      "direction": "bullish|bearish|neutral",
      "ev_t7": <number — copy from quant context>,
      "ev_adj": <number — copy regime-adjusted EV>,
      "consistency_pct": <integer 0-100>,
      "stocks": [
        {
          "symbol": "NSE_SYMBOL",
          "name": "Full Company Name",
          "direction": "bullish|bearish|neutral",
          "expected_move_pct": <integer>,
          "conviction": "high|medium|low",
          "rationale": "2-3 sentences: specific project/contract + historical analogue + balance sheet link"
        }
      ]
    }
  ],
  "summary": "2-3 sentences: overall market read — what opens up, what sells off, dominant narrative",
  "key_risk": "One sentence: what single outcome invalidates the primary thesis",
  "regime_note": "One sentence: how current VIX/regime context shapes sizing and timing"
}`;
};

async function generateScenarioWithGroq(eventContext, scenarioLabel, quantContext, today) {
  const { default: Groq } = await import('groq-sdk');
  const client = new Groq({ apiKey: config.llm.groqApiKey });
  // Use smaller model for large generation to stay within free-tier RPM/TPM limits
  const model = config.llm.groqModel === 'llama-3.3-70b-versatile'
    ? 'llama-3.1-8b-instant'   // faster, lower token cost, still good for structured JSON
    : config.llm.groqModel;
  const msg = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: EVENT_SCENARIO_PROMPT(eventContext, scenarioLabel, quantContext, today) }],
  });
  return JSON.parse(msg.choices[0].message.content.trim());
}

async function generateScenarioWithGemini(eventContext, scenarioLabel, quantContext, today, attempt = 0) {
  const apiKey = config.llm.googleApiKey;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
  const model = config.llm.geminiModel || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: EVENT_SCENARIO_PROMPT(eventContext, scenarioLabel, quantContext, today) }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
    }
  );
  // Retry once on 429 after 8s back-off
  if (res.status === 429 && attempt < 1) {
    await new Promise(r => setTimeout(r, 8000));
    return generateScenarioWithGemini(eventContext, scenarioLabel, quantContext, today, attempt + 1);
  }
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

/**
 * Generate event scenario analysis — LLM acts as synthesis layer only.
 * Quantitative context (sector EVs, probabilities, regime) is pre-computed
 * and passed as structured input; LLM writes rationale and validates thesis.
 * @param {string} eventContext
 * @param {string} scenarioLabel
 * @param {object} quantContext  Output of buildQuantContext()
 * @param {string} today  ISO date
 */
export async function analyzeEventScenario(eventContext, scenarioLabel, quantContext, today) {
  const provider = config.llm.provider;
  try {
    if (provider === 'gemini') return await generateScenarioWithGemini(eventContext, scenarioLabel, quantContext, today);
    return await generateScenarioWithGroq(eventContext, scenarioLabel, quantContext, today);
  } catch (err) {
    const isRateLimit = err.message?.includes('429') || err.status === 429;
    if (isRateLimit && config.llm.googleApiKey) {
      return await generateScenarioWithGemini(eventContext, scenarioLabel, quantContext, today);
    }
    throw err;
  }
}

export { STOCK_ANALYSIS_PROMPT };
