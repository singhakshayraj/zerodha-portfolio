# Skill: Event Plays Page

**Trigger phrases:** "add a new event", "build event plays for [event]", "create event-driven page", "add event to event plays", "new market event"  
**Skill file:** `skills/event-plays/skill.md`  
**Last updated:** 2026-04-29

---

## What This Skill Does

Guides adding new market events to the Event Plays page (`/event`). The framework is reusable — elections, budgets, RBI policy, F&O expiry, earnings season, index rebalancing — any high-impact event where historical patterns predict sector/stock movement.

The page (`dashboard/event.html`) pulls data from `GET /api/intel?action=event_plays&scenario=<scenario>`, which calls `dashboard/lib/eventplays.js`. Adding a new event = updating `eventplays.js` only. No new API files, no page changes (unless a new UI section is needed).

---

## Architecture Overview

```
/event (dashboard/event.html)
    │
    └── GET /api/intel?action=event_plays&scenario={scenario}
            │
            ├── getActiveEvent()      — picks soonest upcoming event from UPCOMING_EVENTS[]
            ├── getBrainCache()       — reads 30-min brain cache (Supabase)
            │                           if warm → boosts stocks where brain has a matching pick
            └── getEventPlays(brain, scenario)
                    │
                    ├── SCENARIO_PLAYS[scenario].sectors[0..2]  — top 3 sectors, curated
                    ├── brainPickMap                            — { symbol → brainPick }
                    └── per stock: final_score = avg_move + (brainPick.score * 2)
                        → flatten → sort by |final_score| → top 10
```

**Response shape:**
```json
{
  "scenario": "nda_strong",
  "scenario_label": "NDA Strong Win (300+ seats)",
  "bias": "bullish",
  "market_tone": "PSU/infra/defense rally. Private sector neutral.",
  "top3Sectors": [ { "name", "avg_move", "confidence", "rationale", "stocks": [...] } ],
  "top10": [ { "symbol", "name", "sector", "avg_move", "brain_pick", "conviction", "final_score" } ],
  "historical_events": [...],
  "active_event": { "id", "name", "date", "description", "note", "scenarios" },
  "brain_context": { "sentiment", "regime", "vix_state", "gift_nifty_bias" },
  "meta": { "total_stocks_evaluated", "brain_aligned", "brain_picks_total", "generated_at" }
}
```

---

## Key Files

| File | Role |
|---|---|
| `dashboard/lib/eventplays.js` | **All event data lives here.** UPCOMING_EVENTS, HISTORICAL_EVENTS, SCENARIO_PLAYS, getEventPlays(), getActiveEvent() |
| `dashboard/event.html` | Page UI — reads API, renders all sections. No logic except rendering. |
| `api/intel.js` | Router — `event_plays` action (lines ~194–223). Reads brain cache, calls getEventPlays(). |
| `vercel.json` | `/event` → `dashboard/event.html` rewrite |

---

## How to Add a New Event

### Step 1 — Add to `UPCOMING_EVENTS` in `eventplays.js`

```javascript
export const UPCOMING_EVENTS = [
  // existing events…
  {
    id: 'union_budget_2027',          // unique ID, kebab-case
    type: 'union_budget',             // event type slug
    name: 'Union Budget 2027',        // display name
    date: '2027-02-01',               // ISO date — event day
    description: 'Annual Union Budget. Sector allocations drive sector-specific plays.',
    note: 'Market open 9:15 AM. Budget speech typically starts 11 AM.',
    scenarios: ['pro_growth', 'fiscal_consolidation', 'populist'],
    default_scenario: 'pro_growth'
  }
];
```

`getActiveEvent()` auto-picks the soonest future event. No other change needed to surface it on the page.

---

### Step 2 — Add historical precedents to `HISTORICAL_EVENTS`

