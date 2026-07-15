-- 0018: Backfill for tasks reorganization (feature/tasks-reorganization).
-- Preserves real customer progress + closes the restricted_to enforcement gap
-- across the category restructure. Must run AFTER 0017. Self-verifying —
-- rolls back entirely if any invariant is violated. Safe to re-run (idempotent).

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- STEP 1: Merge/rename INCOME_TAX + VAT → TAX_VAT (ALL rows, any status —
--         the merge for dual-service customers isn't optional: skipping
--         it would leave two rows both claiming registry_key='TAX_VAT').
--         Title is computed per customer, not a flat literal — mirrors
--         taskRegistry.ts's taxVatTitle (isIncomeTaxActive && !spouseFileExists).
-- ══════════════════════════════════════════════════════════════════

WITH dual AS (
  SELECT it.id AS survivor_id, vat.id AS dropped_id
  FROM parent_tasks it
  JOIN parent_tasks vat
    ON vat.customer_id = it.customer_id AND vat.registry_key = 'VAT'
  WHERE it.registry_key = 'INCOME_TAX'
)
UPDATE sub_tasks
SET parent_task_id = dual.survivor_id
FROM dual
WHERE sub_tasks.parent_task_id = dual.dropped_id;

WITH dual AS (
  SELECT vat.id AS dropped_id
  FROM parent_tasks it
  JOIN parent_tasks vat
    ON vat.customer_id = it.customer_id AND vat.registry_key = 'VAT'
  WHERE it.registry_key = 'INCOME_TAX'
)
DELETE FROM parent_tasks WHERE id IN (SELECT dropped_id FROM dual);

UPDATE parent_tasks pt
SET registry_key = 'TAX_VAT',
    title = CASE
      WHEN c.is_income_tax_active AND NOT COALESCE(c.spouse_file_exists, false) THEN 'מס הכנסה ומע"מ'
      ELSE 'מע"מ'
    END
FROM customers c
WHERE pt.customer_id = c.id
  AND pt.registry_key IN ('INCOME_TAX', 'VAT');

-- ══════════════════════════════════════════════════════════════════
-- STEP 2: FINAL_APPROVAL → OFFICE_HANDLING (ALL rows) + universal
--         restricted_to/registry_key lock on 'approve' (security-relevant —
--         not conditional on completion) + move only COMPLETED ardeni_open
--         (data-preservation only), title computed per customer (mirrors
--         taskRegistry.ts's ardeniOpenTitle) + recompute true parent status.
-- ══════════════════════════════════════════════════════════════════

UPDATE parent_tasks
SET registry_key = 'OFFICE_HANDLING', title = 'טיפול משרדי'
WHERE registry_key = 'FINAL_APPROVAL';

UPDATE sub_tasks st
SET registry_key = 'approve', restricted_to = 'מוישי'
FROM parent_tasks pt
WHERE st.parent_task_id = pt.id
  AND pt.registry_key = 'OFFICE_HANDLING'
  AND st.title = 'אישור ע"י המשרד';

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
  AND st.title = 'פתיחה בארדני'
  AND st.is_completed = true;

UPDATE parent_tasks pt
SET status = CASE
    WHEN EXISTS (SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = pt.id)
     AND NOT EXISTS (SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = pt.id AND st.is_completed = false)
    THEN 'completed' ELSE 'pending'
  END
WHERE pt.registry_key = 'OFFICE_HANDLING';

-- ══════════════════════════════════════════════════════════════════
-- STEP 3: Split completed rep / it_rep / vat_rep into 4 chained subtasks.
--         Idempotency guard (NOT EXISTS) protects against duplicate inserts
--         if this script is accidentally run twice.
-- ══════════════════════════════════════════════════════════════════

UPDATE sub_tasks
SET title = 'ביטוח לאומי רישום ייצוג בן זוג רשום', registry_key = 'rep_1'
WHERE id IN (
  SELECT st.id FROM sub_tasks st JOIN parent_tasks pt ON pt.id = st.parent_task_id
  WHERE pt.registry_key = 'INSURANCE' AND st.title = 'ביטוח לאומי ייצוגים' AND st.is_completed = true
);

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key)
SELECT st.parent_task_id, v.title, true, st.priority, '', v.registry_key
FROM sub_tasks st
CROSS JOIN (VALUES
  ('ביטוח לאומי רישום ייצוג בן זוג', 'rep_2'),
  ('ייצוג ביטוח לאומי בן זוג רשום - אושר', 'rep_3'),
  ('ייצוג ביטוח לאומי בן זוג - אושר', 'rep_4')
) AS v(title, registry_key)
WHERE st.registry_key = 'rep_1' AND st.is_completed = true
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = st.parent_task_id AND ex.registry_key = v.registry_key
  );

