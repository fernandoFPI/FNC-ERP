import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { RENTAL_CONTRACT_QUERY, CREATE_RENTAL_CONTRACT, UPDATE_RENTAL_CONTRACT, RENTAL_CONTRACTS_QUERY } from '../../../graphql/rental'
import { EQUIPMENT_ASSETS_QUERY } from '../../../graphql/rental'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const RENTAL_TYPES = ['short_term', 'long_term', 'project_based']
const BILLING_CYCLES = ['daily', 'weekly', 'monthly']
const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'usage_based', label: 'Usage Based' },
  { value: 'none', label: 'None' },
]

export default function RentalContractForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = !!id
  const addToast = useToastStore((s) => s.addToast)
  const { theme } = useTheme()

  const [form, setForm] = useState({
    asset_id: searchParams.get('assetId') ?? '',
    project_id: '',
    client_name: '',
    client_contact: '',
    rental_type: 'short_term',
    billing_cycle: 'daily',
    rate_amount: '',
    currency_code: 'IQD',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    deposit_amount: '',
    notes: '',
    depreciation_method: 'straight_line',
    depreciation_per_day: '',
    useful_life_days: '',
    salvage_value: '',
  })

  const { data: contractData } = useQuery(RENTAL_CONTRACT_QUERY, { variables: { id }, skip: !isEdit })
  const { data: assetsData } = useQuery(EQUIPMENT_ASSETS_QUERY, { variables: { status: 'available' } })
  // includeAll bypasses the membership filter so all company projects appear in the dropdown
  // statuses: 'active' was renamed to 'ongoing' in migration 033
  const { data: projData } = useQuery(PROJECTS_QUERY, { variables: { status: ['ongoing', 'submitted', 'approved'], includeAll: true } })
  const [createContract, { loading: creating }] = useMutation(CREATE_RENTAL_CONTRACT)
  const [updateContract, { loading: updating }] = useMutation(UPDATE_RENTAL_CONTRACT)

  const assets: { id: string; asset_number: string; name: string; purchase_price?: string; currency_code?: string }[] =
    assetsData?.equipmentAssets ?? []
  const projects: { id: string; code: string; name: string }[] = projData?.projects?.data ?? []

  useEffect(() => {
    const c = contractData?.rentalContract
    if (c) {
      setForm({
        asset_id: c.asset_id ?? '', project_id: c.project_id ?? '', client_name: c.client_name ?? '',
        client_contact: c.client_contact ?? '', rental_type: c.rental_type ?? 'short_term',
        billing_cycle: c.billing_cycle ?? 'daily', rate_amount: String(c.rate_amount ?? ''),
        currency_code: c.currency_code ?? 'IQD', start_date: c.start_date ?? '',
        end_date: c.end_date ?? '', deposit_amount: String(c.deposit_amount ?? ''), notes: c.notes ?? '',
        depreciation_method: c.depreciation_method ?? 'straight_line',
        depreciation_per_day: c.depreciation_per_day != null ? String(c.depreciation_per_day) : '',
        useful_life_days: c.useful_life_days != null ? String(c.useful_life_days) : '',
        salvage_value: c.salvage_value != null ? String(c.salvage_value) : '',
      })
    }
  }, [contractData])

  // Auto-calculate depreciation_per_day when asset or useful_life_days changes
  useEffect(() => {
    if (form.depreciation_method === 'none' || form.depreciation_method === 'usage_based') return
    if (!form.asset_id || !form.useful_life_days) return
    const asset = assets.find((a) => a.id === form.asset_id)
    if (!asset?.purchase_price) return
    const purchasePrice = parseFloat(asset.purchase_price)
    const salvage = parseFloat(form.salvage_value) || 0
    const lifeDays = parseInt(form.useful_life_days) || 0
    if (lifeDays > 0) {
      const perDay = (purchasePrice - salvage) / lifeDays
      setForm((f) => ({ ...f, depreciation_per_day: perDay.toFixed(4) }))
    }
  }, [form.asset_id, form.useful_life_days, form.salvage_value, form.depreciation_method, assets])

  const selectStyle: React.CSSProperties = {
    width: '100%', background: theme.bgSurface, color: theme.textPrimary,
    border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '8px 12px', fontSize: '13px',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', fontWeight: 500,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      ...form,
      rate_amount: parseFloat(form.rate_amount) || 0,
      deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
      project_id: form.project_id || null,
      end_date: form.end_date || null,
      client_contact: form.client_contact || null,
      depreciation_per_day: form.depreciation_per_day ? parseFloat(form.depreciation_per_day) : null,
      useful_life_days: form.useful_life_days ? parseInt(form.useful_life_days) : null,
      salvage_value: form.salvage_value ? parseFloat(form.salvage_value) : null,
    }
    try {
      if (isEdit) {
        await updateContract({
          variables: {
            id,
            input: {
              client_name: input.client_name, rate_amount: input.rate_amount,
              end_date: input.end_date, notes: input.notes,
              depreciation_method: input.depreciation_method,
              depreciation_per_day: input.depreciation_per_day,
              useful_life_days: input.useful_life_days,
              salvage_value: input.salvage_value,
              // required fields for input type
              asset_id: form.asset_id, rental_type: form.rental_type,
              billing_cycle: form.billing_cycle, start_date: form.start_date,
            },
          },
        })
        addToast({ type: 'success', message: 'Contract updated' })
        navigate(`/rental/contracts/${id}`)
      } else {
        const res = await createContract({ variables: { input }, refetchQueries: [{ query: RENTAL_CONTRACTS_QUERY }] })
        addToast({ type: 'success', message: 'Contract created' })
        navigate(`/rental/contracts/${res.data.createRentalContract.id}`)
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const selectedAsset = assets.find((a) => a.id === form.asset_id)

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader title={isEdit ? 'Edit Rental Contract' : 'New Rental Contract'} subtitle="Equipment rental agreement" />

      <Card style={{ marginTop: '20px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>

          {/* ── Asset & Project ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <SearchableSelect
                label="Equipment Asset"
                value={form.asset_id}
                onChange={(v) => setForm((f) => ({ ...f, asset_id: v }))}
                placeholder="Select asset…"
                options={assets.map((a) => ({ value: a.id, label: `${a.asset_number} — ${a.name}` }))}
                required
                disabled={isEdit}
              />
            </div>
            <div>
              <SearchableSelect
                label="Project (optional)"
                value={form.project_id}
                onChange={(v) => setForm((f) => ({ ...f, project_id: v }))}
                placeholder="None"
                options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                disabled={isEdit}
              />
            </div>
          </div>

          {/* ── Client ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Input label="Client Name" value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} required />
            <Input label="Client Contact" value={form.client_contact} onChange={(e) => setForm((f) => ({ ...f, client_contact: e.target.value }))} />
          </div>

          {/* ── Contract terms ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
            <div>
              <SearchableSelect
                label="Rental Type"
                value={form.rental_type}
                onChange={(v) => setForm((f) => ({ ...f, rental_type: v }))}
                options={RENTAL_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
                disabled={isEdit}
              />
            </div>
            <div>
              <SearchableSelect
                label="Billing Cycle"
                value={form.billing_cycle}
                onChange={(v) => setForm((f) => ({ ...f, billing_cycle: v }))}
                options={BILLING_CYCLES.map((c) => ({ value: c, label: c }))}
                disabled={isEdit}
              />
            </div>
            <div>
              <SearchableSelect
                label="Currency"
                value={form.currency_code}
                onChange={(v) => setForm((f) => ({ ...f, currency_code: v }))}
                options={[
                  { value: 'IQD', label: 'IQD' },
                  { value: 'USD', label: 'USD' },
                  { value: 'EUR', label: 'EUR' },
                ]}
                disabled={isEdit}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Input label="Daily Rate" type="number" step="0.01" value={form.rate_amount} onChange={(e) => setForm((f) => ({ ...f, rate_amount: e.target.value }))} required />
            <Input label="Deposit Amount" type="number" step="0.01" value={form.deposit_amount} onChange={(e) => setForm((f) => ({ ...f, deposit_amount: e.target.value }))} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
            <Input label="End Date (optional)" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>

          <Input label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />

          {/* ── Depreciation ── */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '12px', paddingBottom: '8px', borderBottom: `1px solid ${theme.border}` }}>
              Depreciation
            </div>
            {selectedAsset?.purchase_price && (
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
                Asset purchase price: <strong style={{ color: theme.textSecondary }}>{parseFloat(selectedAsset.purchase_price).toLocaleString()} {selectedAsset.currency_code ?? form.currency_code}</strong>
                {' '}— enter useful life below to auto-calculate daily depreciation.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div>
                <SearchableSelect
                  label="Method"
                  value={form.depreciation_method}
                  onChange={(v) => setForm((f) => ({ ...f, depreciation_method: v }))}
                  options={DEPRECIATION_METHODS}
                />
              </div>
              <Input
                label="Useful Life (days)"
                type="number"
                min="1"
                step="1"
                value={form.useful_life_days}
                onChange={(e) => setForm((f) => ({ ...f, useful_life_days: e.target.value }))}
                disabled={form.depreciation_method === 'none'}
              />
              <Input
                label="Salvage Value"
                type="number"
                step="0.01"
                min="0"
                value={form.salvage_value}
                onChange={(e) => setForm((f) => ({ ...f, salvage_value: e.target.value }))}
                disabled={form.depreciation_method === 'none'}
              />
              <Input
                label="Depreciation / Day"
                type="number"
                step="0.0001"
                min="0"
                value={form.depreciation_per_day}
                onChange={(e) => setForm((f) => ({ ...f, depreciation_per_day: e.target.value }))}
                disabled={form.depreciation_method === 'none'}
              />
            </div>
            {form.depreciation_per_day && form.start_date && form.end_date && (
              <div style={{ marginTop: '10px', padding: '10px 14px', background: theme.accentBg, borderRadius: '6px', fontSize: '12px', color: theme.textSecondary }}>
                Total depreciation over contract period:{' '}
                <strong style={{ color: theme.textPrimary }}>
                  {(
                    parseFloat(form.depreciation_per_day) *
                    (Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1)
                  ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {' '}{form.currency_code}
                </strong>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => navigate('/rental/contracts')}>Cancel</Button>
            <Button variant="primary" type="submit" loading={creating || updating}>{isEdit ? 'Save' : 'Create Contract'}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
