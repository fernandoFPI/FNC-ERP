import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useToastStore } from '../../../store/toastStore'
import {
  USERS_QUERY,
  DEACTIVATE_USER,
  CREATE_USER,
  INVITE_USER,
  COMPANIES_QUERY,
} from '../../../graphql/admin'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

interface UserRole {
  id: string
  companyName: string
  module: string
  role: string
  isActive: boolean
}

interface UserItem {
  id: string
  email: string
  isActive: boolean
  mfaEnabled: boolean
  lastLogin: string | null
  activeSessions: number
  companies: string[]
  roles: UserRole[]
}

interface UsersData {
  users: { items: UserItem[]; total: number; page: number; limit: number }
}

export default function UsersPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [search, setSearch] = useState('')
  const [isActive, setIsActive] = useState('')
  const [page] = useState(1)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [confirmDeactivateUser, setConfirmDeactivateUser] = useState<{
    id: string
    email: string
  } | null>(null)

  const [inviteForm, setInviteForm] = useState({ email: '', companyId: '', role: '' })
  const [createForm, setCreateForm] = useState({ email: '', password: '', companyId: '', role: '' })

  const { data, loading, refetch } = useQuery<UsersData>(USERS_QUERY, {
    variables: {
      search: search || undefined,
      isActive: isActive === '' ? undefined : isActive === 'true',
      page,
      limit: 50,
    },
  })

  const { data: companiesData } = useQuery<{ companies: { id: string; name: string }[] }>(
    COMPANIES_QUERY,
  )
  const companies = companiesData?.companies ?? []

  const [deactivateUser] = useMutation(DEACTIVATE_USER, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'User deactivated' })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [inviteUser, { loading: inviting }] = useMutation(INVITE_USER, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Invitation sent' })
      setShowInviteModal(false)
      setInviteForm({ email: '', companyId: '', role: '' })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [createUser, { loading: creating }] = useMutation(CREATE_USER, {
    onCompleted: (res) => {
      addToast({ type: 'success', message: 'User created' })
      setShowCreateModal(false)
      setCreateForm({ email: '', password: '', companyId: '', role: '' })
      navigate(`/admin/users/${res.createUser.id}`)
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const users = data?.users.items ?? []

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Users"
        subtitle={`${data?.users.total ?? 0} total users`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowInviteModal(true)
              }}
            >
              Invite user
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowCreateModal(true)
              }}
            >
              Create user
            </Button>
          </div>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search email…' }}
          filters={[
            {
              key: 'isActive',
              label: 'Status',
              value: isActive,
              onChange: setIsActive,
              options: [
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ],
            },
          ]}
          resultCount={users.length}
        />
      </Card>

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '48px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : users.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Email', 'Status', 'MFA', 'Companies', 'Sessions', 'Last Login', ''].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          borderBottom: `1px solid ${theme.border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    style={{ borderBottom: `1px solid ${theme.border}22`, cursor: 'pointer' }}
                    onClick={() => {
                      navigate(`/admin/users/${user.id}`)
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${theme.accent}12`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>
                      {user.email}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={user.isActive ? 'success' : 'neutral'} size="sm">
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={user.mfaEnabled ? 'success' : 'warning'} size="sm">
                        {user.mfaEnabled ? 'On' : 'Off'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {user.companies.join(', ') || '—'}
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        color: user.activeSessions > 0 ? theme.accent : theme.textMuted,
                      }}
                    >
                      {user.activeSessions}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td
                      style={{ padding: '12px 14px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      {user.isActive && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setConfirmDeactivateUser({ id: user.id, email: user.email })
                          }}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No users found" message="Adjust search criteria to find users." />
        )}
      </Card>

      {/* Invite user modal */}
      {showInviteModal && (
        <Modal
          open={showInviteModal}
          title="Invite User"
          onClose={() => {
            setShowInviteModal(false)
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
                Email *
              </label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => {
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }}
                placeholder="user@company.com"
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
            </div>
            <div>
              <SearchableSelect
                label="Company *"
                value={inviteForm.companyId}
                onChange={(v) => {
                  setInviteForm({ ...inviteForm, companyId: v })
                }}
                placeholder="Select company…"
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <SearchableSelect
                label="Role"
                value={inviteForm.role}
                onChange={(v) => {
                  setInviteForm({ ...inviteForm, role: v })
                }}
                placeholder="Select role (optional)…"
                options={[
                  { value: 'viewer', label: 'Viewer — read-only access' },
                  { value: 'manager', label: 'Manager — standard access' },
                  { value: 'company_admin', label: 'Company Admin — full company access' },
                  { value: 'system_admin', label: 'System Admin — bypasses all permission gates' },
                ]}
              />
            </div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              An email will be sent to the address with a secure invitation link valid for 24 hours.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowInviteModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={inviting}
                disabled={!inviteForm.email || !inviteForm.companyId}
                onClick={() =>
                  void inviteUser({
                    variables: {
                      input: {
                        email: inviteForm.email,
                        company_id: inviteForm.companyId || undefined,
                        role: inviteForm.role || undefined,
                      },
                    },
                  })
                }
              >
                Send invitation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create user modal */}
      {showCreateModal && (
        <Modal
          open={showCreateModal}
          title="Create User"
          onClose={() => {
            setShowCreateModal(false)
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
                Email *
              </label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => {
                  setCreateForm({ ...createForm, email: e.target.value })
                }}
                placeholder="user@company.com"
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
                Password *
              </label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => {
                  setCreateForm({ ...createForm, password: e.target.value })
                }}
                placeholder="Min 12 chars"
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
            </div>
            <div>
              <SearchableSelect
                label="Company"
                value={createForm.companyId}
                onChange={(v) => {
                  setCreateForm({ ...createForm, companyId: v })
                }}
                placeholder="Select company (optional)…"
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <SearchableSelect
                label="Role"
                value={createForm.role}
                onChange={(v) => {
                  setCreateForm({ ...createForm, role: v })
                }}
                placeholder="Select role (optional)…"
                options={[
                  { value: 'viewer', label: 'Viewer — read-only access' },
                  { value: 'manager', label: 'Manager — standard access' },
                  { value: 'company_admin', label: 'Company Admin — full company access' },
                  { value: 'system_admin', label: 'System Admin — bypasses all permission gates' },
                ]}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={creating}
                disabled={!createForm.email || !createForm.password}
                onClick={() =>
                  void createUser({
                    variables: {
                      input: {
                        email: createForm.email,
                        password: createForm.password,
                        company_id: createForm.companyId || undefined,
                        role: createForm.role || undefined,
                      },
                    },
                  })
                }
              >
                Create user
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmDeactivateUser}
        onClose={() => {
          setConfirmDeactivateUser(null)
        }}
        onConfirm={() => {
          if (confirmDeactivateUser)
            void deactivateUser({ variables: { userId: confirmDeactivateUser.id } })
          setConfirmDeactivateUser(null)
        }}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${confirmDeactivateUser?.email ?? ''}? They will lose access immediately.`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
      />
    </div>
  )
}
