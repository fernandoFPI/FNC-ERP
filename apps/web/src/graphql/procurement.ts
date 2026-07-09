import { gql } from '@apollo/client'

export const VENDORS_QUERY = gql`
  query Vendors {
    vendors {
      id name legal_name tax_id currency_code payment_terms_days
      country_code is_active contact_email
    }
  }
`

export const VENDOR_QUERY = gql`
  query Vendor($id: ID!) {
    vendor(id: $id) {
      id name legal_name tax_id currency_code payment_terms_days
      country_code city address contact_name contact_email contact_phone
      withholding_tax_type withholding_tax_rate bank_name is_active
    }
  }
`

export const CREATE_VENDOR = gql`
  mutation CreateVendor($input: VendorInput!) {
    createVendor(input: $input) { id name }
  }
`

export const UPDATE_VENDOR = gql`
  mutation UpdateVendor($id: ID!, $input: VendorInput!) {
    updateVendor(id: $id, input: $input) { id name }
  }
`

export const PURCHASE_ORDERS_QUERY = gql`
  query PurchaseOrders($status: String, $vendorId: ID, $projectId: ID) {
    purchaseOrders(status: $status, vendor_id: $vendorId, project_id: $projectId) {
      id po_number vendor_name vendor_id status priority
      total_amount currency_code created_at analytic_account_id
      expected_delivery_date assigned_to_email invoice_count
    }
  }
`

export const PURCHASE_ORDER_QUERY = gql`
  query PurchaseOrder($id: ID!) {
    purchaseOrder(id: $id) {
      id po_number status currency_code total_amount subtotal tax_amount
      vendor_id vendor_name analytic_account_id analytic_account_name
      expected_delivery_date notes created_by_email created_at
      fx_rate pdf_path assigned_to_email assigned_receiver_name
      lines {
        id product_id product_name description qty unit_price total
        uom qty_received
      }
      receipts {
        id receipt_date location_id location_name notes received_by_email received_by_name location_notes created_at
        lines { po_line_id description qty_received }
        photos { id fileId label originalFilename downloadUrl createdAt }
      }
      approval_log {
        id action user_email notes created_at
      }
    }
  }
`

export const MY_APPROVAL_QUEUE_QUERY = gql`
  query MyApprovalQueue {
    myApprovalQueue {
      id po_number vendor_name status total_amount currency_code created_at
      submitted_at assigned_to_email
    }
  }
`

export const CREATE_PO = gql`
  mutation CreatePurchaseOrder($input: POInput!) {
    createPurchaseOrder(input: $input) { id po_number status assigned_receiver_id assigned_receiver_name }
  }
`

export const UPDATE_PO = gql`
  mutation UpdatePurchaseOrder($id: ID!, $input: POInput!) {
    updatePurchaseOrder(id: $id, input: $input) { id status }
  }
`

export const SUBMIT_PO = gql`
  mutation SubmitPO($id: ID!) { submitPO(id: $id) { id status } }
`

export const APPROVE_L1_PO = gql`
  mutation ApproveL1PO($id: ID!) { approveL1PO(id: $id) { id status } }
`


export const RECORD_RECEIPT = gql`
  mutation RecordReceipt($poId: ID!, $input: ReceiptInput!) {
    recordReceipt(poId: $poId, input: $input) { id receipt_date received_by_name location_notes }
  }
`

export const REQUEST_UPLOAD_URL = gql`
  mutation RequestUploadUrl($filename: String!, $mimeType: String!, $sizeBytes: Int!, $category: String!) {
    requestUploadUrl(filename: $filename, mimeType: $mimeType, sizeBytes: $sizeBytes, category: $category) {
      fileId uploadUrl fileKey expiresInSeconds
    }
  }
`

export const CONFIRM_UPLOAD = gql`
  mutation ConfirmUpload($fileId: ID!) {
    confirmUpload(fileId: $fileId) { id original_filename status }
  }
`

export const ATTACH_RECEIPT_PHOTO = gql`
  mutation AttachReceiptPhoto($receiptId: ID!, $fileId: ID!, $label: String) {
    attachReceiptPhoto(receiptId: $receiptId, fileId: $fileId, label: $label) {
      id fileId label originalFilename createdAt
    }
  }
`

// ── PO Lifecycle (Fix 2A/2C) ──────────────────────────────────────────────────

