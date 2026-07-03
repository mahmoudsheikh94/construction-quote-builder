create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_type text,
  description text,
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','review','final')),
  price_snapshot jsonb,
  skill_versions jsonb,
  overrides jsonb,
  created_at timestamptz not null default now()
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  sort_order integer not null,
  item_code text,
  section_ref text not null,
  description_original text not null,
  unit_raw text,
  unit_canonical text,
  quantity_thousandths bigint check (quantity_thousandths >= 0),
  item_type text not null default 'unit_rate'
    check (item_type in ('unit_rate','provisional_sum','dayworks','lump_sum','percentage')),
  tags jsonb,
  match jsonb,
  rate_fils bigint check (rate_fils >= 0),
  amount_fils bigint check (amount_fils >= 0),
  breakdown jsonb,
  flags jsonb not null default '[]',
  engineer_edited boolean not null default false,
  provenance jsonb,
  created_at timestamptz not null default now()
);
create index line_items_quote_order on line_items(quote_id, sort_order);

alter table projects enable row level security;
alter table quotes enable row level security;
alter table line_items enable row level security;
-- No policies yet: Phase 1 accesses via service role (bypasses RLS).
-- Phase 3 adds authenticated policies.

-- Base table grants for the Data API roles (required regardless of RLS).
-- Local Supabase's default privileges only auto-apply to supabase_admin-owned
-- objects; migrations run as `postgres`, so new tables need explicit grants.
-- service_role has rolbypassrls, so once granted it bypasses RLS entirely,
-- matching Phase 1's service-role-only access model described above.
grant all on projects, quotes, line_items to postgres, anon, authenticated, service_role;
