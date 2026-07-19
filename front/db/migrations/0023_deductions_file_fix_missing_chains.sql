-- 0023: Corrective fix for 0022 — 0022 only created it_ded_rep_1..5 /
-- ins_ded_rep_1..5 via the "migrate completed old row" path, never via a
-- "create fresh incomplete chain for everyone the registry condition
-- applies to" path (unlike 0020's equivalent fix for rep/it_rep/vat_rep).
-- Confirmed via eyeball inspection: customers with is_insurance_active=true
-- but no completed old 'deductions' row ended up with zero ins_ded_rep_*
-- rows at all. Idempotent — NOT EXISTS guards mean this is a no-op for
-- chains 0022 already created correctly (e.g. it_ded_rep for all 3, and
-- ins_ded_rep for the one customer 0022 already handled).

BEGIN;

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT ded.id, v.title, false, 'medium', '', v.registry_key, v.depends_on
FROM customers c
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

INSERT INTO sub_tasks (parent_task_id, title, is_completed, priority, comment, registry_key, depends_on)
SELECT ded.id, v.title, false, 'medium', '', v.registry_key, v.depends_on
FROM customers c
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

DO $$
DECLARE
  incomplete_chains int;
  missing_depends_on int;
BEGIN
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
    RAISE EXCEPTION 'Fix invariant failed: % parents have an incomplete 5-step deductions chain', incomplete_chains;
  END IF;

  SELECT COUNT(*) INTO missing_depends_on FROM sub_tasks
  WHERE registry_key IN (
    'it_ded_rep_2','it_ded_rep_3','it_ded_rep_4','it_ded_rep_5',
    'ins_ded_rep_2','ins_ded_rep_3','ins_ded_rep_4','ins_ded_rep_5'
  ) AND depends_on IS NULL;
  IF missing_depends_on > 0 THEN
    RAISE EXCEPTION 'Fix invariant failed: % deductions chain subtasks missing depends_on', missing_depends_on;
  END IF;
END $$;

COMMIT;