UPDATE sub_tasks
SET title = 'מס הכנסה רישום ייצוג + שליחה לחתימת לקוח', registry_key = 'it_rep_1'
WHERE id IN (
  SELECT st.id FROM sub_tasks st JOIN parent_tasks pt ON pt.id = st.parent_task_id
  WHERE pt.registry_key = 'TAX_VAT' AND st.title = 'ייצוגים מס הכנסה' AND st.is_completed = true
);

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key)
SELECT st.parent_task_id, v.title, true, st.priority, '', v.registry_key
FROM sub_tasks st
CROSS JOIN (VALUES
  ('ייצוג מס הכנסה נחתם ע"י הלקוח', 'it_rep_2'),
  ('ייצוג מס הכנסה שודר', 'it_rep_3'),
  ('ייצוג מס הכנסה נקלט', 'it_rep_4')
) AS v(title, registry_key)
WHERE st.registry_key = 'it_rep_1' AND st.is_completed = true
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = st.parent_task_id AND ex.registry_key = v.registry_key
  );

UPDATE sub_tasks
SET title = 'מע"מ רישום ייצוג + שליחה לחתימת לקוח', registry_key = 'vat_rep_1'
WHERE id IN (
  SELECT st.id FROM sub_tasks st JOIN parent_tasks pt ON pt.id = st.parent_task_id
  WHERE pt.registry_key = 'TAX_VAT' AND st.title = 'מע"מ ייצוגים' AND st.is_completed = true
);

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key)
SELECT st.parent_task_id, v.title, true, st.priority, '', v.registry_key
FROM sub_tasks st
CROSS JOIN (VALUES
  ('ייצוג מע"מ נחתם ע"י הלקוח', 'vat_rep_2'),
  ('ייצוג מע"מ שודר', 'vat_rep_3'),
  ('ייצוג מע"מ נקלט', 'vat_rep_4')
) AS v(title, registry_key)
WHERE st.registry_key = 'vat_rep_1' AND st.is_completed = true
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = st.parent_task_id AND ex.registry_key = v.registry_key
  );

-- ══════════════════════════════════════════════════════════════════
-- STEP 4: Invariants — abort (ROLLBACK) if anything looks wrong.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  stale_parents int;
  dup_registry_keys int;
  approve_missing_lock int;
  split_count_mismatch int;
BEGIN
  SELECT COUNT(*) INTO stale_parents
  FROM parent_tasks WHERE registry_key IN ('INCOME_TAX', 'VAT', 'FINAL_APPROVAL');
  IF stale_parents > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % parent_tasks rows still carry a retired registry_key', stale_parents;
  END IF;

  SELECT COUNT(*) INTO dup_registry_keys FROM (
    SELECT customer_id, registry_key FROM parent_tasks
    WHERE registry_key IS NOT NULL AND customer_id != '00000000-0000-0000-0000-000000000000'
    GROUP BY customer_id, registry_key HAVING COUNT(*) > 1
  ) d;
  IF dup_registry_keys > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % customers have a duplicate parent registry_key', dup_registry_keys;
  END IF;

  SELECT COUNT(*) INTO approve_missing_lock
  FROM sub_tasks
  WHERE title = 'אישור ע"י המשרד'
    AND (restricted_to IS DISTINCT FROM 'מוישי' OR registry_key IS DISTINCT FROM 'approve');
  IF approve_missing_lock > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % approve subtasks missing restricted_to/registry_key', approve_missing_lock;
  END IF;

  SELECT COUNT(*) INTO split_count_mismatch FROM (
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('rep_1','rep_2','rep_3','rep_4') AND is_completed = true
    GROUP BY parent_task_id HAVING COUNT(*) <> 4
    UNION ALL
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('it_rep_1','it_rep_2','it_rep_3','it_rep_4') AND is_completed = true
    GROUP BY parent_task_id HAVING COUNT(*) <> 4
    UNION ALL
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('vat_rep_1','vat_rep_2','vat_rep_3','vat_rep_4') AND is_completed = true
    GROUP BY parent_task_id HAVING COUNT(*) <> 4
  ) s;
  IF split_count_mismatch > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % parents have an incomplete split-subtask chain', split_count_mismatch;
  END IF;
END $$;

COMMIT;
