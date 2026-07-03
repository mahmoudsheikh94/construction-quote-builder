-- The corrections table (added in 20260703215416_ui_rls_and_corrections.sql)
-- was missing the base service_role grant that every other table gets.
-- Migrations run as `postgres`, so new tables need explicit grants (see
-- 20260703082953_core_quotes.sql); service_role has rolbypassrls, so once
-- granted it bypasses RLS entirely, which is intended for server-side repo access.
grant all on corrections to postgres, anon, authenticated, service_role;

-- Re-tighten anon back to no-access, consistent with 20260703215416's intent
-- (anon gets NOTHING on app tables).
revoke all on corrections from anon;
