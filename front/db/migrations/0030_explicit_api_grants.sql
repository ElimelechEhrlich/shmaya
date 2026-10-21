-- 0030: explicit Data API grants for every table the app uses.
--
-- From 30/10/2026 Supabase stops granting Data API access automatically to NEW
-- tables in "public" (existing tables keep their grants). This file states the
-- grants explicitly, so the project still works if the schema is ever recreated
-- (new Supabase project, preview branch, `supabase db reset`).
--
-- On the live database this changes nothing:
--   * GRANT only, never REVOKE — every grant here is one the tables already have
--     (until now Supabase granted anon/authenticated/service_role on every table).
--   * Access is still decided by RLS, which this file does not touch.
--   * A table that does not exist yet is skipped (the core tables were created in
--     the Supabase dashboard, not by a migration), so it never fails.
-- Safe to re-run.
--
-- Rule for every NEW table: add its GRANTs in the same migration that creates it
-- (see CLAUDE.md, "New tables need explicit grants").

DO $$
DECLARE
  t text;
BEGIN
  -- App tables: the browser (anon key) reads and writes them; RLS applies.
  FOREACH t IN ARRAY ARRAY['customers', 'parent_tasks', 'sub_tasks', 'logs'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated, service_role', t);
    END IF;
  END LOOP;

  -- Contreal link table: the browser only reads it (RLS: SELECT policy only);
  -- the contreal-sync Edge Function writes it with the service role.
  IF to_regclass('public.contreal_task_link') IS NOT NULL THEN
    GRANT SELECT ON public.contreal_task_link TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.contreal_task_link TO service_role;
  END IF;

  -- Contreal tokens and user mapping: server only (Edge Function, service role).
  -- Deliberately no grant to anon/authenticated (RLS already has no policies).
  FOREACH t IN ARRAY ARRAY['contreal_auth', 'contreal_user_map'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;
