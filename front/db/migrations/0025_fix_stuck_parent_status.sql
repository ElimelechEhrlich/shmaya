-- 0025: One-time data fix for a cascade bug — several code paths that mark a
-- sub_task completed (Tasks.tsx onRowToggle, Dashboard.tsx office-task toggle,
-- CreateTaskModal.tsx subtask edit, and the CustomerCard "toggle whole parent"
-- bulk action) never wrote parent_tasks.status back, leaving it stuck at
-- 'pending' even after every one of its sub_tasks was completed. The app code
-- itself is fixed (PersistenceAdapter.updateSubtaskStatus /
-- updateSubtasksStatusByParent now recompute this cascade on every write) —
-- this migration only backfills the rows that were already stuck before that
-- fix landed. Data-driven, not a frozen list: any parent_tasks row currently
-- 'pending' with at least one sub_task, none of them incomplete.

BEGIN;

UPDATE parent_tasks
SET status = 'completed'
WHERE status = 'pending'
  AND EXISTS (
    SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = parent_tasks.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = parent_tasks.id AND st.is_completed = false
  );

DO $$
DECLARE
  still_stuck int;
BEGIN
  SELECT COUNT(*) INTO still_stuck FROM parent_tasks p
  WHERE p.status = 'pending'
    AND EXISTS (SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM sub_tasks st WHERE st.parent_task_id = p.id AND st.is_completed = false);

  IF still_stuck > 0 THEN
    RAISE EXCEPTION 'Fix invariant failed: % parent_tasks rows still pending with all sub_tasks completed', still_stuck;
  END IF;
END $$;

COMMIT;
