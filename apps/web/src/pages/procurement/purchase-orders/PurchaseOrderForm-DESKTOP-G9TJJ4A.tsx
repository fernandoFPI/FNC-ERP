import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_PO, PURCHASE_ORDERS_QUERY } from '../../../graphql/procurement'
import { VENDORS_QUERY } from '../../../graphql/procurement'
import { ANALYTIC_ACCOUNTS_QUERY } from '../../../graphql/finance'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { MANUFACTURING_ORDERS_QUERY } from '../../../graphql/manufacturing'
import { EMPLOYEES_QUERY } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'

interface POLine {
  product_id: string
  description: string
  qty: string
  unit_price: string
  uom: string
}

const emptyLine = (): POLine => ({ product_id: '', description: '', qty: '1', unit_price: '0', uom: 'pc' })

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export default function PurchaseOrderForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [searchParams] = useSearchParams()

  const [form, setForm] = useState({
    vendor_id: '',
    currency_code: 'IQD',
    analytic_account_id: '',
    expected_delivery_date: '',
    notes: '',
    fx_rate: '1',
    assigned_receiver_id: '',
  })
  const [purpose, setPurpose] = useState<'stock' | 'project' | 'manufacturing'>('stock')
  const [linkedProjectId, setLinkedProjectId] = useState('')
  const [linkedMoId, setLinkedMoId] = useState('')
  const [lines, setLines] = useState<POLine[]>([emptyLine()])

  // Pre-fill from URL
  useEffect(() => {
    const moId = searchParams.get('moId')
    const projectId = searchParams.get('projectId')
    const purposeParam = searchParams.get('purpose')
    if (moId) {
      setPurpose('manufacturing')
      setLinkedMoId(moId)
    } else if (projectId) {
      setPurpose('project')
      setLinkedProjectId(projectId)
    } else if (purposeParam === 'project' || purposeParam === 'manufacturing' || purposeParam === 'stock') {
      setPurpose(purposeParam)
    }
    const prefill = sessionStorage.getItem('po_prefill_lines')
    if (prefill) {
      try {
        const parsed = JSON.parse(prefill) as POLine[]
        if (parsed.length > 0) setLines(parsed)
      } catch { /* ignore */ }
      sessionStorage.removeItem('po_prefill_lines')
    }
  }, [searchParams])

  const { data: vendorsData } = useQuery(VENDORS_QUERY, { variables: {} })
  const { data: analyticsData } = useQuery(ANALYTIC_ACCOUNTS_QUERY)
  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: {} })
  const { data: projectsData } = useQuery(PROJECTS_QUERY, { variables: { includeAll: true }, skip: purpose !== 'project' })
  const { data: mosData } = useQuery(MANUFACTURING_ORDERS_QUERY, { variables: {}, skip: purpose !== 'manufacturing' })
  const { data: employeesData } = useQuery(EMPLOYEES_QUERY, { variables: { is_active: true } })
  const [createPO, { loading }] = useMutation(CREATE_PO)

  const vendors = vendorsData?.vendors ?? []
  const analytics = analyticsData?.analyticAccounts ?? []
  const products: Array<{ id: string; sku: string; name: string; uom: string }> = productsData?.products ?? []
  const projects: Array<{ id: string; code: string; name: string; analyticAccountId?: string; analyticAccountName?: string }> = projectsData?.projects?.data ?? []
  const mos = mosData?.manufacturingOrders ?? []
  const employees: Array<{ id: string; first_name: string; last_name: string; employee_number: string }> = employeesData?.employees ?? []

  const productOptions = [
    { value: '', label: 'Custom item' },
    ...products.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku })),
  ]

  const projectOptions = [
    { value: '', label: 'Select project…' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]

  const employeeOptions = [
    { value: '', label: 'None' },
    ...employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`, sublabel: e.employee_number })),
  ]

  // Auto-set analytic account when project changes
  useEffect(() => {
    if (!linkedProjectId || projects.length === 0) return
    const proj = projects.find((p) => p.id === linkedProjectId)
    if (proj?.analyticAccountId) {
      setForm((f) => ({ ...f, analytic_account_id: proj.analyticAccountId! }))
    }
  }, [linkedProjectId, projects])

  // Auto-set analytic account when MO is selected
  useEffect(() => {
    if (!linkedMoId || mos.length === 0) return
    const mo = mos.find((m: { id: string; project_analytic_account_id?: string }) => m.id === linkedMoId)
    if (mo?.project_analytic_account_id) {
      setForm((f) => ({ ...f, analytic_account_id: mo.project_analytic_account_id }))
    }
  }, [linkedMoId, mos])

  const subtotal = lines.reduce((s, l) => s + parseFloat(l.qty || '0') * parseFloat(l.unit_price || '0'), 0)

  function updateLine(i: number, key: keyof POLine, value: string) {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [key]: value }
      if (key === 'product_id') {
        if (value) {
          const product = products.find((p) => p.id === value)
          if (product) { updated.description = product.name; updated.uom = product.uom }
        } else {
          updated.description = ''
        }
      }
      return updated
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (purpose !== 'manufacturing' && !form.vendor_id) { addToast({ type: 'error', message: 'Please select a vendor' }); return }
    if (purpose === 'project' && !linkedProjectId) { addToast({ type: 'error', message: 'Please select a project' }); return }
    if (purpose === 'manufacturing' && !linkedMoId) { addToast({ type: 'error', message: 'Please select a manufacturing order' }); return }
    try {
      const input = {
        vendor_id: form.vendor_id || undefined,
        currency_code: form.currency_code,
        analytic_account_id: form.analytic_account_id || undefined,
        expected_delivery_date: form.expected_delivery_date || undefined,
        notes: form.notes || undefined,
        fx_rate: parseFloat(form.fx_rate) || 1,
        purpose,
        assigned_receiver_id: form.assigned_receiver_id || undefined,
        linkedProjectId: purpose === 'project' ? (linkedProjectId || undefined) : undefined,
        linkedMoId: purpose === 'manufacturing' ? (linkedMoId || undefined) : undefined,
        lines: lines.filter((l) => l.description || l.product_id).map((l) => ({
          product_id: l.product_id || undefined,
          description: l.description,
          qty: parseFloat(l.qty),
          unit_price: parseFloat(l.unit_price),
          uom: l.uom,
        })),
      }
      await createPO({ variables: { input }, refetchQueries: [{ query: PURCHASE_ORDERS_QUERY, variables: {} }] })
      addToast({ type: 'success', message: 'Purchase order created' })
      navigate('/procurement/purchase-orders')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title="New Purchase Order" subtitle="Create a purchase order" backPath="/procurement/purchase-orders" />

      <form onSubmit={handleSubmit}>
        <Card style={{ marginTop: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Row 1: Purpose + Project/MO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Select label="Purchase Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as 'stock' | 'project' | 'manufacturing')}>
              <option value="stock">General Stock</option>
              <option value="project">Project Supply</option>
              <option value="manufacturing">Manufacturing / BOM</option>
            </Select>
            {purpose === 'project' && (
              <SearchableSelect
                label="Project"
                value={linkedProjectId}
                onChange={(v) => setLinkedProjectId(v)}
                options={projectOptions}
                placeholder="Search project…"
                minDropdownWidth={360}
              />
            )}
            {purpose === 'manufacturing' && (
              <Select label="Manufacturing Order" value={linkedMoId} onChange={(e) => setLinkedMoId(e.target.value)} required>
                <option value="">Select MO…</option>
                {mos.map((m: { id: string; mo_number: string; product_name?: string }) => <option key={m.id} value={m.id}>{m.mo_number}{m.product_name ? ` — ${m.product_name}` : ''}</option>)}
              </Select>
            )}
          </div>

          {/* Row 2: Vendor + Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <SearchableSelect
              label={purpose === 'manufacturing' ? 'Vendor (optional)' : 'Vendor *'}
              value={form.vendor_id}
              onChange={(v) => setForm((f) => ({ ...f, vendor_id: v }))}
              options={[{ value: '', label: purpose === 'manufacturing' ? 'Select vendor… (optional)' : 'Select vendor…' }, ...vendors.map((v: { id: string; name: string }) => ({ value: v.id, label: v.name }))]}
              placeholder="Search vendor…"
              minDropdownWidth={320}
            />
            <Select label="Currency" value={form.currency_code} onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          {/* Row 3: Analytic Account + Expected Delivery + FX Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
            <Select label="Analytic Account" value={form.analytic_account_id} onChange={(e) => setForm((f) => ({ ...f, analytic_account_id: e.target.value }))}>
              <option value="">None</option>
              {analytics.map((a: { id: string; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Input label="Expected Delivery" type="date" value={form.expected_delivery_date} onChange={(e) => setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))} />
            <Input label="FX Rate" type="number" step="0.0001" min="0" value={form.fx_rate} onChange={(e) => setForm((f) => ({ ...f, fx_rate: e.target.value }))} />
          </div>

          {/* Row 4: Received By */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <SearchableSelect
              label="Received By"
              value={form.assigned_receiver_id}
              onChange={(v) => setForm((f) => ({ ...f, assigned_receiver_id: v }))}
              options={employeeOptions}
              placeholder="Search employee…"
              minDropdownWidth={320}
            />
            <div />
          </div>

          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </Card>

        {/* Lines */}
        <Card style={{ marginTop: '16px' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, fontWeight: 600, color: theme.textPrimary }}>
            Order Lines
          </div>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: '6px', margin: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px 100px 60px 28px', gap: '0', background: theme.bgSurface, padding: '6px 10px', borderBottom: `1px solid ${theme.border}` }}>
              {['Product / Description', 'UOM', 'Qty', 'Unit Price', 'Total', ''].map((h) => (
                <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>

            {lines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px 100px 60px 28px', gap: '0', padding: '6px 10px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <SearchableSelect
                    value={line.product_id}
                    onChange={(v) => updateLine(i, 'product_id', v)}
                    options={productOptions}
                    placeholder="Search by name or SKU…"
                    minDropdownWidth={400}
                  />
                  <Input value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Description" />
                </div>
                <Input value={line.uom} onChange={(e) => updateLine(i, 'uom', e.target.value)} />
                <Input type="number" min="0" step="0.01" value={line.qty} onChange={(e) => updateLine(i, 'qty', e.target.value)} />
                <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} />
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textPrimary, padding: '0 4px' }}>
                  {(parseFloat(line.qty || '0') * parseFloat(line.unit_price || '0')).toLocaleString()}
                </span>
                <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} disabled={lines.length <= 1}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.danger, fontSize: '16px' }}>×</button>
              </div>
            ))}

            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${theme.border}` }}>
              <Button variant="ghost" size="sm" type="button" onClick={() => setLines((p) => [...p, emptyLine()])}>+ Add Line</Button>
              <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, fontFamily: 'monospace' }}>
                Total: {subtotal.toLocaleString()} {form.currency_code}
              </span>
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button variant="ghost" type="button" onClick={() => navigate('/procurement/purchase-orders')}>Cancel</Button>
          <Button variant="primary" type="submit" loading={loading}>Create Purchase Order</Button>
        </div>
      </form>
    </div>
  )
}
