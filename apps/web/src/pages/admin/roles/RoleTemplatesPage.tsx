import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Drawer } from '../../../components/ui/Drawer'
import { Input } from '../../../components/ui/Input'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { PermissionTree } from '../../../components/permissions/PermissionTree'
import {
  GET_ROLE_TEMPLATES,
  CREATE_ROLE_TEMPLATE,
  UPDATE_ROLE_TEMPLATE,
  DELETE_ROLE_TEMPLATE,
} from '../../../graphql/permissions'
import type { AccessLevel } from '../../../lib/permissionRegistry'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface RoleTemplate {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  createdAt: string
  permissions: { key: string; accessLevel: string }[]
}

const emptyForm = { name: '', description: '' }

export default function RoleTemplatesPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [pendingPerms, setPendingPerms] = useState<Record<string, AccessLevel>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, loading, refetch } = useQuery<{ roleTemplates: RoleTemplate[] }>(
    GET_ROLE_TEMPLATES,
    {
      fetchPolicy: 'cache-and-network',
    },
  )
  const templates = data?.roleTemplates ?? []

  const [createTemplate, { loading: creating }] = useMutation(CREATE_ROLE_TEMPLATE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.roles.templateCreated') })
      closeDrawer()
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [updateTemplate, { loading: updating }] = useMutation(UPDATE_ROLE_TEMPLATE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.roles.templateUpdated') })
      closeDrawer()
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [deleteTemplate, { loading: deleting }] = useMutation(DELETE_ROLE_TEMPLATE, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.roles.templateDeleted') })
      setDeleteId(null)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setDeleteId(null)
    },
  })

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setPendingPerms({})
    setDrawerOpen(true)
  }

  function openEdit(tpl: RoleTemplate) {
    if (tpl.isSystem) {
      addToast({ type: 'error', message: t('admin.roles.systemTemplatesCannotBeEdited') })
      return
    }
    setEditingId(tpl.id)
    setForm({ name: tpl.name, description: tpl.description ?? '' })
    const perms: Record<string, AccessLevel> = {}
    for (const p of tpl.permissions) {
      perms[p.key] = p.accessLevel as AccessLevel
    }
    setPendingPerms(perms)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setPendingPerms({})
  }

  function handleSave() {
    const permissionsPayload: Record<string, string> = {}
    for (const [k, v] of Object.entries(pendingPerms)) {
      if (v !== 'none') permissionsPayload[k] = v
    }

    if (editingId) {
      void updateTemplate({
        variables: {
          id: editingId,
          input: {
            ...form,
            description: form.description || undefined,
            permissions: permissionsPayload,
          },
        },
      })
    } else {
      void createTemplate({
        variables: {
          input: {
            ...form,
            description: form.description || undefined,
            permissions: permissionsPayload,
          },
        },
      })
    }
  }

  const permCount = (tpl: RoleTemplate) =>
    tpl.permissions.filter((p) => p.accessLevel !== 'none').length

  const columns: Column<RoleTemplate>[] = [
    {
      key: 'name',
      header: t('admin.roles.name'),
      mobilePrimary: true,
      render: (tpl) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{tpl.name}</span>,
    },
    {
      key: 'description',
      header: t('admin.roles.description'),
      mobileSecondary: true,
      render: (tpl) => <span style={{ color: theme.textSecondary }}>{tpl.description ?? '—'}</span>,
    },
    {
      key: 'isSystem',
      header: t('admin.roles.type'),
      mobilePriority: 1,
      render: (tpl) => (
        <Badge variant={tpl.isSystem ? 'accent' : 'neutral'} size="sm">
          {tpl.isSystem ? t('admin.roles.system') : t('admin.roles.custom')}
        </Badge>
      ),
    },
    {
      key: 'permissions',
      header: t('admin.roles.permissions'),
      mobilePriority: 2,
      render: (tpl) => (
        <>
          <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
            {permCount(tpl)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: '11px' }}> {t('admin.roles.permissions2')}</span>
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobilePriority: 3,
      render: (tpl) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openEdit(tpl)
            }}
            disabled={tpl.isSystem}
          >
            {t('admin.roles.edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleteId(tpl.id)
            }}
            disabled={tpl.isSystem}
          >
            {t('admin.roles.delete')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={t('admin.roles.roleTemplates')}
        subtitle={`${templates.length} templates`}
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            {t('admin.roles.newTemplate')}
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }} padding="none">
        <Table
          columns={columns}
          data={templates}
          rowKey="id"
          loading={loading}
          emptyMessage={t('admin.roles.noTemplatesCreateARoleTemplate')}
        />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? t('admin.roles.editTemplate') : t('admin.roles.newRoleTemplate')}
        width="640px"
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}
        >
          <Input
            label={t('admin.roles.templateName')}
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            placeholder={t('admin.roles.eGFinanceViewer')}
            required
          />
          <Input
            label={t('admin.roles.description')}
            value={form.description}
            onChange={(e) => {
              setForm((f) => ({ ...f, description: e.target.value }))
            }}
            placeholder={t('admin.roles.optionalDescriptionOfThisRole')}
          />

          <div>
            <p
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textMuted,
                marginBottom: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('admin.roles.permissions')}
            </p>
            <PermissionTree value={pendingPerms} onChange={setPendingPerms} />
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}
          >
            <Button variant="secondary" onClick={closeDrawer}>
              {t('admin.roles.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={creating || updating}
              disabled={!form.name.trim()}
              onClick={handleSave}
            >
              {editingId ? t('admin.roles.saveChanges') : t('admin.roles.createTemplate')}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => {
          setDeleteId(null)
        }}
        onConfirm={() => {
          if (deleteId) void deleteTemplate({ variables: { id: deleteId } })
        }}
        title={t('admin.roles.deleteTemplate')}
        message={t('admin.roles.deleteThisRoleTemplateUsersWho')}
        confirmLabel={t('admin.roles.delete')}
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  )
}
