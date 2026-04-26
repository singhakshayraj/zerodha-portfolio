# Product Design Document
## Zerodha Portfolio Intelligence Platform

**Owner:** Akshay Singh  
**Status:** Active — iterative development  
**Last Updated:** 2026-04-26  
**Deployment:** Vercel (Hobby) + Supabase + GitHub Actions

---

## 1. Product Vision

A private, single-user trading intelligence platform built on top of a Zerodha (Kite) account. The goal is not to replace judgment — it is to surface context, structure decisions, and capture outcomes that compound into better judgment over time. Every feature either saves time during market hours or improves the quality of a trade decision. Nothing decorative ships.

---

## 2. Users

Single user (Akshay). No multi-tenancy, no auth beyond a password gate on the dashboard. All infrastructure decisions — Vercel Hobby plan, Supabase free tier, no SDK dependencies in API routes — are made to keep the app free or near-free to run indefinitely.

---

## 3. System Architecture

```
Browser
  │
  ├── dashboard/index.html          Portfolio overview + holdings
  ├── dashboard/intraday.html       Live intraday scanner
  ├── dashboard/research.html       Research desk (AI stock analysis)
  ├── dashboard/trades.html         Trade journal
  ├── dashboard/connect.html        Kite login / enctoken capture
  └── reports/daily/YYYY-MM-DD.html Auto-generated daily report (read-only)

  ↓ fetch()

Vercel Serverless (4 API routers — Hobby plan hard limit)
  ├── api/intel.js     Brain picks, trade plans, stock analysis, outcome recording
  ├── api/kite.js      Holdings, margins, positions, LTP (proxied Kite calls)
  ├── api/orders.js    Place, modify, cancel orders; GTTs
  └── api/research.js  NSE quotes, bulk LTP for watchlist

  ↓ reads/writes

  ├── Supabase (PostgreSQL)         Persistent store — trades, snapshots, brain picks, outcomes
  ├── /tmp cache (Vercel Lambda)    In-process cache for brain result, NSE cookies, history
  └── Google News RSS               Article source for Market Brain (no paid APIs)

Async / Scheduled
  ├── GitHub Actions (daily)        Generates reports/daily/YYYY-MM-DD.html, updates index.html
  ├── GitHub Actions (weekly)       Retrains alpha scorer ML model
  └── modules/alpha-scorer/         Python FastAPI service — ML alpha scores across NSE universe
```

**Key constraint:** Vercel Hobby plan allows exactly 4 serverless functions. All intelligence features route through `api/intel.js` via `?action=` parameters. No new API files will be created.

---

## 4. Feature Inventory

### 4.1 Portfolio Dashboard (`dashboard/index.html`)

The main daily-use view. Loaded with `enctoken` from `localStorage` (captured via `connect.html`).

**Sections:**
- **Summary cards** — Total invested, current value, total P&L (₹ and %), day P&L
- **Holdings grid** — Per-stock: symbol, sector, qty, avg price, LTP, P&L (₹ and %), day change %, AI signal badge
- **History table** — Links to each past daily HTML report
- **Portfolio chart** — Value over time from `data/history.json`
- **AI signal card** — Market Brain summary: regime, top picks, macro risk, GIFT Nifty bias, VIX state

**Live data:** Holdings and margins fetched from `api/kite.js` on load. LTP refreshed periodically.

---

### 4.2 Intraday Scanner (`dashboard/intraday.html`)

Active during market hours. Fetches live quotes for a configured watchlist and surfaces signals.

**Signals per stock:**
- ATR-14, RSI-14, MACD (12/26/9), Bollinger Bands (20, 2σ), Supertrend (10, 3), EMA cross (20/50)
- Support/Resistance (last 10 candles), Pivot Points (classic, yesterday OHLC)
- Candlestick patterns (Doji, Hammer, Shooting Star, Bull/Bear Engulfing, Morning/Evening Star)
- Volume trigger (price >1% AND volume >1.5× 10-day avg)

