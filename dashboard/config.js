// On Vercel, env vars are injected directly into process.env — no dotenv needed.
// For local development, run: export GROQ_API_KEY=xxx (or use a .env loader in your shell).
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
    googleApiKey:   process.env.GOOGLE_API_KEY || '',
    geminiModel:    process.env.GEMINI_MODEL   || 'gemini-1.5-flash',
  },

  port: parseInt(process.env.PORT || '7432', 10),
};
