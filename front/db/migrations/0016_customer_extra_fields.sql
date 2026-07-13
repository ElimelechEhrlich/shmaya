-- Three optional customer fields — no backfill/drop needed, purely additive.
ALTER TABLE customers
  ADD COLUMN parent_id_number text,
  ADD COLUMN spouse_birth_year integer,
  ADD COLUMN has_whatsapp boolean NOT NULL DEFAULT false;
