import { gql } from '@apollo/client'

export const WORK_CENTERS_QUERY = gql`
  query WorkCenters($isActive: Boolean, $allCompanies: Boolean) {
    workCenters(isActive: $isActive, allCompanies: $allCompanies) {
      id code name capacity_hours_per_day cost_per_hour currency_code is_active
    }
  }
`

export const BOMS_QUERY = gql`
  query BOMs($finishedProductId: ID, $isActive: Boolean, $allCompanies: Boolean) {
    boms(finishedProductId: $finishedProductId, isActive: $isActive, allCompanies: $allCompanies) {
      id company_id finished_product_id product_name version qty_produced is_active
    }
  }
`

export const BOM_QUERY = gql`
  query BOM($id: ID!) {
    bom(id: $id) {
      id finished_product_id product_name version qty_produced is_active notes
      lines { id sequence component_product_id component_name qty uom unit_cost }
    }
  }
`

export const MANUFACTURING_ORDERS_QUERY = gql`
  query ManufacturingOrders($status: String, $projectId: ID, $page: Int, $limit: Int) {
    manufacturingOrders(status: $status, projectId: $projectId, page: $page, limit: $limit) {
      id mo_number status qty_planned qty_produced planned_cost actual_cost
      dispatch_type product_name work_center_name project_name project_analytic_account_id
      scheduled_start scheduled_end created_at
    }
  }
`

export const MANUFACTURING_ORDER_QUERY = gql`
  query ManufacturingOrder($id: ID!) {
    manufacturingOrder(id: $id) {
      id mo_number status qty_planned qty_produced planned_cost actual_cost
      dispatch_type product_name work_center_id work_center_name
      bom_id bom_version project_id project_name
      scheduled_start scheduled_end actual_start actual_end notes created_by_email
      lines { id component_product_id component_name qty_planned qty_consumed unit_cost total_cost }
    }
  }
`

export const MO_COST_ANALYSIS_QUERY = gql`
  query MOCostAnalysis($moId: ID!) {
    moCostAnalysis(moId: $moId) {
      plannedCost actualCost variance variancePct
      componentBreakdown { key label amount }
    }
  }
`

export const CREATE_WORK_CENTER = gql`
  mutation CreateWorkCenter($input: WorkCenterInput!) {
    createWorkCenter(input: $input) { id code name is_active }
  }
`

export const UPDATE_WORK_CENTER = gql`
  mutation UpdateWorkCenter($id: ID!, $input: WorkCenterInput!) {
    updateWorkCenter(id: $id, input: $input) { id name is_active }
  }
`

export const CREATE_BOM = gql`
  mutation CreateBOM($input: BOMInput!) {
    createBOM(input: $input) { id version product_name }
  }
`

export const UPDATE_BOM = gql`
  mutation UpdateBOM($id: ID!, $input: BOMInput!) {
    updateBOM(id: $id, input: $input) { id version product_name }
  }
`

export const CREATE_MANUFACTURING_ORDER = gql`
  mutation CreateManufacturingOrder($input: MOInput!) {
    createManufacturingOrder(input: $input) { id mo_number status planned_cost }
  }
`

export const CONFIRM_MO = gql`
  mutation ConfirmMO($id: ID!) { confirmMO(id: $id) { id status } }
`

export const START_MO = gql`
  mutation StartMO($id: ID!) { startMO(id: $id) { id status actual_start } }
`

export const COMPLETE_MO = gql`
  mutation CompleteMO($id: ID!, $input: MOCompletionInput!) {
    completeMO(id: $id, input: $input) { id status qty_produced actual_cost }
  }
`

export const CANCEL_MO = gql`
  mutation CancelMO($id: ID!, $notes: String) { cancelMO(id: $id, notes: $notes) { id status } }
`
