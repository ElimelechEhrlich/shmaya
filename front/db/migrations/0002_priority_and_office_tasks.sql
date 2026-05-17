-- db/migrations/0002_priority_and_office_tasks.sql
--
-- Adds task prioritization and office-wide task support, plus customer
-- active flag. PersistenceAdapter is the only file aware of these column
-- names; UI components only ever see camelCase.

-- ════════════════════════════════════════════════════════════════
-- 1. tasks.priority
-- ════════════════════════════════════════════════════════════════
-- Levels: 'low' | 'medium' | 'high' | 'critical'. Default 'medium' so
-- existing rows back-fill cleanly.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS tasks_priority_idx ON tasks (priority);

-- ════════════════════════════════════════════════════════════════
-- 2. tasks.client_id NULLABLE (office-wide tasks)
-- ════════════════════════════════════════════════════════════════
-- A task with client_id IS NULL represents an office-wide / general
-- task that isn't bound to any specific customer.

ALTER TABLE tasks
  ALTER COLUMN client_id DROP NOT NULL;

-- ════════════════════════════════════════════════════════════════
-- 3. clients.is_active
-- ════════════════════════════════════════════════════════════════
-- Customers can be marked inactive without deletion (preserves history
-- and tasks). The UI surfaces this via the deactivate button in
-- CustomerCard.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS clients_is_active_idx ON clients (is_active);
