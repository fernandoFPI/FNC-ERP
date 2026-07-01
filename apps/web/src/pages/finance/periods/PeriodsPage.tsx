import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { ACCOUNTING_PERIODS_QUERY, CREATE_PERIOD, CLOSE_PERIOD } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useToastStore } from '../../../store/toastStore'

interface AccountingPeriod {
  id: string
  name: string
  start_date: string
  end_date: string
  status: string
  closed_by_email?: string
  closed_at?: string
}

export default function PeriodsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showForm, setShowForm] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' })

  const { data, loading, refetch } = useQuery(ACCOUNTING_PERIODS_QUERY, { fetchPolicy: 'cache-and-network' })
  const [createPeriod, { loading: creating }] = useMutation(CREATE_PERIOD)
  const [closePeriod, { loading: closing }] = useMutation(CLOSE_PERIOD)

  const periods: AccountingPeriod[] = data?.accountingPeriods ?? []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createPeriod({
        variables: { input: form },
        refetchQueries: [{ query: ACCOUNTING_PERIODS_QUERY }],
      })
      addToast({ type: 'success', message: 'Accounting period created' })
      setShowForm(false)
      setForm({ name: '', start_date: '', end_date: '' })
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleClose() {
    if (!closingId) return
    try {
      await closePeriod({
        variables: { id: closingId },
        refetchQueries: [{ query: ACCOUNTING_PERIODS_QUERY }],
      })
      addToast({ type: 'success', message: 'Period closed' })
      setClosingId(null)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const columns: Column<AccountingPeriod>[] = [
    { key: 'name', header: 'Period Name', render: (p) => <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{p.name}</span> },
    { key: 'start_date', header: 'Start Date', render: (p) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{p.start_date}</span> },
    { key: 'end_date', header: 'End Date', render: (p) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{p.end_date}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge variant={p.status === 'open' ? 'success' : 'neutral'}>{p.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (p) => p.status === 'open' ? (
        <Button variant="ghost" size="sm" onClick={() => setClosingId(p.id)}>
          Close Period
        </Button>
      ) : (
        <span style={{ fontSize: '12px', color: theme.textMuted }}>{p.closed_at ? `Closed ${p.closed_at.slice(0, 10)}` : ''}</span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title="Accounting Periods"
        subtitle={`${periods.length} periods`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>New Period</Button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={periods} loading={loading} rowKey="id" />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Accounting Period">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
          <Input label="Period Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Q1 2025" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
            <Input label="End Date" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={creating}>Create</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!closingId}
        title="Close Accounting Period"
        message="Once closed, no new journal entries can be posted to this period. This action cannot be undone."
        confirmLabel="Close Period"
        variant="danger"
        onConfirm={handleClose}
        onCancel={() => setClosingId(null)}
        loading={closing}
      />
    </div>
  )
}
