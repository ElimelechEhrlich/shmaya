-- 0022: Backfill + full resync for the deductions-file feature.
-- Populates deductions_file_status from the old boolean, creates the new
-- DEDUCTIONS_FILE parent for every affected customer NOW (not waiting for
-- their next save — same lesson as 0020), migrates completed old
-- deductions/it_deductions rows into their new 5-step chains, and removes
-- the now-orphaned old rows. Must run AFTER 0021. Self-verifying, idempotent.

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- STEP 1: Populate deductions_file_status from the old boolean. Per
--         explicit decision: representation work and physically opening
--         the file are separate things — a completed old subtask is NOT
--         evidence the file was opened, so everyone gets 'נדרש לפתוח',
--         no attempt to reconstruct 'כבר קיים' from history.
-- ══════════════════════════════════════════════════════════════════

UPDATE customers
SET deductions_file_status = 'נדרש לפתוח תיק ניכויים'
WHERE needs_deductions_file = true
  AND id != '00000000-0000-0000-0000-000000000000';

-- ══════════════════════════════════════════════════════════════════
-- STEP 2: Create the DEDUCTIONS_FILE parent NOW for every affected
--         customer (full resync, not deferred to next natural save).
-- ══════════════════════════════════════════════════════════════════

INSERT INTO parent_tasks (customer_id, registry_key, title, status)
SELECT c.id, 'DEDUCTIONS_FILE', 'תיק ניכויים', 'pending'
FROM customers c
WHERE c.deductions_file_status = 'נדרש לפתוח תיק ניכויים'
  AND NOT EXISTS (
    SELECT 1 FROM parent_tasks pt WHERE pt.customer_id = c.id AND pt.registry_key = 'DEDUCTIONS_FILE'
  );

-- ══════════════════════════════════════════════════════════════════
-- STEP 3: Migrate completed old 'it_deductions' (TAX_VAT) into the new
--         it_ded_rep_1..5 chain, completed=true. Guarded by
--         is_income_tax_active, matching the registry condition exactly.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT ded.id, v.title, true, 'medium', '', v.registry_key, v.depends_on
FROM customers c
JOIN parent_tasks old_pt ON old_pt.customer_id = c.id AND old_pt.registry_key = 'TAX_VAT'
JOIN sub_tasks old_st ON old_st.parent_task_id = old_pt.id
  AND old_st.title = 'מס הכנסה ייצוג ניכויים' AND old_st.is_completed = true
JOIN parent_tasks ded ON ded.customer_id = c.id AND ded.registry_key = 'DEDUCTIONS_FILE'
CROSS JOIN (VALUES
  ('מס הכנסה רישום ייצוג תיק ניכויים', 'it_ded_rep_1', NULL::text),
  ('שליחת ייצוג תיק ניכויים מס הכנסה לחתימת לקוח', 'it_ded_rep_2', 'it_ded_rep_1'),
  ('ייצוג תיק ניכויים מס הכנסה נחתם ע"י הלקוח', 'it_ded_rep_3', 'it_ded_rep_2'),
  ('ייצוג תיק ניכויים מס הכנסה שודר', 'it_ded_rep_4', 'it_ded_rep_3'),
  ('ייצוג תיק ניכויים מס הכנסה נקלט', 'it_ded_rep_5', 'it_ded_rep_4')
) AS v(title, registry_key, depends_on)
WHERE c.is_income_tax_active = true
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = ded.id AND ex.registry_key = v.registry_key
  );

-- ══════════════════════════════════════════════════════════════════
-- STEP 4: Migrate completed old 'deductions' (INSURANCE) into the new
--         ins_ded_rep_1..5 chain, completed=true. Guarded by
--         is_insurance_active, matching the registry condition exactly.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT ded.id, v.title, true, 'medium', '', v.registry_key, v.depends_on
FROM customers c
JOIN parent_tasks old_pt ON old_pt.customer_id = c.id AND old_pt.registry_key = 'INSURANCE'
JOIN sub_tasks old_st ON old_st.parent_task_id = old_pt.id
  AND old_st.title = 'ביטוח לאומי ייצוג תיק ניכויים' AND old_st.is_completed = true
JOIN parent_tasks ded ON ded.customer_id = c.id AND ded.registry_key = 'DEDUCTIONS_FILE'
CROSS JOIN (VALUES
  ('ביטוח לאומי רישום ייצוג תיק ניכויים', 'ins_ded_rep_1', NULL::text),
  ('שליחת ייצוג תיק ניכויים ביטוח לאומי לחתימת לקוח', 'ins_ded_rep_2', 'ins_ded_rep_1'),
  ('ייצוג תיק ניכויים ביטוח לאומי נחתם ע"י הלקוח', 'ins_ded_rep_3', 'ins_ded_rep_2'),
  ('ייצוג תיק ניכויים ביטוח לאומי שודר', 'ins_ded_rep_4', 'ins_ded_rep_3'),
  ('ייצוג תיק ניכויים ביטוח לאומי נקלט', 'ins_ded_rep_5', 'ins_ded_rep_4')
) AS v(title, registry_key, depends_on)
WHERE c.is_insurance_active = true
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = ded.id AND ex.registry_key = v.registry_key
  );

