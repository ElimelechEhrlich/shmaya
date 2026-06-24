-- Add flattened customer detail fields directly to customers.
-- This supports migrating the old 1:1 detail tables into direct columns.
-- All new columns are nullable or have safe defaults to avoid breaking existing rows.

BEGIN;

ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_id text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS employs_workers text,
  ADD COLUMN IF NOT EXISTS needs_deductions_file boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deductions_id text,
  ADD COLUMN IF NOT EXISTS income_tax_rep_type text,
  ADD COLUMN IF NOT EXISTS income_tax_prepayment text,
  ADD COLUMN IF NOT EXISTS annual_turnover text,
  ADD COLUMN IF NOT EXISTS income_tax_is_new_case boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_is_new_case boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_prepayment text,
  ADD COLUMN IF NOT EXISTS work_hours text,
  ADD COLUMN IF NOT EXISTS insurance_is_new_case boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_id text,
  ADD COLUMN IF NOT EXISTS insurance_status text,
  ADD COLUMN IF NOT EXISTS setup_fee text,
  ADD COLUMN IF NOT EXISTS monthly_fee text,
  ADD COLUMN IF NOT EXISTS direct_debit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_income_tax_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vat_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_insurance_active boolean DEFAULT false;

COMMIT;
