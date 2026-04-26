-- Run this in Supabase → SQL Editor

-- ── trades ────────────────────────────────────────────────────────────────────
create table if not exists trades (
  id           text primary key,
  symbol       text not null,
  exchange     text default 'NSE',
  sector       text default '',
  side         text default 'BUY',
  entry        numeric not null,
  target       numeric not null,
  sl           numeric not null,
  qty          integer not null,
  capital      numeric default 0,
  risk_rs      numeric default 0,
  reward_rs    numeric default 0,
  rr           numeric default 0,
  trigger_id   text,
  factors      jsonb default '{}',
  source       text default 'market-brain',
  confidence   numeric default 0,
  score        numeric default 0,
  status       text default 'open',   -- open | closed | cancelled
  pnl          numeric,
  exit_price   numeric,
  exit_reason  text,                  -- target | stoploss | manual
  opened_at    timestamptz default now(),
  closed_at    timestamptz
);

-- ── portfolio_snapshots ───────────────────────────────────────────────────────
create table if not exists portfolio_snapshots (
  id              bigserial primary key,
  snapshot_date   date not null unique,   -- unique so upsert works by date
  total_invested  numeric default 0,
  current_value   numeric default 0,
  total_pnl       numeric default 0,
  total_pnl_pct   numeric default 0,
  day_pnl         numeric default 0,
  winners         integer default 0,
  losers          integer default 0,
  holdings        jsonb default '[]',     -- per-holding detail array
  created_at      timestamptz default now()
);

-- ── brain_cache ───────────────────────────────────────────────────────────────
create table if not exists brain_cache (
  id         integer primary key default 1,  -- always a single row
  data       jsonb not null,
  updated_at timestamptz default now()
);

-- ── brain_picks ───────────────────────────────────────────────────────────────
-- One row per emitted pick per brain cycle. windows_pending tracks which
-- evaluation windows haven't been recorded yet.
create table if not exists brain_picks (
  id               uuid primary key default gen_random_uuid(),
  symbol           text not null,
  exchange         text default 'NSE',
  regime           text,
  directional_bias text,
  score            numeric,
  event_type       text,
  signal_types     jsonb default '[]',
  score_factors    jsonb default '{}',
  mention_count    integer default 0,
  distinct_sources integer default 0,
  ltp_at_emit      numeric,
  emitted_at       timestamptz default now(),
  windows_pending  jsonb default '["30min","1hr","eod"]'
);
create index if not exists brain_picks_emitted_at on brain_picks(emitted_at desc);
create index if not exists brain_picks_windows   on brain_picks using gin(windows_pending);

-- ── brain_outcomes ────────────────────────────────────────────────────────────
-- One row per (pick, evaluation_window). Realized return and direction accuracy.
create table if not exists brain_outcomes (
  id                uuid primary key default gen_random_uuid(),
  pick_id           uuid references brain_picks(id) on delete cascade,
  symbol            text not null,
  regime            text,
  directional_bias  text,
  event_type        text,
  signal_types      jsonb default '[]',
  score_at_emit     numeric,
  window            text not null,      -- '30min' | '1hr' | 'eod'
  ltp_at_emit       numeric,
  ltp_at_window     numeric,
  return_pct        numeric,
  direction_correct boolean,
  mae               numeric default 0,  -- max adverse excursion (approx)
  source_ids        jsonb default '[]', -- contributing sources for rollup
  recorded_at       timestamptz default now()
);
create index if not exists brain_outcomes_pick_id     on brain_outcomes(pick_id);
create index if not exists brain_outcomes_recorded_at on brain_outcomes(recorded_at desc);
create index if not exists brain_outcomes_window      on brain_outcomes(window);

-- ── brain_source_stats ────────────────────────────────────────────────────────
-- Rolling performance stats per segment (source or signal_type×event_type×regime).
-- Upserted on segment_key. Powers blendedReliability() calibration.
create table if not exists brain_source_stats (
  segment_key   text primary key,
  segment_type  text,    -- 'source' | 'signal'
  source_id     text,
  signal_type   text,
  event_type    text,
  regime        text,
  win_rate      numeric,
  avg_return    numeric,
  avg_drawdown  numeric,
  sample_size   integer default 0,
  updated_at    timestamptz default now()
);

-- Disable Row Level Security so the anon key can read/write
-- (this is a private single-user app gated by password)
alter table trades               disable row level security;
alter table portfolio_snapshots  disable row level security;
alter table brain_cache          disable row level security;
alter table brain_picks          disable row level security;
alter table brain_outcomes       disable row level security;
alter table brain_source_stats   disable row level security;
