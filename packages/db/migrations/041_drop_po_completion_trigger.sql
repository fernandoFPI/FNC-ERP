-- ── MIGRATION 041: DROP PO COMPLETION AUTO-INVOICE TRIGGER ──────────────────
-- Vendor invoices are created manually by AP staff, not auto-drafted on PO completion.

DROP TRIGGER IF EXISTS trigger_po_completion_vendor_invoice ON purchase_orders;
DROP FUNCTION IF EXISTS create_vendor_invoice_on_po_completion();