```javascript
export const HISTORICAL_EVENTS = [
  // existing entries…
  {
    year: 2023,
    type: 'union_budget',            // matches event type
    outcome: 'Capex-heavy budget, infra focus',
    nifty_change: +0.8,
    notes: 'NIFTY flat on day. Infrastructure, defense, railways outperformed.',
    sector_moves: {
      'Infrastructure': +4,
      'Defense': +3,
      'Railways': +5,
      'FMCG': -1
    }
    // optional: recovery_3d: +2.0
  }
];
```

The historical table on the page renders ALL events, filtered to the current event type automatically when you add a `type` field matching the event.

> **Note:** The page currently renders all historical events regardless of type. If you want per-event filtering, add a `type` filter in `renderHistorical()` in `event.html`. Not needed until 3+ event types exist.

---

### Step 3 — Add scenarios to `SCENARIO_PLAYS`

Each new event needs its own scenario keys in `SCENARIO_PLAYS`. Follow this structure exactly:

```javascript
export const SCENARIO_PLAYS = {
  // Existing election scenarios…

  // ── Union Budget scenarios ──────────────────────────────────────────────
  pro_growth: {
    label: 'Pro-Growth Budget (High Capex)',
    bias: 'bullish',                 // 'bullish' | 'bearish' | 'mixed'
    market_tone: 'Infrastructure, defense, railways outperform. Consumption neutral.',
    sectors: [
      {
        name: 'Infrastructure',
        avg_move: 8,                  // percentage, signed (+/-). Use historical avg.
        confidence: 'high',          // 'high' | 'medium' | 'low'
        rationale: 'Direct capex beneficiary. Road, port, airport allocation.',
        stocks: [
          { symbol: 'LT',       name: 'Larsen & Toubro',   avg_move: 7 },
          { symbol: 'IRCON',    name: 'IRCON International',avg_move: 9 },
          { symbol: 'NBCC',     name: 'NBCC India',         avg_move: 10 },
          { symbol: 'ENGINERSIN',name: 'Engineers India',   avg_move: 8 },
          { symbol: 'HUDCO',    name: 'HUDCO',              avg_move: 9 }
        ]
      },
      {
        name: 'Defense',
        avg_move: 6, confidence: 'medium',
        rationale: 'Defense budget typically grows 8-10% YoY in capex-heavy budgets.',
        stocks: [
          { symbol: 'HAL',  name: 'Hindustan Aeronautics', avg_move: 8 },
          { symbol: 'BEL',  name: 'Bharat Electronics',    avg_move: 6 },
          { symbol: 'BEML', name: 'BEML Ltd',              avg_move: 7 }
        ]
      },
      {
        name: 'Railways',
        avg_move: 10, confidence: 'high',
        rationale: 'Rail capex budget line item. Directly impacts RVNL, IRFC orderbooks.',
        stocks: [
          { symbol: 'RVNL',    name: 'Rail Vikas Nigam',    avg_move: 12 },
          { symbol: 'IRFC',    name: 'IRFC',                avg_move: 9  },
          { symbol: 'TITAGARH',name: 'Titagarh Rail',       avg_move: 11 }
        ]
      }
    ]
  },

  fiscal_consolidation: {
    label: 'Fiscal Consolidation (Low Deficit Target)',
    bias: 'mixed',
    market_tone: 'Bonds rally, rates fall expectation. Equities mixed. Infra defers.',
    sectors: [ /* ... */ ]
  },

  populist: {
    label: 'Populist Budget (Welfare-Heavy)',
    bias: 'mixed',
    market_tone: 'FMCG, rural consumption, fertilizers outperform. Capex stocks underperform.',
    sectors: [ /* ... */ ]
  }
};
```

**Sector count:** Always provide at least 3 sectors per scenario. `getEventPlays()` slices `sectors.slice(0,3)` — extra sectors are ignored but are good documentation.

**Stock count per sector:** 4–6 stocks ideal. More than 6 is fine but only top 4 render in sector cards.

---

## Composite Scoring — 3 Factors

Scores are computed in two phases:

