-- 0020: Full resync of the remaining not-yet-migrated rows — extends 0018's
-- backfill (which only touched *completed* rep/it_rep/vat_rep/ardeni_open)
-- to ALL statuses, so nothing is left waiting for "the next natural save"
-- (which may happen months from now, or never). Confirmed via live-data
-- diagnostics that zero rows would be stranded by the business-rule guards
-- below. Must run AFTER 0017/0018/0019. Self-verifying, idempotent.

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- STEP 1: Move ALL remaining ardeni_open subtasks (any status) from
--         ADMIN_SETUP to OFFICE_HANDLING, with the correct dynamic title.
-- ══════════════════════════════════════════════════════════════════

UPDATE sub_tasks st
SET parent_task_id = office.id,
    registry_key = 'ardeni_open',
    title = (CASE
        WHEN c.business_type = 'מורשה' THEN 'פתיחה בארדני כמורשה'
        WHEN c.business_type = 'חברה בע"מ' THEN 'פתיחה בארדני כחברה בע"מ'
        ELSE 'פתיחה בארדני'
      END) || (CASE WHEN c.case_start_year IS NOT NULL THEN ' מ' || c.case_start_year ELSE '' END)
FROM parent_tasks admin_setup
JOIN parent_tasks office
  ON office.customer_id = admin_setup.customer_id AND office.registry_key = 'OFFICE_HANDLING'
JOIN customers c ON c.id = admin_setup.customer_id
WHERE st.parent_task_id = admin_setup.id
  AND admin_setup.registry_key = 'ADMIN_SETUP'
  AND st.title LIKE '%פתיחה בארדני%';

-- Recompute OFFICE_HANDLING parent status now that more parents may have
-- gained their ardeni_open subtask (same logic as 0018).
UPDATE parent_tasks pt
SET status = CASE
    WHEN EXISTS (SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = pt.id)
     AND NOT EXISTS (SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = pt.id AND st.is_completed = false)
    THEN 'completed' ELSE 'pending'
  END
WHERE pt.registry_key = 'OFFICE_HANDLING';

-- ══════════════════════════════════════════════════════════════════
-- STEP 2: Split ALL remaining un-split rep/it_rep/vat_rep rows (any
--         status), guarded by the current business condition still being
--         true (confirmed via diagnostics: 0 rows fall outside this today).
--         depends_on is set at insert time this time (0019 fixed the ones
--         0018 already created; this step never repeats that mistake).
-- ══════════════════════════════════════════════════════════════════

UPDATE sub_tasks st
SET title = 'ביטוח לאומי רישום ייצוג בן זוג רשום', registry_key = 'rep_1'
FROM parent_tasks pt
JOIN customers c ON c.id = pt.customer_id
WHERE st.parent_task_id = pt.id
  AND pt.registry_key = 'INSURANCE'
  AND st.title = 'ביטוח לאומי ייצוגים'
  AND c.is_insurance_active = true;

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT st.parent_task_id, v.title, st.is_completed, st.priority, '', v.registry_key, v.depends_on
FROM sub_tasks st
CROSS JOIN (VALUES
  ('ביטוח לאומי רישום ייצוג בן זוג', 'rep_2', 'rep_1'),
  ('ייצוג ביטוח לאומי בן זוג רשום - אושר', 'rep_3', 'rep_2'),
  ('ייצוג ביטוח לאומי בן זוג - אושר', 'rep_4', 'rep_3')
) AS v(title, registry_key, depends_on)
WHERE st.registry_key = 'rep_1'
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = st.parent_task_id AND ex.registry_key = v.registry_key
  );

