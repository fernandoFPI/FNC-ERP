import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'employee_profile',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'employee_number', type: 'string' },
        { name: 'first_name', type: 'string' },
        { name: 'last_name', type: 'string' },
        { name: 'job_title', type: 'string', isOptional: true },
        { name: 'department_name', type: 'string', isOptional: true },
        { name: 'contract_type', type: 'string' },
        { name: 'work_location_id', type: 'string', isOptional: true },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'attendance_logs',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'punch_type', type: 'string' },
        { name: 'gps_lat', type: 'number', isOptional: true },
        { name: 'gps_lng', type: 'number', isOptional: true },
        { name: 'is_valid', type: 'boolean' },
        { name: 'rejection_reason', type: 'string', isOptional: true },
        { name: 'punched_at', type: 'number' },
        { name: 'work_location_id', type: 'string', isOptional: true },
        { name: 'is_offline_submission', type: 'boolean' },
      ],
    }),

    tableSchema({
      name: 'work_locations',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'code', type: 'string', isOptional: true },
        { name: 'location_type', type: 'string' },
        { name: 'geo_lat', type: 'number', isOptional: true },
        { name: 'geo_lng', type: 'number', isOptional: true },
        { name: 'geo_radius_meters', type: 'number', isOptional: true },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'projects',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'code', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'project_type', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'client_name', type: 'string', isOptional: true },
        { name: 'budget_amount', type: 'number' },
        { name: 'budget_currency', type: 'string' },
        { name: 'stages_json', type: 'string' },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'pending_approvals',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'approval_type', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'subtitle', type: 'string', isOptional: true },
        { name: 'amount', type: 'number', isOptional: true },
        { name: 'currency', type: 'string', isOptional: true },
        { name: 'employee_name', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'data_json', type: 'string' },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'products',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'sku', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'uom', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'leave_requests',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'start_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'days_requested', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'leave_type_name', type: 'string' },
        { name: 'reason', type: 'string', isOptional: true },
        { name: 'review_notes', type: 'string', isOptional: true },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'offline_queue',
      columns: [
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'action_type', type: 'string' },
        { name: 'payload_json', type: 'string' },
        { name: 'action_taken_at', type: 'number' },
        { name: 'offline_duration_seconds', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'server_record_id', type: 'string', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'sync_meta',
      columns: [
        { name: 'entity_type', type: 'string', isIndexed: true },
        { name: 'last_synced_at', type: 'number' },
        { name: 'records_count', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'equipment_assets',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'asset_number', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'model', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'project_name', type: 'string', isOptional: true },
        { name: 'project_code', type: 'string', isOptional: true },
        { name: 'current_location', type: 'string', isOptional: true },
        { name: 'gps_lat', type: 'number', isOptional: true },
        { name: 'gps_lng', type: 'number', isOptional: true },
        { name: 'total_hours_operated', type: 'number', isOptional: true },
        { name: 'last_usage_date', type: 'string', isOptional: true },
        { name: 'maintenance_status', type: 'string' },
        { name: 'next_maintenance_due_date', type: 'string', isOptional: true },
        { name: 'next_maintenance_due_hours', type: 'number', isOptional: true },
        { name: 'updated_at_server', type: 'number' },
      ],
    }),
  ],
})
