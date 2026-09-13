// Synthetic, client-side-only demo Requisition for the interactive
// Requisition tour — same approach as tourDemoPO.ts (never touches the
// database; see that file's header comment for why). TOUR_DEMO_REQUISITION_ID
// is a distinct reserved UUID from TOUR_DEMO_PO_ID so both demo records can
// coexist once the tour hands off from one to the other in a later phase.
import type { Requisition, ReqLine, LineAvailability } from '../../pages/procurement/requisitions/RequisitionDetail'

export const TOUR_DEMO_REQUISITION_ID = '00000000-0000-0000-0000-0000000000f1'

// Mirrors tourDemoPO.ts's own VENDOR_KNOWN_FROM pattern: a field only
// "known" once the real workflow would actually have set it, so a line
// column doesn't show a price/qty from a stage that hasn't happened yet.
const QTY_FROM_STOCK_CONFIRMED_FROM = new Set([
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'items_bought',
  'sourcing',
  'completed',
])
const STORE_PRICE_KNOWN_FROM = new Set([
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'items_bought',
  'sourcing',
  'completed',
])
const MARKET_PRICE_KNOWN_FROM = new Set([
  'market_pricing',
  'price_verification',
  'pending_approval',
  'approved',
  'items_bought',
  'sourcing',
  'completed',
])
const VERIFIED_PRICE_KNOWN_FROM = new Set([
  'price_verification',
  'pending_approval',
  'approved',
  'items_bought',
  'sourcing',
  'completed',
])

interface DemoLineSeed {
  id: string
  description: string
  product_id: string
  product_name: string
  qty: number
  uom: string
  unit_price: number
  stockOnHand: number
  confirmedQtyFromStock: number
  storePrice: number
  marketPrice: number
  verifiedPrice: number
}

function demoLineSeeds(): DemoLineSeed[] {
  return [
    {
      id: 'demo-req-line-1',
      description: 'Steel Angle Bar 50mm',
      product_id: 'demo-product-1',
      product_name: 'Steel Angle Bar 50mm',
      qty: 100,
      uom: 'pc',
      unit_price: 5000,
      stockOnHand: 30,
      confirmedQtyFromStock: 20,
      storePrice: 4900,
      marketPrice: 5200,
      verifiedPrice: 5150,
    },
    {
      id: 'demo-req-line-2',
      description: 'Cement Bags 50kg',
      product_id: 'demo-product-2',
      product_name: 'Cement Bags 50kg',
      qty: 200,
      uom: 'bag',
      unit_price: 12000,
      stockOnHand: 0,
      confirmedQtyFromStock: 0,
      storePrice: 11800,
      marketPrice: 12500,
      verifiedPrice: 12300,
    },
    {
      // A "Custom item" line — no catalog product yet, same device
      // tourDemoPO.ts uses for its own line 3. Pricing still flows through
      // normally; only Buying/catalog-matching cares whether it has a
      // product_id, and this phase doesn't reach Buying yet.
      id: 'demo-req-line-3',
      description: 'Rebar Mesh 6mm (not yet in catalog)',
      product_id: '',
      product_name: '',
      qty: 50,
      uom: 'sheet',
      unit_price: 8000,
      stockOnHand: 0,
      confirmedQtyFromStock: 0,
      storePrice: 7800,
      marketPrice: 8200,
      verifiedPrice: 8100,
    },
  ]
}

