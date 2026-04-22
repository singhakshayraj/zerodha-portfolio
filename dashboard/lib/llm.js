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
  "buy_price": <number — ideal entry price in INR based on current technicals and valuation, or null if not a Buy>,
  "sell_price": <number — 6–12 month price target in INR, or null if not a Buy>
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
  const model = config.llm.geminiModel || 'gemini-1.5-flash';
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

export { STOCK_ANALYSIS_PROMPT };
