import NetInfo from '@react-native-community/netinfo'
import { Platform } from 'react-native'
import { Q } from '@nozbe/watermelondb'
import * as SecureStore from 'expo-secure-store'
import { randomUUID } from 'expo-crypto'
import { database } from '../db/database'
import type {
  AttendanceLog,
  OfflineQueueItem,
  SyncMeta,
} from '../db/models'

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? ''
const SYNC_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

export interface SyncResult {
  success: boolean
  reason?: string
  queued?: QueueResult
  pulled?: PullResult
  durationMs?: number
}

interface QueueResult { submitted: number; failed: number }
interface PullResult { entities: number; records: number }

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
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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
      return { success: true, queued: queueResult, pulled: pullResult, durationMs: Date.now() - startTime }
    } catch (err: unknown) {
      return { success: false, reason: err instanceof Error ? err.message : String(err) }
    } finally {
      this.isSyncing = false
    }
  }

  // ── Submit offline queue ──────────────────────────────────
  async submitOfflineQueue(): Promise<QueueResult> {
    const queueItems = (await database
      .get<OfflineQueueItem>('offline_queue')
      .query(Q.where('status', Q.oneOf(['pending', 'failed'])))
      .fetch()) as OfflineQueueItem[]

    if (queueItems.length === 0) return { submitted: 0, failed: 0 }

    const token = await SecureStore.getItemAsync('auth_token')
    if (!token) return { submitted: 0, failed: 0 }

    await database.write(async () => {
      for (const item of queueItems) {
        await item.update((r) => { r.status = 'submitting' })
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

    const syncMeta = (await database.get<SyncMeta>('sync_meta').query().fetch()) as SyncMeta[]

    const since = syncMeta.reduce((oldest, meta) => {
      const d = new Date(meta.lastSyncedAt)
      return d < oldest ? d : oldest
    }, new Date())

    const entities = ['profile', 'attendance', 'locations', 'projects', 'approvals', 'products', 'leave', 'equipment']
    const sinceParam = since.getTime() === 0 ? '' : since.toISOString()

    const response = await fetch(
      `${API_BASE}/api/v1/mobile/sync?` +
        new URLSearchParams({
          since: sinceParam,
          entities: entities.join(','),
          device_id: this.deviceId,
        }),
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
      for (const entityType of Object.keys(changes)) {
        const existing = syncMeta.find((m) => m.entityType === entityType)
        const syncedTs = new Date(syncedAt).getTime()
        const count = changes[entityType]!.updated?.length ?? 0

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

    const totalRecords = Object.values(changes).reduce(
      (sum, c) => sum + (c.updated?.length ?? 0),
      0,
    )
    return { entities: Object.keys(changes).length, records: totalRecords }
  }

  // ── Apply server changes to local DB ─────────────────────
  async applyChanges(changes: Record<string, ServerChanges>): Promise<void> {
    await database.write(async () => {

      if (changes['profile']?.updated.length) {
        await this._upsert('employee_profile', changes['profile'].updated, (r) => ({
          server_id: r['id'],
          employee_number: r['employee_number'],
          first_name: r['first_name'],
          last_name: r['last_name'],
          job_title: r['job_title'] ?? null,
          department_name: r['department_name'] ?? null,
          contract_type: r['contract_type'],
          work_location_id: r['work_location_id'] ?? null,
          updated_at_server: new Date(String(r['updated_at'])).getTime(),
        }))
      }

      if (changes['attendance']?.updated.length) {
        await this._upsert('attendance_logs', changes['attendance'].updated, (r) => ({
          server_id: r['id'],
          punch_type: r['punch_type'],
          gps_lat: r['gps_lat'] != null ? Number(r['gps_lat']) : null,
          gps_lng: r['gps_lng'] != null ? Number(r['gps_lng']) : null,
          is_valid: Boolean(r['is_valid']),
          rejection_reason: r['rejection_reason'] ?? null,
          punched_at: new Date(String(r['punched_at'])).getTime(),
          work_location_id: r['work_location_id'] ?? null,
          is_offline_submission: false,
        }))
      }

      if (changes['locations']?.updated.length) {
        await this._upsert('work_locations', changes['locations'].updated, (r) => ({
          server_id: r['id'],
          name: r['name'],
          code: r['code'] ?? null,
          location_type: r['location_type'],
          geo_lat: r['geo_lat'] != null ? Number(r['geo_lat']) : null,
          geo_lng: r['geo_lng'] != null ? Number(r['geo_lng']) : null,
          geo_radius_meters: r['geo_radius_meters'] != null ? Number(r['geo_radius_meters']) : null,
          updated_at_server: new Date(String(r['updated_at'])).getTime(),
        }))
      }

      if (changes['projects']?.updated.length) {
        await this._upsert('projects', changes['projects'].updated, (r) => ({
          server_id: r['id'],
          code: r['code'],
          name: r['name'],
          project_type: r['project_type'],
          status: r['status'],
          client_name: r['client_name'] ?? null,
          budget_amount: Number(r['budget_amount']),
          budget_currency: r['budget_currency'],
          stages_json: JSON.stringify(r['stages'] ?? []),
          updated_at_server: new Date(String(r['updated_at'])).getTime(),
        }))
      }

      if (changes['approvals']?.updated.length) {
        await this._upsert('pending_approvals', changes['approvals'].updated, (r) => {
          let title = ''
          let subtitle: string | null = null
          let amount: number | null = null
          let currency: string | null = null

          if (r['approval_type'] === 'purchase_order') {
            title = `PO ${String(r['po_number'])}`
            subtitle = String(r['vendor_name'] ?? '')
            amount = Number(r['total_amount'])
            currency = String(r['currency_code'])
          } else if (r['approval_type'] === 'overtime_request') {
            title = `Overtime — ${String(r['employee_name'])}`
            subtitle = `${String(r['overtime_hours'])} hrs on ${String(r['work_date'])}`
          } else if (r['approval_type'] === 'leave_request') {
            title = `Leave — ${String(r['employee_name'])}`
            subtitle = `${String(r['leave_type_name'])}: ${String(r['start_date'])} → ${String(r['end_date'])}`
          }

          return {
            server_id: r['id'],
            approval_type: r['approval_type'],
            title,
            subtitle,
            amount,
            currency,
            employee_name: r['employee_name'] ?? null,
            status: r['status'],
            data_json: JSON.stringify(r),
            updated_at_server: new Date(String(r['updated_at'] ?? r['created_at'])).getTime(),
          }
        })
      }

      if (changes['products']?.updated.length) {
        await this._upsert('products', changes['products'].updated, (r) => ({
          server_id: r['id'],
          sku: r['sku'],
          name: r['name'],
          uom: r['uom'],
          category: r['category'] ?? null,
          updated_at_server: new Date(String(r['updated_at'])).getTime(),
        }))
      }

      if (changes['leave']?.updated.length) {
        await this._upsert('leave_requests', changes['leave'].updated, (r) => ({
          server_id: r['id'],
          start_date: r['start_date'],
          end_date: r['end_date'],
          days_requested: Number(r['days_requested']),
          status: r['status'],
          leave_type_name: r['leave_type_name'],
          reason: r['reason'] ?? null,
          review_notes: r['review_notes'] ?? null,
          updated_at_server: new Date(String(r['updated_at'])).getTime(),
        }))
      }

      if (changes['equipment']?.updated.length) {
        await this._upsert('equipment_assets', changes['equipment'].updated, (r) => ({
          server_id: r['id'],
          asset_number: r['asset_number'],
          name: r['name'],
          category: r['category'] ?? null,
          model: r['model'] ?? null,
          status: r['status'],
          project_id: r['project_id'] ?? null,
          project_name: r['project_name'] ?? null,
          project_code: r['project_code'] ?? null,
          current_location: r['current_location'] ?? null,
          gps_lat: r['gps_lat'] != null ? Number(r['gps_lat']) : null,
          gps_lng: r['gps_lng'] != null ? Number(r['gps_lng']) : null,
          total_hours_operated: r['total_hours_operated'] != null ? Number(r['total_hours_operated']) : null,
          last_usage_date: r['last_usage_date'] ?? null,
          maintenance_status: r['maintenance_status'] ?? 'ok',
          next_maintenance_due_date: r['next_maintenance_due_date'] ?? null,
          next_maintenance_due_hours: r['next_maintenance_due_hours'] != null ? Number(r['next_maintenance_due_hours']) : null,
          updated_at_server: new Date(String(r['updated_at'])).getTime(),
        }))
      }
    })
  }

  private async _upsert(
    tableName: string,
    records: Record<string, unknown>[],
    mapper: (r: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    for (const record of records) {
      const mapped = mapper(record)
      const serverId = String(mapped['server_id'])

      const existing = await database
        .get(tableName)
        .query(Q.where('server_id', serverId))
        .fetch()

      if (existing.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await existing[0]!.update((local: any) => { Object.assign(local, mapped) })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await database.get(tableName).create((local: any) => { Object.assign(local, mapped) })
      }
    }
  }

  // ── Queue offline action ──────────────────────────────────
  async queueAction(
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
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
