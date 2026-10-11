import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useMutation, useSubscription } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
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
  SESSIONS_CHANGED_SUBSCRIPTION,
} from '../../../graphql/admin'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import type { CreateUserMutation, CreateUserMutationVariables, DeactivateUserMutation, DeactivateUserMutationVariables, InviteUserMutation, InviteUserMutationVariables, SessionsChangedSubscription, SessionsChangedSubscriptionVariables } from '../../../graphql/generated'

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
  const { t } = useTranslation()
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

  const [inviteForm, setInviteForm] = useState({ email: '', companyIds: [] as string[], role: '' })
  const [createForm, setCreateForm] = useState({ email: '', password: '', companyId: '', role: '' })

  const { data, loading, refetch } = useQuery<UsersData>(USERS_QUERY, {
    variables: {
      search: search || undefined,
      isActive: isActive === '' ? undefined : isActive === 'true',
      page,
      limit: 50,
    },
  })

  // Live-refetch the list when any user's sessions change — e.g. the
  // Sessions column updating without a manual page refresh.
  useSubscription<SessionsChangedSubscription, SessionsChangedSubscriptionVariables>(SESSIONS_CHANGED_SUBSCRIPTION, {
    onData: () => {
      void refetch()
    },
  })

  const { data: companiesData } = useQuery<{ companies: { id: string; name: string }[] }>(
    COMPANIES_QUERY,
  )
  const companies = companiesData?.companies ?? []

  const [deactivateUser] = useMutation<DeactivateUserMutation, DeactivateUserMutationVariables>(DEACTIVATE_USER, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.users.userDeactivated') })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [inviteUser, { loading: inviting }] = useMutation<InviteUserMutation, InviteUserMutationVariables>(INVITE_USER, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.users.invitationSent') })
      setShowInviteModal(false)
      setInviteForm({ email: '', companyIds: [], role: '' })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [createUser, { loading: creating }] = useMutation<CreateUserMutation, CreateUserMutationVariables>(CREATE_USER, {
    onCompleted: (res) => {
      addToast({ type: 'success', message: t('admin.users.userCreated') })
      setShowCreateModal(false)
      setCreateForm({ email: '', password: '', companyId: '', role: '' })
      navigate(`/admin/users/${res.createUser.id}`)
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const users = data?.users.items ?? []

  const columns: Column<UserItem>[] = [
    {
      key: 'email',
      header: t('admin.users.email'),
      mobilePrimary: true,
      render: (user) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{user.email}</span>
      ),
    },
    {
      key: 'companies',
      header: t('admin.users.companies'),
      mobileSecondary: true,
      render: (user) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {user.companies.join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: t('admin.users.status'),
      mobilePriority: 1,
      render: (user) => (
        <Badge variant={user.isActive ? 'success' : 'neutral'} size="sm">
          {user.isActive ? t('admin.users.active') : t('admin.users.inactive')}
        </Badge>
      ),
    },
    {
      key: 'lastLogin',
      header: t('admin.users.lastLogin'),
      mobilePriority: 2,
      render: (user) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : t('admin.users.never')}
        </span>
      ),
    },
    {
      key: 'activeSessions',
      header: t('admin.users.sessions'),
      mobilePriority: 3,
      render: (user) => (
        <span style={{ color: user.activeSessions > 0 ? theme.accent : theme.textMuted }}>
          {user.activeSessions}
        </span>
      ),
    },
    {
      key: 'mfaEnabled',
      header: t('admin.users.mfa'),
      mobilePriority: 4,
      render: (user) => (
        <Badge variant={user.mfaEnabled ? 'success' : 'warning'} size="sm">
          {user.mfaEnabled ? 'On' : t('admin.users.off')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileAction: true,
      render: (user) =>
        user.isActive ? (
          <div
            onClick={(ev) => {
              ev.stopPropagation()
            }}
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmDeactivateUser({ id: user.id, email: user.email })
              }}
            >
              {t('admin.users.deactivate')}
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('admin.users.users')}
        subtitle={t('admin.users.totalUsers', { count: data?.users.total ?? 0 })}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowInviteModal(true)
              }}
            >
              {t('admin.users.inviteUser')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowCreateModal(true)
              }}
            >
              {t('admin.users.createUser')}
            </Button>
          </div>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: t('admin.users.searchEmail') }}
          filters={[
            {
              key: 'isActive',
              label: t('admin.users.status'),
              value: isActive,
              onChange: setIsActive,
              options: [
                { value: 'true', label: t('admin.users.active') },
                { value: 'false', label: t('admin.users.inactive') },
              ],
            },
          ]}
          resultCount={users.length}
        />
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={users}
          rowKey="id"
          loading={loading}
          emptyMessage={t('admin.users.noUsersFound')}
          onRowClick={(user) => {
            navigate(`/admin/users/${user.id}`)
          }}
        />
      </Card>

      {/* Invite user modal */}
      {showInviteModal && (
        <Modal
          open={showInviteModal}
          title={t('admin.users.inviteUser2')}
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
                {t('admin.users.email2')}
              </label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => {
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }}
                placeholder={t('admin.users.userCompanyCom')}
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
                {t('admin.users.companiesRequired')} <span style={{ color: theme.textMuted }}>{t('admin.users.selectOneOrMore')}</span>
              </label>
              <div
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  background: theme.bgSurface,
                }}
              >
                {companies.map((c) => {
                  const checked = inviteForm.companyIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        fontSize: '13px',
                        color: theme.textPrimary,
                        cursor: 'pointer',
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setInviteForm({
                            ...inviteForm,
                            companyIds: checked
                              ? inviteForm.companyIds.filter((id) => id !== c.id)
                              : [...inviteForm.companyIds, c.id],
                          })
                        }}
                      />
                      {c.name}
                    </label>
                  )
                })}
              </div>
            </div>
            <div>
              <SearchableSelect
                label={t('admin.users.role')}
                value={inviteForm.role}
                onChange={(v) => {
                  setInviteForm({ ...inviteForm, role: v })
                }}
                placeholder={t('admin.users.selectRole')}
                options={[
                  {
                    value: 'user',
                    label: t('admin.users.userNoDefaultAccessPermissionsGranted'),
                  },
                  {
                    value: 'module_admin',
                    label: t('admin.users.moduleAdminFullAccessToAssigned'),
                  },
                  { value: 'company_admin', label: t('admin.users.companyAdminFullCompanyAccess') },
                  { value: 'system_admin', label: t('admin.users.systemAdminBypassesAllPermissionGates') },
                ]}
              />
              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                {t('admin.users.appliedToEverySelectedCompany')}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              {t('admin.users.anEmailWillBeSentTo')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowInviteModal(false)
                }}
              >
                {t('admin.users.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={inviting}
                disabled={
                  !inviteForm.email || inviteForm.companyIds.length === 0 || !inviteForm.role
                }
                onClick={() =>
                  void inviteUser({
                    variables: {
                      input: {
                        email: inviteForm.email,
                        companies: inviteForm.companyIds.map((companyId) => ({
                          companyId,
                          role: inviteForm.role,
                        })),
                      },
                    },
                  })
                }
              >
                {t('admin.users.sendInvitation')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create user modal */}
      {showCreateModal && (
        <Modal
          open={showCreateModal}
          title={t('admin.users.createUser2')}
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
                {t('admin.users.email2')}
              </label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => {
                  setCreateForm({ ...createForm, email: e.target.value })
                }}
                placeholder={t('admin.users.userCompanyCom')}
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
                {t('admin.users.password')}
              </label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => {
                  setCreateForm({ ...createForm, password: e.target.value })
                }}
                placeholder={t('admin.users.min12Chars')}
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
                label={t('admin.users.company')}
                value={createForm.companyId}
                onChange={(v) => {
                  setCreateForm({ ...createForm, companyId: v })
                }}
                placeholder={t('admin.users.selectCompanyOptional')}
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <SearchableSelect
                label={t('admin.users.role2')}
                value={createForm.role}
                onChange={(v) => {
                  setCreateForm({ ...createForm, role: v })
                }}
                placeholder={t('admin.users.selectRoleOptional')}
                options={[
                  {
                    value: 'user',
                    label: t('admin.users.userNoDefaultAccessPermissionsGranted'),
                  },
                  {
                    value: 'module_admin',
                    label: t('admin.users.moduleAdminFullAccessToAssigned'),
                  },
                  { value: 'company_admin', label: t('admin.users.companyAdminFullCompanyAccess') },
                  { value: 'system_admin', label: t('admin.users.systemAdminBypassesAllPermissionGates') },
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
                {t('admin.users.cancel')}
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
                {t('admin.users.createUser')}
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
        title={t('admin.users.deactivateUser')}
        message={t('admin.users.deactivateConfirm', { email: confirmDeactivateUser?.email ?? '' })}
        confirmLabel={t('admin.users.deactivate')}
        confirmVariant="danger"
      />
    </div>
  )
}
