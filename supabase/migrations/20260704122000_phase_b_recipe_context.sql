-- Phase B: rate-recipe completion + context modifiers.
-- firm_settings singleton + 4 firm-editable reference tables (UI-table convention:
-- RLS on, anon revoked, authenticated DML + policies). New quote/price-book columns
-- inherit their parent table's grants.

create table firm_settings (
  id boolean primary key default true check (id),   -- single-row guard
  labor_burden_pct numeric not null default 30,     -- percent, folded into the labor division
  overhead_pct numeric not null default 15,         -- percent; seeds NEW models only
  default_reference_location text,                  -- fallback base for the location factor
  updated_at timestamptz default now()
);
insert into firm_settings (id) values (true) on conflict do nothing;

alter table quotes
  add column gross_floor_area_m2 numeric,
  add column storeys integer,
  add column avg_storey_height_m numeric,
  add column estimate_class integer check (estimate_class between 1 and 5),  -- nullable; null => no band
  add column target_date date;

alter table price_book_entries add column reference_location text;  -- so the location factor is relative

create table location_factors (
  region text primary key,
  labor_index numeric not null,       -- direct multiplier, NOT a percent
  material_index numeric not null
);
create table cost_indices (
  effective_date date primary key,
  index_value numeric not null
);
create table material_waste_defaults (
  material_category text primary key,
  waste_pct numeric not null
);
create table size_curves (
  facility_type text primary key,
  ref_size_m2 numeric not null,       -- sizeFactor = (gfa / ref_size_m2)^(exponent-1)
  exponent numeric not null
);

-- Representative seed rows (firm tunes).
insert into material_waste_defaults values
  ('mortar',1.5),('tile',10),('structural_steel',13),('stone',10),('concrete',2) on conflict do nothing;
insert into size_curves values ('generic',1000,0.90) on conflict do nothing;
insert into location_factors values ('amman',1.00,1.00) on conflict do nothing;  -- firm home = base
insert into cost_indices values ('2026-01-01',100.0) on conflict do nothing;     -- base index

-- UI-table convention (roadmap §7.3): RLS + authenticated DML + policies.
do $$
declare t text;
begin
  foreach t in array array['firm_settings','location_factors','cost_indices','material_waste_defaults','size_curves'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;
