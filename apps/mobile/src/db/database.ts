import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'
import {
  EmployeeProfile,
  AttendanceLog,
  WorkLocation,
  Project,
  PendingApproval,
  Product,
  LeaveRequest,
  OfflineQueueItem,
  SyncMeta,
  EquipmentAsset,
} from './models'

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'fnc_erp',
  // jsi: true — enable for performance once stable in your RN version
  onSetUpError: (error) => {
    console.error('[DB] Setup error:', error)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [
    EmployeeProfile,
    AttendanceLog,
    WorkLocation,
    Project,
    PendingApproval,
    Product,
    LeaveRequest,
    OfflineQueueItem,
    SyncMeta,
    EquipmentAsset,
  ],
})