**Source:** `dashboard/lib/indicators.js` — pure math, no external calls. Candles from NSE history via `dashboard/lib/plan.js`.

---

### 4.3 Research Desk (`dashboard/research.html`)

On-demand AI analysis for any Indian stock or company name.

**Flow:** User types a company → `POST /api/intel?action=analyze` → `dashboard/lib/llm.js` → Groq (llama-3.3-70b, primary) → Gemini (fallback on rate limit) → JSON result with: symbol, sector, AI score (0–100), verdict (Buy/Hold/Sell/Review), bull/bear cases, key ratios, red flags, buy price, sell price, summary.

---

### 4.4 Trade Journal (`dashboard/trades.html`)

Structured journal for every trade taken. Records the full decision context, not just execution.

**Per trade:** symbol, exchange, sector, side (BUY/SELL), entry, target, stop-loss, qty, capital at risk, risk ₹, reward ₹, R:R ratio, factors (jsonb — why the trade was taken), source, confidence, score, status (open/closed/cancelled), P&L, exit price, exit reason, opened_at, closed_at.

**Persistence:** `trades` table in Supabase. Functions in `dashboard/lib/supabase.js`.

---

### 4.5 Adaptive Trade Plan Engine (`dashboard/lib/plan.js`)

On-demand trade plan for any symbol + LTP. Called via `POST /api/intel?action=plan`.

**7-factor sizing model:**
1. ATR-14 from 14-day NSE candle history (real range, not single-day H-L)
2. India VIX (from NSE)
3. Sector beta (hardcoded table, 20 sectors)
4. AI confidence (from brain pick or analyze result)
5. Market trend (EMA cross signal from history)
6. Day-of-week modifier (Monday/Friday ±5%)
7. Time-of-day modifier (first/last 30 min ±8%)

**Risk constraint:** Position risk capped at 2% of portfolio value. Open trade count reduces available risk budget proportionally.

**Output:** entry, stop-loss, target, qty, position size ₹, R:R, sizing rationale, all 9 technical indicator values, candlestick pattern, volume trigger status, pivot points.

---

### 4.6 Market Brain — Context Intelligence Engine (`dashboard/lib/brain.js`)

The most architecturally significant component. Produces the daily context layer: which stocks have signal momentum, what the market regime is, and which signals are evidence-backed vs noise.

#### Pipeline

```
Google News RSS (21 sources)
    ↓ fetchNewsItems()
Articles array (oldest → newest, with source metadata attached)
    ↓ extractWithLLM()   ← Groq llama-3.3-70b, Gemini fallback
Structured extractions: { symbol, company, sentiment, event_type, reason, key_risk, ... }
+ market_context: { market_sentiment, macro_risk, gift_nifty_bias, vix_state, regime, ... }
    ↓ DATA QUALITY GUARD (drop rate >70% or missing event_type >85% → null → stale cache)
    ↓ scoreAndRank()   ← fully deterministic, no LLM involvement
Scored, filtered, ranked picks
    ↓ persistPicks()   ← async, non-blocking
brain_picks table (Supabase)
```

#### Source Registry (21 sources)

Each source carries: `signal_type`, `sentiment_bias`, `reliability_score` (1–10), `dynamic_weight`, `max_age_hours`, `baseline_rate` (expected article density).

Signal types and their weights (bounded 0.80–1.20):

| Signal Type | Weight | Examples |
|---|---|---|
| `smart_money` | 1.20 | Vijay Kedia, Basant Maheshwari, Deepak Shenoy, Mitesh Engineer, Porinju Veliyath |
| `institutional_flow` | 1.15 | FII/DII net flows, bulk/block deals (NSE), insider buying |
| `market_direction` | 1.10 | GIFT Nifty, India VIX, SGX Nifty gap analysis |
| `negative_events` | 1.10 | SEBI actions, promoter pledging, corporate governance |
| `derivatives` | 1.05 | F&O OI changes, PCR, max pain levels |
| `macro` | 0.00 | RBI, Fed, GDP — structural only, never per-stock |
| `media` | 0.80 | ET Markets, Moneycontrol, Business Standard, Mint |

