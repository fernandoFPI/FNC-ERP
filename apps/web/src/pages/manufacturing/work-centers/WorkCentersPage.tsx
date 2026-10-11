import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  WORK_CENTERS_QUERY,
  CREATE_WORK_CENTER,
  UPDATE_WORK_CENTER,
} from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { useToastStore } from '../../../store/toastStore'
import type { CreateWorkCenterMutation, CreateWorkCenterMutationVariables, UpdateWorkCenterMutation, UpdateWorkCenterMutationVariables, WorkCentersQuery, WorkCentersQueryVariables } from '../../../graphql/generated'

interface WorkCenter {
  id: string
  code: string
  name: string
  capacity_hours_per_day: number
  cost_per_hour: number
  currency_code: string
  is_active: boolean
}

export default function WorkCentersPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    code: '',
    name: '',
    capacity_hours_per_day: '8',
    cost_per_hour: '0',
    currency_code: 'IQD',
    is_active: true,
  })

  const { data, loading, refetch } = useQuery<WorkCentersQuery, WorkCentersQueryVariables>(WORK_CENTERS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const [createWC, { loading: creating }] = useMutation<CreateWorkCenterMutation, CreateWorkCenterMutationVariables>(CREATE_WORK_CENTER)
  const [updateWC, { loading: updating }] = useMutation<UpdateWorkCenterMutation, UpdateWorkCenterMutationVariables>(UPDATE_WORK_CENTER)

  const workCenters: WorkCenter[] = data?.workCenters ?? []

  function openCreate() {
    setEditId(null)
    setForm({
      code: '',
      name: '',
      capacity_hours_per_day: '8',
      cost_per_hour: '0',
      currency_code: 'IQD',
      is_active: true,
    })
    setShowForm(true)
  }
  function openEdit(wc: WorkCenter) {
    setEditId(wc.id)
    setForm({
      code: wc.code,
      name: wc.name,
      capacity_hours_per_day: String(wc.capacity_hours_per_day),
      cost_per_hour: String(wc.cost_per_hour),
      currency_code: wc.currency_code,
      is_active: wc.is_active,
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      ...form,
      capacity_hours_per_day: parseFloat(form.capacity_hours_per_day),
      cost_per_hour: parseFloat(form.cost_per_hour),
    }
    try {
      if (editId) {
        await updateWC({
          variables: { id: editId, input },
          refetchQueries: [{ query: WORK_CENTERS_QUERY }],
        })
        addToast({ type: 'success', message: t('mfg.workCenters.workCenterUpdated') })
      } else {
        await createWC({ variables: { input }, refetchQueries: [{ query: WORK_CENTERS_QUERY }] })
        addToast({ type: 'success', message: t('mfg.workCenters.workCenterCreated') })
      }
      setShowForm(false)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const columns: Column<WorkCenter>[] = [
    {
      key: 'code',
      header: t('mfg.workCenters.code'),
      render: (wc) => (
        <span style={{ color: theme.accent, fontFamily: 'monospace', fontSize: '13px' }}>
          {wc.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: t('mfg.workCenters.name'),
      render: (wc) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {wc.name}
        </span>
      ),
    },
    {
      key: 'capacity_hours_per_day',
      header: t('mfg.workCenters.capacityHDay'),
      render: (wc) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {wc.capacity_hours_per_day}h
        </span>
      ),
    },
    {
      key: 'cost_per_hour',
      header: t('mfg.workCenters.costHour'),
      render: (wc) => <AmountDisplay amount={wc.cost_per_hour} currency={wc.currency_code} />,
    },
    {
      key: 'is_active',
      header: t('mfg.workCenters.status'),
      render: (wc) => (
        <Badge variant={wc.is_active ? 'success' : 'neutral'}>
          {wc.is_active ? t('mfg.workCenters.active') : t('mfg.workCenters.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (wc) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            openEdit(wc)
          }}
        >
          {t('mfg.workCenters.edit')}
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={t('mfg.workCenters.workCenters')}
        subtitle={t('mfg.workCenters.workCenters2', { length: workCenters.length })}
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            {t('mfg.workCenters.newWorkCenter')}
          </Button>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={workCenters} loading={loading} rowKey="id" />
      </Card>

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false)
        }}
        title={editId ? t('mfg.workCenters.editWorkCenter') : t('mfg.workCenters.newWorkCenter')}
      >
        <form
          onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
            <Input
              label={t('mfg.workCenters.code')}
              value={form.code}
              onChange={(e) => {
                setForm((f) => ({ ...f, code: e.target.value }))
              }}
              required
            />
            <Input
              label={t('mfg.workCenters.name')}
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
              }}
              required
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label={t('mfg.workCenters.capacityHoursDay')}
              type="number"
              step="0.5"
              value={form.capacity_hours_per_day}
              onChange={(e) => {
                setForm((f) => ({ ...f, capacity_hours_per_day: e.target.value }))
              }}
            />
            <Input
              label={t('mfg.workCenters.costPerHour')}
              type="number"
              step="0.01"
              value={form.cost_per_hour}
              onChange={(e) => {
                setForm((f) => ({ ...f, cost_per_hour: e.target.value }))
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setShowForm(false)
              }}
            >
              {t('mfg.workCenters.cancel')}
            </Button>
            <Button variant="primary" type="submit" loading={creating || updating}>
              {editId ? t('mfg.workCenters.save') : t('mfg.workCenters.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
