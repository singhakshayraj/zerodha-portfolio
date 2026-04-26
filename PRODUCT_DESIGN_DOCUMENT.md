# Product Design Document
## Zerodha Portfolio Intelligence Platform

**Owner:** Akshay Singh  
**Status:** Active — iterative development  
**Last Updated:** 2026-04-27  
**Deployment:** Vercel (Hobby) + Supabase + Upstash Redis + GitHub Actions

---

## 1. Product Vision

A private, single-user trading intelligence platform built on top of a Zerodha (Kite) account. The goal is not to replace judgment — it is to surface context, structure decisions, and capture outcomes that compound into better judgment over time. Every feature either saves time during market hours or improves the quality of a trade decision. Nothing decorative ships.

The system is built around a four-step decision pipeline:

```
Step 1 — Market Brain       Context intelligence: which stocks have signal momentum, why
Step 2 — Trigger Engine     Real-time detection: which stocks are actually moving, how
Step 3 — Intersection Engine Filter: which stocks appear in both and agree on direction
Step 4 — Trade Plan Engine  Execution: entry, SL, targets, sizing — deterministic math only
```

Each step is independent and can run in isolation. Steps 1 and 2 produce inputs. Step 3 filters. Step 4 executes. No step makes a decision that belongs to another.

---

## 2. Users

Single user (Akshay). No multi-tenancy, no auth beyond a password gate on the dashboard. All infrastructure decisions — Vercel Hobby plan, Supabase free tier, Upstash free tier, no SDK dependencies in API routes — are made to keep the app free or near-free to run indefinitely.

---

## 3. System Architecture

```
Browser
  │
  ├── dashboard/index.html          Portfolio overview + holdings
  ├── dashboard/intraday.html       Live intraday scanner
  ├── dashboard/research.html       Research desk (AI stock analysis + triggers)
  ├── dashboard/trades.html         Trade journal
  ├── dashboard/connect.html        Kite login / enctoken capture
  └── reports/daily/YYYY-MM-DD.html Auto-generated daily report (read-only)

  ↓ fetch()

Vercel Serverless (4 API routers — Hobby plan hard limit)
  ├── api/intel.js     Brain, trade plan, stock analysis, outcomes, intersect, trade_plan
  ├── api/kite.js      Holdings, margins, positions, LTP (proxied Kite calls)
  ├── api/orders.js    Place, modify, cancel orders; GTTs
  └── api/research.js  NSE quotes, symbol search, alpha scorer proxy, trigger engine

  ↓ reads/writes

  ├── Supabase (PostgreSQL)         trades, snapshots, brain picks, outcomes, calibration stats
  ├── Upstash Redis (HTTP REST)     Trigger engine state, VWAP, baselines, adaptive curve,
  │                                 LLM analysis cache, NSE history cache, degradation log
  └── Google News RSS               Article source for Market Brain (no paid APIs)

Scheduled (Remote CCR Agents — claude.ai/code/scheduled)
  └── Daily Portfolio Report        3:33 PM IST weekdays — fetches holdings via Vercel API,
                                    computes snapshot, writes history.json, generates HTML report,
                                    updates dashboard/index.html, commits and pushes to GitHub
```

**Key constraint:** Vercel Hobby plan allows exactly 4 serverless functions. All new features route through existing routers via `?action=` parameters. No new API files will be created.

---

## 4. API Action Map

| Router | Action | Method | Purpose |
|---|---|---|---|
| `api/intel.js` | `brain` | GET | Market Brain picks (cached 30 min) |
| `api/intel.js` | `plan` | POST | Adaptive trade plan for a symbol |
| `api/intel.js` | `analyze` | POST | Individual LLM stock analysis |
| `api/intel.js` | `record_outcome` | POST | Record realized returns for brain picks |
| `api/intel.js` | `calibration_stats` | GET | Source performance stats from Supabase |
| `api/intel.js` | `intersect` | POST | Step 3: brain picks × trigger events |
| `api/intel.js` | `trade_plan` | POST | Step 4: generate executable trade plans |
| `api/research.js` | `quotes` | GET | Live NSE OHLCV for symbols |
| `api/research.js` | `symbol` | POST | Symbol search |
| `api/research.js` | `alpha` | POST | Alpha scorer proxy |
| `api/research.js` | `triggers` | GET | Step 2: NIFTY 50 trigger engine cycle |

