import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'
import { Button } from '../../../../components/ui/Button'
import { Badge } from '../../../../components/ui/Badge'
import { Card } from '../../../../components/ui/Card'
import { Modal } from '../../../../components/ui/Modal'
import { EmptyState } from '../../../../components/ui/EmptyState'
import { PermissionTree } from '../../../../components/permissions/PermissionTree'
import { SearchableSelect } from '../../../../components/ui/SearchableSelect'
import {
  GET_USER_PERMISSIONS,
  GET_USER_COMPANIES,
  GET_ROLE_TEMPLATES,
  SAVE_USER_PERMISSIONS,
  GET_USER_PO_POSITIONS,
} from '../../../../graphql/permissions'
import { ASSIGN_PO_POSITION, REMOVE_PO_POSITION } from '../../../../graphql/procurement'
import type { AccessLevel } from '../../../../lib/permissionRegistry'

const PO_POSITION_OPTIONS = [
  { value: 'store_keeper', label: 'Store Keeper' },
  { value: 'store_pricing', label: 'Store Pricing' },
  { value: 'procurement_officer', label: 'Procurement Officer' },
  { value: 'procurement_2nd', label: 'Procurement 2nd' },
  { value: 'po_admin', label: 'PO Admin' },
]

interface Company {
  id: string
  name: string
}

interface RoleTemplate {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: { key: string; accessLevel: string }[]
}

interface POPosition {
  id: string
  employeeId: string
  employeeName: string
  position: string
  projectId?: string | null
  projectName?: string | null
  departmentId?: string | null
  departmentName?: string | null
  isActive: boolean
}

interface UserPermEntry {
  key: string
  accessLevel: string
}

interface UserPermissionsResult {
  userId: string
  companyId: string
  isAdmin: boolean
  permissions: UserPermEntry[]
}

interface UserRolesTabProps {
  userId: string
}

