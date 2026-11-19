import NetInfo from '@react-native-community/netinfo'
import { Platform } from 'react-native'
import { Q } from '@nozbe/watermelondb'
import type { Model } from '@nozbe/watermelondb'
import * as SecureStore from 'expo-secure-store'
import { randomUUID } from 'expo-crypto'
import { database } from '../db/database'
import type {
  OfflineQueueItem,
  SyncMeta,
  EmployeeProfile,
  AttendanceLog,
  WorkLocation,
  Project,
  PendingApproval,
  Product,
  LeaveRequest,
  EquipmentAsset,
} from '../db/models'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''
const SYNC_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

export interface SyncResult {
  success: boolean
  reason?: string
  queued?: QueueResult
  pulled?: PullResult
  durationMs?: number
}

interface QueueResult {
  submitted: number
  failed: number
}
interface PullResult {
  entities: number
  records: number
}

interface ActionResult {
  client_id: string
  status: 'processed' | 'rejected' | 'conflict' | 'duplicate'
  record_id?: string
  rejection_reason?: string
}

interface ServerChanges {
  updated: Record<string, unknown>[]
  deleted: string[]
}

// ── Haversine helper (device-side, UI feedback only) ──────────
// Server-side check is authoritative — this is just for UI
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

class SyncEngine {
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private isSyncing = false
  private deviceId = ''
  private goOnlineAt: Date | null = null

  async initialize(deviceId: string): Promise<void> {
    this.deviceId = deviceId

    NetInfo.addEventListener((state) => {
      if (state.isConnected && !this.isSyncing) {
        this.goOnlineAt = new Date()
        // Brief delay to let connection stabilize
        setTimeout(() => void this.syncAll(), 2_000)
      }
    })

    this.syncTimer = setInterval(() => {
      void NetInfo.fetch().then((state) => {
        if (state.isConnected) void this.syncAll()
      })
    }, SYNC_INTERVAL_MS)

    const isConnected = (await NetInfo.fetch()).isConnected
    if (isConnected) await this.syncAll()
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) return { success: false, reason: 'sync_already_in_progress' }

    this.isSyncing = true
    const startTime = Date.now()

