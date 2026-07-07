import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { EMPLOYEES_QUERY, DEPARTMENTS_QUERY } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'

const FILTER_DEFAULTS = { search: '', dept: '', showInactive: 'false' }
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { EmployeeAvatar } from '../../../components/ui/EmployeeAvatar'
import { PermissionGate } from '../../../components/ui/PermissionGate'

interface Employee {
  id: string
  employee_number?: string
  first_name: string
  last_name: string
  job_title?: string
  employment_type?: string
  status: string
  department_name?: string
  hire_date?: string
}

function downloadCSV(rows: string[][], filename: string) {
  const content = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + content, ''], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function EmployeesPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const currentFilters = { search, dept: deptFilter, showInactive: String(showInactive) }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets('employees', FILTER_DEFAULTS)

  const { data, loading, refetch } = useQuery(EMPLOYEES_QUERY, {
    variables: { department_id: deptFilter || undefined, is_active: showInactive ? undefined : true },
    fetchPolicy: 'cache-and-network',
  })
  const { data: deptData } = useQuery(DEPARTMENTS_QUERY)

  const employees: Employee[] = data?.employees ?? []
  const departments = deptData?.departments ?? []

  const deptOptions = departments.map((d: { id: string; name: string }) => ({ value: d.id, label: d.name }))

  const filtered = employees.filter((e) => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || (e.employee_number ?? '').toLowerCase().includes(q)
  })

  const columns: Column<Employee>[] = [
    {
      key: 'first_name',
      header: 'Employee',
      render: (e) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <EmployeeAvatar firstName={e.first_name} lastName={e.last_name} size="sm" status={e.status === 'active' ? 'active' : 'inactive'} />
          <div>
            <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{e.first_name} {e.last_name}</div>
            {e.job_title && <div style={{ fontSize: '11px', color: theme.textMuted }}>{e.job_title}</div>}
          </div>
        </div>
      ),
    },
    { key: 'employee_number', header: 'Number', render: (e) => <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.accent }}>{e.employee_number ?? '—'}</span> },
    { key: 'department_name', header: 'Department', render: (e) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{e.department_name ?? '—'}</span> },
    { key: 'employment_type', header: 'Type', render: (e) => <Badge variant="neutral">{(e.employment_type ?? '').replace('_', ' ')}</Badge> },
    { key: 'status', header: 'Status', render: (e) => <Badge variant={e.status === 'active' ? 'success' : 'neutral'}>{e.status}</Badge> },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title="Employees"
        subtitle={`${filtered.length} employees`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="sm" onClick={() => {
              const header = ['Employee Number', 'First Name', 'Last Name', 'Job Title', 'Department', 'Employment Type', 'Status', 'Hire Date']
              const rows = filtered.map((e) => [
                e.employee_number ?? '', e.first_name, e.last_name,
                e.job_title ?? '', e.department_name ?? '',
                (e.employment_type ?? '').replace('_', ' '),
                e.status, e.hire_date ?? '',
              ])
              downloadCSV([header, ...rows], `employees-${new Date().toISOString().slice(0,10)}.csv`)
            }}>Export CSV</Button>
            <PermissionGate permission="hr.employees.create" minLevel="edit">
              <Button data-tour="new-employee-btn" variant="primary" size="sm" onClick={() => navigate('/hr/employees/new')}>New Employee</Button>
            </PermissionGate>
          </div>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            filters={[
              { key: 'dept', label: 'Department', value: deptFilter, options: deptOptions, onChange: setDeptFilter },
            ]}
            resultCount={filtered.length}
            onRefresh={() => refetch()}
          >
            <button
              onClick={() => setShowInactive((s) => !s)}
              style={{
                background: showInactive ? theme.accentBg : 'transparent',
                border: `1px solid ${showInactive ? theme.accent : theme.border}`,
                borderRadius: '6px', color: showInactive ? theme.accent : theme.textMuted,
                cursor: 'pointer', fontSize: '12px', padding: '4px 10px',
              }}
            >
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </button>
            <FilterPresets
              presets={presets}
              onApply={(preset) => {
                const r = resolvePreset(preset)
                setSearch(r.search)
                setDeptFilter(r.dept)
                setShowInactive(r.showInactive === 'true')
              }}
              onSave={(name) => savePreset(name, currentFilters)}
              onDelete={deletePreset}
            />
          </FilterBar>
        </div>
        <Table columns={columns} data={filtered} loading={loading} rowKey="id" onRowClick={(e) => navigate(`/hr/employees/${e.id}`)} />
      </Card>
    </div>
  )
}
