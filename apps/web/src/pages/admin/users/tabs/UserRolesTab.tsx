import i18n from '../../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'
import { useAuthStore } from '../../../../store/authStore'
import { useAuth } from '../../../../hooks/useAuth'
import { Button } from '../../../../components/ui/Button'
import { Badge } from '../../../../components/ui/Badge'
import { Card } from '../../../../components/ui/Card'
import { Modal } from '../../../../components/ui/Modal'
import { EmptyState } from '../../../../components/ui/EmptyState'
import { PermissionTree } from '../../../../components/permissions/PermissionTree'
import { SearchableSelect } from '../../../../components/ui/SearchableSelect'
import type { Column } from '../../../../components/ui/Table'
import { Table } from '../../../../components/ui/Table'
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
  { value: 'buyer', get label() { return i18n.t('admin.userRoles.buyer', { defaultValue: "Buyer" }) } },
  { value: 'store_keeper', get label() { return i18n.t('admin.userRoles.storeKeeper', { defaultValue: "Store Keeper" }) } },
  { value: 'store_pricing', get label() { return i18n.t('admin.userRoles.storePricing', { defaultValue: "Store Pricing" }) } },
  { value: 'procurement_officer', get label() { return i18n.t('admin.userRoles.procurementOfficer', { defaultValue: "Procurement Officer" }) } },
  { value: 'po_admin', get label() { return i18n.t('admin.userRoles.poAdmin', { defaultValue: "PO Admin" }) } },
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
  branchId?: string | null
  branchName?: string | null
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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()
  const { impersonate } = useAuth()
  const callerRole = useAuthStore((s) => s.user?.role)
  const callerId = useAuthStore((s) => s.user?.id)
  const alreadyImpersonating = useAuthStore((s) => !!s.impersonatedBy)

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [pendingPerms, setPendingPerms] = useState<Record<string, AccessLevel>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [showAddPositionModal, setShowAddPositionModal] = useState(false)
  const [positionForm, setPositionForm] = useState({
    position: '',
    scopeType: 'project' as 'project' | 'department' | 'branch',
    scopeId: '',
  })
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [impersonating, setImpersonating] = useState(false)

  async function handleLoginAs() {
    if (!selectedCompanyId) return
    setImpersonating(true)
    try {
      await impersonate(userId, selectedCompanyId)
      navigate('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.userRoles.failedImpersonation')
      addToast({ type: 'error', message })
    } finally {
      setImpersonating(false)
    }
  }

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
      addToast({ type: 'success', message: t('admin.userRoles.permissionsSaved') })
      setIsDirty(false)
      void refetchPerms()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [assignPosition, { loading: assigningPos }] = useMutation(ASSIGN_PO_POSITION, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userRoles.positionAssigned') })
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
      addToast({ type: 'success', message: t('admin.userRoles.positionRemoved') })
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
    addToast({ type: 'success', message: t('admin.userRoles.appliedTemplate', { name: template.name }) })
  }

  const isAdmin = permsData?.userPermissions.isAdmin ?? false

  const poColumns: Column<POPosition>[] = [
    {
      key: 'position',
      header: t('admin.userRoles.position'),
      mobilePrimary: true,
      render: (pos) => (
        <Badge variant="neutral" size="sm">
          {PO_POSITION_OPTIONS.find((o) => o.value === pos.position)?.label ?? pos.position}
        </Badge>
      ),
    },
    {
      key: 'scope',
      header: t('admin.userRoles.scope'),
      mobileSecondary: true,
      render: (pos) => (
        <span style={{ color: theme.textSecondary, fontSize: '12px' }}>
          {pos.projectName
            ? `Project: ${pos.projectName}`
            : pos.departmentName
              ? `Dept: ${pos.departmentName}`
              : pos.branchName
                ? `Branch: ${pos.branchName}`
                : '—'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: t('admin.userRoles.status'),
      mobilePriority: 1,
      render: (pos) => (
        <Badge variant={pos.isActive ? 'success' : 'neutral'} size="sm">
          {pos.isActive ? t('admin.userRoles.active') : t('admin.userRoles.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileAction: true,
      render: (pos) => (
        <Button
          variant="danger"
          size="sm"
          onClick={() => void removePosition({ variables: { id: pos.id } })}
        >
          {t('admin.userRoles.remove')}
        </Button>
      ),
    },
  ]

  if (loadingCompanies) {
    return <div style={{ padding: '20px', color: theme.textMuted }}>{t('admin.userRoles.loadingCompanies')}</div>
  }

  if (companies.length === 0) {
    return (
      <EmptyState
        title={t('admin.userRoles.noCompanies')}
        message={t('admin.userRoles.thisUserHasNoCompanyAssignments')}
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
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{t('admin.userRoles.company')}</span>
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
              {t('admin.userRoles.adminPermissionsNotApplicable')}
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isDirty && (
            <span style={{ fontSize: '12px', color: theme.warning }}>{t('admin.userRoles.unsavedChanges')}</span>
          )}
          {callerRole === 'system_admin' && userId !== callerId && !alreadyImpersonating && (
            <Button
              variant="secondary"
              size="sm"
              loading={impersonating}
              disabled={!selectedCompanyId}
              onClick={() => void handleLoginAs()}
            >
              {t('admin.userRoles.loginAsThisUser')}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!isDirty || isAdmin}
            onClick={handleSave}
          >
            {t('admin.userRoles.savePermissions')}
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
              {t('admin.userRoles.quickApplyTemplate')}
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  disabled={applyingTemplate || saving}
                  onClick={() => {
                    handleApplyTemplate(tpl)
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
                  {tpl.name}
                  {tpl.isSystem && (
                    <span style={{ marginInlineStart: '4px', fontSize: '10px', color: theme.textMuted }}>
                      {t('admin.userRoles.system')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Permission tree */}
        {loadingPerms ? (
          <div style={{ padding: '20px', color: theme.textMuted }}>{t('admin.userRoles.loadingPermissions')}</div>
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
              {t('admin.userRoles.poPositions')}
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAddPositionModal(true)
              }}
            >
              {t('admin.userRoles.addPosition')}
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
                {t('admin.userRoles.noPoPositionsAssignedToThis')}
              </div>
            ) : (
              <Table columns={poColumns} data={poPositions} rowKey="id" />
            )}
          </Card>
        </div>
      </div>

      {/* Add Position Modal */}
      {showAddPositionModal && (
        <Modal
          open={showAddPositionModal}
          title={t('admin.userRoles.addPoPosition')}
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
                {t('admin.userRoles.cancel')}
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
                        branchId:
                          positionForm.scopeType === 'branch' ? positionForm.scopeId : undefined,
                      },
                    },
                  })
                }}
              >
                {t('admin.userRoles.assign')}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '340px' }}>
            <div>
              <SearchableSelect
                label={t('admin.userRoles.position2')}
                value={positionForm.position}
                onChange={(v) => {
                  setPositionForm((f) => ({ ...f, position: v }))
                }}
                placeholder={t('admin.userRoles.selectPosition')}
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
                {t('admin.userRoles.scopeType')}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['project', 'department', 'branch'] as const).map((tpl) => (
                  <button
                    key={tpl}
                    onClick={() => {
                      setPositionForm((f) => ({ ...f, scopeType: tpl, scopeId: '' }))
                    }}
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: `1px solid ${positionForm.scopeType === tpl ? theme.accent : theme.border}`,
                      background: positionForm.scopeType === tpl ? theme.accentBg : 'transparent',
                      color: positionForm.scopeType === tpl ? theme.accent : theme.textSecondary,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {t(`admin.userRoles.scope${tpl[0].toUpperCase()}${tpl.slice(1)}`)}
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
                {positionForm.scopeType === 'project'
                  ? t('admin.userRoles.project')
                  : positionForm.scopeType === 'department'
                    ? t('admin.userRoles.department')
                    : t('admin.userRoles.branch')}{' '}
                *
              </label>
              <input
                value={positionForm.scopeId}
                onChange={(e) => {
                  setPositionForm((f) => ({ ...f, scopeId: e.target.value }))
                }}
                placeholder={t('admin.userRoles.enterId', { scope: t(`admin.userRoles.scope${positionForm.scopeType[0].toUpperCase()}${positionForm.scopeType.slice(1)}`) })}
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
                {t('admin.userRoles.enterUuid', { scope: t(`admin.userRoles.scope${positionForm.scopeType[0].toUpperCase()}${positionForm.scopeType.slice(1)}`) })}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
