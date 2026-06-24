-- Drop the five legacy detail tables that existed before the schema was
-- flattened onto the `customers` table (migrations 0004–0006).
-- All customer data now lives directly on `customers` columns; these tables
-- are empty and unreferenced by any application code.
--
-- Applied: 2026-06-23, via Supabase Dashboard → SQL Editor.

BEGIN;
DROP TABLE IF EXISTS business_details   CASCADE;
DROP TABLE IF EXISTS income_tax_cases   CASCADE;
DROP TABLE IF EXISTS vat_cases          CASCADE;
DROP TABLE IF EXISTS insurance_cases    CASCADE;
DROP TABLE IF EXISTS payment_details    CASCADE;
COMMIT;