#### Scoring Formula (per article, then aggregated)

```
contribution = typeWeight × blendedReliability × recencyDecay × noveltyWeight × baselineNorm × sentimentAlign
             (capped at PER_ARTICLE_CAP = 2.5 before accumulation)

score = Σ(contributions) × mismatchPenalty × eventStrength × consensus × symConfidence × sectorMod × timingMod
      → applyRegimeCap(score, directionalBias, regime)
      → min(|score|, FINAL_SCORE_CAP=8.0) × sign
```

**Key design choices:**

- **LLM extracts only.** No score, no rank, no weight is assigned by the model. It returns symbols, companies, event types, sentiments, reasons. All math is deterministic Python-equivalent JS.
- **Continuous recency decay.** Exponential decay with per-type half-lives: derivatives=4h, market_direction=6h, institutional_flow/negative_events=18h, media=12h, smart_money=36h, macro=∞.
- **Novelty clustering.** Articles sorted oldest-to-newest. Later articles in the same Jaccard-trigram cluster within a per-type time window get fractional weight. Same outlet family within a cluster → additional 0.5× penalty. Prevents story repetition from inflating scores.
- **Baseline normalization.** `1 / baselineRate`, floored at 0.15, capped at 2.5×. Lets rare signals (block deal, reliability=0.15/day) compete against high-volume media without being drowned.
- **Consensus on deduped tuples.** Consensus computed on `(outletFamily, signal_type)` pairs — not raw article count. Log-capped source base, type-diversity bonus (≤1.4×), only the single highest cross-type bonus (smart+derivatives=1.40×), outlet-family concentration penalty if one family >40%. Total capped at 4.0×.
- **Directional bias separated.** `deriveDirectionalBias()` resolves long/short/neutral from event_type direction vs LLM sentiment label. Conflict → `direction_conflict: true` in score_factors + 0.90× mismatch penalty.
- **Market regime engine.** Derived from macro_risk × GIFT Nifty bias × VIX state → {strong_bull, bull, neutral, bear, strong_bear}. Bullish events discounted in bear regimes; regime caps applied multiplicatively (strong_bear long → ×0.25, strong_bear short → ×1.35).
- **Macro as structural only.** `SIGNAL_TYPE_WEIGHTS.macro = 0.00`. Macro articles inform regime derivation but never directly boost individual stock scores.

#### Hard Filters (in order)

1. **Symbol confidence drop** — below `CONFIDENCE_DROP_THRESHOLD=0.60` → excluded before scoring
2. **Evidence gate** — must have ≥2 distinct outlet families OR a `HIGH_STRENGTH_EVENT` (earnings_beat/miss, block_deal, sebi_action) + ≥2 mentions total
3. **Score floor** — `|score| < SCORE_FLOOR=0.50` → dropped from ranked output

#### Audit Trail

Every emitted pick carries `score_factors`: event_type, event_strength (versioned v1.1), consensus, sym_confidence, mismatch_penalty, sector_mod (applied once, never compounded), timing_mod, direction_conflict, regime, regime_cap_applied, event_strength_version, per-article contribution breakdowns.

---

### 4.7 Self-Evaluation and Adaptive Calibration Layer (`dashboard/lib/outcomes.js`)

Closes the loop between signal generation and real-world outcomes. Runs entirely non-blocking — never delays the brain response.

#### Supabase Tables

| Table | Purpose |
|---|---|
| `brain_picks` | Every emitted pick: full score_factors, regime, bias, LTP at emit, windows_pending list |
| `brain_outcomes` | Realized metrics at each eval window: return_pct, direction_correct, MAE |
| `brain_source_stats` | Rolling aggregates per segment: win_rate, avg_return, avg_drawdown, sample_size |

#### Evaluation Windows

