-- Backfill customer detail columns from the old 1:1 detail tables.
-- This migrates data from business_details, income_tax_cases, vat_cases,
-- insurance_cases and payment_details into direct columns on customers.

BEGIN;

UPDATE customers AS c
SET
  business_name = bd.business_name,
  business_id = bd.business_id,
  business_type = bd.business_type,
  opening_date = bd.opening_date,
  occupation = bd.occupation,
  business_description = bd.business_description,
  employs_workers = bd.employs_workers,
  needs_deductions_file = bd.needs_deductions_file,
  deductions_id = bd.deductions_id
FROM business_details bd
WHERE bd.customer_id = c.id;

UPDATE customers AS c
SET
  income_tax_rep_type = it.rep_type,
  income_tax_prepayment = it.income_tax_prepayment,
  annual_turnover = it.annual_turnover,
  income_tax_is_new_case = it.is_new_case
FROM income_tax_cases it
WHERE it.customer_id = c.id;

UPDATE customers AS c
SET
  vat_is_new_case = vat.is_new_case
FROM vat_cases vat
WHERE vat.customer_id = c.id;

UPDATE customers AS c
SET
  insurance_prepayment = ins.insurance_prepayment,
  work_hours = ins.work_hours,
  insurance_is_new_case = ins.is_new_case
FROM insurance_cases ins
WHERE ins.customer_id = c.id;

UPDATE customers AS c
SET
  setup_fee = pay.setup_fee,
  monthly_fee = pay.monthly_fee,
  direct_debit = pay.direct_debit
FROM payment_details pay
WHERE pay.customer_id = c.id;

UPDATE customers
SET is_income_tax_active = true
WHERE id IN (SELECT customer_id FROM income_tax_cases);

UPDATE customers
SET is_vat_active = true
WHERE id IN (SELECT customer_id FROM vat_cases);

UPDATE customers
SET is_insurance_active = true
WHERE id IN (SELECT customer_id FROM insurance_cases);

COMMIT;