export const MY_PO_QUEUE_QUERY = gql`
  query MyPOQueue {
    myPOQueue {
      id po_number status currency_code total_amount created_at updated_at
      organizer_id project_id vendor_id vendor_name
    }
  }
`

export const PO_LIFECYCLE_QUERY = gql`
  query PurchaseOrderLifecycle($id: ID!) {
    purchaseOrder(id: $id) {
      id po_number status priority currency_code total_amount subtotal
      vendor_id vendor_name project_id organizer_id assigned_approver_id
      store_keeper_id store_pricing_id procurement_officer_id procurement_2nd_id
      assigned_receiver_id assigned_receiver_name
      purpose linkedProjectId linkedMoId
      expected_delivery_date notes created_by_email created_at updated_at
      lines {
        id product_id product_name description
        qty uom qty_received actual_unit_price
        store_price store_price_currency
        market_price market_price_currency
        verified_price verified_price_currency
        in_stock qty_from_stock unit_price total
        audit_status audit_note audit_flagged_by_email audit_flagged_at
      }
      receipts {
        id receipt_date location_name received_by_email received_by_name location_notes notes created_at
        lines { po_line_id description qty_received }
        photos { id fileId label originalFilename downloadUrl createdAt }
      }
      approval_log { id action user_email notes created_at }
      edit_requests {
        id po_id status changes request_notes
        requested_by_email reviewed_by_email review_notes reviewed_at created_at
      }
    }
  }
`

export const SUBMIT_PO_EDIT_REQUEST = gql`
  mutation SubmitPOEditRequest($id: ID!, $changes: String!, $notes: String) {
    submitPOEditRequest(id: $id, changes: $changes, notes: $notes) {
      id status created_at requested_by_email
    }
  }
`

export const APPROVE_PO_EDIT_REQUEST = gql`
  mutation ApprovePOEditRequest($id: ID!, $requestId: ID!, $reviewNotes: String) {
    approvePOEditRequest(id: $id, requestId: $requestId, reviewNotes: $reviewNotes) {
      id status reviewed_at reviewed_by_email review_notes
    }
  }
`

export const REJECT_PO_EDIT_REQUEST = gql`
  mutation RejectPOEditRequest($id: ID!, $requestId: ID!, $reviewNotes: String!) {
    rejectPOEditRequest(id: $id, requestId: $requestId, reviewNotes: $reviewNotes) {
      id status reviewed_at reviewed_by_email review_notes
    }
  }
`

export const PO_STOCK_AVAILABILITY_QUERY = gql`
  query POStockAvailability($poId: ID!) {
    poStockAvailability(poId: $poId) {
      lineId productId productName description
      qtyRequired qtyOnHand qtyAvailable isAvailable
    }
  }
`

export const SUBMIT_PO_TO_INVENTORY = gql`
  mutation SubmitPOToInventoryCheck($id: ID!, $notes: String) {
    submitPOToInventoryCheck(id: $id, notes: $notes) { id status }
  }
`

export const CONFIRM_PO_INVENTORY = gql`
  mutation ConfirmPOInventoryCheck($id: ID!, $lineStockQtys: [StockConfirmLineInput!]!, $notes: String) {
    confirmPOInventoryCheck(id: $id, lineStockQtys: $lineStockQtys, notes: $notes) { id status }
  }
`

export const APPROVE_STOCK_ISSUANCE = gql`
  mutation ApproveStockIssuance($id: ID!, $notes: String) {
    approveStockIssuance(id: $id, notes: $notes) { id status }
  }
`

export const MO_MISSING_COMPONENTS_QUERY = gql`
  query MOmissingComponents($moId: ID!) {
    moMissingComponents(moId: $moId) {
      bomLineId componentProductId productName uom
      qtyRequired qtyOnHand qtyAvailable qtyShortfall hasSufficientStock
    }
  }
`

export const SUBMIT_PO_STORE_PRICING = gql`
  mutation SubmitPOStorePricing($id: ID!, $linePrices: [LinePriceInput!]) {
    submitPOStorePricing(id: $id, linePrices: $linePrices) { id status }
  }
`

export const SUBMIT_PO_MARKET_PRICING = gql`
  mutation SubmitPOMarketPricing($id: ID!, $vendorId: ID, $linePrices: [MarketPriceInput!]) {
    submitPOMarketPricing(id: $id, vendorId: $vendorId, linePrices: $linePrices) { id status }
  }
`

