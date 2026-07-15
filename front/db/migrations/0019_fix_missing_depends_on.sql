-- 0019: Corrective fix for 0018 — depends_on was never populated on the
-- backfilled split subtasks (rep_2-4 / it_rep_2-4 / vat_rep_2-4). Confirmed
-- via live data cross-check on customer גלויברמן ברכה. Safe, idempotent —
-- only touches rows where depends_on IS NULL.

BEGIN;

UPDATE sub_tasks SET depends_on = 'rep_1' WHERE registry_key = 'rep_2' AND depends_on IS NULL;
UPDATE sub_tasks SET depends_on = 'rep_2' WHERE registry_key = 'rep_3' AND depends_on IS NULL;
UPDATE sub_tasks SET depends_on = 'rep_3' WHERE registry_key = 'rep_4' AND depends_on IS NULL;

UPDATE sub_tasks SET depends_on = 'it_rep_1' WHERE registry_key = 'it_rep_2' AND depends_on IS NULL;
UPDATE sub_tasks SET depends_on = 'it_rep_2' WHERE registry_key = 'it_rep_3' AND depends_on IS NULL;
UPDATE sub_tasks SET depends_on = 'it_rep_3' WHERE registry_key = 'it_rep_4' AND depends_on IS NULL;

UPDATE sub_tasks SET depends_on = 'vat_rep_1' WHERE registry_key = 'vat_rep_2' AND depends_on IS NULL;
UPDATE sub_tasks SET depends_on = 'vat_rep_2' WHERE registry_key = 'vat_rep_3' AND depends_on IS NULL;
UPDATE sub_tasks SET depends_on = 'vat_rep_3' WHERE registry_key = 'vat_rep_4' AND depends_on IS NULL;

DO $$
DECLARE missing int;
BEGIN
  SELECT COUNT(*) INTO missing FROM sub_tasks
  WHERE registry_key IN ('rep_2','rep_3','rep_4','it_rep_2','it_rep_3','it_rep_4','vat_rep_2','vat_rep_3','vat_rep_4')
    AND depends_on IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Corrective backfill failed: % split subtasks still missing depends_on', missing;
  END IF;
END $$;

COMMIT;
