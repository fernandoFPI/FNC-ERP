-- Migration 306: let a project contract be tagged remeasure / unit_rate / hybrid
-- project_contracts.default_billing_method only allowed milestone / progress /
-- cost_plus / fixed_lump_sum (migration 021), so the commercial types
-- remeasure, unit_rate and hybrid could not be recorded on a contract.
--
-- Contract level only. project_invoices.billing_method is deliberately left
-- alone: the invoicing engine (packages/billing) can only build invoice lines
-- for the original four methods, so every invoice is still raised as one of
-- those four, chosen when the invoice is created. Nothing reads a contract's
-- default_billing_method to drive billing; it is a label until quantity-based
-- invoicing (BOQ / measured quantities) exists.
--
-- Widening a CHECK can never fail against existing data: every row that
-- satisfied the narrower rule satisfies this one.
ALTER TABLE project_contracts
  DROP CONSTRAINT IF EXISTS project_contracts_default_billing_method_check;

ALTER TABLE project_contracts
  ADD CONSTRAINT project_contracts_default_billing_method_check
  CHECK (default_billing_method IN (
    'milestone', 'progress', 'cost_plus', 'fixed_lump_sum',
    'remeasure', 'unit_rate', 'hybrid'
  ));
