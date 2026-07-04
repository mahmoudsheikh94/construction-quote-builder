-- Labor rates: a simple, standalone day-rate log for trades — separate from the
-- versioned trade_skills pricing models. Meant for old-school engineers to enter
-- a trade name + day rate (and optional productivity) quickly on their phones.

create table labor_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  day_rate numeric not null,
  currency text not null default 'JOD',
  created_at timestamptz not null default now()
);

create table labor_rate_productivity (
  id uuid primary key default gen_random_uuid(),
  labor_rate_id uuid not null references labor_rates(id) on delete cascade,
  label text not null,
  output_per_day numeric not null,
  unit text not null default 'm²'
);

alter table labor_rates enable row level security;
alter table labor_rate_productivity enable row level security;

-- Match the app-wide security posture: anon gets NOTHING; only authenticated
-- (the trusted users behind the login gate) may read/write. Same pattern as
-- 20260703215416_ui_rls_and_corrections.sql.
do $$
declare t text;
begin
  foreach t in array array['labor_rates','labor_rate_productivity'] loop
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;
