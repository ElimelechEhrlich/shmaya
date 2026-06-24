-- Migrate `parent_tasks` to store the Registry parent-task key directly.
-- This allows the app to match generated tasks with existing rows by `registry_key`
-- instead of relying on fragile title-only matching.

BEGIN;

ALTER TABLE IF EXISTS parent_tasks
  ADD COLUMN IF NOT EXISTS registry_key text;

CREATE INDEX IF NOT EXISTS parent_tasks_registry_key_idx
  ON parent_tasks (registry_key);

UPDATE parent_tasks
SET registry_key = CASE
  WHEN title = 'הקמה אדמיניסטרטיבית' THEN 'ADMIN_SETUP'
  WHEN title = 'טיפול מול ביטוח לאומי' THEN 'INSURANCE'
  WHEN title = 'טיפול מול מס הכנסה' THEN 'INCOME_TAX'
  WHEN title = 'טיפול מול מע"מ' THEN 'VAT'
  WHEN title = 'הסדרת הוראות קבע' THEN 'DIRECT_DEBIT'
  WHEN title = 'אישור ניהולי סופי' THEN 'FINAL_APPROVAL'
  ELSE registry_key
END
WHERE registry_key IS NULL;

COMMIT;
