import { Trans, useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { LEAVE_TYPES_QUERY, CREATE_LEAVE_TYPE, DELETE_LEAVE_TYPE } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Checkbox } from '../../../components/ui/Checkbox'
import { PermissionGate } from '../../../components/ui/PermissionGate'
import { useToastStore } from '../../../store/toastStore'
import type { CreateLeaveTypeMutation, CreateLeaveTypeMutationVariables, DeleteLeaveTypeMutation, DeleteLeaveTypeMutationVariables, LeaveTypesQuery, LeaveTypesQueryVariables } from '../../../graphql/generated'

interface LeaveType {
  id: string
  name: string
  is_paid: boolean
  max_days_per_year?: number | null
  requires_approval: boolean
  is_active: boolean
}

const emptyForm = { name: '', is_paid: true, max_days_per_year: '', requires_approval: true }

export default function LeaveTypesPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null)

  const { data, loading, refetch } = useQuery<LeaveTypesQuery, LeaveTypesQueryVariables>(LEAVE_TYPES_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const [createLeaveType, { loading: creating }] = useMutation<CreateLeaveTypeMutation, CreateLeaveTypeMutationVariables>(CREATE_LEAVE_TYPE)
  const [deleteLeaveType, { loading: deleting }] = useMutation<DeleteLeaveTypeMutation, DeleteLeaveTypeMutationVariables>(DELETE_LEAVE_TYPE)

  const leaveTypes: LeaveType[] = (data?.leaveTypes ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  async function handleSubmit() {
    const input = {
      name: form.name,
      is_paid: form.is_paid,
      max_days_per_year: form.max_days_per_year ? parseInt(form.max_days_per_year) : undefined,
      requires_approval: form.requires_approval,
    }
    try {
      await createLeaveType({ variables: { input } })
      addToast({ type: 'success', message: t('hr.leaveTypes.leaveTypeCreated') })
      setModalOpen(false)
      setForm(emptyForm)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteLeaveType({ variables: { id: deleteTarget.id } })
      addToast({ type: 'success', message: t('hr.leaveTypes.deleted', { name: deleteTarget.name }) })
      setDeleteTarget(null)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const columns: Column<LeaveType>[] = [
    {
      key: 'name',
      header: t('hr.leaveTypes.name'),
      render: (l) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.name}</span>,
    },
    {
      key: 'is_paid',
      header: t('hr.leaveTypes.paid'),
      render: (l) => (
        <Badge variant={l.is_paid ? 'success' : 'neutral'}>{l.is_paid ? t('hr.leaveTypes.paid') : t('hr.leaveTypes.unpaid')}</Badge>
      ),
    },
    {
      key: 'max_days_per_year',
      header: t('hr.leaveTypes.maxDaysYr'),
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {l.max_days_per_year ?? t('hr.leaveTypes.unlimited')}
        </span>
      ),
    },
    {
      key: 'requires_approval',
      header: t('hr.leaveTypes.requiresApproval'),
      render: (l) => (
        <Badge variant={l.requires_approval ? 'info' : 'neutral'}>
          {l.requires_approval ? t('hr.leaveTypes.yes') : 'No'}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      header: t('hr.leaveTypes.status'),
      render: (l) => (
        <Badge variant={l.is_active ? 'success' : 'neutral'}>
          {l.is_active ? t('hr.leaveTypes.active') : t('hr.leaveTypes.inactive')}
        </Badge>
      ),
    },
    {
      key: 'id',
      header: '',
      render: (l) => (
        <PermissionGate permission="hr.leave.approve" minLevel="approve">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteTarget(l)
            }}
            style={{ color: theme.danger }}
          >
            {t('hr.leaveTypes.delete')}
          </Button>
        </PermissionGate>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={t('hr.leaveTypes.leaveTypes')}
        subtitle={t('hr.leaveTypes.leaveTypes2', { length: leaveTypes.length })}
        actions={
          <PermissionGate permission="hr.leave.approve" minLevel="approve">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalOpen(true)
              }}
            >
              {t('hr.leaveTypes.addLeaveType')}
            </Button>
          </PermissionGate>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={leaveTypes} loading={loading} rowKey="id" />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={t('hr.leaveTypes.newLeaveType')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setModalOpen(false)
              }}
            >
              {t('hr.leaveTypes.cancel')}
            </Button>
            <Button variant="primary" onClick={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)} loading={creating}>
              {t('hr.leaveTypes.create')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label={t('hr.leaveTypes.name')}
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            required
            placeholder={t('hr.leaveTypes.eGAnnualLeave')}
          />
          <Input
            label={t('hr.leaveTypes.maxDaysPerYear')}
            type="number"
            min="1"
            value={form.max_days_per_year}
            onChange={(e) => {
              setForm((f) => ({ ...f, max_days_per_year: e.target.value }))
            }}
            placeholder={t('hr.leaveTypes.leaveBlankForUnlimited')}
          />
          <Checkbox
            label={t('hr.leaveTypes.paidLeave')}
            checked={form.is_paid}
            onChange={(checked) => {
              setForm((f) => ({ ...f, is_paid: checked }))
            }}
          />
          <Checkbox
            label={t('hr.leaveTypes.requiresApproval')}
            checked={form.requires_approval}
            onChange={(checked) => {
              setForm((f) => ({ ...f, requires_approval: checked }))
            }}
          />
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null)
        }}
        title={t('hr.leaveTypes.deleteLeaveType')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null)
              }}
            >
              {t('hr.leaveTypes.cancel')}
            </Button>
            <Button variant="danger" onClick={(...args: Parameters<typeof handleDelete>) => void handleDelete(...args)} loading={deleting}>
              {t('hr.leaveTypes.delete')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: theme.textPrimary }}><Trans i18nKey="hr.leaveTypes.areYouSureYouWantTo" values={{ name: deleteTarget?.name }} components={[<strong />]} /></p>
      </Modal>
    </div>
  )
}