---

## 5. Feature Inventory

### 5.1 Portfolio Dashboard (`dashboard/index.html`)

The main daily-use view. Loaded with `enctoken` from `localStorage`.

**Sections:**
- **Summary cards** — Total invested, current value, total P&L (₹ and %), day P&L
- **Holdings grid** — Per-stock: symbol, sector, qty, avg price, LTP, P&L (₹ and %), day change %, AI signal badge
- **History table** — Links to each past daily HTML report
- **Portfolio chart** — Value over time from `data/history.json`
- **AI signal card** — Market Brain summary: regime, top picks, macro risk, GIFT Nifty bias, VIX state

**Live data:** Holdings and margins fetched from `api/kite.js` on load. LTP refreshed periodically.

---

### 5.2 Intraday Scanner (`dashboard/intraday.html`)

Active during market hours. Fetches live quotes for a configured watchlist and surfaces signals.

**Signals per stock:** ATR-14, RSI-14, MACD (12/26/9), Bollinger Bands (20, 2σ), Supertrend (10, 3), EMA cross (20/50), Support/Resistance (last 10 candles), Pivot Points (classic, yesterday OHLC), Candlestick patterns (Doji, Hammer, Shooting Star, Bull/Bear Engulfing, Morning/Evening Star), Volume trigger (price >1% AND volume >1.5× 10-day avg).

**Source:** `dashboard/lib/indicators.js` — pure math, no external calls.

---

### 5.3 Research Desk (`dashboard/research.html`)

On-demand AI analysis for any Indian stock or company name, plus live trigger feed for the NIFTY 50 universe.

**Analysis flow:** User types a company → `POST /api/intel?action=analyze` → `dashboard/lib/llm.js` → Groq (llama-3.3-70b, primary) → Gemini (fallback on rate limit) → JSON result with: symbol, sector, AI score (0–100), verdict (Buy/Hold/Sell/Review), bull/bear cases, key ratios, red flags, buy price, sell price, summary.

**Trigger feed:** `GET /api/research?action=triggers&vix=normal` → Step 2 trigger engine → live NIFTY 50 movement events.

---

### 5.4 Trade Journal (`dashboard/trades.html`)

Structured journal for every trade taken. Records the full decision context, not just execution.

**Per trade:** symbol, exchange, sector, side (BUY/SELL), entry, target, stop-loss, qty, capital at risk, risk ₹, reward ₹, R:R ratio, setup_type, direction, confidence, score, factors (jsonb — full Steps 1–3 context), source, status (open/closed/cancelled), P&L, exit price, exit reason, opened_at, closed_at.

**Persistence:** `trades` table in Supabase. Auto-populated by Step 4 (`generateTradePlans()`) — every generated plan is logged immediately on creation.

---

### 5.5 Adaptive Trade Plan Engine — Legacy (`dashboard/lib/plan.js`)

On-demand trade plan for any symbol + LTP. Called via `POST /api/intel?action=plan`. Remains available as a standalone tool independent of the four-step pipeline.

**7-factor sizing model:** ATR-14, India VIX, sector beta, AI confidence, market trend, day-of-week modifier, time-of-day modifier.

**Risk constraint:** Position risk capped at 2% of portfolio value. Open trade count reduces available risk budget proportionally.

**Output:** entry, stop-loss, target, qty, position size ₹, R:R, all 9 technical indicator values, candlestick pattern, volume trigger, pivot points, price confirmation analysis.

---

## 6. Four-Step Intelligence Pipeline

The core of the platform. Steps 1 through 4 run sequentially, each consuming the previous step's output.

---

### Step 1 — Market Brain (`dashboard/lib/brain.js`)

Context intelligence layer. Produces a daily structured context: which stocks have signal momentum, what the market regime is, and which signals are evidence-backed vs noise. Exposes its output via `GET /api/intel?action=brain`.

#### Pipeline

