/**
 * Step 3 — Intersection Engine
 *
 * Converts Step 1 intelligence + Step 2 real-time movement into actionable
 * opportunity candidates. Acts as a strict deterministic filter — ambiguity
 * always resolves to rejection, never to a forced pass.
 *
 * Pipeline (in order):
 *   1. Symbol intersection          — must appear in both Step 1 and Step 2
 *   2. Direction alignment filter   — directional_bias vs trend_context must agree
 *   3. Trigger quality gate         — structural OR weak-with-confluence
 *   4. Strength filter              — medium or strong only
 *   5. Freshness constraint         — triggered within FRESHNESS_WINDOW_MS
 *   6. Composite score              — 60% brain + 25% strength + 15% intensity
 *   7. Setup classification         — structural nature + direction + confidence
 *   8. Output constraint            — top MAX_RESULTS or score ≥ MIN_SCORE
 *
 * No external API calls. Accepts pre-fetched brain picks and trigger events.
 * All logic is synchronous and deterministic — same inputs always produce same output.
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;  // triggers older than 15 min are stale
const MIN_SCORE           = 0.65;             // minimum final_score to surface
const MAX_RESULTS         = 5;                // hard cap on output candidates

// Composite score weights — must sum to 1.0
const W_BRAIN     = 0.60;
const W_STRENGTH  = 0.25;
const W_INTENSITY = 0.15;

// Direction alignment multipliers
const ALIGN_MATCH    = 1.00;  // bias + trend agree (bullish/uptrend or bearish/downtrend)
const ALIGN_NEUTRAL  = 0.90;  // neutral bias — passes with mild penalty
const ALIGN_MISMATCH = null;  // bias contradicts trend — discard

// Strength component scores
const STRENGTH_SCORE = { strong: 1.0, medium: 0.7, weak: 0.4 };

// Intensity component scores — higher confluence = higher contribution
const INTENSITY_SCORE = { 1: 0.40, 2: 0.70, 3: 1.00 };

// Structural triggers pass the quality gate unconditionally (with confirmation)
const STRUCTURAL = new Set(['breakout_high', 'breakout_low', 'vwap_reclaim', 'vwap_loss']);

// Confidence bands derived from final_score
const CONFIDENCE_HIGH   = 0.80;
const CONFIDENCE_MEDIUM = 0.65;

// ── Direction alignment ───────────────────────────────────────────────────────
// Returns ALIGN_MATCH | ALIGN_NEUTRAL | ALIGN_MISMATCH (null)
function alignmentMultiplier(directionalBias, trendContext) {
  const bias  = (directionalBias || '').toLowerCase();
  const trend = (trendContext    || '').toLowerCase();

  const isBullish  = bias.includes('bullish')  || bias === 'long';
  const isBearish  = bias.includes('bearish')  || bias === 'short';
  const isNeutral  = !isBullish && !isBearish;
  const isUptrend  = trend === 'uptrend';
  const isDowntrend = trend === 'downtrend';

  if (isNeutral)                       return ALIGN_NEUTRAL;
  if (isBullish && isUptrend)          return ALIGN_MATCH;
  if (isBearish && isDowntrend)        return ALIGN_MATCH;
  // Mismatch: bullish + downtrend, or bearish + uptrend
  return ALIGN_MISMATCH;
}

// ── Trigger quality gate ──────────────────────────────────────────────────────
// Structural triggers always pass. Weak triggers (volume/momentum only) require
// signal_intensity >= 2 to pass (multi-trigger confluence as substitute quality).
function passesTriggerQuality(triggers, primaryTrigger, signalIntensity) {
  // At least one structural trigger among the confirmed set → pass
  if (triggers.some(t => STRUCTURAL.has(t))) return true;
  // No structural trigger: require confluence from weak triggers
  return (signalIntensity ?? 1) >= 2;
}

// ── Composite score ───────────────────────────────────────────────────────────
// Brain scores are 0–10; normalised to 0–1.
// Intensity caps at 3 for scoring (4+ treated as 3).
function computeFinalScore(brainScore, strength, signalIntensity, alignMult) {
  const brainNorm  = Math.min(1, Math.max(0, (brainScore ?? 0) / 10));
  const strengthSc = STRENGTH_SCORE[strength] ?? 0.4;
  const intensity  = Math.min(3, signalIntensity ?? 1);
  const intensitySc = INTENSITY_SCORE[intensity] ?? INTENSITY_SCORE[1];

  const raw = W_BRAIN * brainNorm + W_STRENGTH * strengthSc + W_INTENSITY * intensitySc;
  return +(raw * alignMult).toFixed(4);
}

// ── Confidence band ───────────────────────────────────────────────────────────
function confidenceLabel(finalScore) {
  if (finalScore >= CONFIDENCE_HIGH)   return 'high';
  if (finalScore >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}

// ── Direction ─────────────────────────────────────────────────────────────────
// Prefer the brain's directional_bias; fall back to trend_context.
function deriveDirection(directionalBias, trendContext) {
  const bias = (directionalBias || '').toLowerCase();
  if (bias.includes('bullish') || bias === 'long')  return 'long';
  if (bias.includes('bearish') || bias === 'short') return 'short';
  // Neutral bias — derive from live price action
  if (trendContext === 'uptrend')   return 'long';
  if (trendContext === 'downtrend') return 'short';
  return 'neutral';
}

// ── Setup type classification ─────────────────────────────────────────────────
// Combines Step 2's structural nature with Step 1's contextual character.
// Format: "<trigger_nature> + <context_character>"
// e.g. "breakout + smart_money", "vwap_reclaim + news_driven", "momentum + institutional_flow"
function classifySetup(primaryTrigger, signalTypes, eventType) {
  // Trigger nature
  let triggerNature = 'momentum';
  if (primaryTrigger === 'breakout_high' || primaryTrigger === 'breakout_low') triggerNature = 'breakout';
  else if (primaryTrigger === 'vwap_reclaim') triggerNature = 'vwap_reclaim';
  else if (primaryTrigger === 'vwap_loss')    triggerNature = 'vwap_loss';
  else if (primaryTrigger === 'volume')       triggerNature = 'volume_surge';

  // Contextual character from Step 1 signal types + event type
  const types = Array.isArray(signalTypes) ? signalTypes.map(s => s.toLowerCase()) : [];
  const evt   = (eventType || '').toLowerCase();

  let contextChar = 'market_move'; // default
  if (types.includes('smart_money'))         contextChar = 'smart_money';
  else if (types.includes('institutional_flow')) contextChar = 'institutional_flow';
  else if (types.includes('derivatives'))    contextChar = 'derivatives_backed';
  else if (types.includes('macro'))          contextChar = 'macro_driven';
  else if (evt.includes('result') || evt.includes('earnings')) contextChar = 'earnings_catalyst';
  else if (evt.includes('news') || evt.includes('announce'))   contextChar = 'news_driven';
  else if (types.includes('market_direction')) contextChar = 'market_direction';

  return `${triggerNature} + ${contextChar}`;
}

// ── Main intersection function ────────────────────────────────────────────────
/**
 * Run the intersection engine.
 *
 * @param brainPicks   Array of Step 1 pick objects:
 *   { symbol, score, directional_bias, regime, event_type, signal_types, ltp_at_emit }
 *
 * @param triggerEvents  Array of Step 2 trigger event objects:
 *   { symbol, triggers, primary_trigger, strength, signal_intensity,
 *     trend_context, price, volume, breakout, triggered_at }
 *
 * @returns {
 *   opportunities: Opportunity[],   sorted by final_score desc
 *   rejected: RejectedCandidate[],  for debugging — why each intersected symbol was dropped
 *   meta: { total_brain, total_triggers, intersected, passed, cycle_at }
 * }
 */
