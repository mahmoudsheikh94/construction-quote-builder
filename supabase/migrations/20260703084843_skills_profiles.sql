create table trade_skills (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  active_version_id uuid,
  created_at timestamptz not null default now()
);

create table skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references trade_skills(id) on delete cascade,
  version_number integer not null,
  content jsonb not null,
  changelog text,
  parent_version_id uuid references skill_versions(id),
  created_at timestamptz not null default now(),
  unique (skill_id, version_number)
);

create table project_type_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  active_version_id uuid,
  created_at timestamptz not null default now()
);

create table profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references project_type_profiles(id) on delete cascade,
  version_number integer not null,
  content jsonb not null,
  changelog text,
  created_at timestamptz not null default now(),
  unique (profile_id, version_number)
);

-- Versions are immutable: block UPDATE of content at the database level.
create or replace function reject_content_update() returns trigger as $$
begin
  if new.content is distinct from old.content
     or new.version_number is distinct from old.version_number then
    raise exception 'skill/profile versions are immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger skill_versions_immutable before update on skill_versions
  for each row execute function reject_content_update();
create trigger profile_versions_immutable before update on profile_versions
  for each row execute function reject_content_update();

alter table trade_skills enable row level security;
alter table skill_versions enable row level security;
alter table project_type_profiles enable row level security;
alter table profile_versions enable row level security;
-- No policies yet: Phase 1 accesses via service role (bypasses RLS).

-- Base table grants for the Data API roles (required regardless of RLS).
-- Local Supabase's default privileges only auto-apply to supabase_admin-owned
-- objects; migrations run as `postgres`, so new tables need explicit grants.
-- service_role has rolbypassrls, so once granted it bypasses RLS entirely,
-- matching Phase 1's service-role-only access model described above.
grant all on trade_skills, skill_versions, project_type_profiles, profile_versions to postgres, anon, authenticated, service_role;
