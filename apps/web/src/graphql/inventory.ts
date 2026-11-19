import { gql } from '@apollo/client'

export const PRODUCTS_QUERY = gql`
  query Products($category: String, $companyId: ID, $includeCentralWarehouse: Boolean) {
    products(category: $category, companyId: $companyId, includeCentralWarehouse: $includeCentralWarehouse) {
      id
      sku
      name
      name_ar
      category
      sub_category
      uom
      valuation_method
      average_cost
      standard_cost
      cost_currency
      is_active
      reorder_point
      qty_on_hand
      is_returnable
      default_return_days
    }
  }
`

export const PRODUCT_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id
      sku
      name
      name_ar
      description
      category
      sub_category
      uom
      valuation_method
      standard_cost
      cost_currency
      average_cost
      is_active
      reorder_point
      reorder_qty
      is_returnable
      default_return_days
      qty_out
      has_stock_moves
      balances {
        location_id
        location_name
        location_type
        qty_on_hand
        qty_reserved
        available
        average_cost
        last_cost_currency
        total_value
      }
      costHistory {
        id
        old_cost
        new_cost
        currency_code
        source_type
        source_label
        changed_by_name
        changed_at
      }
      pendingCostChanges {
        id
        old_cost
        new_cost
        currency_code
        source_type
        source_label
        requested_by_name
        created_at
      }
    }
  }
`

export const CREATE_PRODUCT = gql`
  mutation CreateProduct($input: ProductInput!) {
    createProduct(input: $input) {
      id
      sku
      name
    }
  }
`

export const UPDATE_PRODUCT = gql`
  mutation UpdateProduct($id: ID!, $input: ProductInput!) {
    updateProduct(id: $id, input: $input) {
      id
      sku
      name
    }
  }
`

export const PRODUCT_COST_CHANGE_REQUESTS_QUERY = gql`
  query ProductCostChangeRequests($status: String) {
    productCostChangeRequests(status: $status) {
      id
      product_id
      product_name
      product_name_ar
      sku
      old_cost
      new_cost
      currency_code
      source_type
      source_id
      source_label
      requested_by
      requested_by_name
      status
      reviewed_by
      reviewed_by_name
      reviewed_at
      rejection_reason
      created_at
      can_review
    }
  }
`

export const APPROVE_PRODUCT_COST_CHANGE = gql`
  mutation ApproveProductCostChange($id: ID!) {
    approveProductCostChange(id: $id) {
      id
      status
    }
  }
`

export const REJECT_PRODUCT_COST_CHANGE = gql`
  mutation RejectProductCostChange($id: ID!, $reason: String!) {
    rejectProductCostChange(id: $id, reason: $reason) {
      id
      status
    }
  }
`

export const PENDING_PRODUCT_CATALOG_ITEMS_QUERY = gql`
  query PendingProductCatalogItems {
    pendingProductCatalogItems {
      id
      po_id
      po_number
      po_line_id
      description
      qty
      uom
      unit_price
      currency_code
      source
      created_at
    }
  }
`

export const CREATE_PRODUCT_FROM_PENDING_CATALOG_ITEM = gql`
  mutation CreateProductFromPendingCatalogItem($id: ID!, $input: ProductInput!, $companyId: ID) {
    createProductFromPendingCatalogItem(id: $id, input: $input, companyId: $companyId) {
      id
      sku
      name
    }
  }
`

export const LINK_PENDING_CATALOG_ITEM_TO_PRODUCT = gql`
  mutation LinkPendingCatalogItemToProduct($id: ID!, $productId: ID!, $companyId: ID) {
    linkPendingCatalogItemToProduct(id: $id, productId: $productId, companyId: $companyId)
  }
`

export const DISMISS_PENDING_CATALOG_ITEM = gql`
  mutation DismissPendingCatalogItem($id: ID!, $reason: String) {
    dismissPendingCatalogItem(id: $id, reason: $reason)
  }
