import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  MANUFACTURING_REQUESTS_QUERY,
  CREATE_MANUFACTURING_REQUEST,
} from '../../../graphql/manufacturing-requests'
import { BOMS_QUERY } from '../../../graphql/manufacturing'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Table, Column } from '../../../components/ui/Table'
import { Modal } from '../../../components/ui/Modal'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

const MR_STATUSES = ['draft', 'pending_approval', 'approved', 'in_production', 'completed', 'cancelled']

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'info',
  in_production: 'info',
  completed: 'success',
  cancelled: 'danger',
}

interface MR {
  id: string
  requestNumber: string
  projectId: string
  projectName?: string
  productName?: string
  productSku?: string
  qtyRequested: number
  requiredDate?: string
  status: string
  requestedByName?: string
  moNumber?: string
  actualCost?: number
  currencyCode: string
  createdAt: string
}

interface CreateForm {
  projectId: string
  productId: string
  bomId: string
  qtyRequested: string
  requiredDate: string
  description: string
  notes: string
}

export default function ManufacturingRequestsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>({
    projectId: '', productId: '', bomId: '', qtyRequested: '1',
    requiredDate: '', description: '', notes: '',
  })

  const { data, loading, refetch } = useQuery(MANUFACTURING_REQUESTS_QUERY, {
    variables: { status: statusFilter },
    fetchPolicy: 'cache-and-network',
  })

  const { data: bomsData } = useQuery(BOMS_QUERY, {
    variables: { isActive: true, allCompanies: true },
    fetchPolicy: 'cache-and-network',
  })

  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })

  const [createMR, { loading: creating }] = useMutation(CREATE_MANUFACTURING_REQUEST)

  const requests: MR[] = data?.manufacturingRequests ?? []
  const boms: Array<{ id: string; finished_product_id: string; product_name: string; version: string }> = bomsData?.boms ?? []
  const projects: Array<{ id: string; code: string; name: string }> = projectsData?.projects?.data ?? []

  const statusCounts = MR_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = requests.filter(r => r.status === s).length
    return acc
  }, {})

  const filtered = search
    ? requests.filter(r =>
        r.requestNumber.toLowerCase().includes(search.toLowerCase()) ||
        (r.projectName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.productName ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : requests

  async function handleCreate() {
    if (!form.projectId) { addToast({ type: 'error', message: 'Project ID is required' }); return }
    try {
      await createMR({
        variables: {
          input: {
            projectId: form.projectId,
            productId: form.productId || null,
            qtyRequested: parseFloat(form.qtyRequested) || 1,
            requiredDate: form.requiredDate || null,
            description: form.description || null,
            notes: form.notes || null,
          },
        },
      })
      addToast({ type: 'success', message: 'Manufacturing request created' })
      setShowCreate(false)
      setForm({ projectId: '', productId: '', bomId: '', qtyRequested: '1', requiredDate: '', description: '', notes: '' })
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const columns: Column<MR>[] = [
    {
      key: 'requestNumber',
      header: 'Request #',
      render: (r) => (
        <button
          onClick={() => navigate(`/manufacturing/requests/${r.id}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}
        >
          {r.requestNumber}
        </button>
      ),
    },
    { key: 'projectName', header: 'Project', render: (r) => <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{r.projectName ?? '—'}</span> },
    { key: 'productName', header: 'Product', render: (r) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.productName ?? '—'}</span> },
    { key: 'qtyRequested', header: 'Qty', render: (r) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{r.qtyRequested.toLocaleString()}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'}>{r.status.replace(/_/g, ' ')}</Badge> },
    { key: 'requestedByName', header: 'Requested By', render: (r) => <span style={{ color: theme.textMuted, fontSize: '12px' }}>{r.requestedByName ?? '—'}</span> },
    { key: 'moNumber', header: 'MO', render: (r) => r.moNumber
      ? <button onClick={() => navigate(`/manufacturing/orders/${r.moNumber}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontFamily: 'monospace', fontSize: '12px' }}>{r.moNumber}</button>
      : <span style={{ color: theme.textMuted, fontSize: '12px' }}>—</span>
    },
    { key: 'actualCost', header: 'Actual Cost', render: (r) => r.actualCost != null ? <AmountDisplay amount={r.actualCost} currency={r.currencyCode} /> : <span style={{ color: theme.textMuted }}>—</span> },
    { key: 'requiredDate', header: 'Required By', render: (r) => <span style={{ color: theme.textMuted, fontSize: '12px' }}>{r.requiredDate?.slice(0, 10) ?? '—'}</span> },
    { key: 'createdAt', header: 'Created', render: (r) => <span style={{ color: theme.textMuted, fontSize: '12px' }}>{r.createdAt.slice(0, 10)}</span> },
  ]

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: '6px',
    border: `1px solid ${theme.border}`, background: theme.bgCanvas,
    color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1600px' }}>
      <PageHeader
        title="Manufacturing Requests"
        subtitle={`${filtered.length} requests`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            New Request
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {MR_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? undefined : s)}
            style={{
              padding: '4px 12px', borderRadius: '16px',
              border: `1px solid ${s === statusFilter ? theme.accent : theme.border}`,
              background: s === statusFilter ? theme.accentBg : 'transparent',
              color: s === statusFilter ? theme.accent : theme.textSecondary,
              fontSize: '12px', cursor: 'pointer',
              fontWeight: s === statusFilter ? 600 : 400,
            }}
          >
            {s.replace(/_/g, ' ')} ({statusCounts[s] ?? 0})
          </button>
        ))}
      </div>

      <Card>
        <FilterBar search={search} onSearchChange={setSearch} resultCount={filtered.length} onRefresh={() => refetch()} />
        <Table columns={columns} data={filtered} loading={loading} rowKey="id" />
      </Card>

      {showCreate && (
        <Modal open={showCreate} title="New Manufacturing Request" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '420px' }}>
            <div>
              <label style={labelStyle}>Project <span style={{ color: theme.danger }}>*</span></label>
              <select
                style={{ ...inputStyle, colorScheme: 'dark' }}
                value={form.projectId}
                onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
              >
                <option value="">— Select a project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Product (BOM) <span style={{ color: theme.textMuted }}>(optional)</span></label>
              <select
                style={{ ...inputStyle, colorScheme: 'dark' }}
                value={form.bomId}
                onChange={e => {
                  const selected = boms.find(b => b.id === e.target.value)
                  setForm(f => ({
                    ...f,
                    bomId: e.target.value,
                    productId: selected?.finished_product_id ?? '',
                  }))
                }}
              >
                <option value="">— Select a product —</option>
                {boms.map(b => (
                  <option key={b.id} value={b.id}>{b.product_name} (v{b.version})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Quantity Requested <span style={{ color: theme.danger }}>*</span></label>
              <input
                type="number" min="0.0001" step="0.0001"
                style={inputStyle}
                value={form.qtyRequested}
                onChange={e => setForm(f => ({ ...f, qtyRequested: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>Required By Date</label>
              <input
                type="date"
                style={inputStyle}
                value={form.requiredDate}
                onChange={e => setForm(f => ({ ...f, requiredDate: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <textarea
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary" size="sm" loading={creating} onClick={handleCreate}>Create</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
