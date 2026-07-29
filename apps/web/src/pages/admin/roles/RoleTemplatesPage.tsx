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
      addToast({ type: 'success', message: 'Template created' })
      closeDrawer()
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [updateTemplate, { loading: updating }] = useMutation(UPDATE_ROLE_TEMPLATE, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Template updated' })
      closeDrawer()
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [deleteTemplate, { loading: deleting }] = useMutation(DELETE_ROLE_TEMPLATE, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Template deleted' })
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

  function openEdit(t: RoleTemplate) {
    if (t.isSystem) {
      addToast({ type: 'error', message: 'System templates cannot be edited' })
      return
    }
    setEditingId(t.id)
    setForm({ name: t.name, description: t.description ?? '' })
    const perms: Record<string, AccessLevel> = {}
    for (const p of t.permissions) {
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

  const permCount = (t: RoleTemplate) =>
    t.permissions.filter((p) => p.accessLevel !== 'none').length

  const columns: Column<RoleTemplate>[] = [
    {
      key: 'name',
      header: 'Name',
      mobilePrimary: true,
      render: (t) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{t.name}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      mobileSecondary: true,
      render: (t) => <span style={{ color: theme.textSecondary }}>{t.description ?? '—'}</span>,
    },
    {
      key: 'isSystem',
      header: 'Type',
      mobilePriority: 1,
      render: (t) => (
        <Badge variant={t.isSystem ? 'accent' : 'neutral'} size="sm">
          {t.isSystem ? 'System' : 'Custom'}
        </Badge>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      mobilePriority: 2,
      render: (t) => (
        <>
          <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
            {permCount(t)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: '11px' }}> permissions</span>
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobilePriority: 3,
      render: (t) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openEdit(t)
            }}
            disabled={t.isSystem}
          >
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleteId(t.id)
            }}
            disabled={t.isSystem}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Role Templates"
        subtitle={`${templates.length} templates`}
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            New Template
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }} padding="none">
        <Table
          columns={columns}
          data={templates}
          rowKey="id"
          loading={loading}
          emptyMessage="No templates — create a role template to quickly apply permission sets to users."
        />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? 'Edit Template' : 'New Role Template'}
        width="640px"
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}
        >
          <Input
            label="Template name"
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            placeholder="e.g. Finance Viewer"
            required
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => {
              setForm((f) => ({ ...f, description: e.target.value }))
            }}
            placeholder="Optional description of this role"
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
              Permissions
            </p>
            <PermissionTree value={pendingPerms} onChange={setPendingPerms} />
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}
          >
            <Button variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={creating || updating}
              disabled={!form.name.trim()}
              onClick={handleSave}
            >
              {editingId ? 'Save changes' : 'Create template'}
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
        title="Delete Template"
        message="Delete this role template? Users who have had it applied keep their existing permissions."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  )
}
