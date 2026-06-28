-- 2026-06-28
-- Partial unique index on identity_id:
-- allows duplicate identity_id only when business_type = 'חברה בע"מ'
CREATE UNIQUE INDEX customers_identity_id_unique
ON customers(identity_id)
WHERE identity_id IS NOT NULL
AND business_type != 'חברה בע"מ';
