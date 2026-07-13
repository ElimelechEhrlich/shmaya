-- Adds client_type (replacing is_new_business), the spousal income-tax
-- fields, and the customer "waiting" status.
--
-- client_type replaces is_new_business entirely (DROP COLUMN, not just
-- deprecation). To avoid ever having a row silently lose its value, the
-- whole migration runs as one transaction: add the column, backfill every
-- existing row from is_new_business, verify zero NULLs remain, only then
-- enforce NOT NULL and drop the old column. If the verification fails the
-- RAISE EXCEPTION aborts the transaction and nothing in this file is
-- committed — not even the earlier ADD COLUMN statements.

BEGIN;

ALTER TABLE customers
  ADD COLUMN client_type text,
  ADD COLUMN spouse_file_exists boolean NOT NULL DEFAULT false,
  ADD COLUMN spouse_representation_transfer_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN is_waiting boolean NOT NULL DEFAULT false;

UPDATE customers
SET client_type = CASE WHEN is_new_business THEN 'עסק חדש' ELSE 'לקוח עובר (עסק קיים)' END
WHERE client_type IS NULL;

DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM customers WHERE client_type IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration 0015 aborted: % row(s) still have NULL client_type after backfill', null_count;
  END IF;
END $$;

ALTER TABLE customers
  ALTER COLUMN client_type SET NOT NULL,
  DROP COLUMN is_new_business;

COMMIT;
