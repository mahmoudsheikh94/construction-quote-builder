-- Phase D: risk columns + optimism/scope seed tables + day-log + learned_norms.

alter table quotes
  add column archetype text check (archetype in ('standard_building','non_standard_building','standard_civil','non_standard_civil')),
  add column site_class text check (site_class in ('greenfield_clean','average','brownfield_contaminated','poor_ground')),
  add column geotech_done boolean,
  add column contingency_pct numeric,
  add column risk_register jsonb,
  add column procurement_route text check (procurement_route in ('design_bid_build','design_build','construction_management')),
  add column contract_type text check (contract_type in ('lump_sum','cost_plus','gmp')),
  add column region text;   -- for the SANITY_BAND key

create table optimism_uplift (
  archetype text, stage int check (stage between 1 and 5), pct numeric not null,
  primary key (archetype, stage)
);
-- full 4x5 grid: stage 5 (early) high, stage 1 (near-award) low, linear between.
insert into optimism_uplift values
 ('standard_building',5,24),('standard_building',4,20),('standard_building',3,15),('standard_building',2,10),('standard_building',1,6),
 ('non_standard_building',5,51),('non_standard_building',4,40),('non_standard_building',3,29),('non_standard_building',2,17),('non_standard_building',1,6),
 ('standard_civil',5,44),('standard_civil',4,34),('standard_civil',3,24),('standard_civil',2,14),('standard_civil',1,4),
 ('non_standard_civil',5,66),('non_standard_civil',4,50),('non_standard_civil',3,35),('non_standard_civil',2,19),('non_standard_civil',1,4)
 on conflict do nothing;

create table scope_templates (project_type text primary key, required_items jsonb not null);
insert into scope_templates values
 ('building', '["concrete","rebar","blockwork","plastering","tiling","painting","doors-windows","plumbing","electrical"]'::jsonb)
 on conflict do nothing;

create table day_log_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  labor_rate_id uuid references labor_rates(id),
  trade text not null, task text,
  cost_model_id text, component_id text,
  date date not null,
  crew_skilled integer not null default 0, crew_helpers integer not null default 0,
  hours_worked numeric not null, quantity_installed numeric not null, unit_canonical text not null,
  temp_c numeric, weather text, shift text, overtime_hours numeric default 0, rework_quantity numeric default 0,
  notes text, created_at timestamptz default now()
);

create table learned_norms (
  scope text not null, key text not null, value numeric not null,
  sample_size integer not null default 0, updated_at timestamptz default now(),
  primary key (scope, key)
);

-- UI-table bucket (incl. service_role grant) for optimism_uplift, scope_templates, day_log_entries.
do $$
declare t text;
begin
  foreach t in array array['optimism_uplift','scope_templates','day_log_entries'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant select, insert, update, delete on %I to service_role', t);
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;

-- learned_norms: CLI-written (variance job), session-read (reprice path).
alter table learned_norms enable row level security;
grant all on learned_norms to postgres, service_role;
grant select on learned_norms to authenticated;
revoke all on learned_norms from anon;
create policy learned_norms_sel on learned_norms for select to authenticated using (true);
-- no authenticated write policy: writes stay service-role-only.
