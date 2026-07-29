import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  PO_POSITIONS_QUERY,
  ASSIGN_PO_POSITION,
  REMOVE_PO_POSITION,
} from '../../../graphql/procurement'
import { EMPLOYEES_QUERY, DEPARTMENTS_QUERY } from '../../../graphql/hr'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Select } from '../../../components/ui/Select'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { PO_POSITIONS } from '../../../lib/po-constants'

interface POPosition {
  id: string
  employeeId: string
  employeeName: string
  position: string
  projectId?: string
  projectName?: string
  departmentId?: string
  departmentName?: string
  isActive: boolean
  createdAt: string
}

const POSITION_VARIANT: Record<string, 'info' | 'warning' | 'accent' | 'neutral'> = {
  store_keeper: 'info',
  store_pricing: 'info',
  procurement_officer: 'accent',
  procurement_2nd: 'warning',
  po_admin: 'accent',
}

// ── Searchable employee combobox ─────────────────────────────────────────────
interface EmployeeOption {
  id: string
  label: string
}

function EmployeeCombobox({
  value,
  onChange,
}: {
  value: EmployeeOption | null
  onChange: (v: EmployeeOption | null) => void
}) {
  const { theme } = useTheme()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery(EMPLOYEES_QUERY, {
    variables: { is_active: true },
    skip: !open,
    fetchPolicy: 'cache-and-network',
  })

  const allEmployees: EmployeeOption[] = (data?.employees ?? []).map(
    (e: { id: string; first_name: string; last_name: string; employee_number?: string }) => ({
      id: e.id,
      label: `${e.first_name} ${e.last_name}${e.employee_number ? ` (${e.employee_number})` : ''}`,
    }),
  )

  const options = search
    ? allEmployees.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
    : allEmployees

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [])

  function select(opt: EmployeeOption) {
    onChange(opt)
    setSearch('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={open ? search : (value?.label ?? '')}
        onFocus={() => {
          setOpen(true)
          setSearch('')
        }}
        onChange={(e) => {
          setSearch(e.target.value)
          onChange(null)
        }}
        placeholder="Search by name or employee number…"
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: '6px',
          border: `1px solid ${open ? theme.accent : theme.border}`,
          background: theme.bgSurface,
          color: theme.textPrimary,
          fontSize: '13px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 100,
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: theme.textMuted }}>
              {search ? 'No employees found' : 'Type to search…'}
            </div>
          )}
          {options.map((opt) => (
            <div
              key={opt.id}
              onMouseDown={() => {
                select(opt)
              }}
              style={{
                padding: '9px 14px',
                fontSize: '13px',
                color: theme.textPrimary,
                cursor: 'pointer',
                background: value?.id === opt.id ? `${theme.accent}18` : 'transparent',
                borderBottom: `1px solid ${theme.border}22`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `${theme.accent}12`)}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  value?.id === opt.id ? `${theme.accent}18` : 'transparent')
              }
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function POPositionsPage() {
  const { theme } = useTheme()
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<'all' | 'project' | 'department'>('all')
  const [confirmRemovePosition, setConfirmRemovePosition] = useState<string | null>(null)

  // form state
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null)
  const [position, setPosition] = useState('')
  const [scopeType, setScopeType] = useState<'none' | 'project' | 'department'>('none')
  const [projectId, setProjectId] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  function resetForm() {
    setSelectedEmployee(null)
    setPosition('')
    setScopeType('none')
    setProjectId('')
    setDepartmentId('')
  }

  const { data, loading, refetch } = useQuery(PO_POSITIONS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })

  // load projects + departments for scope dropdowns
  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { limit: 200, includeAll: true },
    skip: !showAssignModal,
  })
  const { data: deptData } = useQuery(DEPARTMENTS_QUERY, { skip: !showAssignModal })

  const projects = (projectsData?.projects?.data ?? []) as {
    id: string
    code: string
    name: string
  }[]
  const departments = (deptData?.departments ?? []) as {
    id: string
    name: string
    is_active: boolean
  }[]

  const [assignPosition, { loading: assigning }] = useMutation(ASSIGN_PO_POSITION, {
    onCompleted: () => {
      setShowAssignModal(false)
      resetForm()
      void refetch()
    },
  })

  const [removePosition] = useMutation(REMOVE_PO_POSITION, {
    onCompleted: () => void refetch(),
  })

  const positions: POPosition[] = data?.poPositions ?? []
  const filtered = positions.filter((p) => {
    if (scopeFilter === 'project') return !!p.projectId
    if (scopeFilter === 'department') return !!p.departmentId
    return true
  })

  const canSubmit =
    !!selectedEmployee &&
    !!position &&
    (scopeType === 'none' ||
      (scopeType === 'project' && !!projectId) ||
      (scopeType === 'department' && !!departmentId))

  const columns: Column<POPosition>[] = [
    {
      key: 'employeeName',
      header: 'Employee',
      mobilePrimary: true,
      render: (p) => <span style={{ color: theme.textPrimary }}>{p.employeeName}</span>,
    },
    {
      key: 'position',
      header: 'Position',
      mobileSecondary: true,
      render: (p) => (
        <Badge variant={POSITION_VARIANT[p.position] ?? 'neutral'}>
          {PO_POSITIONS.find((pos) => pos.key === p.position)?.label ?? p.position}
        </Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Active',
      mobilePriority: 1,
      render: (p) => (
        <Badge variant={p.isActive ? 'success' : 'neutral'}>
          {p.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      mobilePriority: 2,
      render: (p) => (
        <span style={{ color: theme.textMuted }}>
          {p.projectName
            ? `Project: ${p.projectName}`
            : p.departmentName
              ? `Dept: ${p.departmentName}`
              : 'Company-wide'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Assigned',
      mobilePriority: 3,
      render: (p) => <span style={{ color: theme.textMuted }}>{p.createdAt.slice(0, 10)}</span>,
    },
    {
      key: 'actions',
      header: '',
      mobileAction: true,
      render: (p) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirmRemovePosition(p.id)
          }}
        >
          Remove
        </Button>
      ),
    },
  ]

  function handleAssign() {
    if (!selectedEmployee) return
    void assignPosition({
      variables: {
        input: {
          employeeId: selectedEmployee.id,
          position,
          projectId: scopeType === 'project' ? projectId : undefined,
          departmentId: scopeType === 'department' ? departmentId : undefined,
        },
      },
    })
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title="PO Positions"
        subtitle="Assign employees to procurement roles per project or department"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowAssignModal(true)
            }}
          >
            Assign position
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '16px' }}>
        {(['all', 'project', 'department'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setScopeFilter(s)
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${theme.border}`,
              cursor: 'pointer',
              fontSize: '12px',
              background: scopeFilter === s ? theme.accent : 'transparent',
              color: scopeFilter === s ? '#fff' : theme.textMuted,
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        <Table
          columns={columns}
          data={filtered}
          rowKey="id"
          loading={loading}
          emptyMessage="No positions assigned."
        />
      </Card>

      {showAssignModal && (
        <Modal
          open={showAssignModal}
          title="Assign PO Position"
          onClose={() => {
            setShowAssignModal(false)
            resetForm()
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '420px' }}>
            {/* Employee */}
            <div>
              <label
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Employee
              </label>
              <EmployeeCombobox value={selectedEmployee} onChange={setSelectedEmployee} />
            </div>

            {/* Position */}
            <Select
              label="Position"
              value={position}
              onChange={(e) => {
                setPosition(e.target.value)
              }}
              options={PO_POSITIONS.map((p) => ({ value: p.key, label: p.label }))}
              placeholder="Select position"
            />

            {/* Scope */}
            <div>
              <label
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                Scope
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                {(['none', 'project', 'department'] as const).map((s) => {
                  const labels = {
                    none: 'Company-wide',
                    project: 'Project',
                    department: 'Department',
                  }
                  const active = scopeType === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setScopeType(s)
                        setProjectId('')
                        setDepartmentId('')
                      }}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        borderRadius: '6px',
                        border: `1px solid ${active ? theme.accent : theme.border}`,
                        background: active ? `${theme.accent}18` : 'transparent',
                        color: active ? theme.accent : theme.textMuted,
                        fontSize: '12px',
                        fontWeight: active ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {labels[s]}
                    </button>
                  )
                })}
              </div>

              {scopeType === 'none' && (
                <p style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.5 }}>
                  This employee's role will apply across all projects and departments.
                </p>
              )}

              {scopeType === 'project' && (
                <Select
                  label=""
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value)
                  }}
                  placeholder="Select project…"
                  options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                />
              )}

              {scopeType === 'department' && (
                <Select
                  label=""
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value)
                  }}
                  placeholder="Select department…"
                  options={departments
                    .filter((d) => d.is_active)
                    .map((d) => ({ value: d.id, label: d.name }))}
                />
              )}
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAssignModal(false)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={assigning}
                disabled={!canSubmit}
                onClick={handleAssign}
              >
                Assign
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmRemovePosition}
        onClose={() => {
          setConfirmRemovePosition(null)
        }}
        onConfirm={() => {
          if (confirmRemovePosition)
            void removePosition({ variables: { id: confirmRemovePosition } })
          setConfirmRemovePosition(null)
        }}
        title="Remove Position"
        message="Remove this position assignment? The employee will lose this PO role."
        confirmLabel="Remove"
        confirmVariant="danger"
      />
    </div>
  )
}