-- ══════════════════════════════════════════════════════════════════
-- STEP 5: Create 'ded_open' for every affected customer, always
--         incomplete (deductions_file_status is always 'נדרש לפתוח' right
--         after this backfill). Guarded by is_income_tax_active, matching
--         the registry condition exactly (no insurance-side equivalent —
--         intentional, per spec).
-- ══════════════════════════════════════════════════════════════════

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT ded.id, 'פתיחת תיק ניכויים מס הכנסה', false, 'medium', '', 'ded_open', NULL
FROM customers c
JOIN parent_tasks ded ON ded.customer_id = c.id AND ded.registry_key = 'DEDUCTIONS_FILE'
WHERE c.deductions_file_status = 'נדרש לפתוח תיק ניכויים'
  AND c.is_income_tax_active = true
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks ex WHERE ex.parent_task_id = ded.id AND ex.registry_key = 'ded_open'
  );

-- ══════════════════════════════════════════════════════════════════
-- STEP 6: Remove the now-orphaned old subtask rows (completed ones already
--         migrated above; pending ones were never done, safe to drop).
-- ══════════════════════════════════════════════════════════════════

DELETE FROM sub_tasks st
USING parent_tasks pt
WHERE st.parent_task_id = pt.id
  AND pt.registry_key = 'INSURANCE'
  AND st.title = 'ביטוח לאומי ייצוג תיק ניכויים';

DELETE FROM sub_tasks st
USING parent_tasks pt
WHERE st.parent_task_id = pt.id
  AND pt.registry_key = 'TAX_VAT'
  AND st.title = 'מס הכנסה ייצוג ניכויים';

-- ══════════════════════════════════════════════════════════════════
-- STEP 7: Invariants — abort (ROLLBACK) if anything looks wrong.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  missing_parent int;
  leftover_old int;
  incomplete_chains int;
  missing_depends_on int;
BEGIN
  SELECT COUNT(*) INTO missing_parent FROM customers c
  WHERE c.deductions_file_status = 'נדרש לפתוח תיק ניכויים'
    AND NOT EXISTS (SELECT 1 FROM parent_tasks pt WHERE pt.customer_id = c.id AND pt.registry_key = 'DEDUCTIONS_FILE');
  IF missing_parent > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % customers with deductions_file_status still lack a DEDUCTIONS_FILE parent', missing_parent;
  END IF;

  SELECT COUNT(*) INTO leftover_old FROM sub_tasks st JOIN parent_tasks pt ON pt.id = st.parent_task_id
  WHERE (pt.registry_key = 'INSURANCE' AND st.title = 'ביטוח לאומי ייצוג תיק ניכויים')
     OR (pt.registry_key = 'TAX_VAT' AND st.title = 'מס הכנסה ייצוג ניכויים');
  IF leftover_old > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % old deductions/it_deductions rows still remain', leftover_old;
  END IF;

  SELECT COUNT(*) INTO incomplete_chains FROM (
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('it_ded_rep_1','it_ded_rep_2','it_ded_rep_3','it_ded_rep_4','it_ded_rep_5')
    GROUP BY parent_task_id HAVING COUNT(*) <> 5
    UNION ALL
    SELECT parent_task_id FROM sub_tasks
    WHERE registry_key IN ('ins_ded_rep_1','ins_ded_rep_2','ins_ded_rep_3','ins_ded_rep_4','ins_ded_rep_5')
    GROUP BY parent_task_id HAVING COUNT(*) <> 5
  ) s;
  IF incomplete_chains > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % parents have an incomplete 5-step deductions chain', incomplete_chains;
  END IF;

  SELECT COUNT(*) INTO missing_depends_on FROM sub_tasks
  WHERE registry_key IN (
    'it_ded_rep_2','it_ded_rep_3','it_ded_rep_4','it_ded_rep_5',
    'ins_ded_rep_2','ins_ded_rep_3','ins_ded_rep_4','ins_ded_rep_5'
  ) AND depends_on IS NULL;
  IF missing_depends_on > 0 THEN
    RAISE EXCEPTION 'Backfill invariant failed: % deductions chain subtasks missing depends_on', missing_depends_on;
  END IF;
END $$;

COMMIT;
