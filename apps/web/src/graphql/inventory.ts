import { gql } from '@apollo/client'

export const PRODUCTS_QUERY = gql`
  query Products($category: String) {
    products(category: $category) {
      id
      sku
      name
      name_ar
      category
      sub_category
      uom
      valuation_method
      average_cost
      is_active
      reorder_point
      qty_on_hand
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
      average_cost
      is_active
      reorder_point
      reorder_qty
      has_stock_moves
      balances {
        location_id
        location_name
        location_type
        qty_on_hand
        qty_reserved
        available
        average_cost
        total_value
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
      product_name
      location_name
    }
  }
`

export const STOCK_SNAPSHOT_QUERY = gql`
  query StockSnapshot {
    stockBalanceSnapshot {
      totalValue
      currency
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