### Phase 1 — Static (server-side, instant)
`computeCompositeScore(avg_move, brainScore, llmScore=null)` in `eventplays.js`:

```
hist_norm  = clamp(|avg_move| / 25, 0, 1) * 10   // 25% move = score 10
llm_norm   = llmScore ?? hist_norm                 // fallback to hist if AI not yet run
brain_norm = brainPick?.score ?? 0                 // 0-10 from brain pipeline

raw = (hist_norm * 0.40) + (llm_norm * 0.35) + (brain_norm * 0.25)
final_score = sign(avg_move) * raw                 // preserves direction
```

**Weights:**
| Factor | Weight | Source | Notes |
|---|---|---|---|
| Historical (H) | **40%** | `avg_move` in SCENARIO_PLAYS | curated from past election data |
| AI Event Score (AI) | **35%** | `analyzeEventStocks()` LLM call | groq llama-3.3-70b → gemini fallback |
| Brain Pick (B) | **25%** | `getBrainCache()` Supabase | 0 if no active brain pick for symbol |

**Displayed in table header as: `H40·AI35·B25`**

### Phase 2 — Async LLM enrichment (client-side, ~2-4s after page load)
`enrichWithLLM(data, scenario)` in `event.html`:

1. Collects top 10 symbols from rendered picks table
2. POSTs to `POST /api/intel?action=event_stock_analysis` with:
   - `symbols[]` — top 10 NSE symbols
   - `event_context` — from `SCENARIO_PLAYS[scenario].event_context` (full narrative string)
   - `scenario_label` — display label
3. Groq (llama-3.3-70b) → ONE call for all symbols → returns per-symbol `{ event_score, verdict, reason }`
4. Client recomputes `compositeScore(avg_move, brainScore, event_score)` per stock
5. Updates score cells + AI Analysis column in-place (no page reload)

**When AI unavailable:** Phase 1 score persists. LLM column shows `—`. Page fully functional.

### Brain Boost Mechanics

Brain score range: 0–10. A stock with `avg_move: 14` and `brain.score: 8` at 25% weight:
```
hist_norm  = 14/25 * 10 = 5.6
llm_norm   = (assume AI scores 8) → 8
brain_norm = 8
raw = (5.6*0.40) + (8*0.35) + (8*0.25) = 2.24 + 2.80 + 2.00 = 7.04
```

vs same stock without brain pick:
```
raw = (5.6*0.40) + (8*0.35) + (0*0.25) = 2.24 + 2.80 + 0.00 = 5.04
```

Brain pick = +2 points on composite (significant enough to change rank). **Direction never changes.**

---

## Scoring Rules

| Rule | Implementation |
|---|---|
| Ranked by `|final_score|` not `final_score` | `Math.abs(b.composite_score) - Math.abs(a.composite_score)` |
| Only top 3 sectors used | `plays.sectors.slice(0, 3)` — order = priority |
| Top 10 stocks cross-sector | Flatten all 3 sectors → sort → slice 10. No per-sector quota. |
| Conviction = 'high' if brain_pick | Else inherits sector confidence ('high' → 'medium', others → 'low') |
| LLM fallback | If `llmScore === null`, hist_norm used as llm_norm (conservative, no artificial boost) |

---

## Adding a New Scenario Tab (UI)

When a new event has different scenario names, update the scenario tabs in `dashboard/event.html`:

```html
<!-- Find this block and add/replace buttons -->
<div class="scenario-tabs" id="scenarioTabs">
  <button class="scenario-tab active" data-scenario="pro_growth"
    onclick="switchScenario('pro_growth',this)">Pro-Growth Budget</button>
  <button class="scenario-tab" data-scenario="fiscal_consolidation"
    onclick="switchScenario('fiscal_consolidation',this)">Fiscal Consolidation</button>
  <button class="scenario-tab" data-scenario="populist"
    onclick="switchScenario('populist',this)">Populist / Welfare</button>
</div>
```

