import i18n, { enumLabel } from '../../../i18n'
import { Trans, useTranslation } from 'react-i18next'
import { useState, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useSubscription } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Checkbox } from '../../../components/ui/Checkbox'
import { Badge } from '../../../components/ui/Badge'
import { TabBar } from '../../../components/ui/TabBar'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Modal } from '../../../components/ui/Modal'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'

const UserRolesTab = lazy(() => import('./tabs/UserRolesTab'))
import {
  USER_QUERY,
  USER_SESSIONS_QUERY,
  ADD_USER_ROLE,
  UPDATE_USER_ROLE,
  REMOVE_USER_ROLE,
  DEACTIVATE_USER,
  ACTIVATE_USER,
  ASSIGN_ROLE,
  UNLOCK_USER,
  RESET_USER_MFA,
  REVOKE_USER_SESSION,
  REVOKE_ALL_USER_SESSIONS,
  ADMIN_SET_USER_PASSWORD,
  COMPANIES_QUERY,
  SESSIONS_CHANGED_SUBSCRIPTION,
} from '../../../graphql/admin'

const ROLE_OPTIONS = [
  { value: 'system_admin', get label() { return i18n.t('admin.userDetail.systemAdmin', { defaultValue: "System Admin" }) } },
  { value: 'company_admin', get label() { return i18n.t('admin.userDetail.companyAdmin', { defaultValue: "Company Admin" }) } },
  { value: 'module_admin', get label() { return i18n.t('admin.userDetail.moduleAdmin', { defaultValue: "Module Admin" }) } },
  { value: 'user', get label() { return i18n.t('admin.userDetail.user', { defaultValue: "User" }) } },
]

const MODULE_OPTIONS = [
  { value: '', get label() { return i18n.t('admin.userDetail.noneCompanyLevelRole', { defaultValue: "— None (company-level role) —" }) } },
  { value: 'procurement', get label() { return i18n.t('admin.userDetail.procurement', { defaultValue: "Procurement" }) } },
  { value: 'finance', get label() { return i18n.t('admin.userDetail.finance', { defaultValue: "Finance" }) } },
  { value: 'hr', get label() { return i18n.t('admin.userDetail.hr', { defaultValue: "HR" }) } },
  { value: 'projects', get label() { return i18n.t('admin.userDetail.projects', { defaultValue: "Projects" }) } },
  { value: 'manufacturing', get label() { return i18n.t('admin.userDetail.manufacturing', { defaultValue: "Manufacturing" }) } },
  { value: 'rental', get label() { return i18n.t('admin.userDetail.rental', { defaultValue: "Rental" }) } },
  { value: 'reporting', get label() { return i18n.t('admin.userDetail.reporting', { defaultValue: "Reporting" }) } },
  { value: 'inventory', get label() { return i18n.t('admin.userDetail.inventory', { defaultValue: "Inventory" }) } },
  { value: 'interco', get label() { return i18n.t('admin.userDetail.interco', { defaultValue: "Interco" }) } },
]

interface UserRole {
  id: string
  companyId: string
  companyName: string
  module: string
  role: string
  isActive: boolean
}

interface UserDetail {
  id: string
  email: string
  isActive: boolean
  mfaEnabled: boolean
  lastLogin: string | null
  failedLoginAttempts: number
  lockedUntil: string | null
  createdAt: string
  roles: UserRole[]
}

interface UserSession {
  id: string
  deviceName: string
  platform: string
  ipAddress: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

interface UserDetailData {
  user: UserDetail
}

interface UserSessionsData {
  userSessions: UserSession[]
}

const TABS = [
  { key: 'overview', get label() { return i18n.t('admin.userDetail.overview', { defaultValue: "Overview" }) } },
  { key: 'roles', get label() { return i18n.t('admin.userDetail.roles', { defaultValue: "Roles" }) } },
  { key: 'permissions', get label() { return i18n.t('admin.userDetail.permissions', { defaultValue: "Permissions" }) } },
  { key: 'sessions', get label() { return i18n.t('admin.userDetail.sessions', { defaultValue: "Sessions" }) } },
  { key: 'activity', get label() { return i18n.t('admin.userDetail.activity', { defaultValue: "Activity" }) } },
]

export default function UserDetail() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { id } = useParams<{ id: string }>()
  const addToast = useToastStore((s) => s.addToast)
  const { can } = usePermission()
  const canManageRoles = can('admin.users.edit', 'edit')

