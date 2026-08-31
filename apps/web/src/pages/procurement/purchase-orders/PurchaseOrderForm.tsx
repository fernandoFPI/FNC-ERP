import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_PO, PURCHASE_ORDERS_QUERY, PO_FX_RATES_QUERY } from '../../../graphql/procurement'
import { VENDORS_QUERY } from '../../../graphql/procurement'
import { ANALYTIC_ACCOUNTS_QUERY } from '../../../graphql/finance'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { MANUFACTURING_ORDERS_QUERY } from '../../../graphql/manufacturing'
import { EMPLOYEES_QUERY } from '../../../graphql/hr'
import { COMPANY_BRANCHES_QUERY } from '../../../graphql/admin'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { useToastStore } from '../../../store/toastStore'
import { useTourStore } from '../../../store/tourStore'

interface POLine {
  product_id: string
  description: string
  qty: string
  unit_price: string
  uom: string
  // Suggested currency for this line, picked before a vendor is known.
  // Doesn't lock anything in — market pricing still has final say once a
  // real quote exists (see resolvers.ts submitPOMarketPricing).
  requested_currency_code: string
}

const emptyLine = (defaultCurrency = 'IQD'): POLine => ({
  product_id: '',
  description: '',
  qty: '1',
  unit_price: '0',
  uom: 'pc',
  requested_currency_code: defaultCurrency,
})

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

// Same fixed enterprise accent palette used on the Record Receipt page — kept
// as literal values (not theme tokens) so the two forms read as one visual
// system regardless of which of the app's themes is active.
const BRAND_BLUE = '#2563EB'
const BRAND_GREEN = '#16A34A'
const BRAND_ORANGE = '#F97316'
const BRAND_RED = '#DC2626'

const PRIORITY_COLOR: Record<'low' | 'high' | 'emergency', string> = {
  low: BRAND_BLUE,
  high: BRAND_ORANGE,
  emergency: BRAND_RED,
}

function IconDocument({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  )
}

