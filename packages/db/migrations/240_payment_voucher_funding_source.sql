-- Migration 240: Structured funding source on payment_vouchers
-- Adds a structured "paid from" reference (a specific petty cash float or
-- recon bank account) alongside the existing free-text bank_account_fund
-- column, which is left untouched — it also serves a distinct existing
-- purpose (auto-filled GL account code annotation on advance-settlement
-- vouchers, see apps/web/src/pages/finance/payment-vouchers/PaymentVoucherDetail.tsx).

ALTER TABLE payment_vouchers
  ADD COLUMN funding_source_type VARCHAR(20) CHECK (funding_source_type IN ('cash_box','bank_account')),
  ADD COLUMN petty_cash_float_id UUID REFERENCES petty_cash_floats(id),
  ADD COLUMN recon_bank_account_id UUID REFERENCES recon_bank_accounts(id);

ALTER TABLE payment_vouchers
  ADD CONSTRAINT chk_funding_source_exactly_one CHECK (
    (funding_source_type IS NULL AND petty_cash_float_id IS NULL AND recon_bank_account_id IS NULL)
    OR (funding_source_type = 'cash_box' AND petty_cash_float_id IS NOT NULL AND recon_bank_account_id IS NULL)
    OR (funding_source_type = 'bank_account' AND recon_bank_account_id IS NOT NULL AND petty_cash_float_id IS NULL)
  );

CREATE INDEX idx_payment_vouchers_petty_cash_float ON payment_vouchers(petty_cash_float_id);
CREATE INDEX idx_payment_vouchers_recon_bank_account ON payment_vouchers(recon_bank_account_id);