UPDATE sub_tasks st
SET title = 'מס הכנסה רישום ייצוג + שליחה לחתימת לקוח', registry_key = 'it_rep_1'
FROM parent_tasks pt
JOIN customers c ON c.id = pt.customer_id
WHERE st.parent_task_id = pt.id
  AND pt.registry_key = 'TAX_VAT'
  AND st.title = 'ייצוגים מס הכנסה'
  AND c.is_income_tax_active = true
  AND NOT COALESCE(c.spouse_file_exists, false);

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT st.parent_task_id, v.title, st.is_completed, st.priority, '', v.registry_key, v.depends_on
FROM sub_tasks st
CROSS JOIN (VALUES
  ('ייצוג מס הכנסה נחתם ע"י הלקוח', 'it_rep_2', 'it_rep_1'),
  ('ייצוג מס הכנסה שודר', 'it_rep_3', 'it_rep_2'),
  ('ייצוג מס הכנסה נקלט', 'it_rep_4', 'it_rep_3')
) AS v(title, registry_key, depends_on)
WHERE st.registry_key = 'it_rep_1'
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = st.parent_task_id AND ex.registry_key = v.registry_key
  );

UPDATE sub_tasks st
SET title = 'מע"מ רישום ייצוג + שליחה לחתימת לקוח', registry_key = 'vat_rep_1'
FROM parent_tasks pt
JOIN customers c ON c.id = pt.customer_id
WHERE st.parent_task_id = pt.id
  AND pt.registry_key = 'TAX_VAT'
  AND st.title = 'מע"מ ייצוגים'
  AND c.is_vat_active = true;

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT st.parent_task_id, v.title, st.is_completed, st.priority, '', v.registry_key, v.depends_on
FROM sub_tasks st
CROSS JOIN (VALUES
  ('ייצוג מע"מ נחתם ע"י הלקוח', 'vat_rep_2', 'vat_rep_1'),
  ('ייצוג מע"מ שודר', 'vat_rep_3', 'vat_rep_2'),
  ('ייצוג מע"מ נקלט', 'vat_rep_4', 'vat_rep_3')
) AS v(title, registry_key, depends_on)
WHERE st.registry_key = 'vat_rep_1'
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = st.parent_task_id AND ex.registry_key = v.registry_key
  );

-- ══════════════════════════════════════════════════════════════════
-- STEP 3: Invariants — abort (ROLLBACK) if anything looks wrong.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  leftover_ardeni int;
  incomplete_chains int;
  missing_depends_on int;
BEGIN
  SELECT COUNT(*) INTO leftover_ardeni
  FROM sub_tasks st JOIN parent_tasks pt ON pt.id = st.parent_task_id
  WHERE pt.registry_key = 'ADMIN_SETUP' AND st.title LIKE '%פתיחה בארדני%';
  IF leftover_ardeni > 0 THEN
    RAISE EXCEPTION 'Full-resync invariant failed: % ardeni_open rows still under ADMIN_SETUP', leftover_ardeni;
  END IF;

  SELECT COUNT(*) INTO incomplete_chains FROM (
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('rep_1','rep_2','rep_3','rep_4')
    GROUP BY parent_task_id HAVING COUNT(*) <> 4
    UNION ALL
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('it_rep_1','it_rep_2','it_rep_3','it_rep_4')
    GROUP BY parent_task_id HAVING COUNT(*) <> 4
    UNION ALL
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('vat_rep_1','vat_rep_2','vat_rep_3','vat_rep_4')
    GROUP BY parent_task_id HAVING COUNT(*) <> 4
  ) s;
  IF incomplete_chains > 0 THEN
    RAISE EXCEPTION 'Full-resync invariant failed: % parents have an incomplete split-subtask chain', incomplete_chains;
  END IF;

  SELECT COUNT(*) INTO missing_depends_on FROM sub_tasks
  WHERE registry_key IN ('rep_2','rep_3','rep_4','it_rep_2','it_rep_3','it_rep_4','vat_rep_2','vat_rep_3','vat_rep_4')
    AND depends_on IS NULL;
  IF missing_depends_on > 0 THEN
    RAISE EXCEPTION 'Full-resync invariant failed: % split subtasks still missing depends_on', missing_depends_on;
  END IF;
END $$;

COMMIT;
