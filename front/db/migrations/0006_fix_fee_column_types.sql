-- Fix setup_fee and monthly_fee column types: text → numeric.
--
-- Why: migration 0004 declared them as text by mistake. The backfill in 0005
-- cast payment_details (numeric) → text, producing "1200.00" strings.
-- Customers created via the app after the backfill have "" (empty string).
--
-- USING COALESCE(NULLIF(col,'')::numeric, 0):
--   step 1: NULLIF converts "" to NULL, leaves "1200.00" as-is
--   step 2: ::numeric casts "1200.00" → 1200, NULL stays NULL
--   step 3: COALESCE maps NULL → 0  (matches old _writeDetailTables behavior)
--
-- After this migration the adapter writes Number(fee)||0 instead of the
-- raw string — see companion change in PersistenceAdapter.ts.

BEGIN;

ALTER TABLE customers
  ALTER COLUMN setup_fee   TYPE numeric
    USING COALESCE(NULLIF(setup_fee,   '')::numeric, 0),
  ALTER COLUMN monthly_fee TYPE numeric
    USING COALESCE(NULLIF(monthly_fee, '')::numeric, 0);

ALTER TABLE customers
  ALTER COLUMN setup_fee   SET DEFAULT 0,
  ALTER COLUMN monthly_fee SET DEFAULT 0;

COMMIT;