export default function UserRolesTab({ userId }: UserRolesTabProps) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [pendingPerms, setPendingPerms] = useState<Record<string, AccessLevel>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [showAddPositionModal, setShowAddPositionModal] = useState(false)
  const [positionForm, setPositionForm] = useState({
    position: '',
    scopeType: 'project' as 'project' | 'department',
    scopeId: '',
  })
  const [applyingTemplate, setApplyingTemplate] = useState(false)

  const { data: companiesData, loading: loadingCompanies } = useQuery<{ userCompanies: Company[] }>(
    GET_USER_COMPANIES,
    { variables: { userId }, fetchPolicy: 'cache-and-network' },
  )
  const companies = companiesData?.userCompanies ?? []

  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0]?.id ?? '')
    }
  }, [companies, selectedCompanyId])

  const {
    data: permsData,
    loading: loadingPerms,
    refetch: refetchPerms,
  } = useQuery<{
    userPermissions: UserPermissionsResult
  }>(GET_USER_PERMISSIONS, {
    variables: { userId, companyId: selectedCompanyId },
    skip: !selectedCompanyId,
    fetchPolicy: 'cache-and-network',
  })

  useEffect(() => {
    if (permsData?.userPermissions) {
      const flat: Record<string, AccessLevel> = {}
      for (const p of permsData.userPermissions.permissions) {
        flat[p.key] = p.accessLevel as AccessLevel
      }
      setPendingPerms(flat)
      setIsDirty(false)
    }
  }, [permsData])

  const { data: templatesData } = useQuery<{ roleTemplates: RoleTemplate[] }>(GET_ROLE_TEMPLATES, {
    fetchPolicy: 'cache-and-network',
  })
  const templates = templatesData?.roleTemplates ?? []

  const { data: poData, refetch: refetchPO } = useQuery<{ userPOPositions: POPosition[] }>(
    GET_USER_PO_POSITIONS,
    { variables: { userId }, fetchPolicy: 'cache-and-network' },
  )
  const poPositions = poData?.userPOPositions ?? []

  const [savePerms, { loading: saving }] = useMutation(SAVE_USER_PERMISSIONS, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Permissions saved' })
      setIsDirty(false)
      void refetchPerms()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [assignPosition, { loading: assigningPos }] = useMutation(ASSIGN_PO_POSITION, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Position assigned' })
      setShowAddPositionModal(false)
      setPositionForm({ position: '', scopeType: 'project', scopeId: '' })
      void refetchPO()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [removePosition] = useMutation(REMOVE_PO_POSITION, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Position removed' })
      void refetchPO()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  function handlePermChange(next: Record<string, AccessLevel>) {
    setPendingPerms(next)
    setIsDirty(true)
  }

  function handleSave() {
    if (!selectedCompanyId) return
    void savePerms({
      variables: {
        input: {
          userId,
          companyId: selectedCompanyId,
          permissions: pendingPerms,
        },
      },
    })
  }

  function handleApplyTemplate(template: RoleTemplate) {
    setApplyingTemplate(true)
    const merged: Record<string, AccessLevel> = { ...pendingPerms }
    for (const p of template.permissions) {
      if (p.accessLevel !== 'none') {
        merged[p.key] = p.accessLevel as AccessLevel
      }
    }
    setPendingPerms(merged)
    setIsDirty(true)
    setApplyingTemplate(false)
    addToast({ type: 'success', message: `Applied template: ${template.name}` })
  }

  const isAdmin = permsData?.userPermissions?.isAdmin ?? false

  if (loadingCompanies) {
    return <div style={{ padding: '20px', color: theme.textMuted }}>Loading companies…</div>
  }

  if (companies.length === 0) {
    return (
      <EmptyState
        title="No companies"
        message="This user has no company assignments. Assign the user to a company role first."
      />
    )
  }

  return (
    <div>
      {/* Company switcher + save bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.bgSurface,
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>Company:</span>
          <div style={{ minWidth: '180px' }}>
            <SearchableSelect
              value={selectedCompanyId}
              onChange={(v) => {
                setSelectedCompanyId(v)
                setIsDirty(false)
              }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          {isAdmin && (
            <Badge variant="accent" size="sm">
              Admin — permissions not applicable
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isDirty && (
            <span style={{ fontSize: '12px', color: theme.warning }}>Unsaved changes</span>
          )}
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!isDirty || isAdmin}
            onClick={handleSave}
          >
            Save permissions
          </Button>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Template quick-apply */}
        {!isAdmin && templates.length > 0 && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
              Quick apply template:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {templates.map((t) => (
                <button
                  key={t.id}
                  disabled={applyingTemplate || saving}
                  onClick={() => {
                    handleApplyTemplate(t)
                  }}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    background: 'transparent',
                    color: theme.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  {t.name}
                  {t.isSystem && (
                    <span style={{ marginLeft: '4px', fontSize: '10px', color: theme.textMuted }}>
                      (system)
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Permission tree */}
        {loadingPerms ? (
          <div style={{ padding: '20px', color: theme.textMuted }}>Loading permissions…</div>
        ) : (
          <PermissionTree value={pendingPerms} onChange={handlePermChange} disabled={isAdmin} />
        )}

        {/* PO Positions */}
        <div style={{ marginTop: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
              PO Positions
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAddPositionModal(true)
              }}
            >
              Add Position
            </Button>
          </div>
          <Card padding="none">
            {poPositions.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: theme.textMuted,
                  fontSize: '13px',
                }}
              >
                No PO positions assigned to this user.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {['Position', 'Scope', 'Status', ''].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 14px',
                            textAlign: 'left',
                            fontSize: '10px',
                            fontWeight: 600,
                            color: theme.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            borderBottom: `1px solid ${theme.border}`,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {poPositions.map((pos) => (
                      <tr key={pos.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge variant="neutral" size="sm">
                            {PO_POSITION_OPTIONS.find((o) => o.value === pos.position)?.label ??
                              pos.position}
                          </Badge>
                        </td>
                        <td
                          style={{
                            padding: '10px 14px',
                            color: theme.textSecondary,
                            fontSize: '12px',
                          }}
                        >
                          {pos.projectName
                            ? `Project: ${pos.projectName}`
                            : pos.departmentName
                              ? `Dept: ${pos.departmentName}`
                              : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge variant={pos.isActive ? 'success' : 'neutral'} size="sm">
                            {pos.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void removePosition({ variables: { id: pos.id } })}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Add Position Modal */}
      {showAddPositionModal && (
        <Modal
          open={showAddPositionModal}
          title="Add PO Position"
          onClose={() => {
            setShowAddPositionModal(false)
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAddPositionModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={assigningPos}
                disabled={!positionForm.position || !positionForm.scopeId}
                onClick={() => {
                  void assignPosition({
                    variables: {
                      input: {
                        employeeId: poPositions[0]?.employeeId ?? '',
                        position: positionForm.position,
                        projectId:
                          positionForm.scopeType === 'project' ? positionForm.scopeId : undefined,
                        departmentId:
                          positionForm.scopeType === 'department'
                            ? positionForm.scopeId
                            : undefined,
                      },
                    },
                  })
                }}
              >
                Assign
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '340px' }}>
            <div>
              <SearchableSelect
                label="Position *"
                value={positionForm.position}
                onChange={(v) => {
                  setPositionForm((f) => ({ ...f, position: v }))
                }}
                placeholder="Select position…"
                options={PO_POSITION_OPTIONS}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Scope type *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['project', 'department'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setPositionForm((f) => ({ ...f, scopeType: t, scopeId: '' }))
                    }}
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: `1px solid ${positionForm.scopeType === t ? theme.accent : theme.border}`,
                      background: positionForm.scopeType === t ? theme.accentBg : 'transparent',
                      color: positionForm.scopeType === t ? theme.accent : theme.textSecondary,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {positionForm.scopeType === 'project' ? 'Project' : 'Department'} *
              </label>
              <input
                value={positionForm.scopeId}
                onChange={(e) => {
                  setPositionForm((f) => ({ ...f, scopeId: e.target.value }))
                }}
                placeholder={`Enter ${positionForm.scopeType} ID`}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                }}
              />
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                Enter the UUID of the {positionForm.scopeType}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
