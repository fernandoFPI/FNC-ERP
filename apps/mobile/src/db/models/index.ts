import { Model } from '@nozbe/watermelondb'
import { field, text, readonly, date, nochange } from '@nozbe/watermelondb/decorators'

// ── EmployeeProfile ───────────────────────────────────────────
export class EmployeeProfile extends Model {
  static override table = 'employee_profile'

  @nochange @text('server_id') serverId!: string
  @text('employee_number') employeeNumber!: string
  @text('first_name') firstName!: string
  @text('last_name') lastName!: string
  @text('job_title') jobTitle!: string | null
  @text('department_name') departmentName!: string | null
  @text('contract_type') contractType!: string
  @text('work_location_id') workLocationId!: string | null
  @field('updated_at_server') updatedAtServer!: number

  get fullName() {
    return `${this.firstName} ${this.lastName}`
  }
}

// ── AttendanceLog ─────────────────────────────────────────────
export class AttendanceLog extends Model {
  static override table = 'attendance_logs'

  @nochange @text('server_id') serverId!: string
  @text('punch_type') punchType!: string
  @field('gps_lat') gpsLat!: number | null
  @field('gps_lng') gpsLng!: number | null
  @field('is_valid') isValid!: boolean
  @text('rejection_reason') rejectionReason!: string | null
  @field('punched_at') punchedAt!: number
  @text('work_location_id') workLocationId!: string | null
  @field('is_offline_submission') isOfflineSubmission!: boolean
}

// ── WorkLocation ──────────────────────────────────────────────
export class WorkLocation extends Model {
  static override table = 'work_locations'

  @nochange @text('server_id') serverId!: string
  @text('name') name!: string
  @text('code') code!: string | null
  @text('location_type') locationType!: string
  @field('geo_lat') geoLat!: number | null
  @field('geo_lng') geoLng!: number | null
  @field('geo_radius_meters') geoRadiusMeters!: number | null
  @field('updated_at_server') updatedAtServer!: number
}

// ── Project ───────────────────────────────────────────────────
export class Project extends Model {
  static override table = 'projects'

  @nochange @text('server_id') serverId!: string
  @text('code') code!: string
  @text('name') name!: string
  @text('project_type') projectType!: string
  @text('status') status!: string
  @text('client_name') clientName!: string | null
  @field('budget_amount') budgetAmount!: number
  @text('budget_currency') budgetCurrency!: string
  @text('stages_json') stagesJson!: string
  @field('updated_at_server') updatedAtServer!: number

  get stages() {
    try {
      return JSON.parse(this.stagesJson) as {
        id: string
        name: string
        sequence: number
        status: string
        completion_pct: number
      }[]
    } catch {
      return []
    }
  }
}

// ── PendingApproval ───────────────────────────────────────────
export class PendingApproval extends Model {
  static override table = 'pending_approvals'

  @nochange @text('server_id') serverId!: string
  @text('approval_type') approvalType!: string
  @text('title') title!: string
  @text('subtitle') subtitle!: string | null
  @field('amount') amount!: number | null
  @text('currency') currency!: string | null
  @text('employee_name') employeeName!: string | null
  @text('status') status!: string
  @text('data_json') dataJson!: string
  @field('updated_at_server') updatedAtServer!: number

  get data() {
    try {
      return JSON.parse(this.dataJson) as Record<string, unknown>
    } catch {
      return {}
    }
  }
}

// ── Product ───────────────────────────────────────────────────
export class Product extends Model {
  static override table = 'products'

  @nochange @text('server_id') serverId!: string
  @text('sku') sku!: string
  @text('name') name!: string
  @text('uom') uom!: string
  @text('category') category!: string | null
  @field('updated_at_server') updatedAtServer!: number
}

// ── LeaveRequest ──────────────────────────────────────────────
export class LeaveRequest extends Model {
  static override table = 'leave_requests'

  @nochange @text('server_id') serverId!: string
  @text('start_date') startDate!: string
  @text('end_date') endDate!: string
  @field('days_requested') daysRequested!: number
  @text('status') status!: string
  @text('leave_type_name') leaveTypeName!: string
  @text('reason') reason!: string | null
  @text('review_notes') reviewNotes!: string | null
  @field('updated_at_server') updatedAtServer!: number
}

// ── OfflineQueueItem ──────────────────────────────────────────
export class OfflineQueueItem extends Model {
  static override table = 'offline_queue'

  @nochange @text('client_id') clientId!: string
  @text('action_type') actionType!: string
  @text('payload_json') payloadJson!: string
  @field('action_taken_at') actionTakenAt!: number
  @field('offline_duration_seconds') offlineDurationSeconds!: number | null
  @text('status') status!: string
  @field('retry_count') retryCount!: number
  @text('last_error') lastError!: string | null
  @text('server_record_id') serverRecordId!: string | null

  get payload() {
    try {
      return JSON.parse(this.payloadJson) as Record<string, unknown>
    } catch {
      return {}
    }
  }
}

// ── SyncMeta ──────────────────────────────────────────────────
export class SyncMeta extends Model {
  static override table = 'sync_meta'

  @nochange @text('entity_type') entityType!: string
  @field('last_synced_at') lastSyncedAt!: number
  @field('records_count') recordsCount!: number
}

// ── EquipmentAsset ────────────────────────────────────────────
export class EquipmentAsset extends Model {
  static override table = 'equipment_assets'

  @nochange @text('server_id') serverId!: string
  @text('asset_number') assetNumber!: string
  @text('name') name!: string
  @text('category') category!: string | null
  @text('model') model!: string | null
  @text('status') status!: string
  @text('project_id') projectId!: string | null
  @text('project_name') projectName!: string | null
  @text('project_code') projectCode!: string | null
  @text('current_location') currentLocation!: string | null
  @field('gps_lat') gpsLat!: number | null
  @field('gps_lng') gpsLng!: number | null
  @field('total_hours_operated') totalHoursOperated!: number | null
  @text('last_usage_date') lastUsageDate!: string | null
  @text('maintenance_status') maintenanceStatus!: string
  @text('next_maintenance_due_date') nextMaintenanceDueDate!: string | null
  @field('next_maintenance_due_hours') nextMaintenanceDueHours!: number | null
  @field('updated_at_server') updatedAtServer!: number
}
