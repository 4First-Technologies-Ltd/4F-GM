-- Supabase hardening: this database is accessed ONLY via Prisma (server-side),
-- never through Supabase's auto-generated REST API. Enable Row-Level Security
-- on every table and revoke API-role access so PostgREST cannot read or write
-- anything. Prisma is unaffected: it connects as the table owner, which
-- bypasses RLS.
--
-- Apply with:
--   npx prisma db execute --file prisma/enable-rls.sql --url "$DIRECT_URL"
--
-- NOTE: run this again after any migration that creates a new table — new
-- tables default to RLS disabled. (The default-privilege revokes below already
-- cover the grant side for future tables.)

do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end
$$;

-- Defense in depth: strip the Supabase API roles' privileges entirely so even
-- a future accidental policy or RLS-disabled table exposes nothing.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