function IconBarChart({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconBox({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function IconCheckCircle({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function PurchaseOrderForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [searchParams] = useSearchParams()

  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')
  const formRef = useRef<HTMLFormElement>(null)

  const [form, setForm] = useState({
    vendor_id: '',
    currency_code: 'IQD',
    analytic_account_id: '',
    expected_delivery_date: '',
    notes: '',
    fx_rate: '1',
    assigned_receiver_id: '',
    branch_id: '',
  })
  // Interactive tour: a real project shouldn't be picked (or even opened —
  // its dropdown lists real company data) during a walkthrough that never
  // saves anything. Also lets handleSubmit skip the "select a project"
  // validation below, since the tour's demo PO is entirely synthetic.
  const isTourMode = useTourStore((s) => s.isActive)
  const [purpose, setPurpose] = useState<'stock' | 'project' | 'manufacturing'>('stock')
  const [priority, setPriority] = useState<'low' | 'high' | 'emergency'>('low')
  const [linkedProjectId, setLinkedProjectId] = useState('')
  // Only meaningful for purpose='project' — decided now, at creation, because
  // it has to be known before approval (it gates whether the from-stock
  // auto Store Out fires) and receiving (whether Record Receipt creates a
  // Store In or a direct-to-jobsite delivery).
  const [deliveryDestination, setDeliveryDestination] = useState<'inventory' | 'jobsite'>(
    'inventory',
  )
  const [linkedMoId, setLinkedMoId] = useState('')
  const [lines, setLines] = useState<POLine[]>([emptyLine()])
  const [currencyTouched, setCurrencyTouched] = useState(false)

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
    } else if (
      purposeParam === 'project' ||
      purposeParam === 'manufacturing' ||
      purposeParam === 'stock'
    ) {
      setPurpose(purposeParam)
    }
    const prefill = sessionStorage.getItem('po_prefill_lines')
    if (prefill) {
      try {
        const parsed = JSON.parse(prefill) as POLine[]
        if (parsed.length > 0)
          setLines(parsed.map((l) => ({ ...l, requested_currency_code: l.requested_currency_code || 'IQD' })))
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('po_prefill_lines')
    }
  }, [searchParams])

  const { data: fxRatesData } = useQuery(PO_FX_RATES_QUERY)
  const fxRates: { currency_code: string; rate_to_base: number; is_default: boolean }[] =
    fxRatesData?.poFxRates?.rates ?? []
  const baseCurrency: string = fxRatesData?.poFxRates?.base_currency ?? 'IQD'

  // Apply the Settings-configured default PO currency once, the first time
  // rates load — only if the user hasn't already picked a currency themselves.
  useEffect(() => {
    if (currencyTouched || fxRates.length === 0) return
    const defaultRate = fxRates.find((r) => r.is_default)
    if (defaultRate) {
      setForm((f) => ({ ...f, currency_code: defaultRate.currency_code }))
      setLines((prev) =>
        prev.map((l) =>
          l.requested_currency_code === 'IQD'
            ? { ...l, requested_currency_code: defaultRate.currency_code }
            : l,
        ),
      )
    }
  }, [fxRates, currencyTouched])

  // Keep FX Rate in sync with whatever's configured in Settings for the
  // selected header currency — base currency is always 1:1, an unconfigured
  // currency falls back to manual entry (see the warning below the field).
  useEffect(() => {
    if (form.currency_code === baseCurrency) {
      setForm((f) => (f.fx_rate === '1' ? f : { ...f, fx_rate: '1' }))
      return
    }
    const configured = fxRates.find((r) => r.currency_code === form.currency_code)
    if (configured) {
      setForm((f) => ({ ...f, fx_rate: String(configured.rate_to_base) }))
    }
  }, [form.currency_code, baseCurrency, fxRates])

  const { data: vendorsData } = useQuery(VENDORS_QUERY, { variables: {} })
  const { data: analyticsData } = useQuery(ANALYTIC_ACCOUNTS_QUERY)
  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: {} })
  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { includeAll: true },
    skip: purpose !== 'project',
  })
  const { data: mosData } = useQuery(MANUFACTURING_ORDERS_QUERY, {
    variables: {},
    skip: purpose !== 'manufacturing',
  })
  const { data: employeesData } = useQuery(EMPLOYEES_QUERY, { variables: { is_active: true } })
  const { data: branchesData } = useQuery(COMPANY_BRANCHES_QUERY, {
    variables: { companyId: currentCompanyId },
    skip: !currentCompanyId,
  })
  const [createPO, { loading }] = useMutation(CREATE_PO)

  const vendors = vendorsData?.vendors ?? []
  const analytics = analyticsData?.analyticAccounts ?? []
  const products: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    productsData?.products ?? []
  const projects: {
    id: string
    code: string
    name: string
    analyticAccountId?: string
    analyticAccountName?: string
  }[] = projectsData?.projects?.data ?? []
  const mos = mosData?.manufacturingOrders ?? []
  const employees: {
    id: string
    first_name: string
    last_name: string
    employee_number: string
  }[] = employeesData?.employees ?? []
  const branches: { id: string; name: string; isActive: boolean }[] = (
    branchesData?.companyBranches ?? []
  ).filter((b: { isActive: boolean }) => b.isActive)

  const productOptions = [
    { value: '', label: 'Custom item' },
    ...products.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.sku,
      keywords: p.name_ar ?? undefined,
    })),
  ]

  const projectOptions = [
    { value: '', label: 'Select project…' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]

  const employeeOptions = [
    { value: '', label: 'None' },
    ...employees.map((e) => ({
      value: e.id,
      label: `${e.first_name} ${e.last_name}`,
      sublabel: e.employee_number,
    })),
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
    const mo = mos.find(
      (m: { id: string; project_analytic_account_id?: string }) => m.id === linkedMoId,
    )
    if (mo?.project_analytic_account_id) {
      setForm((f) => ({ ...f, analytic_account_id: mo.project_analytic_account_id }))
    }
  }, [linkedMoId, mos])

  // Each line can request its own currency, and no FX conversion happens at
  // this stage — so summing raw amounts across lines priced in different
  // currencies and labeling the result with the header currency would be
  // wrong, not just inconsistent. Group by the line's own currency instead;
  // "subtotal" is only the portion actually priced in the header currency,
  // and any other currency present is surfaced separately.
  const lineTotalsByCurrency = lines.reduce<Record<string, number>>((acc, l) => {
    const cur = l.requested_currency_code || form.currency_code
    const amt = (parseFloat(l.qty || '0') || 0) * (parseFloat(l.unit_price || '0') || 0)
    acc[cur] = (acc[cur] ?? 0) + amt
    return acc
  }, {})
  const subtotal = lineTotalsByCurrency[form.currency_code] ?? 0
  const otherCurrencySubtotals = Object.entries(lineTotalsByCurrency).filter(
    ([cur, amt]) => cur !== form.currency_code && amt !== 0,
  )
  const otherCurrencySuffix = otherCurrencySubtotals
    .map(([cur, amt]) => ` + ${amt.toLocaleString()} ${cur}`)
    .join('')
  // Summary sidebar stats — only lines with a real product/description count
  // as "items"; a fresh blank line shouldn't inflate the count.
  const realLines = lines.filter((l) => l.description || l.product_id)
  const totalQty = realLines.reduce((s, l) => s + (parseFloat(l.qty || '0') || 0), 0)
  const estimatedBaseTotal = subtotal * (parseFloat(form.fx_rate) || 1)

  function updateLine(i: number, key: keyof POLine, value: string) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l
        const updated = { ...l, [key]: value }
        if (key === 'product_id') {
          if (value) {
            const product = products.find((p) => p.id === value)
            if (product) {
              // Leave description blank rather than repeating the product
              // name — the picker above already shows it. An empty
              // description still displays fine everywhere downstream
              // (PO detail, print, etc. all fall back to the product name).
              updated.description = ''
              updated.uom = product.uom
            }
          } else {
            updated.description = ''
          }
        }
        return updated
      }),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (purpose === 'project' && !linkedProjectId && !isTourMode) {
      addToast({ type: 'error', message: 'Please select a project' })
      return
    }
    if (purpose === 'manufacturing' && !linkedMoId) {
      addToast({ type: 'error', message: 'Please select a manufacturing order' })
      return
    }
    if (branches.length > 0 && !form.branch_id) {
      addToast({ type: 'error', message: 'Please select a branch' })
      return
    }
    try {
      const input = {
        vendor_id: form.vendor_id || undefined,
        currency_code: form.currency_code,
        analytic_account_id: form.analytic_account_id || undefined,
        expected_delivery_date: form.expected_delivery_date || undefined,
        notes: form.notes || undefined,
        fx_rate: parseFloat(form.fx_rate) || 1,
        purpose,
        delivery_destination: purpose === 'project' ? deliveryDestination : undefined,
        priority,
        assigned_receiver_id: form.assigned_receiver_id || undefined,
        branch_id: form.branch_id || undefined,
        linkedProjectId: purpose === 'project' ? linkedProjectId || undefined : undefined,
        linkedMoId: purpose === 'manufacturing' ? linkedMoId || undefined : undefined,
        lines: lines
          .filter((l) => l.description || l.product_id)
          .map((l) => ({
            product_id: l.product_id || undefined,
            description: l.description,
            qty: parseFloat(l.qty),
            unit_price: parseFloat(l.unit_price),
            uom: l.uom,
            requested_currency_code: l.requested_currency_code || undefined,
          })),
      }
      await createPO({
        variables: { input },
        refetchQueries: [{ query: PURCHASE_ORDERS_QUERY, variables: {} }],
      })
      addToast({ type: 'success', message: 'Purchase order created' })
      navigate('/procurement/purchase-orders')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const lineFields: LineItemField<POLine>[] = [
    {
      key: 'product',
      label: 'Product / Description',
      render: (line, i) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <SearchableSelect
            value={line.product_id}
            onChange={(v) => {
              updateLine(i, 'product_id', v)
            }}
            options={productOptions}
            placeholder="Search by name or SKU…"
            minDropdownWidth={400}
          />
          <Input
            value={line.description}
            onChange={(e) => {
              updateLine(i, 'description', e.target.value)
            }}
            placeholder="Description"
          />
        </div>
      ),
    },
    {
      key: 'uom',
      label: 'UOM',
      width: '160px',
      render: (line, i) => (
        <Input
          value={line.uom}
          onChange={(e) => {
            updateLine(i, 'uom', e.target.value)
          }}
        />
      ),
    },
    {
      key: 'qty',
      label: 'Qty',
      width: '80px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.qty}
          onChange={(e) => {
            updateLine(i, 'qty', e.target.value)
          }}
        />
      ),
    },
    {
      key: 'unit_price',
      label: 'Unit Price',
      width: '100px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(e) => {
            updateLine(i, 'unit_price', e.target.value)
          }}
        />
      ),
    },
    {
      key: 'requested_currency_code',
      label: 'Currency',
      width: '90px',
      render: (line, i) => (
        <Select
          value={line.requested_currency_code}
          onChange={(e) => {
            updateLine(i, 'requested_currency_code', e.target.value)
          }}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'total',
      label: 'Total',
      width: '90px',
      render: (line) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: theme.textPrimary,
            padding: '0 4px',
          }}
        >
          {(parseFloat(line.qty || '0') * parseFloat(line.unit_price || '0')).toLocaleString()}
        </span>
      ),
    },
  ]

  const linkedProject = projects.find((p) => p.id === linkedProjectId)
  const linkedMo = mos.find((m: { id: string; mo_number: string }) => m.id === linkedMoId)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="New Purchase Order"
        subtitle="Create a purchase order"
        backPath="/procurement/purchase-orders"
        actions={
          <Button
            type="button"
            variant="primary"
            icon={<IconCheckCircle size={16} />}
            loading={loading}
            onClick={() => formRef.current?.requestSubmit()}
          >
            Create Purchase Order
          </Button>
        }
      />

      <form ref={formRef} onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* Left column ~70%: Order Details */}
          <div style={{ flex: '2 1 560px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: theme.textPrimary,
                }}
              >
                <span style={{ color: theme.textMuted, display: 'flex' }}>
                  <IconDocument />
                </span>
                Order Details
              </div>

              {/* Row 1: Purpose + Project/MO + Delivery Destination */}
              <div
                data-tour="po-purpose-row"
                style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}
              >
                <div style={{ flex: '1 1 200px' }}>
                  <Select
                    label="Purchase Purpose"
                    value={purpose}
                    onChange={(e) => {
                      setPurpose(e.target.value as 'stock' | 'project' | 'manufacturing')
                    }}
                  >
                    <option value="stock">General Stock</option>
                    <option value="project">Project Supply</option>
                    <option value="manufacturing">Manufacturing / BOM</option>
                  </Select>
                </div>
                {purpose === 'project' && (
                  <div style={{ flex: '1 1 200px' }}>
                    <SearchableSelect
                      label="Project"
                      value={linkedProjectId}
                      onChange={(v) => {
                        setLinkedProjectId(v)
                      }}
                      options={projectOptions}
                      placeholder={isTourMode ? 'Not needed for this walkthrough' : 'Search project…'}
                      minDropdownWidth={360}
                      disabled={isTourMode}
                    />
                  </div>
                )}
                {purpose === 'project' && (
                  <div style={{ flex: '1 1 200px' }}>
                    <Select
                      label="Delivery Destination"
                      value={deliveryDestination}
                      onChange={(e) => {
                        setDeliveryDestination(e.target.value as 'inventory' | 'jobsite')
                      }}
                    >
                      <option value="inventory">Delivered to inventory</option>
                      <option value="jobsite">Delivered directly to the jobsite</option>
                    </Select>
                  </div>
                )}
                {purpose === 'manufacturing' && (
                  <div style={{ flex: '1 1 200px' }}>
                    <Select
                      label="Manufacturing Order"
                      value={linkedMoId}
                      onChange={(e) => {
                        setLinkedMoId(e.target.value)
                      }}
                      required
                    >
                      <option value="">Select MO…</option>
                      {mos.map((m: { id: string; mo_number: string; product_name?: string }) => (
                        <option key={m.id} value={m.id}>
                          {m.mo_number}
                          {m.product_name ? ` — ${m.product_name}` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {/* Row 2: Vendor + Currency + Branch */}
              <div
                data-tour="po-vendor-row"
                style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}
              >
                <div style={{ flex: '1 1 200px' }}>
                  <SearchableSelect
                    label="Vendor (optional)"
                    value={form.vendor_id}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, vendor_id: v }))
                    }}
                    options={[
                      { value: '', label: 'Select vendor… (optional — can be set later)' },
                      ...vendors.map((v: { id: string; name: string }) => ({
                        value: v.id,
                        label: v.name,
                      })),
                    ]}
                    placeholder="Search vendor…"
                    minDropdownWidth={320}
                  />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <Select
                    label="Currency"
                    value={form.currency_code}
                    onChange={(e) => {
                      setCurrencyTouched(true)
                      setForm((f) => ({ ...f, currency_code: e.target.value }))
                    }}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                {branches.length > 0 && (
                  <div style={{ flex: '1 1 200px' }}>
                    <Select
                      label="Branch *"
                      value={form.branch_id}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, branch_id: e.target.value }))
                      }}
                    >
                      <option value="">Select branch…</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {/* Row 3: Analytic Account + Expected Delivery + FX Rate */}
              <div
                data-tour="po-delivery-row"
                style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}
              >
                <div style={{ flex: '1 1 180px' }}>
                  <Select
                    label="Analytic Account"
                    value={form.analytic_account_id}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, analytic_account_id: e.target.value }))
                    }}
                  >
                    <option value="">None</option>
                    {analytics.map((a: { id: string; name: string }) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <Input
                    label="Expected Delivery"
                    type="date"
                    value={form.expected_delivery_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <Input
                    label={`FX Rate (1 ${form.currency_code} = ? ${baseCurrency})`}
                    type="number"
                    step="0.0001"
                    min="0"
                    disabled={form.currency_code === baseCurrency}
                    value={form.fx_rate}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, fx_rate: e.target.value }))
                    }}
                  />
                  {form.currency_code !== baseCurrency &&
                    !fxRates.some((r) => r.currency_code === form.currency_code) && (
                      <div style={{ fontSize: '11px', color: theme.warning, marginTop: '3px' }}>
                        No rate configured for {form.currency_code} — set one in Settings → PO
                        Exchange Rates, or enter it manually here.
                      </div>
                    )}
                </div>
              </div>

              {/* Row 4: Received By + Priority */}
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <SearchableSelect
                    label="Received By"
                    value={form.assigned_receiver_id}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, assigned_receiver_id: v }))
                    }}
                    options={employeeOptions}
                    placeholder="Search employee…"
                    minDropdownWidth={320}
                  />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: theme.textSecondary,
                      marginBottom: '4px',
                    }}
                  >
                    Priority
                  </div>
                  <div style={{ display: 'flex', gap: '8px', height: '36px' }}>
                    {(['low', 'high', 'emergency'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setPriority(p)
                        }}
                        style={{
                          padding: '0 14px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          border: `1px solid ${priority === p ? PRIORITY_COLOR[p] : theme.borderInput}`,
                          background: priority === p ? PRIORITY_COLOR[p] : theme.bgSurface,
                          color: priority === p ? '#ffffff' : theme.textMuted,
                          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                        }}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                  {priority === 'emergency' && (
                    <div style={{ fontSize: '11px', color: BRAND_RED, marginTop: '5px' }}>
                      Skips inventory check, store &amp; market pricing — goes direct to approval.
                    </div>
                  )}
                </div>
              </div>

              <Textarea
                label="Notes"
                value={form.notes}
                onChange={(e) => {
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }}
                rows={2}
              />
            </Card>
          </div>

          {/* Right column ~30%: Order Summary */}
          <div style={{ flex: '1 1 280px', display: 'flex' }}>
            <Card style={{ padding: '24px', position: 'sticky', top: '20px', width: '100%' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 600,
                  fontSize: '15px',
                  color: theme.textPrimary,
                  marginBottom: '16px',
                }}
              >
                <span style={{ color: theme.textMuted, display: 'flex' }}>
                  <IconBarChart />
                </span>
                Order Summary
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                {[
                  { label: 'Line Items', value: String(realLines.length) },
                  { label: 'Total Qty', value: totalQty.toLocaleString() },
                  {
                    label: 'Subtotal',
                    value: `${subtotal.toLocaleString()} ${form.currency_code}`,
                    color: BRAND_GREEN,
                    // Other currencies among the lines aren't converted at
                    // this stage, so they're broken out here instead of
                    // being silently added into the header-currency figure.
                    extra: otherCurrencySubtotals.map(
                      ([cur, amt]) => `+ ${amt.toLocaleString()} ${cur}`,
                    ),
                  },
                  {
                    label: 'Priority',
                    value: priority.charAt(0).toUpperCase() + priority.slice(1),
                    color: PRIORITY_COLOR[priority],
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      background: theme.bgCanvas,
                      border: `1px solid ${theme.border}`,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: theme.textMuted,
                        marginBottom: '6px',
                      }}
                    >
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: kpi.color ?? theme.textPrimary,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {kpi.value}
                    </div>
                    {kpi.extra?.map((line) => (
                      <div
                        key={line}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          marginTop: '2px',
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>
                {purpose === 'project' ? (
                  <>
                    For project{' '}
                    <strong style={{ color: theme.textPrimary }}>
                      {linkedProject?.code ?? '— not selected —'}
                    </strong>
                  </>
                ) : purpose === 'manufacturing' ? (
                  <>
                    For manufacturing order{' '}
                    <strong style={{ color: theme.textPrimary }}>
                      {linkedMo?.mo_number ?? '— not selected —'}
                    </strong>
                  </>
                ) : (
                  'General stock purchase — not linked to a project or MO'
                )}
              </div>
              {form.currency_code !== baseCurrency && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                  ≈{' '}
                  <strong style={{ color: theme.textPrimary }}>
                    {estimatedBaseTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </strong>{' '}
                  {baseCurrency} at the current FX rate
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Order Lines */}
        <Card style={{ marginTop: '20px' }} data-tour="po-lines-card">
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                fontSize: '15px',
                color: theme.textPrimary,
              }}
            >
              <span style={{ color: theme.textMuted, display: 'flex' }}>
                <IconBox />
              </span>
              Order Lines
            </div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
              Add each item you are ordering, with quantity and price.
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <LineItemEditor
              fields={lineFields}
              rows={lines}
              onRemoveRow={(idx) => {
                setLines((p) => p.filter((_, i) => i !== idx))
              }}
              removeDisabled={() => lines.length <= 1}
            />
          </div>

          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <Button
              data-tour="po-add-line"
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setLines((p) => [...p, emptyLine(form.currency_code)])
              }}
            >
              + Add Line
            </Button>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: theme.textPrimary,
                fontFamily: 'monospace',
              }}
            >
              Total: {subtotal.toLocaleString()} {form.currency_code}
              {otherCurrencySuffix}
            </span>
          </div>
        </Card>

        {/* Sticky footer action bar */}
        <div
          style={{
            position: 'sticky',
            bottom: '0',
            marginTop: '20px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px',
            boxShadow: '0 -6px 20px rgba(15,23,42,0.08)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            zIndex: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  color: BRAND_BLUE,
                  display: 'flex',
                  padding: '8px',
                  borderRadius: '8px',
                  background: '#EFF6FF',
                }}
              >
                <IconBox size={18} />
              </span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  {realLines.length} Line Item{realLines.length === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  {totalQty.toLocaleString()} units total
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  color: BRAND_GREEN,
                  display: 'flex',
                  padding: '8px',
                  borderRadius: '8px',
                  background: '#F0FDF4',
                }}
              >
                <IconCheckCircle size={18} />
              </span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  Subtotal: {subtotal.toLocaleString()} {form.currency_code}
                  {otherCurrencySuffix}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                navigate('/procurement/purchase-orders')
              }}
            >
              Cancel
            </Button>
            <Button
              data-tour="submit-po-btn"
              variant="primary"
              type="submit"
              loading={loading}
              icon={<IconCheckCircle size={16} />}
              style={{
                background: BRAND_BLUE,
                border: `1px solid ${BRAND_BLUE}`,
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              Create Purchase Order
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