`30min`, `1hr`, `eod` (375 min from open). `recordOutcomes()` runs on each brain refresh, checks which picks have passed their windows, fetches current LTP via caller-supplied function, records realized metrics. `direction_correct` is null for neutral-bias picks (excluded from win-rate).

#### Calibration Loop

`refreshSourceStats()` aggregates `brain_outcomes` (last 90 days, EOD window as canonical) into two segment types:
- `source::ET Markets` — per-source reliability, collapsed across regime/event
- `type::smart_money::block_deal::bear` — per signal_type × event_type × regime combo

Minimum 5 samples before a segment is written. On the next brain cycle, `fetchCalibration()` loads these stats and `blendedReliability(priorScore, win_rate, sample_size)` blends the prior `reliability_score` toward observed performance — weight of observed rate increases with sample size, dominates above ~100 samples.

#### Monitoring Output (`_monitor` in brain result)

Every brain API response includes:
```json
{
  "coverage_pct": 45.2,
  "total_extractions": 67,
  "discard_reasons": { "low_confidence": 8, "evidence_gate": 12, "score_floor": 5 },
  "signal_distribution": { "smart_money": 12, "media": 31, "derivatives": 8, ... },
  "calibration_segments": 43,
  "calibration_active": true
}
```

---

### 4.8 Alpha Scorer (`modules/alpha-scorer/`)

Python FastAPI service. Runs as a separate process (local or Docker). Scores the NSE universe using a trained scikit-learn model (`model.pkl`). Outputs `scores.json` and `report.html`.

Weekly retraining via GitHub Actions (`.github/workflows/weekly-retrain.yml`). Inputs: NSE price/volume/fundamental data. Not yet integrated into the main dashboard scoring — planned as a signal layer feeding into `smart_money` or `institutional_flow` type weights.

---

### 4.9 Daily Report Generator (`modules/daily-report/`)

Node.js script (`generate.js`) run by GitHub Actions daily (`.github/workflows/daily-report.yml`). Reads portfolio data, fetches live prices, generates `reports/daily/YYYY-MM-DD.html` in a dark-theme template matching the existing report style.

**Report sections:** Summary cards, sector allocation grid, full holdings table (with vs-previous-day column), action plan. Output linked from `dashboard/index.html` history table.

---

## 5. Data Layer

### Supabase Tables

| Table | Description |
|---|---|
| `trades` | Trade journal — full decision context per trade |
| `portfolio_snapshots` | Daily snapshot: invested, value, P&L, holdings array |
| `brain_cache` | Single-row (id=1) brain result cache with 30-min TTL |
| `brain_picks` | Emitted picks per brain cycle with audit trail |
| `brain_outcomes` | Realized return/direction metrics per pick per eval window |
| `brain_source_stats` | Rolling calibration stats per source/signal_type/event_type/regime |

RLS disabled on all tables. Single-user app, password-gated dashboard.

### Local / Lambda Stores

| Store | Location | TTL | Content |
|---|---|---|---|
| Brain cache | `/tmp/brain-cache.json` | 30 min fresh, 4 hr stale | Full brain result |
| NSE cookie | Lambda in-memory | 8 min | NSE session cookie |
| Candle history | Lambda in-memory Map | 1 hr | 14-day OHLCV per symbol |

---

## 6. LLM Stack

| Provider | Model | Role | Fallback |
|---|---|---|---|
| Groq | llama-3.3-70b | Brain extraction, stock analysis | → Gemini |
| Google Gemini | gemini-2.0-flash | Brain extraction fallback | → error |
| Anthropic Claude | claude-3-5-sonnet | Stock analysis fallback | → error |

LLM is always extract-only in the brain pipeline. No scores, no rankings. The backend scorer owns all math.

---

## 7. Environment Variables

