-- 0012: adds updated_by to sub_tasks
-- updated_by is already written by PersistenceAdapter (updateSubtaskStatus,
-- updateSubtaskStatusBulk, updateSubtaskComment) but the column was missing.

ALTER TABLE sub_tasks
  ADD COLUMN IF NOT EXISTS updated_by text;
