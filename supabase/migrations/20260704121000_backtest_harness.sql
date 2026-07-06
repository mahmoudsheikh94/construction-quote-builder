-- Phase A: backtest harness. Three service-role/CLI tables (written and read
-- only by serviceClient — no UI). Follows the service-role table convention:
-- base grants to the Data API roles, then revoke from anon. No RLS policies.

create table golden_cases (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  project_type text not null check (project_type in
    ('civil','mep','architectural','labs','hospital','infrastructure')),
  input_path text not null,               -- pipeline input; repo-root-relative path
  priced_path text,                       -- priced-truth doc; NULL iff truth_source='none'
  profile_slug text not null,
  project_id uuid references projects(id), -- set for built jobs (Phase-D outturn bridge)
  truth_source text not null check (truth_source in ('priced-tender','actual-outturn','none')),
  created_at timestamptz default now(),
  check ((truth_source = 'none') = (priced_path is null))  -- priced_path present iff scoreable
);

create table golden_lines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  sort_order integer not null,
  item_code text,
  description_original text not null,
  unit_canonical text,
  quantity_thousandths bigint,
  truth_rate_fils bigint,                 -- from priced_path; NULL if not on the priced doc
  truth_amount_fils bigint,               -- NULL if the priced doc has no amount (never synthesized)
  trade text,                             -- resolved at build time; NULL for no-match/non-unit-rate
  truth_source text not null default 'priced-tender',
  created_at timestamptz default now()
);

create table backtest_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references golden_cases(id) on delete cascade,
  label text,
  config jsonb not null,                  -- {skillVersions, profileVersionId, overrides, asOf}
  scored_at timestamptz default now(),
  summary jsonb not null                  -- metrics in signed integer basis points
);

-- Service-role table convention (roadmap §7.3): local `db reset` runs as `postgres`;
-- the Data API roles need the explicit grant. service_role has rolbypassrls.
grant all on golden_cases, golden_lines, backtest_runs to postgres, anon, authenticated, service_role;
revoke all on golden_cases, golden_lines, backtest_runs from anon;
