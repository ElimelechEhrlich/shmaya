-- 0017: Schema-only additions for tasks reorganization (feature/tasks-reorganization).
-- All columns are nullable, additive, no backfill, no data migration.
-- Backfill of existing rows (if any) is handled separately in migration 0018.

ALTER TABLE public.sub_tasks
  ADD COLUMN IF NOT EXISTS restricted_to text,
  ADD COLUMN IF NOT EXISTS depends_on text,
  ADD COLUMN IF NOT EXISTS registry_key text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS case_start_year integer;
