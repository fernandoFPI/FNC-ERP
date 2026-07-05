import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { api } from '../../../lib/axios'

interface Category { id: string; name: string; default_depreciation_method: string; default_useful_life_months: number | null; default_declining_rate: number | null }
interface CoAAccount { id: string; code: string; name: string; account_type: string }
interface Asset {
  id: string; name: string; description: string; category_id: string | null; serial_number: string
  location: string; purchase_date: string; purchase_cost: number; salvage_value: number
  useful_life_months: number; depreciation_method: string; declining_rate: number | null
  asset_account_id: string | null; accum_dep_account_id: string | null; dep_expense_account_id: string | null
  vendor_id: string | null; notes: string; status: string
}

export default function AssetForm() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<CoAAccount[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', category_id: '', serial_number: '', location: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_cost: '', salvage_value: '0', useful_life_months: '60',
    depreciation_method: 'straight_line', declining_rate: '',
    asset_account_id: '', accum_dep_account_id: '', dep_expense_account_id: '',
    notes: '',
  })

  useEffect(() => {
    Promise.all([
      api.get<Category[]>('/finance/assets/categories'),
      api.get<CoAAccount[]>('/finance/accounts'),
    ]).then(([cRes, aRes]) => {
      setCategories(cRes.data)
      setAccounts(aRes.data)
    }).catch(() => {})

    if (isEdit && id) {
      api.get<Asset>(`/finance/assets/${id}`).then(r => {
        const a = r.data
        setForm({
          name: a.name, description: a.description ?? '', category_id: a.category_id ?? '',
          serial_number: a.serial_number ?? '', location: a.location ?? '',
          purchase_date: a.purchase_date.slice(0, 10),
          purchase_cost: String(a.purchase_cost), salvage_value: String(a.salvage_value),
          useful_life_months: String(a.useful_life_months), depreciation_method: a.depreciation_method,
          declining_rate: a.declining_rate != null ? String(a.declining_rate) : '',
          asset_account_id: a.asset_account_id ?? '', accum_dep_account_id: a.accum_dep_account_id ?? '',
          dep_expense_account_id: a.dep_expense_account_id ?? '', notes: a.notes ?? '',
        })
      }).catch(() => {})
    }
  }, [id, isEdit])

  function applyCategory(catId: string) {
    const cat = categories.find(c => c.id === catId)
    if (!cat) return
    setForm(f => ({
      ...f,
      category_id: catId,
      depreciation_method: cat.default_depreciation_method,
      useful_life_months: cat.default_useful_life_months ? String(cat.default_useful_life_months) : f.useful_life_months,
      declining_rate: cat.default_declining_rate != null ? String(cat.default_declining_rate) : f.declining_rate,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: form.name, description: form.description || undefined,
        category_id: form.category_id || undefined, serial_number: form.serial_number || undefined,
        location: form.location || undefined, purchase_date: form.purchase_date,
        purchase_cost: Number(form.purchase_cost), salvage_value: Number(form.salvage_value),
        useful_life_months: Number(form.useful_life_months), depreciation_method: form.depreciation_method,
        declining_rate: form.declining_rate ? Number(form.declining_rate) : undefined,
        asset_account_id: form.asset_account_id || undefined,
        accum_dep_account_id: form.accum_dep_account_id || undefined,
        dep_expense_account_id: form.dep_expense_account_id || undefined,
        notes: form.notes || undefined,
      }
      if (isEdit && id) {
        await api.patch(`/finance/assets/${id}`, payload)
      } else {
        await api.post('/finance/assets', payload)
      }
      navigate('/finance/assets')
    } catch { alert('Failed to save asset') }
    finally { setSaving(false) }
  }

  const label = (text: string) => (
    <label style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 500, display: 'block', marginBottom: '4px' }}>{text}</label>
  )

  const input = (key: keyof typeof form, type = 'text', extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type={type}
      value={form[key]}
      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit', boxSizing: 'border-box' }}
      {...extra}
    />
  )

  const select = (key: keyof typeof form, options: { value: string; label: string }[]) => (
    <select
      value={form[key]}
      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit' }}
    >
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  const assetAccounts  = accounts.filter(a => a.account_type === 'asset')
  const expenseAccounts = accounts.filter(a => a.account_type === 'expense')

  const row = (children: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
      {children}
    </div>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '860px' }}>
      <PageHeader
        title={isEdit ? 'Edit Asset' : 'New Fixed Asset'}
        subtitle={isEdit ? 'Update asset details (only available in Draft status)' : 'Register a new asset in the fixed asset register'}
        actions={<Button variant="ghost" size="sm" onClick={() => navigate('/finance/assets')}>← Back</Button>}
      />

      <form onSubmit={(e) => { void handleSubmit(e) }}>
        {/* Basic Info */}
        <Card padding="md" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Asset Information</p>
          {row(<>
            <div>
              {label('Asset Name *')}
              {input('name')}
            </div>
            <div>
              {label('Category')}
              <select
                value={form.category_id}
                onChange={e => applyCategory(e.target.value)}
                style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit' }}
              >
                <option value="">— Select —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </>)}
          {row(<>
            <div>{label('Serial Number')}{input('serial_number')}</div>
            <div>{label('Location / Site')}{input('location')}</div>
          </>)}
          <div style={{ marginBottom: '16px' }}>
            {label('Description')}
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </Card>

        {/* Financials */}
        <Card padding="md" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Financial Details</p>
          {row(<>
            <div>{label('Purchase Date *')}{input('purchase_date', 'date')}</div>
            <div>{label('Purchase Cost *')}{input('purchase_cost', 'number', { min: '0', step: '0.01' })}</div>
          </>)}
          {row(<>
            <div>{label('Salvage Value')}{input('salvage_value', 'number', { min: '0', step: '0.01' })}</div>
            <div>{label('Useful Life (months) *')}{input('useful_life_months', 'number', { min: '1', step: '1' })}</div>
          </>)}
          {row(<>
            <div>
              {label('Depreciation Method *')}
              {select('depreciation_method', [
                { value: 'straight_line', label: 'Straight Line (SL)' },
                { value: 'declining_balance', label: 'Declining Balance (DB)' },
              ])}
            </div>
            {form.depreciation_method === 'declining_balance' && (
              <div>{label('Annual Declining Rate (e.g. 0.20 = 20%)')}{input('declining_rate', 'number', { min: '0', max: '1', step: '0.01' })}</div>
            )}
          </>)}
          {form.purchase_cost && form.salvage_value !== undefined && form.useful_life_months && (
            <div style={{ padding: '10px 12px', background: theme.bgSurface, borderRadius: '8px', fontSize: '11px', color: theme.textMuted }}>
              Monthly depreciation (SL): <strong style={{ color: theme.textPrimary }}>
                {((Number(form.purchase_cost) - Number(form.salvage_value)) / Number(form.useful_life_months)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </strong> per month over {form.useful_life_months} months
            </div>
          )}
        </Card>

        {/* GL Accounts */}
        <Card padding="md" style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>GL Account Mapping</p>
          <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '16px' }}>Required to auto-post depreciation journal entries</p>
          {row(<>
            <div>
              {label('Asset Account (Balance Sheet)')}
              {select('asset_account_id', assetAccounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` })))}
            </div>
            <div>
              {label('Accumulated Depreciation Account')}
              {select('accum_dep_account_id', assetAccounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` })))}
            </div>
          </>)}
          <div style={{ maxWidth: '420px' }}>
            {label('Depreciation Expense Account')}
            {select('dep_expense_account_id', expenseAccounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` })))}
          </div>
        </Card>

        {/* Notes */}
        <Card padding="md" style={{ marginBottom: '24px' }}>
          {label('Notes')}
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3} style={{ width: '100%', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '7px 10px', fontSize: '13px', color: theme.textPrimary, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
        </Card>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Asset'}</Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/finance/assets')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
