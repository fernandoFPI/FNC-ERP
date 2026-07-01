import { gql } from '@apollo/client'

export const EQUIPMENT_ASSETS_QUERY = gql`
  query EquipmentAssets($status: String, $category: String) {
    equipmentAssets(status: $status, category: $category) {
      id asset_number name category status daily_rate currency_code
      total_hours total_mileage maintenance_status condition_rating
      last_maintenance_date maintenance_due_hours
    }
  }
`

export const EQUIPMENT_ASSET_QUERY = gql`
  query EquipmentAsset($id: ID!) {
    equipmentAsset(id: $id) {
      id asset_number name description category serial_number status
      purchase_date purchase_price current_value daily_rate currency_code
      total_hours total_mileage maintenance_due_hours last_maintenance_date
      maintenance_status condition_rating
      usageLogs { id usage_date hours_used mileage_km operator_name notes created_at }
      maintenanceSchedules { id maintenance_type scheduled_date description status estimated_cost assigned_to }
      conditionReports { id report_date rating checklist notes gps_lat gps_lng created_by_email created_at }
    }
  }
`

export const RENTAL_CONTRACTS_QUERY = gql`
  query RentalContracts($status: String, $projectId: ID) {
    rentalContracts(status: $status, projectId: $projectId) {
      id contract_number rental_type status billing_cycle rate_amount start_date
      client_name asset_name end_date currency_code
    }
  }
`

export const RENTAL_CONTRACT_QUERY = gql`
  query RentalContract($id: ID!) {
    rentalContract(id: $id) {
      id contract_number rental_type status billing_cycle rate_amount
      start_date end_date deposit_amount currency_code notes
      client_name client_contact asset_id asset_name project_id project_name
      depreciation_method depreciation_per_day useful_life_days salvage_value
      usageLogs { id usage_date hours_used mileage_km operator_name }
      invoices { id invoice_number billing_period_start billing_period_end days_billed total_amount status invoice_date due_date }
    }
  }
`

export const MAINTENANCE_SCHEDULES_QUERY = gql`
  query MaintenanceSchedules($assetId: ID, $status: String, $fromDate: String, $toDate: String) {
    maintenanceSchedules(assetId: $assetId, status: $status, fromDate: $fromDate, toDate: $toDate) {
      id asset_id asset_name maintenance_type scheduled_date description status estimated_cost assigned_to
    }
  }
`

export const MAINTENANCE_RECORDS_QUERY = gql`
  query MaintenanceRecords($assetId: ID) {
    maintenanceRecords(assetId: $assetId) {
      id asset_id maintenance_type performed_date description cost performed_by next_due_date notes
    }
  }
`

export const RENTAL_INVOICES_QUERY = gql`
  query RentalInvoices($contractId: ID, $status: String) {
    rentalInvoices(contractId: $contractId, status: $status) {
      id invoice_number billing_period_start billing_period_end days_billed
      rate_amount total_amount whtApplies whtScenario whtRate whtAmount
      status invoice_date due_date paid_at
    }
  }
`

export const CREATE_EQUIPMENT_ASSET = gql`
  mutation CreateEquipmentAsset($input: EquipmentAssetInput!) {
    createEquipmentAsset(input: $input) { id asset_number name status }
  }
`

export const UPDATE_EQUIPMENT_ASSET = gql`
  mutation UpdateEquipmentAsset($id: ID!, $input: EquipmentAssetInput!) {
    updateEquipmentAsset(id: $id, input: $input) { id name status }
  }
`

export const LOG_USAGE = gql`
  mutation LogUsage($input: UsageLogInput!) {
    logUsage(input: $input) { id usage_date hours_used }
  }
`

export const SCHEDULE_MAINTENANCE = gql`
  mutation ScheduleMaintenanceItem($input: MaintenanceScheduleInput!) {
    scheduleMaintenanceItem(input: $input) { id maintenance_type scheduled_date status }
  }
`

export const RECORD_MAINTENANCE = gql`
  mutation RecordMaintenance($input: MaintenanceRecordInput!) {
    recordMaintenance(input: $input) { id performed_date maintenance_type }
  }
`

export const SUBMIT_CONDITION_REPORT = gql`
  mutation SubmitConditionReport($input: ConditionReportInput!) {
    submitConditionReport(input: $input) { id report_date rating }
  }
`

export const CREATE_RENTAL_CONTRACT = gql`
  mutation CreateRentalContract($input: RentalContractInput!) {
    createRentalContract(input: $input) { id contract_number status }
  }
`

export const UPDATE_RENTAL_CONTRACT = gql`
  mutation UpdateRentalContract($id: ID!, $input: RentalContractInput!) {
    updateRentalContract(id: $id, input: $input) { id status }
  }
`

export const ACTIVATE_RENTAL_CONTRACT = gql`
  mutation ActivateRentalContract($id: ID!) {
    activateRentalContract(id: $id) { id status }
  }
`

export const CLOSE_RENTAL_CONTRACT = gql`
  mutation CloseRentalContract($id: ID!, $notes: String) {
    closeRentalContract(id: $id, notes: $notes) { id status }
  }
`

export const GENERATE_RENTAL_INVOICE = gql`
  mutation GenerateRentalInvoice($contractId: ID!, $periodStart: String!, $periodEnd: String!, $whtApplies: Boolean, $whtScenario: String, $whtRate: Float) {
    generateRentalInvoice(contractId: $contractId, periodStart: $periodStart, periodEnd: $periodEnd, whtApplies: $whtApplies, whtScenario: $whtScenario, whtRate: $whtRate) {
      id invoice_number days_billed total_amount whtApplies whtScenario whtRate whtAmount status
    }
  }
`

export const OVERDUE_MAINTENANCE_COUNT_QUERY = gql`
  query OverdueMaintenanceCount {
    overdueMaintenanceCount
  }
`
