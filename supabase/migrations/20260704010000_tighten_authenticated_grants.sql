-- Least-privilege hygiene (Phase 3 whole-branch review, finding #1).
-- The earlier `grant all ... to authenticated` left TRUNCATE/TRIGGER/REFERENCES on
-- every app table. These are not reachable via the Supabase Data API (PostgREST emits
-- only SELECT/INSERT/UPDATE/DELETE + RPC — never DDL), so this is not exploitable, but
-- the grant set should match the stated intent: the UI needs DML only.
-- Revoke the three DDL privileges; keep select/insert/update/delete.
do $$
declare t text;
begin
  foreach t in array array[
    'projects','quotes','line_items','price_book_entries',
    'trade_skills','skill_versions','project_type_profiles','profile_versions',
    'line_item_tags','match_corpus','corrections'
  ] loop
    execute format('revoke truncate, trigger, references on %I from authenticated', t);
  end loop;
end $$;
