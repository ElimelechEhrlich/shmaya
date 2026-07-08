-- Documentation-only: these columns were already applied directly via the
-- Supabase dashboard. Kept idempotent so a fresh environment stays in sync.
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS id_photo_url text,
ADD COLUMN IF NOT EXISTS bank_approval_url text,
ADD COLUMN IF NOT EXISTS agreement_url text;
