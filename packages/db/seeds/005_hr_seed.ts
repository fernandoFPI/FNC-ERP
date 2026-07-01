import { type PoolClient } from 'pg'

const COMPANY_1 = '00000000-0000-0000-0000-000000000001'
const COMPANY_2 = '00000000-0000-0000-0000-000000000002'
const COMPANY_3 = '00000000-0000-0000-0000-000000000003'

export const workLocations = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    company_id: COMPANY_1,
    name: 'Head Office - Erbil',
    address: 'Gulan Street, Erbil, Iraq',
    latitude: 36.1911,
    longitude: 44.0092,
    geofence_radius_m: 200,
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    company_id: COMPANY_2,
    name: 'Factory - Erbil Industrial Zone',
    address: 'Industrial Zone, Erbil, Iraq',
    latitude: 36.1500,
    longitude: 44.0300,
    geofence_radius_m: 500,
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    company_id: COMPANY_3,
    name: 'Al Watanyia Office',
    address: 'Kirkuk Road, Erbil, Iraq',
    latitude: 36.2100,
    longitude: 44.0150,
    geofence_radius_m: 200,
  },
]

export const departments = [
  { id: '20000000-0000-0000-0000-000000000001', company_id: COMPANY_1, name: 'Finance' },
  { id: '20000000-0000-0000-0000-000000000002', company_id: COMPANY_1, name: 'Operations' },
  { id: '20000000-0000-0000-0000-000000000003', company_id: COMPANY_1, name: 'HR' },
  { id: '20000000-0000-0000-0000-000000000004', company_id: COMPANY_2, name: 'Production' },
  { id: '20000000-0000-0000-0000-000000000005', company_id: COMPANY_2, name: 'Quality Control' },
  { id: '20000000-0000-0000-0000-000000000006', company_id: COMPANY_3, name: 'Sales' },
]

export const shiftConfigs = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    company_id: COMPANY_1,
    name: 'Standard Day Shift',
    start_time: '08:00',
    end_time: '17:00',
    break_minutes: 60,
    overtime_threshold_hours: 8,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    company_id: COMPANY_2,
    name: 'Factory Morning Shift',
    start_time: '06:00',
    end_time: '14:00',
    break_minutes: 30,
    overtime_threshold_hours: 8,
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    company_id: COMPANY_2,
    name: 'Factory Evening Shift',
    start_time: '14:00',
    end_time: '22:00',
    break_minutes: 30,
    overtime_threshold_hours: 8,
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    company_id: COMPANY_3,
    name: 'Standard Day Shift',
    start_time: '08:00',
    end_time: '17:00',
    break_minutes: 60,
    overtime_threshold_hours: 8,
  },
]

export const leaveTypes = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    company_id: COMPANY_1,
    name: 'Annual Leave',
    is_paid: true,
    max_days_per_year: 21,
    requires_approval: true,
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    company_id: COMPANY_1,
    name: 'Sick Leave',
    is_paid: true,
    max_days_per_year: 14,
    requires_approval: false,
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    company_id: COMPANY_1,
    name: 'Unpaid Leave',
    is_paid: false,
    max_days_per_year: null,
    requires_approval: true,
  },
  {
    id: '40000000-0000-0000-0000-000000000004',
    company_id: COMPANY_2,
    name: 'Annual Leave',
    is_paid: true,
    max_days_per_year: 21,
    requires_approval: true,
  },
  {
    id: '40000000-0000-0000-0000-000000000005',
    company_id: COMPANY_2,
    name: 'Sick Leave',
    is_paid: true,
    max_days_per_year: 14,
    requires_approval: false,
  },
  {
    id: '40000000-0000-0000-0000-000000000006',
    company_id: COMPANY_3,
    name: 'Annual Leave',
    is_paid: true,
    max_days_per_year: 21,
    requires_approval: true,
  },
  {
    id: '40000000-0000-0000-0000-000000000007',
    company_id: COMPANY_3,
    name: 'Sick Leave',
    is_paid: true,
    max_days_per_year: 14,
    requires_approval: false,
  },
]

export async function seedHR(client: PoolClient): Promise<void> {
  for (const loc of workLocations) {
    await client.query(
      `INSERT INTO work_locations (id, company_id, name, address, latitude, longitude, geofence_radius_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [loc.id, loc.company_id, loc.name, loc.address, loc.latitude, loc.longitude, loc.geofence_radius_m],
    )
  }
  console.warn(`[seed] Work locations seeded: ${workLocations.length}`)

  for (const dept of departments) {
    await client.query(
      `INSERT INTO departments (id, company_id, name)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO NOTHING`,
      [dept.id, dept.company_id, dept.name],
    )
  }
  console.warn(`[seed] Departments seeded: ${departments.length}`)

  for (const shift of shiftConfigs) {
    await client.query(
      `INSERT INTO shift_configs (id, company_id, name, start_time, end_time, break_minutes, overtime_threshold_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [shift.id, shift.company_id, shift.name, shift.start_time, shift.end_time, shift.break_minutes, shift.overtime_threshold_hours],
    )
  }
  console.warn(`[seed] Shift configs seeded: ${shiftConfigs.length}`)

  for (const lt of leaveTypes) {
    await client.query(
      `INSERT INTO leave_types (id, company_id, name, is_paid, max_days_per_year, requires_approval)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [lt.id, lt.company_id, lt.name, lt.is_paid, lt.max_days_per_year ?? null, lt.requires_approval],
    )
  }
  console.warn(`[seed] Leave types seeded: ${leaveTypes.length}`)
}