| Variable | Used By |
|---|---|
| `SUPABASE_URL` | All Supabase calls |
| `SUPABASE_ANON_KEY` | All Supabase calls |
| `GROQ_API_KEY` | Brain extraction, stock analysis |
| `GEMINI_API_KEY` | Brain fallback |
| `ANTHROPIC_API_KEY` | Analysis fallback |
| `UPSTASH_REDIS_URL` | Redis cache layer (optional — app works without it) |
| `UPSTASH_REDIS_TOKEN` | Redis cache layer (optional) |
| `KITE_API_KEY` | Kite enctoken auth (optional — enctoken stored client-side) |

---

## 8. Design Principles

1. **Determinism over vibes.** The LLM produces structure; the backend produces scores. These two roles never blur. Every score can be reproduced from its `score_factors` audit trail.

2. **Graceful degradation everywhere.** Redis down → in-memory cache. Supabase down → `/tmp` cache. LLM fails → Groq → Gemini fallback chain. Data quality guard fails → stale cache, not empty output. The app never hard-fails during market hours.

3. **No new API files.** Vercel Hobby plan = 4 functions. Every new server-side feature is a new `?action=` parameter on an existing router, not a new file.

4. **Bounded multipliers.** Every factor in the scoring formula has an explicit floor and ceiling. No single factor can dominate the output. This is enforced in code, not just convention.

5. **Non-blocking outcomes.** The calibration loop (persist, record, aggregate) runs entirely with `.catch(() => {})`. It never delays a response and never throws into the main flow.

6. **Data-dense, not cluttered.** Dark theme. Numbers above prose. Every pixel earns its place. The dashboard is read during market hours — cognitive load is the enemy.

---

## 9. Planned / In Progress

| Feature | Status | Notes |
|---|---|---|
| Redis/Upstash caching layer | Planned | Needs Upstash account. Cache keys: llm:analysis, nse:history, plan:SYMBOL, kite:holdings, kite:margins |
| Alpha scorer → brain integration | Planned | Feed ML scores as `smart_money` signal type with reliability tied to model accuracy |
| `record_outcome` client trigger | Planned | Dashboard calls `POST /api/intel?action=record_outcome` with live ltpMap when user opens brain panel |
| Calibration visualization | Planned | Small table in dashboard showing top/bottom performing sources by win_rate |
| Event-type level calibration | Planned | Extend `brain_source_stats` segments to carry event_type × regime dimension for finer-grained blending |

---

## 10. File Map

```
/
├── api/
│   ├── intel.js          Brain, trade plan, stock analysis, outcome recording
│   ├── kite.js           Holdings, margins, positions, LTP proxy
│   ├── orders.js         Order placement, GTTs
│   └── research.js       NSE quotes, bulk LTP
├── dashboard/
│   ├── index.html        Portfolio overview
│   ├── intraday.html     Live intraday scanner
│   ├── research.html     Research desk
│   ├── trades.html       Trade journal
│   ├── connect.html      Kite login
│   ├── config.js         LLM keys, model names, app config
│   ├── server.js         Local dev server
│   └── lib/
│       ├── brain.js      Market Brain — signal intelligence engine
│       ├── outcomes.js   Self-evaluation and calibration loop
│       ├── indicators.js Technical indicators (ATR, RSI, MACD, BB, ST, EMA, S/R, pivots, patterns)
│       ├── plan.js       Adaptive trade plan engine
│       ├── kite.js       Kite API client (holdings, margins, history)
│       ├── llm.js        Stock analysis LLM wrapper
│       └── supabase.js   Supabase REST client (no SDK)
├── modules/
│   ├── alpha-scorer/     Python FastAPI ML alpha scorer
│   └── daily-report/     Daily HTML report generator
├── config/
│   └── sectors.json      Symbol → sector mapping
├── data/
│   ├── history.json      Portfolio value history (time series)
│   └── trades.json       Local trade backup
├── reports/
│   └── daily/            Auto-generated daily HTML reports
├── supabase-schema.sql   Full schema (run in Supabase SQL Editor)
├── vercel.json           Vercel routing config
└── PRODUCT_DESIGN_DOCUMENT.md   This file
```