export const SUBMIT_PO_PRICE_VERIFICATION = gql`
  mutation SubmitPOPriceVerification($id: ID!, $verificationNotes: String, $lineAdjustments: [PriceAdjustmentInput]) {
    submitPOPriceVerification(id: $id, verificationNotes: $verificationNotes, lineAdjustments: $lineAdjustments) { id status }
  }
`

export const REJECT_PO_TO_MARKET = gql`
  mutation RejectPOToMarketPricing($id: ID!, $reason: String!) {
    rejectPOToMarketPricing(id: $id, reason: $reason) { id status }
  }
`

export const APPROVE_PO = gql`
  mutation ApprovePO($id: ID!) {
    approvePO(id: $id) { id status }
  }
`

export const REJECT_PO = gql`
  mutation RejectPO($id: ID!, $reason: String!) {
    rejectPO(id: $id, reason: $reason) { id status }
  }
`

export const REOPEN_PO = gql`
  mutation ReopenPO($id: ID!) {
    reopenPO(id: $id) { id status }
  }
`

export const CANCEL_PO = gql`
  mutation CancelPO($id: ID!, $reason: String) {
    cancelPO(id: $id, reason: $reason) { id status }
  }
`

export const SEND_PO_TO_AUDIT = gql`
  mutation SendPOToAudit($id: ID!) {
    sendPOToAudit(id: $id) { id status }
  }
`

export const PASS_PO_AUDIT = gql`
  mutation PassPOAudit($id: ID!) {
    passPOAudit(id: $id) { id status }
  }
`

export const FAIL_PO_AUDIT = gql`
  mutation FailPOAudit($id: ID!, $notes: String) {
    failPOAudit(id: $id, notes: $notes) { id status }
  }
`

export const SET_PO_LINE_AUDIT_STATUS = gql`
  mutation SetPOLineAuditStatus($poId: ID!, $lineId: ID!, $auditStatus: String!, $auditNote: String) {
    setPOLineAuditStatus(poId: $poId, lineId: $lineId, auditStatus: $auditStatus, auditNote: $auditNote) {
      id audit_status audit_note
    }
  }
`

export const COMPLETE_PO = gql`
  mutation CompletePO($id: ID!, $receiptNotes: String) {
    completePO(id: $id, receiptNotes: $receiptNotes) { id status }
  }
`

export const DELETE_PO = gql`
  mutation DeletePO($id: ID!, $reason: String) {
    deletePO(id: $id, reason: $reason) { id status }
  }
`

export const ADMIN_SET_PO_STATUS = gql`
  mutation AdminSetPOStatus($id: ID!, $status: String!) {
    adminSetPOStatus(id: $id, status: $status) { id status }
  }
`

// ── PO Positions ──────────────────────────────────────────────────────────────

export const PO_POSITIONS_QUERY = gql`
  query GetPOPositions($projectId: ID, $departmentId: ID) {
    poPositions(projectId: $projectId, departmentId: $departmentId) {
      id employeeId employeeName position
      projectId projectName departmentId departmentName
      isActive createdAt
    }
  }
`

export const ASSIGN_PO_POSITION = gql`
  mutation AssignPOPosition($input: POPositionInput!) {
    assignPOPosition(input: $input) { id employeeName position }
  }
`

export const REMOVE_PO_POSITION = gql`
  mutation RemovePOPosition($id: ID!) {
    removePOPosition(id: $id)
  }
`

export const SET_PO_PRIORITY = gql`
  mutation SetPOPriority($id: ID!, $priority: String!) {
    setPOPriority(id: $id, priority: $priority) { id priority }
  }
`

export const SET_PO_RECEIVER = gql`
  mutation SetPOReceiver($id: ID!, $employeeId: ID) {
    setPOReceiver(id: $id, employeeId: $employeeId) { id assigned_receiver_id assigned_receiver_name }
  }
`

export const SET_PO_LINE_ACTUAL_PRICE = gql`
  mutation SetPOLineActualPrice($poId: ID!, $lineId: ID!, $actualUnitPrice: Float) {
    setPOLineActualPrice(poId: $poId, lineId: $lineId, actualUnitPrice: $actualUnitPrice) { id actual_unit_price }
  }
`
