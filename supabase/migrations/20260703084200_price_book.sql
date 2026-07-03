create table price_book_entries (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label_ar text not null,
  unit text not null,
  price_fils bigint not null check (price_fils >= 0),
  effective_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index price_book_key_date on price_book_entries(key, effective_date desc);
alter table price_book_entries enable row level security;
-- No policies yet: Phase 1 accesses via service role (bypasses RLS).

-- Base table grants for the Data API roles (required regardless of RLS).
-- Local Supabase's default privileges only auto-apply to supabase_admin-owned
-- objects; migrations run as `postgres`, so new tables need explicit grants.
-- service_role has rolbypassrls, so once granted it bypasses RLS entirely,
-- matching Phase 1's service-role-only access model described above.
grant all on price_book_entries to postgres, anon, authenticated, service_role;
