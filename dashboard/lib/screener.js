/**
 * Fundamental data orchestrator — client-side.
 * Calls /api/research?action=fundamental (server proxies Screener + Yahoo + NSE).
 * Then calls /api/intel?action=fa_narrative for LLM narrative.
 */

import { computeComposite, computePiotroski, detectRedFlags, getSectorMedianPE } from './fundamental.js';

const BASE = '';  // same-origin

/**
 * Fetch FA data for a symbol. Returns merged object ready for scoring.
 * @param {string} symbol NSE symbol
 * @returns {Promise<object>} faData
 */
export async function fetchFAData(symbol) {
  const res = await fetch(`${BASE}/api/research?action=fundamental&symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`FA data fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch LLM narrative for a symbol. Fires async after main data loads.
 * @param {string} symbol
 * @param {object} faData  the object returned by fetchFAData
 * @returns {Promise<object>} narrative
 */
export async function fetchFANarrative(symbol, faData) {
  const res = await fetch(`${BASE}/api/intel?action=fa_narrative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, faData }),
  });
  if (!res.ok) throw new Error(`Narrative fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Full FA analysis pipeline: fetch → score → detect flags → return.
 * @param {string} symbol
 * @returns {Promise<{ faData, scores, flags, piotroski }>}
 */
export async function analyzeFA(symbol) {
  const faData = await fetchFAData(symbol);
  const scores = computeComposite(faData);
  const piotroski = computePiotroski(faData);
  const flags = detectRedFlags(faData);
  return { faData, scores, piotroski, flags };
}

/**
 * Fetch holdings from Kite and run FA analysis on each holding.
 * @param {string} enctoken
 * @returns {Promise<Array<{symbol, holding, faData, scores, flags, piotroski}>>}
 */
export async function analyzePortfolio(enctoken) {
  const res = await fetch('/api/kite?action=holdings', {
    headers: { 'X-Kite-Enctoken': enctoken },
  });
  if (!res.ok) throw new Error(`Holdings fetch failed: ${res.status}`);
  const holdings = await res.json();
  const holdingsList = Array.isArray(holdings) ? holdings : (holdings.data || holdings.holdings || []);

  // Analyze all holdings in parallel (limit concurrency to 3 to avoid rate limits)
  const results = [];
  for (let i = 0; i < holdingsList.length; i += 3) {
    const batch = holdingsList.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map(async h => {
        const symbol = h.tradingsymbol || h.symbol;
        try {
          const { faData, scores, piotroski, flags } = await analyzeFA(symbol);
          return { symbol, holding: h, faData, scores, piotroski, flags };
        } catch (e) {
          return { symbol, holding: h, faData: null, scores: null, piotroski: null, flags: [], error: e.message };
        }
      })
    );
    batchResults.forEach(r => results.push(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }));
    // Small delay between batches
    if (i + 3 < holdingsList.length) await new Promise(r => setTimeout(r, 500));
  }
  return results.filter(r => r.symbol);
}

/**
 * Fetch OHLCV technical data for a symbol + timeframe.
 * @param {string} symbol
 * @param {string} timeframe 'daily'|'weekly'|'monthly'
 * @param {string} enctoken
 */
export async function fetchTAData(symbol, timeframe, enctoken) {
  const res = await fetch(
    `/api/research?action=technical_full&symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
    { headers: { 'X-Kite-Enctoken': enctoken } }
  );
  if (!res.ok) throw new Error(`TA data fetch failed: ${res.status}`);
  return res.json();
}
