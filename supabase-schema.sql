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

-- Disable Row Level Security so the anon key can read/write
-- (this is a private single-user app gated by password)
alter table trades               disable row level security;
alter table portfolio_snapshots  disable row level security;
alter table brain_cache          disable row level security;
