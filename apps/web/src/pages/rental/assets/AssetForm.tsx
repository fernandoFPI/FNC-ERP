import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  EQUIPMENT_ASSET_QUERY,
  CREATE_EQUIPMENT_ASSET,
  UPDATE_EQUIPMENT_ASSET,
  EQUIPMENT_ASSETS_QUERY,
} from '../../../graphql/rental'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const STATUSES = ['available', 'rented', 'maintenance', 'reserved', 'retired']
const CATEGORIES = ['vehicle', 'machinery', 'equipment', 'tool', 'other']

export default function AssetForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const addToast = useToastStore((s) => s.addToast)
  const { theme } = useTheme()

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'vehicle',
    serial_number: '',
    purchase_date: '',
    purchase_price: '',
    daily_rate: '',
    currency_code: 'IQD',
    maintenance_due_hours: '',
    status: 'available',
  })

  const { data } = useQuery(EQUIPMENT_ASSET_QUERY, { variables: { id }, skip: !isEdit })
  const [createAsset, { loading: creating }] = useMutation(CREATE_EQUIPMENT_ASSET)
  const [updateAsset, { loading: updating }] = useMutation(UPDATE_EQUIPMENT_ASSET)

  useEffect(() => {
    const a = data?.equipmentAsset
    if (a) {
      setForm({
        name: a.name ?? '',
        description: a.description ?? '',
        category: a.category ?? 'vehicle',
        serial_number: a.serial_number ?? '',
        purchase_date: a.purchase_date ?? '',
        purchase_price: String(a.purchase_price ?? ''),
        daily_rate: String(a.daily_rate ?? ''),
        currency_code: a.currency_code ?? 'IQD',
        maintenance_due_hours: String(a.maintenance_due_hours ?? ''),
        status: a.status ?? 'available',
      })
    }
  }, [data])

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      ...form,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      daily_rate: parseFloat(form.daily_rate) || 0,
      maintenance_due_hours: form.maintenance_due_hours
        ? parseFloat(form.maintenance_due_hours)
        : null,
    }
    try {
      if (isEdit) {
        await updateAsset({
          variables: { id, input },
          refetchQueries: [{ query: EQUIPMENT_ASSET_QUERY, variables: { id } }],
        })
        addToast({ type: 'success', message: 'Asset updated' })
        navigate(`/rental/assets/${id}`)
      } else {
        const res = await createAsset({
          variables: { input },
          refetchQueries: [{ query: EQUIPMENT_ASSETS_QUERY }],
        })
        addToast({ type: 'success', message: 'Asset created' })
        navigate(`/rental/assets/${res.data.createEquipmentAsset.id}`)
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title={isEdit ? 'Edit Asset' : 'New Equipment Asset'}
        subtitle={isEdit ? 'Update asset details' : 'Add to fleet'}
      />
      <Card style={{ marginTop: '20px' }}>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <Input
              label="Asset Name"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
              }}
              required
            />
            <div>
              <SearchableSelect
                label="Category"
                value={form.category}
                onChange={(v) => {
                  setForm((f) => ({ ...f, category: v }))
                }}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => {
              setForm((f) => ({ ...f, description: e.target.value }))
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label="Serial Number"
              value={form.serial_number}
              onChange={(e) => {
                setForm((f) => ({ ...f, serial_number: e.target.value }))
              }}
            />
            <div>
              <SearchableSelect
                label="Status"
                value={form.status}
                onChange={(v) => {
                  setForm((f) => ({ ...f, status: v }))
                }}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label="Purchase Date"
              type="date"
              value={form.purchase_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, purchase_date: e.target.value }))
              }}
            />
            <Input
              label="Purchase Price"
              type="number"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) => {
                setForm((f) => ({ ...f, purchase_price: e.target.value }))
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <Input
              label="Daily Rate"
              type="number"
              step="0.01"
              value={form.daily_rate}
              onChange={(e) => {
                setForm((f) => ({ ...f, daily_rate: e.target.value }))
              }}
              required
            />
            <div>
              <SearchableSelect
                label="Currency"
                value={form.currency_code}
                onChange={(v) => {
                  setForm((f) => ({ ...f, currency_code: v }))
                }}
                options={[
                  { value: 'IQD', label: 'IQD' },
                  { value: 'USD', label: 'USD' },
                  { value: 'EUR', label: 'EUR' },
                ]}
              />
            </div>
          </div>
          <Input
            label="Maintenance Due (hours)"
            type="number"
            step="1"
            value={form.maintenance_due_hours}
            onChange={(e) => {
              setForm((f) => ({ ...f, maintenance_due_hours: e.target.value }))
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate('/rental/assets')
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={creating || updating}>
              {isEdit ? 'Save' : 'Create Asset'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
