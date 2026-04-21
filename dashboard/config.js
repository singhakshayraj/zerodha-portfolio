import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from project root (one level up from dashboard/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') }); // also check dashboard/.env

export const config = {
  // Runtime mode: "local" = Claude Code + MCP, "server" = direct API keys
  runtimeMode: process.env.RUNTIME_MODE || 'local',

  // Kite (server mode only — enctoken from browser session)
  kite: {
    enctoken:    process.env.KITE_ENCTOKEN || '',
    apiKey:      process.env.KITE_API_KEY  || '',
    apiSecret:   process.env.KITE_API_SECRET || '',
  },

  // LLM provider: "groq" | "claude" | "openai"
  llm: {
    provider:       process.env.LLM_PROVIDER || 'groq',
    groqApiKey:     process.env.GROQ_API_KEY || '',
    groqModel:      process.env.GROQ_MODEL   || 'llama-3.3-70b-versatile',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    anthropicModel:  process.env.ANTHROPIC_MODEL   || 'claude-haiku-4-5-20251001',
    openaiApiKey:   process.env.OPENAI_API_KEY || '',
    openaiModel:    process.env.OPENAI_MODEL   || 'gpt-4o-mini',
  },

  port: parseInt(process.env.PORT || '7432', 10),
};