export function runIntersection(brainPicks, triggerEvents) {
  const now = Date.now();

  // Index Step 1 picks by symbol (last-write wins if duplicate — highest score preferred)
  const brainMap = new Map();
  for (const pick of (brainPicks || [])) {
    if (!pick?.symbol) continue;
    const existing = brainMap.get(pick.symbol);
    if (!existing || (pick.score ?? 0) > (existing.score ?? 0)) {
      brainMap.set(pick.symbol, pick);
    }
  }

  // Index Step 2 triggers by symbol (keep highest signal_intensity if duplicate)
  const triggerMap = new Map();
  for (const ev of (triggerEvents || [])) {
    if (!ev?.symbol) continue;
    const existing = triggerMap.get(ev.symbol);
    if (!existing || (ev.signal_intensity ?? 0) > (existing.signal_intensity ?? 0)) {
      triggerMap.set(ev.symbol, ev);
    }
  }

  // ── Step 1: Symbol intersection ───────────────────────────────────────────
  const intersectedSymbols = [...brainMap.keys()].filter(s => triggerMap.has(s));

  const opportunities = [];
  const rejected      = [];

  for (const symbol of intersectedSymbols) {
    const brain   = brainMap.get(symbol);
    const trigger = triggerMap.get(symbol);
    const rejectWith = (reason) => rejected.push({ symbol, reason, brain_score: brain.score, strength: trigger.strength });

    // ── Step 2: Direction alignment ─────────────────────────────────────────
    const alignMult = alignmentMultiplier(brain.directional_bias, trigger.trend_context);
    if (alignMult === ALIGN_MISMATCH) {
      rejectWith(`direction_mismatch: bias=${brain.directional_bias} trend=${trigger.trend_context}`);
      continue;
    }

    // ── Step 3: Trigger quality gate ────────────────────────────────────────
    if (!passesTriggerQuality(trigger.triggers ?? [], trigger.primary_trigger, trigger.signal_intensity)) {
      rejectWith(`trigger_quality: no structural trigger and signal_intensity=${trigger.signal_intensity ?? 1} < 2`);
      continue;
    }

    // ── Step 4: Strength filter ─────────────────────────────────────────────
    if (trigger.strength === 'weak') {
      rejectWith(`strength_weak: only medium/strong allowed`);
      continue;
    }

    // ── Step 5: Freshness constraint ────────────────────────────────────────
    const triggeredAt  = trigger.triggered_at ? new Date(trigger.triggered_at).getTime() : 0;
    const ageMs        = triggeredAt > 0 ? now - triggeredAt : Infinity;
    if (ageMs > FRESHNESS_WINDOW_MS) {
      rejectWith(`stale: trigger is ${Math.round(ageMs / 60000)} min old, max ${FRESHNESS_WINDOW_MS / 60000} min`);
      continue;
    }

    // ── Step 6: Composite score ─────────────────────────────────────────────
    const finalScore = computeFinalScore(
      brain.score, trigger.strength, trigger.signal_intensity, alignMult,
    );

    // Apply minimum score gate here (before setup classification — saves work)
    if (finalScore < MIN_SCORE) {
      rejectWith(`score_below_minimum: final_score=${finalScore} < ${MIN_SCORE}`);
      continue;
    }

    // ── Step 7: Setup classification ────────────────────────────────────────
    const direction  = deriveDirection(brain.directional_bias, trigger.trend_context);
    const setupType  = classifySetup(trigger.primary_trigger, brain.signal_types, brain.event_type);
    const confidence = confidenceLabel(finalScore);

    // ── Step 8: Build opportunity object ────────────────────────────────────
    opportunities.push({
      symbol,
      exchange:         'NSE',

      // Classification
      setup_type:       setupType,
      direction,
      confidence,
      final_score:      finalScore,

      // Step 1 context
      brain: {
        score:            brain.score,
        directional_bias: brain.directional_bias,
        regime:           brain.regime,
        event_type:       brain.event_type,
        signal_types:     brain.signal_types ?? [],
        ltp_at_emit:      brain.ltp_at_emit ?? null,
      },

      // Step 2 market activity
      trigger: {
        primary:          trigger.primary_trigger,
        all_triggers:     trigger.triggers ?? [],
        strength:         trigger.strength,
        signal_intensity: trigger.signal_intensity,
        trend_context:    trigger.trend_context,
        triggered_at:     trigger.triggered_at,
        age_min:          +(ageMs / 60000).toFixed(1),
      },

      // Live price context (from Step 2)
      price: {
        ltp:                  trigger.price?.ltp ?? null,
        change_from_open_pct: trigger.price?.change_from_open_pct ?? null,
        vwap:                 trigger.price?.vwap ?? null,
        above_vwap:           trigger.price?.above_vwap ?? null,
        or_high:              trigger.breakout?.or_high ?? null,
        or_low:               trigger.breakout?.or_low  ?? null,
      },

      // Volume context
      volume: {
        current:      trigger.volume?.current ?? null,
        volume_ratio: trigger.volume?.volume_ratio ?? null,
      },

      // Scoring breakdown (for transparency)
      score_breakdown: {
        brain_norm:    +(Math.min(1, (brain.score ?? 0) / 10)).toFixed(3),
        strength_sc:   STRENGTH_SCORE[trigger.strength] ?? 0.4,
        intensity_sc:  INTENSITY_SCORE[Math.min(3, trigger.signal_intensity ?? 1)] ?? 0.4,
        align_mult:    alignMult,
        weights:       { brain: W_BRAIN, strength: W_STRENGTH, intensity: W_INTENSITY },
      },
    });
  }

  // ── Step 8: Output constraint ─────────────────────────────────────────────
  // Sort by final_score desc, then signal_intensity desc as tiebreaker
  opportunities.sort((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    return (b.trigger.signal_intensity ?? 0) - (a.trigger.signal_intensity ?? 0);
  });

  // Keep only top MAX_RESULTS (all should already be >= MIN_SCORE from filter above)
  const topOpportunities = opportunities.slice(0, MAX_RESULTS);

  return {
    opportunities: topOpportunities,
    rejected,
    meta: {
      total_brain:    brainMap.size,
      total_triggers: triggerMap.size,
      intersected:    intersectedSymbols.length,
      passed:         topOpportunities.length,
      dropped_by_filter: opportunities.length - topOpportunities.length,
      min_score_threshold: MIN_SCORE,
      freshness_window_min: FRESHNESS_WINDOW_MS / 60000,
      cycle_at: new Date().toISOString(),
    },
  };
}