```
Google News RSS (21 sources, grouped by signal type)
    ↓ fetchNewsItems()
Articles array (oldest → newest, source metadata attached)
    ↓ extractWithLLM()  ← Groq llama-3.3-70b, Gemini fallback
Structured extractions: { symbol, sentiment, event_type, reason, key_risk, ... }
+ market_context: { market_sentiment, macro_risk, gift_nifty_bias, vix_state, regime }
    ↓ DATA QUALITY GUARD (dropRate >70% or missingEvents >85% → null → stale cache)
    ↓ scoreAndRank()  ← fully deterministic, no LLM involvement
Scored, ranked picks
    ↓ persistPicks(), recordOutcomes(), refreshSourceStats() — all non-blocking
brain_picks, brain_outcomes, brain_source_stats tables (Supabase)
```

#### Source Registry (21 sources)

Signal types and weights (bounded 0.80–1.20):

| Signal Type | Weight | Examples |
|---|---|---|
| `smart_money` | 1.20 | Vijay Kedia, Basant Maheshwari, Deepak Shenoy, Mitesh Engineer, Porinju Veliyath |
| `institutional_flow` | 1.15 | FII/DII net flows, bulk/block deals, Goldman/JPMorgan India |
| `market_direction` | 1.10 | GIFT Nifty, India VIX, NSE 52-week breakouts |
| `negative_events` | 1.10 | SEBI actions, promoter pledging, governance alerts |
| `derivatives` | 1.05 | Nifty/BankNifty OI, stock OI buildup |
| `macro` | 0.00 | RBI, Fed, GDP — structural only, never per-stock |
| `media` | 0.80 | ET Markets, Moneycontrol, Business Standard, Mint |

#### Scoring Formula

```
contribution = typeWeight × blendedReliability × recencyDecay × noveltyWeight
             × baselineNorm × sentimentAlign
             → capped at PER_ARTICLE_CAP = 2.5

score = Σ(contributions) × mismatchPenalty × eventStrength × consensus
      × symConfidence × sectorMod × timingMod
      → applyRegimeCap(score, directionalBias, regime)
      → min(|score|, FINAL_SCORE_CAP=8.0) × sign
```

**Key design choices:**
- **LLM extracts only.** No score, no rank, no weight assigned by model. All math is deterministic.
- **Recency decay.** Exponential per type: derivatives=4h, market_direction=6h, media=12h, institutional_flow/negative_events=18h, smart_money=36h, macro=∞.
- **Novelty clustering.** Jaccard-trigram clustering. Later articles in same cluster get fractional weight. Same outlet family within cluster → 0.5× penalty.
- **Baseline normalization.** `1 / baselineRate`. Rare signals (block deal) compete fairly against high-volume media.
- **Consensus.** Computed on deduplicated `(outletFamily, signal_type)` pairs. Log-capped source base, type-diversity bonus (≤1.4×), outlet-family concentration penalty if >40%.
- **Evidence gate.** ≥2 distinct outlet families OR a HIGH_STRENGTH_EVENT + ≥2 mentions.
- **Score floor.** `|score| < 0.50` → dropped from ranked output.
- **Direction conflict.** `direction_conflict: true` + 0.90× mismatch penalty when bias contradicts event sentiment.

#### Context-Aware Calibration

VIX bucket (low/normal/high) and time bucket (opening 09:15–10:30 / midday / closing 14:00–15:30) are derived at scoring time and attached to every brain pick. `blendedReliability()` looks up the symbol's calibration segment using a 7-level hierarchical resolution: `source×vix×time → source×vix → source×time → source → type×vix → type×time → type → null (prior fallback)`. Minimum 5 samples required before a segment is trusted. 20% prior floor prevents full overfit to recent data. Stale segments (< 15 samples, not updated in 30 days) are pruned by `refreshSourceStats()`.

---

### Step 2 — Trigger Engine (`dashboard/lib/trigger.js`)

Real-time price-volume detection layer. Monitors the NIFTY 50 universe and emits structured movement events when statistically meaningful activity is detected. Invoked via `GET /api/research?action=triggers&vix=normal`. Completely independent of Step 1 — no knowledge of brain scores, LLM outputs, or signal context.

#### State Management

Five aggregate Redis keys persist all detection state across Lambda cold starts:

| Key | Content | TTL |
|---|---|---|
| `trig:vwap_all` | Incremental VWAP accumulators per symbol | 24h |
| `trig:or_all` | Opening range high/low per symbol (set once per day) | 24h |
| `trig:baseline_all` | 5-day average daily volume per symbol | 12h |
| `trig:pending_all` | Confirmation gate pending state | 24h |
| `trig:cooldown_all` | Active cooldown expiries per trigger type | 24h |