`

// Every company the CALLING user has an active role in — powers the
// cross-company target picker on New Items to Catalog (a company with no
// physical inventory of its own can resolve a pending item straight into
// another company's catalog, e.g. its factory's).
export const MY_COMPANIES_QUERY = gql`
  query MyCompanies {
    myCompanies {
      id
      name
      requires_jobsite_delivery
    }
  }
`

export const STOCK_LOCATIONS_QUERY = gql`
  query StockLocations($type: String, $isActive: Boolean, $companyId: ID) {
    stockLocations(type: $type, isActive: $isActive, companyId: $companyId) {
      id
      name
      code
      type
      parent_id
      parent_name
      is_active
      address
    }
  }
`

export const CENTRAL_WAREHOUSE_LOCATIONS_QUERY = gql`
  query CentralWarehouseLocations($type: String, $isActive: Boolean) {
    centralWarehouseLocations(type: $type, isActive: $isActive) {
      id
      name
      code
      type
      parent_id
      parent_name
      is_active
      address
    }
  }
`

export const CREATE_STOCK_LOCATION = gql`
  mutation CreateStockLocation($input: LocationInput!) {
    createStockLocation(input: $input) {
      id
      name
      code
    }
  }
`

export const STOCK_BALANCES_QUERY = gql`
  query StockBalances($productId: ID, $locationId: ID) {
    stockBalances(product_id: $productId, location_id: $locationId) {
      product_id
      location_id
      qty_on_hand
      average_cost
      last_cost_currency
      product_name
      location_name
    }
  }
`

export const STOCK_SNAPSHOT_QUERY = gql`
  query StockSnapshot {
    stockBalanceSnapshot {
      totals {
        currency_code
        total_value
        row_count
      }
      rows {
        product_id
        sku
        product_name
        category
        location_id
        location_name
        location_type
        qty_on_hand
        qty_reserved
        available
        average_cost
        total_value
        currency_code
        is_low_stock
      }
    }
  }
`

export const STOCK_MOVES_QUERY = gql`
  query StockMoves($productId: ID, $fromLocationId: ID, $sourceType: String) {
    stockMoves(productId: $productId, fromLocationId: $fromLocationId, sourceType: $sourceType) {
      id
      move_date
      product_id
      product_name
      sku
      from_location_id
      from_location_name
      to_location_id
      to_location_name
      qty
      unit_cost
      total_cost
      source_type
      reference
      lot_id
      lot_number
      moved_by_email
    }
  }
`

export const CREATE_TRANSFER = gql`
  mutation CreateManualTransfer($input: TransferInput!) {
    createManualTransfer(input: $input) {
      id
      move_date
      qty
    }
  }
`

export const CREATE_STOCK_ADJUSTMENT = gql`
  mutation CreateStockAdjustment($input: StockAdjustmentInput!) {
    createStockAdjustment(input: $input) {
      id
      move_date
      qty
    }
  }
`

export const STOCK_LOTS_QUERY = gql`
  query StockLots($productId: ID) {
    stockLots(productId: $productId) {
      id
      lot_number
      product_id
      product_name
      expiry_date
      created_at
      current_qty
      current_location_name
    }
  }
`

export const STOCK_LOT_QUERY = gql`
  query StockLot($id: ID!) {
    stockLot(id: $id) {
      id
      lot_number
      product_id
      product_name
      sku
      expiry_date
      created_at
      current_qty
      current_location_id
      current_location_name
      moves {
        id
        move_date
        direction
        from_location_name
        to_location_name
        qty
        source_type
        reference
        moved_by_email
      }
    }
  }
