import { gql } from '@apollo/client'

// G1 Phase 3 Milestone A screen 2 — the creation form. accountId/
// costCenterId per line are optional — createRequisition fills in a
// default (project's cost center for Project Supply, else the branch's;
// system_configuration's company-wide default account) when omitted.
export const CREATE_REQUISITION = gql`
  mutation CreateRequisition($input: RequisitionInput!) {
    createRequisition(input: $input) {
      id
      requisition_number
      status
    }
  }
`

// G1 Phase 3 Milestone A screen 2 — inventory-check panel. Company-wide
// scoped, same as poStockAvailability (not narrowed to the requisition's
// branch — see the resolver's own comment for why).
export const REQUISITION_STOCK_AVAILABILITY_QUERY = gql`
  query RequisitionStockAvailability($requisitionId: ID!) {
    requisitionStockAvailability(requisitionId: $requisitionId) {
      lineId
      qtyRequired
      qtyOnHand
      qtyAvailable
      isAvailable
      byLocation {
        companyId
        companyName
        locationId
        locationName
        qtyOnHand
        qtyAvailable
      }
    }
  }
`

// G1 Phase 3 Milestone A screen 2 — RequisitionDetail. purchases is only
// populated when a line is fetched via this query (see POLine.purchases'
// schema comment) — it's the Items Bought record, read-only here (the
// Items Bought *action* UI is screen 3).
export const REQUISITION_QUERY = gql`
  query Requisition($id: ID!) {
    requisition(id: $id) {
      id
      requisition_number
      status
      priority
      purpose
      delivery_destination
      project_id
      projectName
      branch_id
      branch_name
      organizer_id
      organizerName
      assigned_approver_id
      notes
      created_at
      updated_at
      callerHasStoreKeeperPosition
      callerHasStorePricingPosition
      callerHasMarketPricingPosition
      callerHasPriceVerificationPosition
      callerHasBuyerPosition
      callerCanApprove
      currencyTotals {
        currency_code
        subtotal
        line_count
      }
      lines {
        id
        line_number
        description
        product_id
        product_name
        sku
        qty
        uom
        currency_code
        unit_price
        initial_unit_price
        qty_from_stock
        source_location_id
        source_location_name
        store_price
        store_price_currency
        market_price
        market_price_currency
        verified_price
        verified_price_currency
        total
        qty_received
        actual_unit_price
        short_reason
        short_marked_at
        closed_at
        closed_reason
        purchases {
          id
          vendor_id
          vendor_name
          currency_code
          qty
          actual_unit_price
          bought_at
          over_tolerance
        }
      }
      approval_log {
        id
        from_status
        to_status
        action
        actor_id
        actor_name
        actor_position
        notes
        created_at
      }
    }
  }
`

export const REQUISITION_CHILD_POS_QUERY = gql`
  query RequisitionChildPurchaseOrders($requisitionId: ID!) {
    requisitionChildPurchaseOrders(requisitionId: $requisitionId) {
      id
      po_number
      status
      vendor_id
      vendor_name
      total_amount
      currency_code
      created_at
    }
  }
`

export const SUBMIT_REQUISITION_TO_INVENTORY_CHECK = gql`
  mutation SubmitRequisitionToInventoryCheck($id: ID!, $notes: String) {
    submitRequisitionToInventoryCheck(id: $id, notes: $notes) {
      id
      status
    }
  }
`

export const CONFIRM_REQUISITION_INVENTORY_CHECK = gql`
  mutation ConfirmRequisitionInventoryCheck(
    $id: ID!
    $lineStockQtys: [StockConfirmLineInput!]!
    $notes: String
  ) {
    confirmRequisitionInventoryCheck(id: $id, lineStockQtys: $lineStockQtys, notes: $notes) {
      id
      status
    }
  }
`

export const SUBMIT_REQUISITION_STORE_PRICING = gql`
  mutation SubmitRequisitionStorePricing($id: ID!, $linePrices: [RequisitionStorePriceInput!]) {
    submitRequisitionStorePricing(id: $id, linePrices: $linePrices) {
      id
      status
    }
  }
`

export const SUBMIT_REQUISITION_MARKET_PRICING = gql`
  mutation SubmitRequisitionMarketPricing($id: ID!, $linePrices: [RequisitionMarketPriceInput!]) {
    submitRequisitionMarketPricing(id: $id, linePrices: $linePrices) {
      id
      status
    }
  }
`

export const VERIFY_REQUISITION_PRICES = gql`
  mutation VerifyRequisitionPrices(
    $id: ID!
    $verificationNotes: String
    $lineAdjustments: [RequisitionPriceVerificationAdjustment!]
  ) {
    verifyRequisitionPrices(id: $id, verificationNotes: $verificationNotes, lineAdjustments: $lineAdjustments) {
      id
      status
    }
  }
`