Three auxiliary Redis keys:

| Key | Content |
|---|---|
| `trig:curve_snapshots` | Volume curve recalibration snapshots (last 200) |
| `trig:degrade_log` | Degraded cycle ring buffer (last 100) |
| `trig:degrade_alert` | Proactive alert flag — degraded cycles in last 30 min |

10 Redis ops per cycle (5 GET on cold load + 5 SET on flush). All ops fire-and-forget.

#### Core Detection Components

**True incremental VWAP** — `Σ(typicalPrice × ΔVolume) / ΣΔVolume`. Three data integrity guards: negative ΔVol (skip, advance prevVolume), zero ΔVol (hold accumulator), abnormally large ΔVol >5× previous snapshot (skip, bad tick). VWAP side (above/below) persisted per symbol — crossing fires only on side flip.

**Opening range** — ORH/ORL captured during 09:15–09:30. Opening period applies dampening (price ×1.6, volume ×1.8) to suppress auction noise.

**Adaptive volume curve** — Piecewise non-linear curve reflecting NSE's U-shaped intraday volume distribution. Recalibrated from `trig:curve_snapshots` using exponential decay weighting (half-life = 50 snapshots ≈ 2.5 days). Stability guard: incoming snapshot rejected if it deviates >2.5σ from recent same-bucket entries (prevents circuit-breaker days from distorting the curve).

**Six trigger types** — `momentum`, `volume`, `breakout_high`, `breakout_low`, `vwap_reclaim`, `vwap_loss`. Each evaluated via a unified `tryTrigger(type, condition)` helper.

**VIX-adaptive thresholds** — low: 0.7%/1.3×, normal: 1.0%/1.5×, high: 1.6%/2.2× (price/volume). Expiry Thursdays: 0.85× volume factor.

**Type-sensitive confirmation gate** — Per-type confirmation windows (normal / choppy / momentum phase):

| Type | Normal | Choppy | Momentum |
|---|---|---|---|
| vwap_reclaim/loss | 6 min | 9 min | 3 min |
| breakout_high/low | 3 min | 5 min | 1 min |
| momentum | 4 min | 7 min | 2 min |
| volume | 5 min | 8 min | 3 min |

High-strength bypass (volRatio ≥ 3.0× or price ≥ 2× threshold) skips confirmation but requires: volume ≥ 200k traded + LTP-vs-prevClose jump < 4%.

**Dynamic cooldowns** — strong=6min, medium=12min, weak=20min.

**Symbol continuity check** — Rolling 8-observation history per symbol. Signals suppressed if current observation deviates >3.5σ on price or >4.0σ on volume vs its own recent history.

**Directional consistency filter** — Signals suppressed if symbol has flipped price direction ≥ 4 times in last 8 observations (choppy/oscillating conditions).

