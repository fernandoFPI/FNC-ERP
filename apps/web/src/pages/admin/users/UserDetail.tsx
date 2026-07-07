import { useState, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { TabBar } from '../../../components/ui/TabBar'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Modal } from '../../../components/ui/Modal'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { useToastStore } from '../../../store/toastStore'

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
} from '../../../graphql/admin'

const ROLE_OPTIONS = [
  { value: 'system_admin',  label: 'System Admin' },
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'module_admin',  label: 'Module Admin' },
  { value: 'user',          label: 'User' },
]

const MODULE_OPTIONS = [
  { value: '',              label: '— None (company-level role) —' },
  { value: 'procurement',   label: 'Procurement' },
  { value: 'finance',       label: 'Finance' },
  { value: 'hr',            label: 'HR' },
  { value: 'projects',      label: 'Projects' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'rental',        label: 'Rental' },
  { value: 'reporting',     label: 'Reporting' },
  { value: 'inventory',     label: 'Inventory' },
  { value: 'interco',       label: 'Interco' },
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
  { key: 'overview', label: 'Overview' },
  { key: 'roles', label: 'Roles' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'activity', label: 'Activity' },
]

export default function UserDetail() {
  const { theme } = useTheme()
  const { id } = useParams<{ id: string }>()
  const addToast = useToastStore((s) => s.addToast)

  const [activeTab, setActiveTab] = useState('overview')
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const [confirmResetMFA, setConfirmResetMFA] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null)
  const [removeRoleId, setRemoveRoleId] = useState<string | null>(null)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [roleForm, setRoleForm] = useState({ companyId: '', role: '', module: '' })
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')

  const { data: companiesData } = useQuery<{ companies: Array<{ id: string; name: string }> }>(COMPANIES_QUERY)
  const companyOptions = (companiesData?.companies ?? []).map((c) => ({ value: c.id, label: c.name }))

  const { data: userData, loading: userLoading, refetch: refetchUser } = useQuery<UserDetailData>(USER_QUERY, {
    variables: { id },
    skip: !id,
  })

  const { data: sessionsData, loading: sessionsLoading, refetch: refetchSessions } = useQuery<UserSessionsData>(USER_SESSIONS_QUERY, {
    variables: { userId: id },
    skip: !id || activeTab !== 'sessions',
  })

  const [unlockUser, { loading: unlocking }] = useMutation(UNLOCK_USER, {
    variables: { userId: id },
    onCompleted: () => { addToast({ type: 'success', message: 'User unlocked' }); setConfirmUnlock(false); refetchUser() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setConfirmUnlock(false) },
  })

  const [resetMFA, { loading: resettingMFA }] = useMutation(RESET_USER_MFA, {
    variables: { userId: id },
    onCompleted: () => { addToast({ type: 'success', message: 'MFA reset' }); setConfirmResetMFA(false); refetchUser() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setConfirmResetMFA(false) },
  })

  const [revokeSession, { loading: revokingSession }] = useMutation(REVOKE_USER_SESSION, {
    onCompleted: () => { addToast({ type: 'success', message: 'Session revoked' }); setRevokeSessionId(null); refetchSessions() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setRevokeSessionId(null) },
  })

  const [revokeAllSessions, { loading: revokingAll }] = useMutation(REVOKE_ALL_USER_SESSIONS, {
    variables: { userId: id },
    onCompleted: () => { addToast({ type: 'success', message: 'All sessions revoked' }); setConfirmRevokeAll(false); refetchSessions() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setConfirmRevokeAll(false) },
  })

  const [removeRole, { loading: removingRole }] = useMutation(REMOVE_USER_ROLE, {
    onCompleted: () => { addToast({ type: 'success', message: 'Role removed' }); setRemoveRoleId(null); refetchUser() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setRemoveRoleId(null) },
  })

  const [toggleRoleActive] = useMutation(UPDATE_USER_ROLE, {
    onCompleted: () => { addToast({ type: 'success', message: 'Role updated' }); refetchUser() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [deactivateUser, { loading: deactivating }] = useMutation(DEACTIVATE_USER, {
    variables: { userId: id },
    onCompleted: () => { addToast({ type: 'success', message: 'User deactivated' }); void refetchUser() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [activateUser, { loading: activating }] = useMutation(ACTIVATE_USER, {
    variables: { userId: id },
    onCompleted: () => { addToast({ type: 'success', message: 'User activated' }); void refetchUser() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [setUserPassword, { loading: settingPassword }] = useMutation(ADMIN_SET_USER_PASSWORD, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Password updated. All sessions have been revoked.' })
      setShowSetPasswordModal(false)
      setPasswordForm({ newPassword: '', confirmPassword: '' })
      setPasswordError('')
    },
    onError: (e) => { setPasswordError(e.message) },
  })

  const [assignRole, { loading: assigningRole }] = useMutation(ASSIGN_ROLE, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Role assigned' })
      setShowAddRoleModal(false)
      setRoleForm({ companyId: '', role: '', module: '' })
      void refetchUser()
    },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_addRole] = useMutation(ADD_USER_ROLE)

  const user = userData?.user
  const sessions = sessionsData?.userSessions ?? []
  const isLocked = !!user?.lockedUntil && new Date(user.lockedUntil) > new Date()

  if (userLoading) {
    return (
      <div style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '60px', borderRadius: '8px', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '300px', borderRadius: '8px' }} />
      </div>
    )
  }

  if (!user) {
    return <div style={{ padding: '24px' }}><p style={{ color: theme.textMuted }}>User not found.</p></div>
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={user.email}
        backPath="/admin/users"
        backLabel="Users"
        status={<Badge variant={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Active' : 'Inactive'}</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {isLocked && (
              <Button variant="secondary" size="sm" onClick={() => setConfirmUnlock(true)} loading={unlocking}>Unlock</Button>
            )}
            {user.mfaEnabled && (
              <Button variant="secondary" size="sm" onClick={() => setConfirmResetMFA(true)} loading={resettingMFA}>Reset MFA</Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => { setPasswordForm({ newPassword: '', confirmPassword: '' }); setPasswordError(''); setShowSetPasswordModal(true) }}>
              Set Password
            </Button>
            {user.isActive ? (
              <Button variant="danger" size="sm" loading={deactivating} onClick={() => setConfirmDeactivate(true)}>Deactivate</Button>
            ) : (
              <Button variant="primary" size="sm" loading={activating} onClick={() => void activateUser()}>Activate</Button>
            )}
          </div>
        }
      />

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: '20px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Card padding="md">
              <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Account Info</p>
              <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: '13px' }}>
                <dt style={{ color: theme.textMuted }}>Email</dt>
                <dd style={{ color: theme.textPrimary, margin: 0 }}>{user.email}</dd>
                <dt style={{ color: theme.textMuted }}>Status</dt>
                <dd style={{ margin: 0 }}><Badge variant={user.isActive ? 'success' : 'neutral'} size="sm">{user.isActive ? 'Active' : 'Inactive'}</Badge></dd>
                <dt style={{ color: theme.textMuted }}>MFA</dt>
                <dd style={{ margin: 0 }}><Badge variant={user.mfaEnabled ? 'success' : 'warning'} size="sm">{user.mfaEnabled ? 'Enabled' : 'Disabled'}</Badge></dd>
                <dt style={{ color: theme.textMuted }}>Last Login</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</dd>
                <dt style={{ color: theme.textMuted }}>Created</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>{new Date(user.createdAt).toLocaleDateString()}</dd>
              </dl>
            </Card>
            <Card padding="md">
              <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Security</p>
              <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 12px', fontSize: '13px' }}>
                <dt style={{ color: theme.textMuted }}>Failed Logins</dt>
                <dd style={{ color: user.failedLoginAttempts > 0 ? theme.danger : theme.textMuted, margin: 0 }}>{user.failedLoginAttempts}</dd>
                <dt style={{ color: theme.textMuted }}>Locked Until</dt>
                <dd style={{ color: isLocked ? theme.danger : theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {isLocked ? new Date(user.lockedUntil!).toLocaleString() : '—'}
                </dd>
              </dl>
            </Card>
          </div>
        )}

        {activeTab === 'roles' && (
          <Card padding="none">
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setShowAddRoleModal(true)}>Add role</Button>
            </div>
            {user.roles.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {['Company', 'Module', 'Role', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {user.roles.map(role => (
                      <tr key={role.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{role.companyName}</td>
                        <td style={{ padding: '12px 14px' }}><Badge variant="neutral" size="sm">{role.module}</Badge></td>
                        <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>{role.role}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <Badge variant={role.isActive ? 'success' : 'neutral'} size="sm">{role.isActive ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <Button variant="ghost" size="sm" onClick={() => toggleRoleActive({ variables: { roleId: role.id, input: { isActive: !role.isActive } } })}>
                              {role.isActive ? 'Disable' : 'Enable'}
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => setRemoveRoleId(role.id)}>Remove</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No roles" message="This user has no assigned roles." />
            )}
          </Card>
        )}

        {activeTab === 'permissions' && (
          <Card padding="none">
            <Suspense fallback={<div style={{ padding: '20px', color: theme.textMuted }}>Loading…</div>}>
              <UserRolesTab userId={user.id} />
            </Suspense>
          </Card>
        )}

        {activeTab === 'sessions' && (
          <Card padding="none">
            <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Active Sessions</h3>
              {sessions.length > 0 && (
                <Button variant="danger" size="sm" onClick={() => setConfirmRevokeAll(true)} loading={revokingAll}>Revoke All</Button>
              )}
            </div>
            {sessionsLoading ? (
              <div style={{ padding: '24px' }}>
                <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
              </div>
            ) : sessions.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {['Device', 'Platform', 'IP', 'Created', 'Expires', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ padding: '12px 14px', color: theme.textPrimary }}>
                          {s.deviceName}
                          {s.isCurrent && <span style={{ marginLeft: '8px' }}><Badge variant="accent" size="sm">Current</Badge></span>}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{s.platform}</td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>
                          {s.ipAddress === '::1' || s.ipAddress === '127.0.0.1' ? 'localhost' : (s.ipAddress ?? '—')}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{new Date(s.expiresAt).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {!s.isCurrent && (
                            <Button variant="danger" size="sm" onClick={() => setRevokeSessionId(s.id)} loading={revokingSession && revokeSessionId === s.id}>
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No sessions" message="This user has no active sessions." />
            )}
          </Card>
        )}

        {activeTab === 'activity' && (
          <Card padding="md">
            <p style={{ color: theme.textMuted, fontSize: '13px' }}>Activity log will be shown here. Use the Audit Log page to filter by user.</p>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmUnlock}
        onClose={() => setConfirmUnlock(false)}
        onConfirm={() => { unlockUser() }}
        title="Unlock User"
        message={`Unlock ${user.email}? This will clear their failed login attempts and lock.`}
        confirmLabel="Unlock"
        confirmVariant="primary"
        loading={unlocking}
      />

      <ConfirmDialog
        open={confirmResetMFA}
        onClose={() => setConfirmResetMFA(false)}
        onConfirm={() => { resetMFA() }}
        title="Reset MFA"
        message={`Reset MFA for ${user.email}? They will need to re-enroll on next login.`}
        confirmLabel="Reset MFA"
        confirmVariant="danger"
        loading={resettingMFA}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => { void deactivateUser(); setConfirmDeactivate(false) }}
        title="Deactivate User"
        message={`Deactivate ${user.email}? They will lose access immediately.`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        loading={deactivating}
      />

      <ConfirmDialog
        open={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={() => { revokeAllSessions() }}
        title="Revoke All Sessions"
        message={`Revoke all sessions for ${user.email}? They will be logged out from all devices.`}
        confirmLabel="Revoke All"
        confirmVariant="danger"
        loading={revokingAll}
      />

      <ConfirmDialog
        open={!!revokeSessionId}
        onClose={() => setRevokeSessionId(null)}
        onConfirm={() => { if (revokeSessionId) revokeSession({ variables: { sessionId: revokeSessionId } }) }}
        title="Revoke Session"
        message="Revoke this session? The user will be logged out on that device."
        confirmLabel="Revoke"
        confirmVariant="danger"
        loading={revokingSession}
      />

      <ConfirmDialog
        open={!!removeRoleId}
        onClose={() => setRemoveRoleId(null)}
        onConfirm={() => { if (removeRoleId) removeRole({ variables: { roleId: removeRoleId } }) }}
        title="Remove Role"
        message="Remove this role from the user?"
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={removingRole}
      />

      {showSetPasswordModal && (
        <Modal open={showSetPasswordModal} title="Set Password" onClose={() => setShowSetPasswordModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '360px' }}>
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
              Set a new password for <strong style={{ color: theme.textPrimary }}>{user.email}</strong>. All active sessions will be revoked.
            </p>
            <div>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>New Password *</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                autoComplete="new-password"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Confirm Password *</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                autoComplete="new-password"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            {passwordError && (
              <p style={{ fontSize: '12px', color: theme.danger, margin: 0 }}>{passwordError}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="ghost" onClick={() => setShowSetPasswordModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={settingPassword}
                disabled={!passwordForm.newPassword || !passwordForm.confirmPassword}
                onClick={() => {
                  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                    setPasswordError('Passwords do not match')
                    return
                  }
                  void setUserPassword({ variables: { userId: id, newPassword: passwordForm.newPassword } })
                }}
              >
                Set Password
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showAddRoleModal && (
        <Modal open={showAddRoleModal} title="Add Role" onClose={() => setShowAddRoleModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '380px' }}>
            <div>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Company *</label>
              <SearchableSelect
                value={roleForm.companyId}
                onChange={(v) => setRoleForm({ ...roleForm, companyId: v })}
                options={companyOptions}
                placeholder="Select company…"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Role *</label>
              <SearchableSelect
                value={roleForm.role}
                onChange={(v) => setRoleForm({ ...roleForm, role: v, module: '' })}
                options={ROLE_OPTIONS}
                placeholder="Select role…"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>
                Module{roleForm.role === 'module_admin' ? ' *' : ' (optional)'}
              </label>
              <SearchableSelect
                value={roleForm.module}
                onChange={(v) => setRoleForm({ ...roleForm, module: v })}
                options={MODULE_OPTIONS}
                placeholder="Select module…"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="ghost" onClick={() => setShowAddRoleModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={assigningRole}
                disabled={!roleForm.companyId || !roleForm.role || (roleForm.role === 'module_admin' && !roleForm.module)}
                onClick={() => void assignRole({ variables: { input: { user_id: id, company_id: roleForm.companyId, role: roleForm.role, module: roleForm.module || undefined } } })}
              >
                Add role
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
