-- ── MIGRATION 030: PO LIFECYCLE REDESIGN ──────────────────────────────────
-- Replaces the two-level approval flow with a full procurement workflow:
-- opening → inventory_check → store_pricing → market_pricing →
-- price_verification → review → pending_approval → approved → completed
-- Introduces po_position_assignments for scoped position roles.

-- STEP 1: Drop old status CHECK on purchase_orders
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- STEP 2: Add new status CHECK
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'opening',
    'inventory_check',
    'store_pricing',
    'market_pricing',
    'price_verification',
    'review',
    'pending_approval',
    'dept_assigned',
    'approved',
    'completed',
    'deleted'
  ));

-- STEP 3: Migrate existing status values to new equivalents
UPDATE purchase_orders SET status = 'opening'
  WHERE status IN ('draft');
UPDATE purchase_orders SET status = 'pending_approval'
  WHERE status IN ('submitted', 'pending_review', 'under_review');
UPDATE purchase_orders SET status = 'approved'
  WHERE status IN ('approved_l1', 'approved_l2', 'ordered');
UPDATE purchase_orders SET status = 'completed'
  WHERE status IN ('partially_received', 'fully_received', 'invoiced', 'closed');
UPDATE purchase_orders SET status = 'deleted'
  WHERE status IN ('rejected', 'cancelled');

-- STEP 4: Make vendor_id nullable (vendor is selected during market pricing, not at creation)
ALTER TABLE purchase_orders
  ALTER COLUMN vendor_id DROP NOT NULL;

-- STEP 5: Add lifecycle columns to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS organizer_id         UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_approver_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS store_keeper_id      UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS store_pricing_id     UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS procurement_officer_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS procurement_2nd_id   UUID REFERENCES employees(id);

-- Backfill organizer_id from created_by
UPDATE purchase_orders
  SET organizer_id = created_by
  WHERE organizer_id IS NULL;

-- STEP 6: Add pricing-stage columns to po_lines
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS store_price          NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS store_price_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS store_price_notes    TEXT,
  ADD COLUMN IF NOT EXISTS vendor_quote_ref     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS verification_notes   TEXT;

-- STEP 7: Drop the overly restrictive action CHECK on po_approval_log
--         so new action strings are accepted
ALTER TABLE po_approval_log
  DROP CONSTRAINT IF EXISTS po_approval_log_action_check;

-- STEP 8: Create po_position_assignments
CREATE TABLE IF NOT EXISTS po_position_assignments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  position      VARCHAR(30) NOT NULL
    CHECK (position IN (
      'store_keeper',
      'store_pricing',
      'procurement_officer',
      'procurement_2nd',
      'po_admin'
    )),
  -- scope: project-level OR department-level (at least one required)
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  assigned_by   UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ppa_must_have_scope CHECK (
    (project_id IS NOT NULL) OR (department_id IS NOT NULL)
  )
);

-- STEP 9: Indexes
CREATE INDEX IF NOT EXISTS idx_ppa_company
  ON po_position_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_ppa_employee
  ON po_position_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_ppa_project
  ON po_position_assignments(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppa_dept
  ON po_position_assignments(department_id)
  WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_status_company
  ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_po_organizer
  ON purchase_orders(organizer_id)
  WHERE organizer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_assigned_approver
  ON purchase_orders(assigned_approver_id)
  WHERE assigned_approver_id IS NOT NULL;
