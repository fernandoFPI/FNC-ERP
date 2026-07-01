-- Company stamp (base64 data URL, per-company)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stamp_image TEXT;

-- Payment type on invoice (wire_transfer | cash)
ALTER TABLE project_invoices ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) NOT NULL DEFAULT 'wire_transfer';

-- Extended bank account fields
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS beneficiary_name VARCHAR(255);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS branch_code VARCHAR(50);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS bank_address TEXT;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS intermediary_bank_name VARCHAR(255);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS intermediary_swift VARCHAR(50);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS intermediary_country VARCHAR(100);