The `bearish` and `mixed` CSS classes on `.scenario-tab.active` control tab color:
- `bias: 'bullish'` → blue (default)
- `bias: 'mixed'` → add class `mixed` → gold
- `bias: 'bearish'` → add class `bearish` → red

The `switchScenario()` function handles this if you add the class logic:
```javascript
if (scenario === 'populist') el.classList.add('mixed');
if (scenario === 'fiscal_consolidation') el.classList.add('bearish');
```

---

## Making Event Scenarios Dynamic (Future Enhancement)

Currently the UI tabs are hardcoded for election scenarios. When a second event type is added, the page should:

1. Detect `active_event.scenarios[]` from the API response
2. Render tabs dynamically from that array
3. Map scenario key → display label from `SCENARIO_PLAYS[key].label`

Pseudocode for `renderScenarioTabs(scenarios, defaultScenario)`:
```javascript
function renderScenarioTabs(scenarios, defaultScenario) {
  const container = document.getElementById('scenarioTabs');
  container.innerHTML = scenarios.map(s => {
    const play = SCENARIO_PLAYS_CLIENT[s]; // needs client-side copy or API to return labels
    const isActive = s === defaultScenario;
    return `<button class="scenario-tab ${isActive ? 'active' : ''}" 
      data-scenario="${s}" onclick="switchScenario('${s}',this)">
      ${play?.label || s}
    </button>`;
  }).join('');
}
```

Simplest approach: have the API return `scenario_labels: { nda_strong: 'NDA Strong (300+)', ... }` and use that.

---

## Common Mistakes to Avoid

1. **New api/ file** — never. Add `event_plays` params to `api/intel.js` only. Vercel Hobby = 4 functions hard limit.
2. **Mid-file imports** — all imports at top of `api/intel.js`. No dynamic `import()` calls inside action handlers.
3. **LLM calls in getEventPlays()** — pure function, no async, no API calls. Historical data is static; brain boost comes in from outside.
4. **Missing scenario key** — `SCENARIO_PLAYS[scenario] || SCENARIO_PLAYS.nda_strong` fallback in `getEventPlays()` handles unknown scenario gracefully.
5. **Negative avg_move stocks in bullish scenario** — check your stock data. If `avg_move` is negative in an NDA-strong scenario, that stock shouldn't be in that sector's list.
6. **sectors.slice(0,3) hard limit** — getEventPlays always returns exactly 3 sectors. If you add 5 sectors to a scenario, only first 3 are used. Order = priority.

---

## Data Quality Guidelines for avg_move

- Use index-level sector ETF moves where possible, not individual stock spikes
- Average across at least 3 comparable past events (2014 + 2019 + 2024 for NDA elections)
- Round to nearest integer
- For exit polls vs actual results: exit poll avg_move ≈ 30–50% of result day move
- Include only NSE-listed, liquid mid/large cap stocks (avoid illiquid PSU smallcaps)
- Validate symbols against `config/sectors.json` — if symbol not in sectors.json, add it there too

---

## Verification Checklist

After adding a new event:

- [ ] `GET /api/intel?action=event_plays&scenario=<new_scenario>` returns 200 with top10 populated
- [ ] `active_event` in response matches the new event (check date ordering)
- [ ] Historical table shows new entries
- [ ] Sector cards show 3 sectors with rationale
- [ ] Top 10 table shows 10 rows
- [ ] Switching scenario tab changes sectors + picks
- [ ] If brain cache is warm: at least 1 stock should get ⚡ badge if brain has any relevant picks
- [ ] If brain cache is cold: page still loads with pure historical ranking (no 500 error)

---

## Event Calendar Maintenance

Remove past events from `UPCOMING_EVENTS` after results are published (keep in `HISTORICAL_EVENTS`). `getActiveEvent()` filters `date >= today` — stale events stay harmlessly invisible but clean code is better.

Suggested cron (mental note): after results day, move event from `UPCOMING_EVENTS` to `HISTORICAL_EVENTS` with actual outcome + nifty_change filled in from real data.
