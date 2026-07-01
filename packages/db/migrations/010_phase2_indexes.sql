-- ── FINANCE INDEXES ────────────────────────────────────────────
CREATE INDEX idx_coa_company_type ON chart_of_accounts(company_id, account_type);
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_id);
CREATE INDEX idx_cost_center_code ON cost_centers(company_id, code);
CREATE INDEX idx_analytic_code ON analytic_accounts(company_id, code);
CREATE INDEX idx_analytic_cost_center ON analytic_accounts(cost_center_id);
CREATE INDEX idx_fx_rates_lookup ON fx_rates(from_currency, to_currency, rate_date DESC);
CREATE INDEX idx_je_company_date ON journal_entries(company_id, entry_date DESC);
CREATE INDEX idx_je_company_status ON journal_entries(company_id, status);
CREATE INDEX idx_je_source ON journal_entries(source_type, source_id);
CREATE INDEX idx_je_reference ON journal_entries(reference);
CREATE INDEX idx_jl_account ON journal_lines(account_id, journal_entry_id);
CREATE INDEX idx_jl_analytic ON journal_lines(analytic_account_id, journal_entry_id);
CREATE INDEX idx_jl_cost_center ON journal_lines(cost_center_id, journal_entry_id);
CREATE INDEX idx_jl_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_period_company_date ON accounting_periods(company_id, start_date);
CREATE INDEX idx_period_status ON accounting_periods(company_id, status)
  WHERE status = 'open';

-- ── PROCUREMENT INDEXES ────────────────────────────────────────
CREATE INDEX idx_vendors_company ON vendors(company_id);
CREATE INDEX idx_vendors_active ON vendors(company_id, is_active) WHERE is_active = true;
CREATE INDEX idx_po_company_status ON purchase_orders(company_id, status);
CREATE INDEX idx_po_company_date ON purchase_orders(company_id, created_at DESC);
CREATE INDEX idx_po_open ON purchase_orders(assigned_to, status)
  WHERE status NOT IN ('closed','cancelled','rejected');
CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_analytic ON purchase_orders(analytic_account_id);
CREATE INDEX idx_po_lines_po ON po_lines(po_id);
CREATE INDEX idx_po_lines_product ON po_lines(product_id);
CREATE INDEX idx_po_approval_pending ON po_approval_log(po_id, created_at DESC);
CREATE INDEX idx_po_approval_actor ON po_approval_log(actor_id, created_at DESC);
CREATE INDEX idx_po_receipts_po ON po_receipts(po_id);
CREATE INDEX idx_po_receipt_lines_receipt ON po_receipt_lines(receipt_id);
CREATE INDEX idx_po_receipt_lines_line ON po_receipt_lines(po_line_id);

-- ── INVENTORY INDEXES ─────────────────────────────────────────
CREATE INDEX idx_products_active ON products(company_id, is_active) WHERE is_active = true;
CREATE INDEX idx_products_category ON products(company_id, category);
CREATE INDEX idx_locations_company ON stock_locations(company_id);
CREATE INDEX idx_locations_type ON stock_locations(company_id, type);
CREATE INDEX idx_moves_product_date ON stock_moves(product_id, moved_at DESC);
CREATE INDEX idx_moves_from_location ON stock_moves(from_location_id, moved_at DESC);
CREATE INDEX idx_moves_to_location ON stock_moves(to_location_id, moved_at DESC);
CREATE INDEX idx_moves_source ON stock_moves(source_type, source_id);
CREATE INDEX idx_moves_lot ON stock_moves(lot_id);
CREATE INDEX idx_moves_date_brin ON stock_moves USING BRIN(moved_at);
CREATE INDEX idx_balance_location ON stock_balances(location_id);
CREATE INDEX idx_balance_low_stock ON stock_balances(product_id)
  WHERE qty_on_hand <= 10;

-- ── INTERCO INDEXES ────────────────────────────────────────────
CREATE INDEX idx_interco_from_company ON interco_transactions(from_company_id, created_at DESC);
CREATE INDEX idx_interco_to_company ON interco_transactions(to_company_id, created_at DESC);
CREATE INDEX idx_interco_status ON interco_transactions(status) WHERE status = 'pending';