**Microstructure filter** — Three-layer check: absolute range > 5% of LTP; open-jump > 9%; relative check (current range > 2.5× symbol's own recent 2σ range from rolling history).

**State freshness check** — Triggers suppressed until ≥ 3 fresh live observations recorded this session (prevents triggering on Redis-rehydrated state).

**Cross-trigger validation** — Structural triggers (breakout, VWAP) without any participation trigger (volume, momentum) co-confirming are removed unless high-strength bypass applies.

**Per-symbol activity dampening** — Symbols triggering > 3× universe average rate in last 60 min get threshold multiplier of 1.35× applied uniformly.

**Cycle health check** — Triggers suppressed entirely if: coverage < 70% of universe OR baselines missing for > 40% of scanned symbols. Degraded cycles written to `trig:degrade_log` and `trig:degrade_alert` updated with proactive flag.

#### Output Per Event

```json
{
  "symbol": "HDFCBANK",
  "exchange": "NSE",
  "triggers": ["breakout_high", "volume"],
  "primary_trigger": "breakout_high",
  "strength": "strong",
  "signal_intensity": 2,
  "trend_context": "uptrend",
  "activity_dampened": false,
  "price": { "ltp", "open", "high", "low", "prev_close", "change_pct", "change_from_open_pct", "vwap", "above_vwap", "distance_from_high_pct", "distance_from_low_pct" },
  "volume": { "current", "volume_ratio", "avg_5d_baseline" },
  "breakout": { "state", "or_high", "or_low", "dist_from_orh_pct", "dist_from_orl_pct" },
  "meta": { "opening_period", "expiry_day", "high_strength_bypass", "cooldown_suppressed", "pending_triggers", "thresholds_used", "fresh_obs" },
  "triggered_at": "ISO timestamp"
}
```

Output sorted: strength desc → signal_intensity desc → volume_ratio desc → abs(change_from_open) desc.

---

### Step 3 — Intersection Engine (`dashboard/lib/intersect.js`)

Pure synchronous filter. Takes Step 1 brain picks and Step 2 trigger events, applies five sequential hard filters, computes a composite score, and returns a ranked shortlist of high-conviction opportunities. Exposed via `POST /api/intel?action=intersect`. No API calls, no side effects — identical inputs always produce identical outputs.

#### Filter Pipeline (in order — ambiguity always resolves to rejection)

**1. Symbol intersection** — Only symbols present in both brain picks and trigger events proceed. Eliminates stocks talked about but not moving (Step 1 only) and stocks moving without contextual backing (Step 2 only).

**2. Direction alignment** — Compares `directional_bias` (Step 1) vs `trend_context` (Step 2):

| Combination | Result | Score multiplier |
|---|---|---|
| bullish + uptrend | Pass | 1.0× |
| bearish + downtrend | Pass | 1.0× |
| neutral + any | Pass (mild penalty) | 0.9× |
| bullish + downtrend | Discard | — |
| bearish + uptrend | Discard | — |

**3. Trigger quality gate** — Structural triggers (`breakout_high/low`, `vwap_reclaim/loss`) pass unconditionally. Weak-only triggers (`volume`, `momentum`) pass only if `signal_intensity ≥ 2`.

**4. Strength filter** — `strength === 'weak'` is an immediate rejection. Only medium or strong proceed.

**5. Freshness constraint** — `triggered_at` must be within the last 15 minutes. Stale triggers are rejected with age in minutes recorded.

#### Composite Score

```
final_score = (0.60 × brain_norm) + (0.25 × strength_sc) + (0.15 × intensity_sc)
            × alignment_multiplier

brain_norm:   brain.score / 10        (0–1)
strength_sc:  strong=1.0, medium=0.7
intensity_sc: 1→0.40, 2→0.70, 3+→1.00
```

Minimum score threshold: 0.65. Maximum output: top 5.

#### Setup Classification

Combines Step 2's structural nature with Step 1's contextual character:

```
primary_trigger     →  trigger nature:  breakout | vwap_reclaim | vwap_loss | volume_surge | momentum
brain.signal_types  →  context char:    smart_money | institutional_flow | derivatives_backed
brain.event_type                         | macro_driven | earnings_catalyst | news_driven | market_direction

Output: "breakout + smart_money", "vwap_reclaim + earnings_catalyst", etc.
```

**Output:** `{ opportunities[], rejected[], meta{} }`. `rejected[]` contains every intersected symbol that failed a filter with its specific reason — the primary debugging surface.

---

### Step 4 — Trade Plan Engine (`dashboard/lib/tradeplan.js`)

Converts each Step 3 opportunity into a fully defined, risk-controlled, journal-ready trade plan. Exposed via `POST /api/intel?action=trade_plan`. Deterministic and math-driven — no LLM calls, no subjective decisions. Every generated plan is automatically logged to the Supabase `trades` table.

#### Data Assembly

`getHistory()`, `getMarketSnapshot()`, and `getPortfolioContext()` are reused from `plan.js`. Market context (VIX, Nifty change) and portfolio state (portfolio value, open trade count) are fetched once per batch invocation. A shared `historyCache` Map ensures NSE historical data is fetched at most once per symbol per cycle even across multiple opportunities. ATR-14 and RSI-14 are computed from the 20-day OHLC history.

#### Entry Logic (setup-type specific)

| Primary Trigger | Entry Rule | Buffer |
|---|---|---|
| `breakout_high` | ORH + 0.10% | Confirms continuation above breakout level |
| `breakout_low` | ORL − 0.10% | Confirms continuation below breakdown level |
| `vwap_reclaim` | VWAP + 0.05% | Confirms reclaim is holding across a live tick |
| `vwap_loss` | VWAP − 0.05% | Confirms loss is holding |
| `volume` | LTP (no buffer) | Already confirmed by Step 2 gate |
| `momentum` / default | LTP ± 0.08% | Small directional confirmation buffer |

#### Stop-Loss (wider of ATR-based vs structure-based)

**ATR-based:** `entry ± (ATR-14 × atrMultiplier(VIX))`
- VIX ≤ 14 → 1.2×, VIX ≥ 20 → 1.8×, linear interpolation between.

**Structure-based:**

| Setup | Long SL | Short SL |
|---|---|---|
| `breakout_high` | ORH − 0.15% | — |
| `breakout_low` | — | ORL + 0.15% |
| `vwap_reclaim` | VWAP − 0.15% | — |
| `vwap_loss` | — | VWAP + 0.15% |
| `momentum/volume` | Recent 5-day swing low − 0.15% | Recent 5-day swing high + 0.15% |

Always takes the **wider** (more conservative) of the two. `sl_method` field records which won.

#### Dual Targets

- **T1** — entry ± (1.5 × SL distance) — always surfaced
- **T2** — entry ± (2.5 × SL distance) — suppressed after 14:15 IST (insufficient session time)
- Primary `target` field in journal always set to T1 for schema compatibility

#### Position Sizing

```
total_risk    = portfolioValue × 2%
risk_per_slot = total_risk / (openTrades + 1)
qty           = floor(risk_per_slot / SL_distance)
capital       = clamp(qty × entry, ₹15,000, ₹50,000)
```

Fallback when Kite disconnected: ₹25,000 fixed capital.

#### Execution Filters

| Filter | Condition | Reject Reason |
|---|---|---|
| Session time | After 14:45 IST | Too late for intraday management |
| R:R floor | T1 R:R < 1.5 | Insufficient reward for risk |
| RSI overbought | RSI > 78 for long | Extended — poor continuation |
| RSI oversold | RSI < 22 for short | Extended — poor continuation |
| Entry validity | Long entry > 3% above reference high | Unreachable in practice |
| SL polarity | SL on wrong side of entry | Computation error guard |

#### Journal Logging

Every passing plan is written to Supabase `trades` with `status: 'open'` and a `factors` JSON blob containing the full Steps 1–3 context. This blob is what feeds the calibration feedback loop — once a trade closes, outcomes are correlated against the signal combination, VIX bucket, regime, session, and trigger type that produced the plan. Rejected plans are not logged.

---

## 7. Data Layer

### Supabase Tables

| Table | Description |
|---|---|
| `trades` | Trade journal — full plan with Steps 1–3 context in `factors` jsonb |
| `portfolio_snapshots` | Daily snapshot: invested, value, P&L, holdings array |
| `brain_cache` | Single-row (id=1) brain result cache with 30-min TTL |
| `brain_picks` | Every emitted pick with audit trail, vix_bucket, time_bucket |
| `brain_outcomes` | Realized return/direction metrics per pick per eval window |
| `brain_source_stats` | Rolling calibration stats per segment (7 dimension types) |

RLS disabled on all tables. Single-user app, password-gated dashboard.

### Redis Keys (Upstash)

| Key | Content | TTL |
|---|---|---|
| `trig:vwap_all` | VWAP accumulators (all symbols) | 24h |
| `trig:or_all` | Opening range (all symbols) | 24h |
| `trig:baseline_all` | 5-day avg volume (all symbols) | 12h |
| `trig:pending_all` | Confirmation pending state | 24h |
| `trig:cooldown_all` | Active cooldowns | 24h |
| `trig:curve_snapshots` | Volume curve recalibration data | 60d |
| `trig:degrade_log` | Degraded cycle ring buffer | 7d |
| `trig:degrade_alert` | Proactive alert flag | 24h |
| `llm:analysis:{slug}` | LLM stock analysis cache | 4h |
| `nse:history:{SYMBOL}` | NSE 20-day candle cache | 1h |
| `plan:{SYMBOL}:{ltp_bucket}` | Trade plan result cache | 15min |
| `kite:holdings:{token_last8}` | Holdings cache | 5min |
| `kite:margins:{token_last8}` | Margins cache | 2min |

Upstash free tier: 10,000 req/day. Estimated usage: ~600/day (10 per trigger cycle × ~20 cycles + cache ops). All ops fire-and-forget with graceful degradation if unconfigured.

---

## 8. Self-Evaluation and Calibration (`dashboard/lib/outcomes.js`)

Closes the loop between signal generation and real-world outcomes. Runs entirely non-blocking.

#### Evaluation Windows

`30min`, `1hr`, `eod` (375 min from open). `recordOutcomes()` checks which pending brain picks have passed their windows and records: `return_pct`, `direction_correct`, `mae` (max adverse excursion).

#### Calibration Segment Types

`refreshSourceStats()` aggregates outcomes (last 90 days, EOD as canonical) into 7 segment dimensions:

| Segment Key Format | Example |
|---|---|
| `source::{label}::vix::{bucket}::time::{bucket}` | Full context |
| `source::{label}::vix::{bucket}` | Source × VIX |
| `source::{label}::time::{bucket}` | Source × time |
| `source::{label}` | Source only |
| `type::{st}::{et}::{reg}::vix::{bucket}` | Type × VIX |
| `type::{st}::{et}::{reg}::time::{bucket}` | Type × time |
| `type::{st}::{et}::{reg}` | Type only |

Hierarchical resolution in `blendedReliability()`: tries each from most specific to least. Falls back to prior `reliability_score` if no segment has ≥ 5 samples. 20% prior floor prevents full overfit. Stale segments (< 15 samples, >30 days old) pruned by `refreshSourceStats()`.

#### Monitoring Output

Every brain API response includes `_monitor`:
```json
{
  "coverage_pct": 45.2,
  "total_extractions": 67,
  "discard_reasons": { "low_confidence": 8, "evidence_gate": 12, "score_floor": 5 },
  "signal_distribution": { "smart_money": 12, "media": 31, "derivatives": 8 },
  "calibration_segments": 43,
  "calibration_active": true,
  "context_bucket": { "vix": "normal", "time": "midday" }
}
```

---

## 9. LLM Stack

| Provider | Model | Role | Fallback |
|---|---|---|---|
| Groq | llama-3.3-70b | Brain extraction, stock analysis | → Gemini |
| Google Gemini | gemini-2.0-flash | Brain extraction fallback | → error |
| Anthropic Claude | claude-3-5-sonnet | Stock analysis fallback | → error |

LLM is always extract-only in the brain pipeline. No scores, no rankings. The backend scorer owns all math.

---

## 10. Scheduled Automation

### Daily Portfolio Report (claude.ai Remote CCR)

**Schedule:** 3:33 PM IST, Monday–Friday (`3 10 * * 1-5` UTC)  
**Trigger ID:** `trig_01A9dGs2pFEkvcVs8kubXdZT`

**Flow:**
1. Call `GET https://zerodha-portfolio-three.vercel.app/api/kite?action=holdings` — fetches live holdings via Vercel (enctoken stored in Vercel env vars)
2. Read `config/sectors.json` + `data/history.json`
3. Compute daily snapshot: totalInvested, currentValue, totalPnl, totalPnlPct, dayPnl, winners, losers, per-holding metrics
4. Append snapshot to `data/history.json`
5. Generate `reports/daily/YYYY-MM-DD.html` — dark theme, nav bar, summary cards, sector grid, full holdings table with vs-yesterday column, action plan
6. Update `dashboard/index.html` — cards, history table row, chart data, Updated date
7. Commit and push to GitHub (`git push`)

Fails gracefully with a clear error message if Kite enctoken is stale.

---

## 11. Environment Variables

| Variable | Used By |
|---|---|
| `SUPABASE_URL` | All Supabase calls |
| `SUPABASE_ANON_KEY` | All Supabase calls |
| `GROQ_API_KEY` | Brain extraction, stock analysis |
| `GEMINI_API_KEY` | Brain fallback |
| `ANTHROPIC_API_KEY` | Analysis fallback |
| `UPSTASH_REDIS_URL` | All Redis cache ops (optional — graceful degradation if absent) |
| `UPSTASH_REDIS_TOKEN` | All Redis cache ops (optional) |
| `ALPHA_SCORER_URL` | Alpha scorer proxy (optional) |

---

## 12. Design Principles

1. **Determinism over vibes.** The LLM produces structure; the backend produces scores. These two roles never blur. Every score can be reproduced from its `score_factors` audit trail.

2. **Graceful degradation everywhere.** Redis down → in-memory. Supabase down → tmp cache. LLM fails → Groq → Gemini fallback. Data quality guard fails → stale cache. Trigger degradation → suppressed output, logged reason. The app never hard-fails during market hours.

3. **No new API files.** Vercel Hobby plan = 4 functions. Every new server-side feature is a new `?action=` parameter on an existing router.

4. **Bounded multipliers.** Every factor in every scoring formula has an explicit floor and ceiling. No single factor can dominate output.

5. **Non-blocking outcomes.** The calibration loop runs entirely fire-and-forget. It never delays a response and never throws into the main flow.

6. **Strictness resolves to rejection.** In Steps 3 and 4, ambiguity always resolves to rejection rather than a forced pass. A partial opportunity is not an opportunity.

7. **Step isolation.** Each step of the four-step pipeline can run independently. Steps 1 and 2 have no knowledge of each other. Step 3 is a pure function. Step 4 is deterministic math with no new intelligence.

8. **Data-dense, not cluttered.** Dark theme. Numbers above prose. The dashboard is read during market hours — cognitive load is the enemy.

---

## 13. File Map

```
/
├── api/
│   ├── intel.js          Brain | plan | analyze | record_outcome | calibration_stats
│   │                     intersect | trade_plan
│   ├── kite.js           Holdings, margins, positions, LTP proxy
│   ├── orders.js         Order placement, GTTs
│   └── research.js       NSE quotes | symbol search | alpha proxy | triggers
├── dashboard/
│   ├── index.html        Portfolio overview
│   ├── intraday.html     Live intraday scanner
│   ├── research.html     Research desk + trigger feed
│   ├── trades.html       Trade journal
│   ├── connect.html      Kite login
│   ├── config.js         LLM keys, model names
│   ├── server.js         Local dev server
│   └── lib/
│       ├── brain.js      Step 1 — Market Brain (context intelligence)
│       ├── outcomes.js   Calibration — picks, outcomes, source stats
│       ├── trigger.js    Step 2 — Trigger Engine (real-time detection)
│       ├── intersect.js  Step 3 — Intersection Engine (opportunity filter)
│       ├── tradeplan.js  Step 4 — Trade Plan Engine (execution math)
│       ├── indicators.js Technical indicators (ATR, RSI, MACD, BB, ST, EMA, S/R, pivots, patterns)
│       ├── plan.js       Legacy adaptive trade plan (standalone tool)
│       ├── redis.js      Upstash HTTP wrapper (graceful degradation)
│       ├── kite.js       Kite API client (holdings, margins, history)
│       ├── llm.js        Stock analysis LLM wrapper
│       └── supabase.js   Supabase REST client (no SDK)
├── modules/
│   ├── alpha-scorer/     Python FastAPI ML alpha scorer
│   └── daily-report/     Legacy daily HTML report generator
├── config/
│   └── sectors.json      Symbol → sector mapping
├── data/
│   ├── history.json      Portfolio value history (time series)
│   └── trades.json       Local trade backup
├── reports/
│   └── daily/            Auto-generated daily HTML reports
├── supabase-schema.sql   Full schema with migrations (run in Supabase SQL Editor)
├── vercel.json           Vercel routing config
└── PRODUCT_DESIGN_DOCUMENT.md   This file
```

---

## 14. Planned / In Progress

| Feature | Status | Notes |
|---|---|---|
| Step 3+4 frontend integration | Planned | UI in research.html to call intersect → trade_plan and display opportunities |
| Alpha scorer → brain integration | Planned | Feed ML scores as `smart_money` signal type with reliability tied to model accuracy |
| `record_outcome` client trigger | Planned | Dashboard calls record_outcome with live ltpMap when user opens brain panel |
| Calibration visualization | Planned | Table in dashboard showing top/bottom performing sources by win_rate |
| Trade close automation | Planned | Hook from orders.js to update trade status + log exit reason on SL/target hit |
| Step 2 degradation alerting | Planned | Surface `trig:degrade_alert` in dashboard header when alerting=true |
