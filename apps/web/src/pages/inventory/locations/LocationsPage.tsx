import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useMutation } from '@apollo/client'
import { CREATE_STOCK_LOCATION } from '../../../graphql/inventory'
import { useToastStore } from '../../../store/toastStore'

interface StockLocation {
  id: string
  name: string
  code?: string
  type: string
  parent_id?: string
  parent_name?: string
  is_active: boolean
  address?: string
}

const TYPE_OPTIONS = [
  { value: 'warehouse',   label: 'Warehouse' },
  { value: 'site',        label: 'Site' },
  { value: 'transit',     label: 'Transit' },
  { value: 'virtual_in',  label: 'Virtual In' },
  { value: 'virtual_out', label: 'Virtual Out' },
]

export default function LocationsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', type: 'warehouse', parent_id: '', address: '' })

  const { data, loading, refetch } = useQuery(STOCK_LOCATIONS_QUERY, {
    variables: { type: typeFilter || undefined, isActive: undefined },
    fetchPolicy: 'cache-and-network',
  })

  const [createLocation, { loading: creating }] = useMutation(CREATE_STOCK_LOCATION)

  const locations: StockLocation[] = data?.stockLocations ?? []
  const filtered = locations.filter((l) => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.name.toLowerCase().includes(q) || (l.code ?? '').toLowerCase().includes(q)
  })

  const columns: Column<StockLocation>[] = [
    {
      key: 'name',
      header: 'Location Name',
      render: (l) => (
        <div>
          <div style={{ color: theme.textPrimary }}>{l.name}</div>
          {l.parent_name && <div style={{ fontSize: '11px', color: theme.textMuted }}>{l.parent_name}</div>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (l) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary, fontSize: '12px' }}>{l.code ?? '—'}</span> },
    { key: 'type', header: 'Type', render: (l) => <Badge variant={l.type === 'warehouse' ? 'success' : l.type === 'transit' ? 'warning' : 'neutral'}>{l.type.replace('_', ' ')}</Badge> },
    { key: 'address', header: 'Address', render: (l) => <span style={{ color: theme.textMuted, fontSize: '13px' }}>{l.address ?? '—'}</span> },
    { key: 'is_active', header: 'Status', render: (l) => <Badge variant={l.is_active ? 'success' : 'neutral'}>{l.is_active ? 'Active' : 'Inactive'}</Badge> },
  ]

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createLocation({
        variables: { input: { name: form.name, code: form.code || undefined, type: form.type, parent_id: form.parent_id || undefined, address: form.address || undefined } },
        refetchQueries: [{ query: STOCK_LOCATIONS_QUERY, variables: {} }],
      })
      addToast({ type: 'success', message: 'Location created' })
      setShowForm(false)
      setForm({ name: '', code: '', type: 'internal', parent_id: '', address: '' })
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title="Stock Locations"
        subtitle={`${filtered.length} locations`}
        actions={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}>New Location</Button>}
      />

      <Card style={{ marginTop: '20px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[{ key: 'type', label: 'Type', value: typeFilter, options: TYPE_OPTIONS, onChange: setTypeFilter }]}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        />
        <Table columns={columns} data={filtered} loading={loading} rowKey="id" />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Stock Location">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Optional" />
          </div>
          <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="warehouse">Warehouse</option>
            <option value="site">Site</option>
            <option value="transit">Transit</option>
            <option value="virtual_in">Virtual In</option>
            <option value="virtual_out">Virtual Out</option>
          </Select>
          <Select label="Parent Location" value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}>
            <option value="">None</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Input label="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={creating}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