  const [activeTab, setActiveTab] = useState('overview')
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const [confirmResetMFA, setConfirmResetMFA] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null)
  const [removeRoleId, setRemoveRoleId] = useState<string | null>(null)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [roleForm, setRoleForm] = useState({ companyId: '', role: '', module: '', modules: [] as string[] })
  const [editingRole, setEditingRole] = useState<UserRole | null>(null)
  const [editRoleForm, setEditRoleForm] = useState({ role: '', module: '' })
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')

  const { data: companiesData } = useQuery<{ companies: { id: string; name: string }[] }>(
    COMPANIES_QUERY,
  )
  const companyOptions = (companiesData?.companies ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const {
    data: userData,
    loading: userLoading,
    refetch: refetchUser,
  } = useQuery<UserDetailData>(USER_QUERY, {
    variables: { id },
    skip: !id,
  })

  const {
    data: sessionsData,
    loading: sessionsLoading,
    refetch: refetchSessions,
  } = useQuery<UserSessionsData>(USER_SESSIONS_QUERY, {
    variables: { userId: id },
    skip: !id || activeTab !== 'sessions',
  })

  // Live-refetch when this user's sessions change elsewhere (login from
  // another device, another admin revoking a session, etc.) instead of
  // requiring a manual page refresh.
  useSubscription(SESSIONS_CHANGED_SUBSCRIPTION, {
    variables: { userId: id },
    skip: !id || activeTab !== 'sessions',
    onData: () => {
      void refetchSessions()
    },
  })

  const [unlockUser, { loading: unlocking }] = useMutation(UNLOCK_USER, {
    variables: { userId: id },
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.userUnlocked') })
      setConfirmUnlock(false)
      void refetchUser()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmUnlock(false)
    },
  })

  const [resetMFA, { loading: resettingMFA }] = useMutation(RESET_USER_MFA, {
    variables: { userId: id },
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.mfaReset') })
      setConfirmResetMFA(false)
      void refetchUser()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmResetMFA(false)
    },
  })

  const [revokeSession, { loading: revokingSession }] = useMutation(REVOKE_USER_SESSION, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.sessionRevoked') })
      setRevokeSessionId(null)
      void refetchSessions()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setRevokeSessionId(null)
    },
  })

  const [revokeAllSessions, { loading: revokingAll }] = useMutation(REVOKE_ALL_USER_SESSIONS, {
    variables: { userId: id },
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.allSessionsRevoked') })
      setConfirmRevokeAll(false)
      void refetchSessions()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmRevokeAll(false)
    },
  })

  const [removeRole, { loading: removingRole }] = useMutation(REMOVE_USER_ROLE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.roleRemoved') })
      setRemoveRoleId(null)
      void refetchUser()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setRemoveRoleId(null)
    },
  })

  const [updateRole, { loading: updatingRole }] = useMutation(UPDATE_USER_ROLE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.roleUpdated') })
      setEditingRole(null)
      void refetchUser()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [deactivateUser, { loading: deactivating }] = useMutation(DEACTIVATE_USER, {
    variables: { userId: id },
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.userDeactivated') })
      void refetchUser()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [activateUser, { loading: activating }] = useMutation(ACTIVATE_USER, {
    variables: { userId: id },
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.userActivated') })
      void refetchUser()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [setUserPassword, { loading: settingPassword }] = useMutation(ADMIN_SET_USER_PASSWORD, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.userDetail.passwordUpdatedAllSessionsHaveBeen') })
      setShowSetPasswordModal(false)
      setPasswordForm({ newPassword: '', confirmPassword: '' })
      setPasswordError('')
    },
    onError: (e) => {
      setPasswordError(e.message)
    },
  })

  const [assignRole] = useMutation(ASSIGN_ROLE)
  const [submittingRoles, setSubmittingRoles] = useState(false)

  async function handleAddRole() {
    const modules = roleForm.role === 'module_admin' ? roleForm.modules : ['']
    setSubmittingRoles(true)
    const succeeded: string[] = []
    const failed: string[] = []
    for (const m of modules) {
      try {
        await assignRole({
          variables: {
            input: {
              user_id: id,
              company_id: roleForm.companyId,
              role: roleForm.role,
              module: m || undefined,
            },
          },
        })
        succeeded.push(m)
      } catch {
        failed.push(m)
      }
    }
    setSubmittingRoles(false)
    if (failed.length === 0) {
      addToast({
        type: 'success',
        message: succeeded.length > 1 ? t('admin.userDetail.assignedRoles', { count: succeeded.length }) : t('admin.userDetail.roleAssigned'),
      })
      setShowAddRoleModal(false)
      setRoleForm({ companyId: '', role: '', module: '', modules: [] })
    } else {
      const failedLabels = failed
        .map((m) => MODULE_OPTIONS.find((o) => o.value === m)?.label ?? m)
        .join(', ')
      addToast({
        type: 'error',
        message:
          succeeded.length > 0
            ? t('admin.userDetail.someModulesFailed', { labels: failedLabels })
            : t('admin.userDetail.couldNotAssign', { labels: failedLabels }),
      })
    }
    if (succeeded.length > 0) void refetchUser()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_addRole] = useMutation(ADD_USER_ROLE)

  const user = userData?.user
  const sessions = sessionsData?.userSessions ?? []
  const isLocked = !!user?.lockedUntil && new Date(user.lockedUntil) > new Date()

  const roleColumns: Column<UserRole>[] = [
    {
      key: 'companyName',
      header: t('admin.userDetail.company'),
      mobilePrimary: true,
      render: (role) => role.companyName,
    },
    {
      key: 'module',
      header: t('admin.userDetail.module'),
      mobileSecondary: true,
      render: (role) => (
        <Badge variant="neutral" size="sm">
          {role.module}
        </Badge>
      ),
    },
    {
      key: 'role',
      header: t('admin.userDetail.role'),
      mobilePriority: 1,
      render: (role) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{enumLabel(role.role)}</span>
      ),
    },
    {
      key: 'isActive',
      header: t('admin.userDetail.status'),
      mobilePriority: 2,
      render: (role) => (
        <Badge variant={role.isActive ? 'success' : 'neutral'} size="sm">
          {role.isActive ? t('admin.userDetail.active') : t('admin.userDetail.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileLabel: 'Actions',
      mobilePriority: 3,
      render: (role) =>
        !canManageRoles ? null : (
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditRoleForm({ role: role.role, module: role.module })
                setEditingRole(role)
              }}
            >
              {t('admin.userDetail.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void updateRole({
                  variables: {
                    roleId: role.id,
                    input: { isActive: !role.isActive },
                  },
                })
              }
            >
              {role.isActive ? t('admin.userDetail.disable') : t('admin.userDetail.enable')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setRemoveRoleId(role.id)
              }}
            >
              {t('admin.userDetail.remove')}
            </Button>
          </div>
        ),
    },
  ]

  const sessionColumns: Column<UserSession>[] = [
    {
      key: 'deviceName',
      header: t('admin.userDetail.device'),
      mobilePrimary: true,
      render: (s) => (
        <span style={{ color: theme.textPrimary }}>
          {s.deviceName}
          {s.isCurrent && (
            <span style={{ marginInlineStart: '8px' }}>
              <Badge variant="accent" size="sm">
                {t('admin.userDetail.current')}
              </Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'platform',
      header: t('admin.userDetail.platform'),
      mobileSecondary: true,
      render: (s) => s.platform,
    },
    {
      key: 'ipAddress',
      header: 'IP',
      mobilePriority: 1,
      render: (s) => (
        <span
          style={{
            color: theme.textMuted,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
          }}
        >
          {s.ipAddress === '::1' || s.ipAddress === '127.0.0.1'
            ? 'localhost'
            : (s.ipAddress ?? '—')}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: t('admin.userDetail.created'),
      mobilePriority: 2,
      render: (s) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(s.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: t('admin.userDetail.expires'),
      mobilePriority: 3,
      render: (s) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(s.expiresAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileAction: true,
      render: (s) =>
        !s.isCurrent ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setRevokeSessionId(s.id)
            }}
            loading={revokingSession && revokeSessionId === s.id}
          >
            {t('admin.userDetail.revoke')}
          </Button>
        ) : null,
    },
  ]

  if (userLoading) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          className="skeleton"
          style={{ height: '60px', borderRadius: '8px', marginBottom: '16px' }}
        />
        <div className="skeleton" style={{ height: '300px', borderRadius: '8px' }} />
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>{t('admin.userDetail.userNotFound')}</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={user.email}
        backPath="/admin/users"
        backLabel="Users"
        status={
          <Badge variant={user.isActive ? 'success' : 'neutral'}>
            {user.isActive ? t('admin.userDetail.active') : t('admin.userDetail.inactive')}
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {isLocked && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setConfirmUnlock(true)
                }}
                loading={unlocking}
              >
                {t('admin.userDetail.unlock')}
              </Button>
            )}
            {user.mfaEnabled && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setConfirmResetMFA(true)
                }}
                loading={resettingMFA}
              >
                {t('admin.userDetail.resetMfa')}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPasswordForm({ newPassword: '', confirmPassword: '' })
                setPasswordError('')
                setShowSetPasswordModal(true)
              }}
            >
              {t('admin.userDetail.setPassword')}
            </Button>
            {user.isActive ? (
              <Button
                variant="danger"
                size="sm"
                loading={deactivating}
                onClick={() => {
                  setConfirmDeactivate(true)
                }}
              >
                {t('admin.userDetail.deactivate')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                loading={activating}
                onClick={() => void activateUser()}
              >
                {t('admin.userDetail.activate')}
              </Button>
            )}
          </div>
        }
      />

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: '20px' }}>
        {activeTab === 'overview' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Card padding="md">
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                }}
              >
                {t('admin.userDetail.accountInfo')}
              </p>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: '8px 12px',
                  fontSize: '13px',
                }}
              >
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.email')}</dt>
                <dd style={{ color: theme.textPrimary, margin: 0 }}>{user.email}</dd>
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.status')}</dt>
                <dd style={{ margin: 0 }}>
                  <Badge variant={user.isActive ? 'success' : 'neutral'} size="sm">
                    {user.isActive ? t('admin.userDetail.active') : t('admin.userDetail.inactive')}
                  </Badge>
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.mfa')}</dt>
                <dd style={{ margin: 0 }}>
                  <Badge variant={user.mfaEnabled ? 'success' : 'warning'} size="sm">
                    {user.mfaEnabled ? t('admin.userDetail.enabled') : t('admin.userDetail.disabled')}
                  </Badge>
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.lastLogin')}</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : t('admin.userDetail.never')}
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.created')}</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </dd>
              </dl>
            </Card>
            <Card padding="md">
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                }}
              >
                {t('admin.userDetail.security')}
              </p>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: '8px 12px',
                  fontSize: '13px',
                }}
              >
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.failedLogins')}</dt>
                <dd
                  style={{
                    color: user.failedLoginAttempts > 0 ? theme.danger : theme.textMuted,
                    margin: 0,
                  }}
                >
                  {user.failedLoginAttempts}
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('admin.userDetail.lockedUntil')}</dt>
                <dd
                  style={{
                    color: isLocked ? theme.danger : theme.textMuted,
                    margin: 0,
                    fontSize: '12px',
                  }}
                >
                  {isLocked && user?.lockedUntil
                    ? new Date(user.lockedUntil).toLocaleString()
                    : '—'}
                </dd>
              </dl>
            </Card>
          </div>
        )}

        {activeTab === 'roles' && (
          <Card padding="none">
            {canManageRoles && (
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowAddRoleModal(true)
                  }}
                >
                  {t('admin.userDetail.addRole')}
                </Button>
              </div>
            )}
            {user.roles.length ? (
              <Table columns={roleColumns} data={user.roles} rowKey="id" />
            ) : (
              <EmptyState title={t('admin.userDetail.noRoles')} message={t('admin.userDetail.thisUserHasNoAssignedRoles')} />
            )}
          </Card>
        )}

        {activeTab === 'permissions' && (
          <Card padding="none">
            <Suspense
              fallback={<div style={{ padding: '20px', color: theme.textMuted }}>{t('admin.userDetail.loading')}</div>}
            >
              <UserRolesTab userId={user.id} />
            </Suspense>
          </Card>
        )}

        {activeTab === 'sessions' && (
          <Card padding="none">
            <div
              style={{
                padding: '16px 20px 12px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                {t('admin.userDetail.activeSessions')}
              </h3>
              {sessions.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setConfirmRevokeAll(true)
                  }}
                  loading={revokingAll}
                >
                  {t('admin.userDetail.revokeAll')}
                </Button>
              )}
            </div>
            {sessionsLoading ? (
              <div style={{ padding: '24px' }}>
                <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
              </div>
            ) : sessions.length ? (
              <Table columns={sessionColumns} data={sessions} rowKey="id" />
            ) : (
              <EmptyState title={t('admin.userDetail.noSessions')} message={t('admin.userDetail.thisUserHasNoActiveSessions')} />
            )}
          </Card>
        )}

        {activeTab === 'activity' && (
          <Card padding="md">
            <p style={{ color: theme.textMuted, fontSize: '13px' }}>
              {t('admin.userDetail.activityLogWillBeShownHere')}
            </p>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmUnlock}
        onClose={() => {
          setConfirmUnlock(false)
        }}
        onConfirm={() => {
          void unlockUser()
        }}
        title={t('admin.userDetail.unlockUser')}
        message={t('admin.userDetail.unlockConfirm', { email: user.email })}
        confirmLabel={t('admin.userDetail.unlock')}
        confirmVariant="primary"
        loading={unlocking}
      />

      <ConfirmDialog
        open={confirmResetMFA}
        onClose={() => {
          setConfirmResetMFA(false)
        }}
        onConfirm={() => {
          void resetMFA()
        }}
        title={t('admin.userDetail.resetMfa')}
        message={t('admin.userDetail.resetMfaConfirm', { email: user.email })}
        confirmLabel={t('admin.userDetail.resetMfa')}
        confirmVariant="danger"
        loading={resettingMFA}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => {
          setConfirmDeactivate(false)
        }}
        onConfirm={() => {
          void deactivateUser()
          setConfirmDeactivate(false)
        }}
        title={t('admin.userDetail.deactivateUser')}
        message={t('admin.userDetail.deactivateConfirm', { email: user.email })}
        confirmLabel={t('admin.userDetail.deactivate')}
        confirmVariant="danger"
        loading={deactivating}
      />

      <ConfirmDialog
        open={confirmRevokeAll}
        onClose={() => {
          setConfirmRevokeAll(false)
        }}
        onConfirm={() => {
          void revokeAllSessions()
        }}
        title={t('admin.userDetail.revokeAllSessions')}
        message={t('admin.userDetail.revokeAllConfirm', { email: user.email })}
        confirmLabel={t('admin.userDetail.revokeAll')}
        confirmVariant="danger"
        loading={revokingAll}
      />

      <ConfirmDialog
        open={!!revokeSessionId}
        onClose={() => {
          setRevokeSessionId(null)
        }}
        onConfirm={() => {
          if (revokeSessionId) void revokeSession({ variables: { sessionId: revokeSessionId } })
        }}
        title={t('admin.userDetail.revokeSession')}
        message={t('admin.userDetail.revokeThisSessionTheUserWill')}
        confirmLabel={t('admin.userDetail.revoke')}
        confirmVariant="danger"
        loading={revokingSession}
      />

      <ConfirmDialog
        open={!!removeRoleId}
        onClose={() => {
          setRemoveRoleId(null)
        }}
        onConfirm={() => {
          if (removeRoleId) void removeRole({ variables: { roleId: removeRoleId } })
        }}
        title={t('admin.userDetail.removeRole')}
        message={t('admin.userDetail.removeThisRoleFromTheUser')}
        confirmLabel={t('admin.userDetail.remove')}
        confirmVariant="danger"
        loading={removingRole}
      />

      {showSetPasswordModal && (
        <Modal
          open={showSetPasswordModal}
          title={t('admin.userDetail.setPassword')}
          onClose={() => {
            setShowSetPasswordModal(false)
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '360px' }}>
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
              <Trans
                i18nKey="admin.userDetail.setPasswordFor"
                values={{ email: user.email }}
                components={{ strong: <strong style={{ color: theme.textPrimary }} /> }}
              />
            </p>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('admin.userDetail.newPassword')}
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                }}
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
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
                {t('admin.userDetail.confirmPassword')}
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                }}
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {passwordError && (
              <p style={{ fontSize: '12px', color: theme.danger, margin: 0 }}>{passwordError}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowSetPasswordModal(false)
                }}
              >
                {t('admin.userDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={settingPassword}
                disabled={!passwordForm.newPassword || !passwordForm.confirmPassword}
                onClick={() => {
                  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                    setPasswordError(t('admin.userDetail.passwordsMismatch'))
                    return
                  }
                  void setUserPassword({
                    variables: { userId: id, newPassword: passwordForm.newPassword },
                  })
                }}
              >
                {t('admin.userDetail.setPassword')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showAddRoleModal && (
        <Modal
          open={showAddRoleModal}
          title={t('admin.userDetail.addRole2')}
          onClose={() => {
            setShowAddRoleModal(false)
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '380px' }}>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('admin.userDetail.company2')}
              </label>
              <SearchableSelect
                value={roleForm.companyId}
                onChange={(v) => {
                  setRoleForm({ ...roleForm, companyId: v })
                }}
                options={companyOptions}
                placeholder={t('admin.userDetail.selectCompany')}
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
                {t('admin.userDetail.role2')}
              </label>
              <SearchableSelect
                value={roleForm.role}
                onChange={(v) => {
                  setRoleForm({ ...roleForm, role: v, module: '', modules: [] })
                }}
                options={ROLE_OPTIONS}
                placeholder={t('admin.userDetail.selectRole')}
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
                {roleForm.role === 'module_admin' ? t('admin.userDetail.modulesRequired') : t('admin.userDetail.moduleOptional')}
              </label>
              {roleForm.role === 'module_admin' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {MODULE_OPTIONS.filter((o) => o.value).map((o) => (
                    <Checkbox
                      key={o.value}
                      label={o.label}
                      checked={roleForm.modules.includes(o.value)}
                      onChange={(checked) => {
                        setRoleForm({
                          ...roleForm,
                          modules: checked
                            ? [...roleForm.modules, o.value]
                            : roleForm.modules.filter((m) => m !== o.value),
                        })
                      }}
                    />
                  ))}
                </div>
              ) : (
                <SearchableSelect
                  value={roleForm.module}
                  onChange={(v) => {
                    setRoleForm({ ...roleForm, module: v })
                  }}
                  options={MODULE_OPTIONS}
                  placeholder={t('admin.userDetail.selectModule')}
                />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAddRoleModal(false)
                }}
              >
                {t('admin.userDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={submittingRoles}
                disabled={
                  !roleForm.companyId ||
                  !roleForm.role ||
                  (roleForm.role === 'module_admin' && roleForm.modules.length === 0)
                }
                onClick={() => void handleAddRole()}
              >
                {t('admin.userDetail.addRole')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editingRole && (
        <Modal
          open={!!editingRole}
          title={t('admin.userDetail.editRole')}
          onClose={() => {
            setEditingRole(null)
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '380px' }}>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('admin.userDetail.company')}
              </label>
              <div style={{ fontSize: '13px', color: theme.textPrimary, padding: '8px 0' }}>
                {editingRole.companyName}
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
                {t('admin.userDetail.role2')}
              </label>
              <SearchableSelect
                value={editRoleForm.role}
                onChange={(v) => {
                  setEditRoleForm({
                    ...editRoleForm,
                    role: v,
                    module: v === 'module_admin' ? editRoleForm.module : '',
                  })
                }}
                options={ROLE_OPTIONS}
                placeholder={t('admin.userDetail.selectRole')}
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
                {editRoleForm.role === 'module_admin' ? t('admin.userDetail.moduleRequired') : t('admin.userDetail.moduleOptional')}
              </label>
              <SearchableSelect
                value={editRoleForm.module}
                onChange={(v) => {
                  setEditRoleForm({ ...editRoleForm, module: v })
                }}
                options={MODULE_OPTIONS}
                placeholder={t('admin.userDetail.selectModule')}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingRole(null)
                }}
              >
                {t('admin.userDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={updatingRole}
                disabled={
                  !editRoleForm.role ||
                  (editRoleForm.role === 'module_admin' && !editRoleForm.module)
                }
                onClick={() =>
                  void updateRole({
                    variables: {
                      roleId: editingRole.id,
                      input: { role: editRoleForm.role, module: editRoleForm.module || '' },
                    },
                  })
                }
              >
                {t('admin.userDetail.save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
