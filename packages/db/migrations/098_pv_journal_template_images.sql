ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS pv_template_image TEXT,
  ADD COLUMN IF NOT EXISTS journal_template_image TEXT;