export const APPROVE_REQUISITION = gql`
  mutation ApproveRequisition($id: ID!) {
    approveRequisition(id: $id) {
      id
      status
    }
  }
`

export const REJECT_REQUISITION_APPROVAL = gql`
  mutation RejectRequisitionApproval($id: ID!, $reason: String!) {
    rejectRequisitionApproval(id: $id, reason: $reason) {
      id
      status
    }
  }
`

export const CANCEL_REQUISITION = gql`
  mutation CancelRequisition($id: ID!, $reason: String) {
    cancelRequisition(id: $id, reason: $reason) {
      id
      status
    }
  }
`

export const REQUISITIONS_QUERY = gql`
  query Requisitions($status: String, $projectId: ID, $branchId: ID, $myQueueOnly: Boolean) {
    requisitions(status: $status, projectId: $projectId, branchId: $branchId, myQueueOnly: $myQueueOnly) {
      id
      requisition_number
      status
      priority
      purpose
      delivery_destination
      project_id
      projectName
      branch_id
      branch_name
      organizer_id
      organizerName
      notes
      created_at
      updated_at
    }
  }
`

// ── G1 Phase 3 Milestone A screen 3 — Items Bought ──────────────────────

// Dedicated to the buying screen rather than reusing REQUISITION_QUERY —
// needs richer per-purchase fields (who bought/approved it, the receipt)
// that screen 2's read-only summary has no use for.
export const REQUISITION_ITEMS_BOUGHT_QUERY = gql`
  query RequisitionItemsBought($id: ID!) {
    requisition(id: $id) {
      id
      requisition_number
      status
      callerHasBuyerPosition
      callerCanApprove
      lines {
        id
        line_number
        description
        product_id
        product_name
        sku
        qty
        uom
        currency_code
        unit_price
        approved_unit_price
        qty_from_stock
        short_reason
        short_marked_by
        short_marked_at
        account_id
        account_code
        account_name
        cost_center_id
        cost_center_name
        purchases {
          id
          vendor_id
          vendor_name
          currency_code
          qty
          actual_unit_price
          bought_by
          bought_by_name
          bought_at
          over_tolerance
          tolerance_approved_by
          tolerance_approved_by_name
          receipt_file_id
          receipt_filename
        }
      }
    }
  }
`

export const RECORD_LINE_PURCHASE = gql`
  mutation RecordLinePurchase($input: RecordLinePurchaseInput!) {
    recordLinePurchase(input: $input) {
      id
      po_line_id
      vendor_id
      vendor_name
      currency_code
      qty
      actual_unit_price
      bought_by
      bought_by_name
      bought_at
      over_tolerance
      tolerance_approved_by
      receipt_file_id
      receipt_filename
    }
  }
`

export const APPROVE_TOLERANCE_PURCHASE = gql`
  mutation ApproveTolerancePurchase($purchaseId: ID!) {
    approveTolerancePurchase(purchaseId: $purchaseId) {
      id
      tolerance_approved_by
      tolerance_approved_by_name
    }
  }
`

export const MARK_REQUISITION_LINE_SHORT = gql`
  mutation MarkRequisitionLineShort($lineId: ID!, $reason: String!) {
    markRequisitionLineShort(lineId: $lineId, reason: $reason) {
      id
      short_reason
      short_marked_at
    }
  }
`

export const FINISH_BUYING_REQUISITION = gql`
  mutation FinishBuyingRequisition($id: ID!) {
    finishBuyingRequisition(id: $id) {
      id
      status
    }
  }
`

export const ENSURE_CASH_PURCHASE_VENDOR = gql`
  mutation EnsureCashPurchaseVendor {
    ensureCashPurchaseVendor {
      id
      name
      is_cash_purchase
    }
  }
`

// Reuses the generic upload-then-attach flow (REQUEST_UPLOAD_URL from
// graphql/procurement.ts + a plain POST to /api/v1/files/:id/content) —
// no dedicated mutation needed here, recordLinePurchase's own
// receiptFileId argument does the attaching.

// ── G1 Phase 3 Milestone A screen 5 — My Requisition Queue ──────────────

export const MY_REQUISITION_QUEUE_QUERY = gql`
  query MyRequisitionApprovalQueue {
    myRequisitionApprovalQueue {
      id
      requisition_number
      status
      priority
      purpose
      project_id
      projectName
      branch_id
      branch_name
      organizer_id
      organizerName
      created_at
      updated_at
    }
  }
`
