-- 0024: Cleanup — drop the legacy needs_deductions_file boolean, fully
-- replaced by customers.deductions_file_status (0021-0023). Destructive,
-- irreversible. Run only after confirming 0021-0023 visually (done).
--
-- Pre-check: every customer whose old flag was true must have a non-null
-- deductions_file_status before we remove the only record of that flag.
-- Aborts (ROLLBACK) rather than dropping data if anything looks unmigrated.

BEGIN;

DO $$
DECLARE
  unmigrated int;
BEGIN
  SELECT COUNT(*) INTO unmigrated
  FROM customers
  WHERE needs_deductions_file = true
    AND (deductions_file_status IS NULL OR deductions_file_status = '');
  IF unmigrated > 0 THEN
    RAISE EXCEPTION 'Drop aborted: % customers have needs_deductions_file=true but no deductions_file_status', unmigrated;
  END IF;
END $$;

ALTER TABLE public.customers
  DROP COLUMN needs_deductions_file;

COMMIT;