export function buildTourDemoRequisition(status: string): Requisition {
  const seeds = demoLineSeeds()
  const now = new Date().toISOString()

  const lines: ReqLine[] = seeds.map((s) => ({
    id: s.id,
    description: s.description,
    product_id: s.product_id || null,
    product_name: s.product_name || null,
    sku: null,
    qty: String(s.qty),
    uom: s.uom,
    currency_code: 'IQD',
    unit_price: String(s.unit_price),
    initial_unit_price: String(s.unit_price),
    qty_from_stock: String(QTY_FROM_STOCK_CONFIRMED_FROM.has(status) ? s.confirmedQtyFromStock : 0),
    source_location_id: QTY_FROM_STOCK_CONFIRMED_FROM.has(status) && s.confirmedQtyFromStock > 0 ? 'demo-location-1' : null,
    source_location_name: QTY_FROM_STOCK_CONFIRMED_FROM.has(status) && s.confirmedQtyFromStock > 0 ? 'Main Warehouse' : null,
    store_price: STORE_PRICE_KNOWN_FROM.has(status) ? String(s.storePrice) : null,
    store_price_currency: STORE_PRICE_KNOWN_FROM.has(status) ? 'IQD' : null,
    market_price: MARKET_PRICE_KNOWN_FROM.has(status) ? String(s.marketPrice) : null,
    market_price_currency: MARKET_PRICE_KNOWN_FROM.has(status) ? 'IQD' : null,
    verified_price: VERIFIED_PRICE_KNOWN_FROM.has(status) ? String(s.verifiedPrice) : null,
    verified_price_currency: VERIFIED_PRICE_KNOWN_FROM.has(status) ? 'IQD' : null,
    total: String(s.qty * s.unit_price),
    qty_received: null,
    actual_unit_price: null,
    short_reason: null,
    short_marked_at: null,
    closed_at: null,
    closed_reason: null,
    purchases: null,
  }))

  const subtotal = seeds.reduce((sum, s) => sum + s.qty * s.unit_price, 0)

  return {
    id: TOUR_DEMO_REQUISITION_ID,
    requisition_number: 'REQ-TOUR-DEMO',
    status,
    priority: 'low',
    // Project Supply + jobsite delivery — same demo project as tourDemoPO.ts
    // and buildTourDemoReceiptPO(), so the whole tour reads as one
    // continuous story once it hands off to the child PO in a later phase.
    purpose: 'project',
    delivery_destination: 'jobsite',
    project_id: 'demo-project-1',
    projectName: 'Tour Demo — Al Karrada Renovation',
    branch_id: 'demo-branch-1',
    branch_name: 'Baghdad Branch',
    organizer_id: 'demo-user-1',
    organizerName: 'You (tour)',
    notes: 'Tour walkthrough demo — nothing here is real or saved.',
    created_at: now,
    updated_at: now,
    // All true regardless of who is actually running the tour — mirrors
    // buildTourDemoPO's own callerHasStorePricingPosition/
    // callerHasMarketPricingPosition, so every stage's action panel is
    // interactive without requiring a specific real position to be held.
    callerHasStoreKeeperPosition: true,
    callerHasStorePricingPosition: true,
    callerHasMarketPricingPosition: true,
    callerHasPriceVerificationPosition: true,
    callerCanApprove: true,
    currencyTotals: [{ currency_code: 'IQD', subtotal: String(subtotal), line_count: seeds.length }],
    lines,
    approval_log: [],
    edit_requests: [],
  }
}

// Mirrors RequisitionDetail.tsx's own `availabilityByLine` shape (derived
// there from `availData?.requisitionStockAvailability`) — the Inventory
// Check step reads this instead of that skipped query when isTourDemo is
// true. Stock on hand is independent of the line's own qty_from_stock,
// which only reflects what's been confirmed (nothing, until this very
// step is submitted) — the two only start matching once the tour moves
// past Inventory Check.
export function buildTourDemoRequisitionStockAvailability(req: Requisition): LineAvailability[] {
  const stockById: Record<string, number> = {
    'demo-req-line-1': 30,
    'demo-req-line-2': 0,
    'demo-req-line-3': 0,
  }
  return req.lines.map((line) => {
    const qtyRequired = parseFloat(String(line.qty)) || 0
    const qtyOnHand = stockById[line.id] ?? 0
    const qtyAvailable = qtyOnHand
    return {
      lineId: line.id,
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
              },
            ]
          : [],
    }
  })
}
