// Synthetic, client-side-only demo PO for the interactive Purchase Order
// tour. Never touches the database — see the "Chosen approach" note in the
// PO tour plan for why (no real seeded row: it would need excluding from
// every real PO/project list and dashboard KPI company-wide, and wouldn't
// exist for companies created after a seed/migration ran).
//
// TOUR_DEMO_PO_ID is a well-formed but reserved UUID — deliberately NOT a
// non-UUID string, so if any query/mutation is ever fired against it by
// mistake (e.g. a future id-scoped query added here without a tour-demo
// guard), Postgres cleanly returns "not found" instead of a type-cast
// error. Harmless either way — just a wasted network call — see
// PurchaseOrderDetail.tsx and ReceiptForm.tsx for the guarded queries.
import type { PO, POLine } from '../../pages/procurement/purchase-orders/PurchaseOrderDetail'

export const TOUR_DEMO_PO_ID = '00000000-0000-0000-0000-0000000000f0'

// Vendor is genuinely unknown until Market Pricing in the real workflow —
// the demo mirrors that instead of showing a vendor from the first step.
const VENDOR_KNOWN_FROM = new Set([
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'ready_to_issue',
  'items_bought',
  'goods_received',
  'finance_audit',
  'invoiced',
  'completed',
])

function demoLines(): POLine[] {
  return [
    {
      id: 'demo-line-1',
      product_id: 'demo-product-1',
      product_name: 'Steel Angle Bar 50mm',
      description: 'Steel Angle Bar 50mm',
      qty: 100,
      uom: 'pc',
      qty_received: 0,
      unit_price: 5000,
      total: 500000,
      qty_from_stock: 20,
      in_stock: false,
      market_price: 5200,
      market_price_currency: 'IQD',
      fx_rate_to_base: 1,
      actual_unit_price: 5150,
      is_bought: true,
      audit_status: 'ok',
    },
    {
      id: 'demo-line-2',
      product_id: 'demo-product-2',
      product_name: 'Cement Bags 50kg',
      description: 'Cement Bags 50kg',
      qty: 200,
      uom: 'bag',
      qty_received: 0,
      unit_price: 12000,
      total: 2400000,
      qty_from_stock: 0,
      in_stock: false,
      market_price: 12500,
      market_price_currency: 'IQD',
      fx_rate_to_base: 1,
      actual_unit_price: 12300,
      is_bought: true,
      audit_status: 'ok',
    },
    {
      // A "Custom item" line — no catalog product yet. Left unbought on
      // purpose so the Items Bought step still has something to interact
      // with, and shows up as the example for the New Items to Catalog step.
      id: 'demo-line-3',
      product_id: '',
      product_name: '',
      description: 'Custom Item — Rebar Mesh 6mm (not yet in catalog)',
      qty: 50,
      uom: 'sheet',
      qty_received: 0,
      unit_price: 8000,
      total: 400000,
      qty_from_stock: 0,
      in_stock: false,
      market_price: 8200,
      market_price_currency: 'IQD',
      fx_rate_to_base: 1,
      actual_unit_price: undefined,
      is_bought: false,
      audit_status: 'pending',
    },
  ]
}

export function buildTourDemoPO(status: string): PO {
  const lines = demoLines()
  const vendorKnown = VENDOR_KNOWN_FROM.has(status)
  const now = new Date().toISOString()
  return {
    id: TOUR_DEMO_PO_ID,
    po_number: 'PO-TOUR-DEMO',
    status,
    priority: 'low',
    currency_code: 'IQD',
    base_currency_code: 'IQD',
    total_amount: lines.reduce((s, l) => s + l.total, 0),
    subtotal: lines.reduce((s, l) => s + l.total, 0),
    vendor_id: vendorKnown ? 'demo-vendor-1' : null,
    vendor_name: vendorKnown ? 'Al-Rasheed Building Materials Co.' : undefined,
    project_id: 'demo-project-1',
    purpose: 'project',
    linkedProjectId: 'demo-project-1',
    projectCode: 'PRJ-DEMO-01',
    projectName: 'Tour Demo — Al Karrada Renovation',
    branch_id: 'demo-branch-1',
    branch_name: 'Baghdad Branch',
    funding_source: status === 'invoiced' || status === 'completed' ? 'vendor_ap' : null,
    // false (not decided yet) so the Invoiced step's interactive
    // funding-decision UI shows, rather than the passive "Awaiting
    // Finance" notice — more useful for a walkthrough.
    funding_decided: false,
    assigned_buyer_user_id: 'demo-user-1',
    assigned_buyer_name: 'You (tour)',
    buyerNames: ['You (tour)'],
    callerIsBuyer: true,
    callerHasStorePricingPosition: true,
    callerHasMarketPricingPosition: true,
    expected_delivery_date: now.slice(0, 10),
    notes: 'Tour walkthrough demo — nothing here is real or saved.',
    created_by_email: 'you@tour.demo',
    created_at: now,
    updated_at: now,
    lines,
    receipts: [],
    approval_log: [],
    edit_requests: [],
  }
}

// ReceiptForm.tsx reads a much smaller, loosely-typed slice of the PO (its
// own inline shape, not PurchaseOrderDetail.tsx's `PO` interface) — this
// mirrors exactly what that file reads (grepped: purpose,
// delivery_destination, po_number, status, vendor_name, created_at, plus
// .lines with string-typed numeric fields and .assigned_receiver_name).
// Framed as a direct-to-jobsite delivery (purpose 'project',
// delivery_destination 'jobsite') so the tour's Receiving step lands on the
// simplified "Mark Delivered" branch — the Project Supply-specific path.
export function buildTourDemoReceiptPO() {
  const lines = demoLines()
  return {
    po_number: 'PO-TOUR-DEMO',
    status: 'items_bought',
    vendor_name: 'Al-Rasheed Building Materials Co.',
    created_at: new Date().toISOString(),
    purpose: 'project',
    delivery_destination: 'jobsite',
    assigned_receiver_name: null,
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description,
      sku: l.product_id || null,
      qty: String(l.qty),
      qty_received: String(l.qty_received),
      qty_from_stock: String(l.qty_from_stock),
      unit_price: String(l.unit_price),
    })),
  }
}

// Mirrors PurchaseOrderDetail.tsx's own `stockAvailability` shape (derived
// there from `stockData?.poStockAvailability`) — the Inventory Check step
// reads this instead of that skipped query when isTourDemo is true.
export function buildTourDemoStockAvailability(po: PO) {
  return po.lines.map((line) => {
    const qtyRequired = line.qty
    const qtyOnHand = line.qty_from_stock
    const qtyAvailable = qtyOnHand
    return {
      lineId: line.id,
      productId: line.product_id || undefined,
      productName: line.product_name || undefined,
      description: line.description,
      qtyRequired,
      qtyOnHand,
      qtyAvailable,
      isAvailable: qtyAvailable >= qtyRequired,
      byLocation:
        qtyOnHand > 0
          ? [
              {
                companyId: 'demo-company-1',
                companyName: 'Your Company',
                locationId: 'demo-location-1',
                locationName: 'Main Warehouse',
                qtyOnHand,
                qtyAvailable,
                averageCost: line.unit_price,
              },
            ]
          : [],
    }
  })
}