`

// Equipment that must come back (returnable Store Out lines). One rule behind the list and its summary: services/gateway/src/lib/equipmentReturns.ts
export const RETURNABLE_ITEMS_QUERY = gql`
  query ReturnableItems($status: String, $search: String) {
    returnableItems(status: $status, search: $search) {
      issueLineId
      issueId
      issueNumber
      issueDate
      productId
      productName
      productNameAr
      sku
      uom
      isEquipment
      qtyIssued
      qtyReturned
      qtyLost
      qtyOutstanding
      expectedReturnDate
      daysOverdue
      status
      serialNote
      issuedToName
      department
      projectCode
      projectName
      storeName
      fromLocationId
      isLoan
      ownerCompanyName
      borrowerCompanyName
      lastReturnDate
      canReceiveBack
    }
  }
`

export const RETURNABLE_ITEMS_SUMMARY_QUERY = gql`
  query ReturnableItemsSummary {
    returnableItemsSummary {
      openLines
      overdueLines
      dueSoonLines
      unitsOut
    }
  }
`

export const CREATE_EQUIPMENT_RETURN = gql`
  mutation CreateEquipmentReturn($input: EquipmentReturnInput!) {
    createEquipmentReturn(input: $input) {
      id
      returnNumber
      returnDate
      receivedByName
      lines {
        id
        issueLineId
        productName
        qtyReturned
        condition
        toLocationName
      }
    }
  }
`

// One history of Store In, Store Out, transfers and equipment returns. One query: services/gateway/src/lib/storeDocuments.ts
export const STORE_DOCUMENTS_QUERY = gql`
  query StoreDocuments($type: String, $locationId: ID, $search: String) {
    storeDocuments(type: $type, locationId: $locationId, search: $search) {
      id
      docType
      number
      date
      storeId
      storeName
      party
      reference
      lineCount
      status
    }
  }
`

// Temporary stores and store transfers (sent, in transit, received). One rule behind each: services/gateway/src/lib/storeTransfers.ts
const STORE_TRANSFER_FIELDS = gql`
  fragment StoreTransferFields on StoreTransfer {
  id
  transferNumber
  transferDate
  status
  fromLocationId
  fromLocationName
  toLocationId
  toLocationName
  driverName
  vehicleNo
  waybillNo
  reference
  notes
  daysInTransit
  receivedDate
  receivedByName
  lines {
    id
    productId
    productName
    sku
    uom
    qtySent
    qtyReceived
    remarks
    receiveRemarks
  }
  }
`

export const STORE_TRANSFERS_QUERY = gql`${STORE_TRANSFER_FIELDS}
  query StoreTransfers($status: String, $id: ID) {
    storeTransfers(status: $status, id: $id) {
      ...StoreTransferFields
    }
  }
`

export const TEMP_STORE_ITEMS_QUERY = gql`
  query TempStoreItems {
    tempStoreItems {
      productId
      productName
      productNameAr
      sku
      uom
      locationId
      locationName
      qty
      since
      daysWaiting
      late
      poNumbers
      suppliers
      destinationLocationId
      destinationName
    }
  }
`

export const TEMP_STORE_SUMMARY_QUERY = gql`
  query TempStoreSummary {
    tempStoreSummary {
      itemsWaiting
      waitingTooLong
      inTransit
      oldestDays
    }
  }
`

export const CREATE_STORE_TRANSFER = gql`${STORE_TRANSFER_FIELDS}
  mutation CreateStoreTransfer($input: StoreTransferInput!) {
    createStoreTransfer(input: $input) {
      ...StoreTransferFields
    }
  }
`

export const RECEIVE_STORE_TRANSFER = gql`${STORE_TRANSFER_FIELDS}
  mutation ReceiveStoreTransfer($id: ID!, $input: ReceiveStoreTransferInput!) {
    receiveStoreTransfer(id: $id, input: $input) {
      ...StoreTransferFields
    }
  }
`

export const CANCEL_STORE_TRANSFER = gql`${STORE_TRANSFER_FIELDS}
  mutation CancelStoreTransfer($id: ID!) {
    cancelStoreTransfer(id: $id) {
      ...StoreTransferFields
    }
  }
`
