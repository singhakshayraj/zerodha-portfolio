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
  "summary": "One sentence verdict with reasoning."
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

/**
 * Analyze a stock using the configured LLM provider.
 * Returns the same JSON schema regardless of provider.
 */
export async function analyzeStock(company) {
  const provider = config.llm.provider;
  switch (provider) {
    case 'claude':  return analyzeWithClaude(company);
    case 'openai':  return analyzeWithOpenAI(company);
    case 'groq':
    default:        return analyzeWithGroq(company);
  }
}

export { STOCK_ANALYSIS_PROMPT };