    try {
      const queueResult = await this.submitOfflineQueue()
      const pullResult = await this.pullDelta()
      return {
        success: true,
        queued: queueResult,
        pulled: pullResult,
        durationMs: Date.now() - startTime,
      }
    } catch (err: unknown) {
      return { success: false, reason: err instanceof Error ? err.message : String(err) }
    } finally {
      this.isSyncing = false
    }
  }

  // ── Submit offline queue ──────────────────────────────────
  async submitOfflineQueue(): Promise<QueueResult> {
    const queueItems = await database
      .get<OfflineQueueItem>('offline_queue')
      .query(Q.where('status', Q.oneOf(['pending', 'failed'])))
      .fetch()

    if (queueItems.length === 0) return { submitted: 0, failed: 0 }

    const token = await SecureStore.getItemAsync('auth_token')
    if (!token) return { submitted: 0, failed: 0 }

    await database.write(async () => {
      for (const item of queueItems) {
        await item.update((r) => {
          r.status = 'submitting'
        })
      }
    })

    const offlineDurationSeconds = this.goOnlineAt
      ? Math.floor((Date.now() - this.goOnlineAt.getTime()) / 1000)
      : null

    const actions = queueItems.map((item) => ({
      client_id: item.clientId,
      action_type: item.actionType,
      payload: JSON.parse(item.payloadJson) as Record<string, unknown>,
      action_taken_at: new Date(item.actionTakenAt).toISOString(),
      offline_duration_seconds: offlineDurationSeconds,
    }))

    let results: ActionResult[] = []
    try {
      const response = await fetch(`${API_BASE}/api/v1/mobile/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Device-Id': this.deviceId,
        },
        body: JSON.stringify({ actions, device_id: this.deviceId }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = (await response.json()) as { data: { results: ActionResult[] } }
      results = data.data.results
    } catch {
      await database.write(async () => {
        for (const item of queueItems) {
          await item.update((r) => {
            r.status = 'failed'
            r.retryCount = r.retryCount + 1
          })
        }
      })
      return { submitted: 0, failed: queueItems.length }
    }

    await database.write(async () => {
      for (const item of queueItems) {
        const result = results.find((r) => r.client_id === item.clientId)
        if (!result) continue
        await item.update((r) => {
          r.status =
            result.status === 'processed' || result.status === 'duplicate'
              ? 'submitted'
              : result.status === 'conflict'
                ? 'conflict'
                : 'rejected'
          r.serverRecordId = result.record_id ?? null
          r.lastError = result.rejection_reason ?? null
        })
      }
    })

    const submitted = results.filter(
      (r) => r.status === 'processed' || r.status === 'duplicate',
    ).length
    return { submitted, failed: results.length - submitted }
  }

  // ── Pull delta from server ────────────────────────────────
  async pullDelta(): Promise<PullResult> {
    const token = await SecureStore.getItemAsync('auth_token')
    if (!token) return { entities: 0, records: 0 }

    const syncMeta = await database.get<SyncMeta>('sync_meta').query().fetch()

    const since = syncMeta.reduce((oldest, meta) => {
      const d = new Date(meta.lastSyncedAt)
      return d < oldest ? d : oldest
    }, new Date())

    const entities = [
      'profile',
      'attendance',
      'locations',
      'projects',
      'approvals',
      'products',
      'leave',
      'equipment',
    ]
    const sinceParam = since.getTime() === 0 ? '' : since.toISOString()

    const response = await fetch(
      `${API_BASE}/api/v1/mobile/sync?` +
        new URLSearchParams({
          since: sinceParam,
          entities: entities.join(','),
          device_id: this.deviceId,
        }).toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Device-Id': this.deviceId,
          'X-Platform': Platform.OS,
        },
      },
    )

    if (!response.ok) throw new Error(`Sync pull failed: HTTP ${response.status}`)

    const data = (await response.json()) as {
      data: { syncedAt: string; changes: Record<string, ServerChanges> }
    }
    const { changes, syncedAt } = data.data

    await this.applyChanges(changes)

    await database.write(async () => {
      for (const [entityType, change] of Object.entries(changes)) {
        const existing = syncMeta.find((m) => m.entityType === entityType)
        const syncedTs = new Date(syncedAt).getTime()
        const count = change.updated.length

        if (existing) {
          await existing.update((r) => {
            r.lastSyncedAt = syncedTs
            r.recordsCount = r.recordsCount + count
          })
        } else {
          await database.get<SyncMeta>('sync_meta').create((r) => {
            r.entityType = entityType
            r.lastSyncedAt = syncedTs
            r.recordsCount = count
          })
        }
      }
    })

    const totalRecords = Object.values(changes).reduce((sum, c) => sum + c.updated.length, 0)
    return { entities: Object.keys(changes).length, records: totalRecords }
  }

  // ── Apply server changes to local DB ─────────────────────
  async applyChanges(changes: Record<string, ServerChanges>): Promise<void> {
    await database.write(async () => {
      if (changes.profile?.updated.length) {
        await this._upsert<EmployeeProfile>('employee_profile', changes.profile.updated, (r) => ({
          serverId: String(r.id),
          employeeNumber: String(r.employee_number),
          firstName: String(r.first_name),
          lastName: String(r.last_name),
          jobTitle: r.job_title != null ? String(r.job_title) : null,
          departmentName: r.department_name != null ? String(r.department_name) : null,
          contractType: String(r.contract_type),
          workLocationId: r.work_location_id != null ? String(r.work_location_id) : null,
          updatedAtServer: new Date(String(r.updated_at)).getTime(),
        }))
      }

      if (changes.attendance?.updated.length) {
        await this._upsert<AttendanceLog>('attendance_logs', changes.attendance.updated, (r) => ({
          serverId: String(r.id),
          punchType: String(r.punch_type),
          gpsLat: r.gps_lat != null ? Number(r.gps_lat) : null,
          gpsLng: r.gps_lng != null ? Number(r.gps_lng) : null,
          isValid: Boolean(r.is_valid),
          rejectionReason: r.rejection_reason != null ? String(r.rejection_reason) : null,
          punchedAt: new Date(String(r.punched_at)).getTime(),
          workLocationId: r.work_location_id != null ? String(r.work_location_id) : null,
          isOfflineSubmission: false,
        }))
      }

      if (changes.locations?.updated.length) {
        await this._upsert<WorkLocation>('work_locations', changes.locations.updated, (r) => ({
          serverId: String(r.id),
          name: String(r.name),
          code: r.code != null ? String(r.code) : null,
          locationType: String(r.location_type),
          geoLat: r.geo_lat != null ? Number(r.geo_lat) : null,
          geoLng: r.geo_lng != null ? Number(r.geo_lng) : null,
          geoRadiusMeters: r.geo_radius_meters != null ? Number(r.geo_radius_meters) : null,
          updatedAtServer: new Date(String(r.updated_at)).getTime(),
        }))
      }

      if (changes.projects?.updated.length) {
        await this._upsert<Project>('projects', changes.projects.updated, (r) => ({
          serverId: String(r.id),
          code: String(r.code),
          name: String(r.name),
          projectType: String(r.project_type),
          status: String(r.status),
          clientName: r.client_name != null ? String(r.client_name) : null,
          budgetAmount: Number(r.budget_amount),
          budgetCurrency: String(r.budget_currency),
          stagesJson: JSON.stringify(r.stages ?? []),
          updatedAtServer: new Date(String(r.updated_at)).getTime(),
        }))
      }

      if (changes.approvals?.updated.length) {
        await this._upsert<PendingApproval>('pending_approvals', changes.approvals.updated, (r) => {
          let title = ''
          let subtitle: string | null = null
          let amount: number | null = null
          let currency: string | null = null

          if (r.approval_type === 'purchase_order') {
            title = `PO ${String(r.po_number)}`
            subtitle = String(r.vendor_name ?? '')
            amount = Number(r.total_amount)
            currency = String(r.currency_code)
          } else if (r.approval_type === 'overtime_request') {
            title = `Overtime — ${String(r.employee_name)}`
            subtitle = `${String(r.overtime_hours)} hrs on ${String(r.work_date)}`
          } else if (r.approval_type === 'leave_request') {
            title = `Leave — ${String(r.employee_name)}`
            subtitle = `${String(r.leave_type_name)}: ${String(r.start_date)} → ${String(r.end_date)}`
          }

          return {
            serverId: String(r.id),
            approvalType: String(r.approval_type),
            title,
            subtitle,
            amount,
            currency,
            employeeName: r.employee_name != null ? String(r.employee_name) : null,
            status: String(r.status),
            dataJson: JSON.stringify(r),
            updatedAtServer: new Date(String(r.updated_at ?? r.created_at)).getTime(),
          }
        })
      }

      if (changes.products?.updated.length) {
        await this._upsert<Product>('products', changes.products.updated, (r) => ({
          serverId: String(r.id),
          sku: String(r.sku),
          name: String(r.name),
          uom: String(r.uom),
          category: r.category != null ? String(r.category) : null,
          updatedAtServer: new Date(String(r.updated_at)).getTime(),
        }))
      }

      if (changes.leave?.updated.length) {
        await this._upsert<LeaveRequest>('leave_requests', changes.leave.updated, (r) => ({
          serverId: String(r.id),
          startDate: String(r.start_date),
          endDate: String(r.end_date),
          daysRequested: Number(r.days_requested),
          status: String(r.status),
          leaveTypeName: String(r.leave_type_name),
          reason: r.reason != null ? String(r.reason) : null,
          reviewNotes: r.review_notes != null ? String(r.review_notes) : null,
          updatedAtServer: new Date(String(r.updated_at)).getTime(),
        }))
      }

      if (changes.equipment?.updated.length) {
        await this._upsert<EquipmentAsset>('equipment_assets', changes.equipment.updated, (r) => ({
          serverId: String(r.id),
          assetNumber: String(r.asset_number),
          name: String(r.name),
          category: r.category != null ? String(r.category) : null,
          model: r.model != null ? String(r.model) : null,
          status: String(r.status),
          projectId: r.project_id != null ? String(r.project_id) : null,
          projectName: r.project_name != null ? String(r.project_name) : null,
          projectCode: r.project_code != null ? String(r.project_code) : null,
          currentLocation: r.current_location != null ? String(r.current_location) : null,
          gpsLat: r.gps_lat != null ? Number(r.gps_lat) : null,
          gpsLng: r.gps_lng != null ? Number(r.gps_lng) : null,
          totalHoursOperated:
            r.total_hours_operated != null ? Number(r.total_hours_operated) : null,
          lastUsageDate: r.last_usage_date != null ? String(r.last_usage_date) : null,
          maintenanceStatus: r.maintenance_status != null ? String(r.maintenance_status) : 'ok',
          nextMaintenanceDueDate:
            r.next_maintenance_due_date != null ? String(r.next_maintenance_due_date) : null,
          nextMaintenanceDueHours:
            r.next_maintenance_due_hours != null ? Number(r.next_maintenance_due_hours) : null,
          updatedAtServer: new Date(String(r.updated_at)).getTime(),
        }))
      }
    })
  }

  private async _upsert<M extends Model>(
    tableName: string,
    records: Record<string, unknown>[],
    mapper: (r: Record<string, unknown>) => Partial<M> & { serverId: string },
  ): Promise<void> {
    for (const record of records) {
      const mapped = mapper(record)
      const { serverId, ...mutable } = mapped

      const existing = await database
        .get<M>(tableName)
        .query(Q.where('server_id', serverId))
        .fetch()
      const first = existing[0]

      if (first) {
        await first.update((local) => {
          Object.assign(local, mutable)
        })
      } else {
        await database.get<M>(tableName).create((local) => {
          Object.assign(local, mapped)
        })
      }
    }
  }

  // ── Queue offline action ──────────────────────────────────
  async queueAction(actionType: string, payload: Record<string, unknown>): Promise<string> {
    const clientId = randomUUID()

    await database.write(async () => {
      await database.get<OfflineQueueItem>('offline_queue').create((r) => {
        r.clientId = clientId
        r.actionType = actionType
        r.payloadJson = JSON.stringify({ ...payload, client_id: clientId })
        r.actionTakenAt = Date.now()
        r.status = 'pending'
        r.retryCount = 0
      })
    })

    return clientId
  }

  get syncing() {
    return this.isSyncing
  }

  destroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer)
  }
}

export const syncEngine = new SyncEngine()
