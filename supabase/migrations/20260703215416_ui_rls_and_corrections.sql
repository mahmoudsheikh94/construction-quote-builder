-- Display name for a quote (project name captured at pricing time).
alter table quotes add column if not exists name text;

-- Corrections log: every engineer edit to a line's rate.
create table corrections (
  id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references line_items(id) on delete cascade,
  before_fils bigint,
  after_fils bigint not null,
  scope text not null check (scope in ('quote','trade')),
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table corrections enable row level security;

-- Tighten the broad grants from earlier migrations to least-privilege, and add
-- authenticated-only policies. anon gets NOTHING on app tables.
-- (Phase 1 whole-branch carry-forward: replace `grant all ... to anon`.)
do $$
declare t text;
begin
  foreach t in array array[
    'projects','quotes','line_items','price_book_entries',
    'trade_skills','skill_versions','project_type_profiles','profile_versions',
    'line_item_tags','match_corpus','corrections'
  ] loop
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- Authenticated may read+write everything (single-tenant, two trusted users, no roles yet).
-- anon has no policies → denied. Each table: a permissive policy TO authenticated.
do $$
declare t text;
begin
  foreach t in array array[
    'projects','quotes','line_items','price_book_entries',
    'trade_skills','skill_versions','project_type_profiles','profile_versions',
    'line_item_tags','match_corpus','corrections'
  ] loop
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;
