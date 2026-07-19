-- 0021: Schema-only addition for the deductions-file feature (feature/deductions-file).
-- Additive, nullable, no backfill, no drop. needs_deductions_file is dropped
-- separately in 0023, only after 0022's backfill is confirmed working.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS deductions_file_status text;
