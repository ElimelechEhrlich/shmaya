-- db/migrations/0001_registry_alignment.sql
--
-- Aligns the live Supabase schema with src/registries/CustomerRegistry.ts.
-- Audit cross-reference: .claude/project-map.md §1, §4, §7.
--
-- Naming convention: snake_case for new columns. Quoted camelCase identifiers
-- need escaping on every query and the team chose snake_case to avoid the
-- recurring PostgreSQL casing errors. PersistenceAdapter does the
-- camelCase↔snake_case translation; nothing else in /src knows DB column
-- names.
--
-- Sections 1 and 2 are required for the new TS infrastructure to work.
-- Section 3 lists drop-candidates — review and uncomment after confirming
-- no remaining readers.
-- Section 4 documents a future rename pass for the remaining mixed-case
-- columns (e.g. clients.businessDetails).

-- ════════════════════════════════════════════════════════════════
-- 1. tasks.parent_task_id
-- ════════════════════════════════════════════════════════════════
-- Audit finding #5: TaskService.isCustomerFinalized relies on substring-
-- matching Hebrew titles. Adding a stable registry id per row removes that
-- brittleness — CustomerRegistry.isCustomerFinalized keys off parentTaskId
-- (the adapter-translated camelCase view of this column).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id text;

CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx
  ON tasks (parent_task_id);

-- One-time backfill for rows generated before this column existed.
-- Uses the same Hebrew-substring heuristic that isCustomerFinalized had —
-- this is the ONE place that gunk is acceptable, because afterwards every
-- newly generated row carries the id explicitly (TaskGeneratorService now
-- emits parentTaskId on every row).
UPDATE tasks SET parent_task_id = CASE
  WHEN parent_task_id IS NOT NULL              THEN parent_task_id
  WHEN title LIKE '%הקמה אדמיניסטרטיבית%'      THEN 'ADMIN_SETUP'
  WHEN title LIKE '%ביטוח לאומי%'              THEN 'INSURANCE'
  WHEN title LIKE '%מס הכנסה%'                 THEN 'INCOME_TAX'
  WHEN title LIKE '%מע"מ%'                     THEN 'VAT'
  WHEN title LIKE '%הוראות קבע%'               THEN 'DIRECT_DEBIT'
  WHEN title LIKE '%אישור ניהול%'              THEN 'FINAL_APPROVAL'
  WHEN title LIKE '%פתיחת תיק סופית%'          THEN 'FINAL_APPROVAL'
  ELSE NULL
END;

-- ════════════════════════════════════════════════════════════════
-- 2. logs table (snake_case columns)
-- ════════════════════════════════════════════════════════════════
-- Replaces the broken src/services/logService.js placeholder fetch.
-- LogService.ts now writes here via PersistenceAdapter, which renames
-- camelCase keys (entityType, entityId, createdAt) to these snake_case
-- columns.

CREATE TABLE IF NOT EXISTS logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL    DEFAULT now(),
  actor        text        NOT NULL,
  action       text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    uuid,
  payload      jsonb       NOT NULL    DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS logs_entity_idx
  ON logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS logs_created_at_idx
  ON logs (created_at DESC);

CREATE INDEX IF NOT EXISTS logs_action_idx
  ON logs (action);

-- RLS reminder: the anon key is shipped to the browser. Add policies before
-- this goes live, e.g.:
--   ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY logs_insert_any ON logs FOR INSERT WITH CHECK (true);
--   CREATE POLICY logs_select_self ON logs FOR SELECT USING (actor = current_setting('app.user_name', true));
-- (Adjust to your auth model; current "auth" is a localStorage flag with no
-- DB-side identity, so any RLS here is purely cosmetic until that's fixed.)

-- ════════════════════════════════════════════════════════════════
-- 3. Drop candidates — REVIEW BEFORE RUNNING
-- ════════════════════════════════════════════════════════════════
-- Phantom or dead columns identified by the audit. Each statement is
-- commented out; uncomment after confirming via grep that no consumer
-- remains.

-- 3a. clients."representationFor" — declared in AddCustomer initial state but
-- never read or written anywhere else. AddCustomer no longer initializes it
-- (removed in the Registry refactor); safe to drop.
-- ALTER TABLE clients DROP COLUMN IF EXISTS "representationFor";

-- 3b. clients."isFinalApproved" — referenced once in CustomerList.exportToExcel
-- in a comparison that could never evaluate true. Replaced by
-- TaskGeneratorService.isCustomerFinalized(client.tasks). Safe to drop.
-- ALTER TABLE clients DROP COLUMN IF EXISTS "isFinalApproved";

-- 3c. tasks.category — rendered in CustomerCard.jsx but never written.
-- Phantom column.
-- ALTER TABLE tasks DROP COLUMN IF EXISTS "category";

-- 3d. tasks.details — top-level details column whose only writer was the
-- orphaned TaskManager component (deleted in the Registry refactor). The
-- generator writes details into subTasks[*].details instead.
-- ALTER TABLE tasks DROP COLUMN IF EXISTS "details";

-- ════════════════════════════════════════════════════════════════
-- 4. Phase 2 — remaining mixed-case rename (NOT in this migration)
-- ════════════════════════════════════════════════════════════════
-- For full snake_case consistency, the following columns are still
-- camelCase and would need renaming:
--
--   clients.customerDetails        → clients.customer_details
--   clients.businessDetails        → clients.business_details
--   clients.insuranceDetails       → clients.insurance_details
--   clients.incomeTaxDetails       → clients.income_tax_details
--   clients.vatDetails             → clients.vat_details
--   clients.paymentDetails         → clients.payment_details
--   clients.isInsuranceActive      → clients.is_insurance_active
--   clients.isIncomeTaxActive      → clients.is_income_tax_active
--   clients.isVatActive            → clients.is_vat_active
--   clients.needsDeductionsFile    → clients.needs_deductions_file
--   tasks.subTasks                 → tasks.sub_tasks
--   tasks.restrictedTo             → tasks.restricted_to
--
-- After renaming, extend the CUSTOMER_TO_DB / TASK_TO_DB maps in
-- src/services/PersistenceAdapter.ts to translate. Coordination required:
-- migrate every reader before flipping the rename, or do it all in one
-- transaction.
