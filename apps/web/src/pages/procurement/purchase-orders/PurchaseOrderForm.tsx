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
import { COMPANY_BRANCHES_QUERY } from '../../../graphql/admin'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { useToastStore } from '../../../store/toastStore'

interface POLine {
  product_id: string
  description: string
  qty: string
  unit_price: string
  uom: string
}

const emptyLine = (): POLine => ({
  product_id: '',
  description: '',
  qty: '1',
  unit_price: '0',
  uom: 'pc',
})

interface FundingAdvance {
  id: string
  advance_number: string
  amount: number
  outstanding_amount: number
  currency_code: string
  status: string
}

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

export default function PurchaseOrderForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [searchParams] = useSearchParams()

  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')

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
  const [purpose, setPurpose] = useState<'stock' | 'project' | 'manufacturing'>('stock')
  const [priority, setPriority] = useState<'low' | 'high' | 'emergency'>('low')
  const [linkedProjectId, setLinkedProjectId] = useState('')
  const [linkedMoId, setLinkedMoId] = useState('')
  const [lines, setLines] = useState<POLine[]>([emptyLine()])
  const [fundingSource, setFundingSource] = useState<'vendor_ap' | 'employee_advance'>('vendor_ap')
  const [fundingEmployeeId, setFundingEmployeeId] = useState('')
  const [fundingAdvanceId, setFundingAdvanceId] = useState('')
  const [fundingAdvances, setFundingAdvances] = useState<FundingAdvance[]>([])

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
        if (parsed.length > 0) setLines(parsed)
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('po_prefill_lines')
    }
  }, [searchParams])

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

  // Employee-advance funding: settleable advances for the selected employee.
  // REST, not GraphQL — Employee Advances is a REST-only module (see
  // services/finance/src/routes/employee-advances.ts).
  useEffect(() => {
    if (fundingSource !== 'employee_advance' || !fundingEmployeeId) {
      setFundingAdvances([])
      setFundingAdvanceId('')
      return
    }
    let cancelled = false
    void api
      .get<FundingAdvance[]>('/finance/advances', { params: { employee_id: fundingEmployeeId } })
      .then((res) => {
        if (cancelled) return
        const settleable = res.data.filter((a) =>
          ['approved', 'partially_settled'].includes(a.status),
        )
        setFundingAdvances(settleable)
        // No ambiguity to ask about when there's only one — pre-fill it,
        // but only if nothing's been picked yet.
        if (settleable.length === 1) {
          setFundingAdvanceId((prev) => prev || settleable[0].id)
        }
      })
      .catch(() => {
        /* handled */
      })
    return () => {
      cancelled = true
    }
  }, [fundingSource, fundingEmployeeId])

  const vendors = vendorsData?.vendors ?? []
  const analytics = analyticsData?.analyticAccounts ?? []
  const products: { id: string; sku: string; name: string; uom: string }[] =
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
    user_id?: string | null
  }[] = employeesData?.employees ?? []
  const branches: {
    id: string
    name: string
    isActive: boolean
    defaultProcurementUserId?: string | null
  }[] = (branchesData?.companyBranches ?? []).filter((b: { isActive: boolean }) => b.isActive)

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

  // Employee-advance POs only: default "Employee" itself to the selected
  // branch's existing default procurement buyer — the same person is who's
  // whose advance funds the PO and who'll tick each line bought once
  // approved, not a separate pick. Only fills an empty picker, so a manual
  // choice is never overwritten.
  useEffect(() => {
    if (fundingSource !== 'employee_advance' || !form.branch_id || fundingEmployeeId) return
    const branch = branches.find((b) => b.id === form.branch_id)
    if (!branch?.defaultProcurementUserId) return
    const match = employees.find((e) => e.user_id === branch.defaultProcurementUserId)
    if (match) {
      setFundingEmployeeId(match.id)
    }
  }, [fundingSource, form.branch_id, branches, employees, fundingEmployeeId])

  const subtotal = lines.reduce(
    (s, l) => s + parseFloat(l.qty || '0') * parseFloat(l.unit_price || '0'),
    0,
  )

  function updateLine(i: number, key: keyof POLine, value: string) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l
        const updated = { ...l, [key]: value }
        if (key === 'product_id') {
          if (value) {
            const product = products.find((p) => p.id === value)
            if (product) {
              updated.description = product.name
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
    if (purpose !== 'manufacturing' && !form.vendor_id) {
      addToast({ type: 'error', message: 'Please select a vendor' })
      return
    }
    if (purpose === 'project' && !linkedProjectId) {
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
    if (fundingSource === 'employee_advance' && !fundingAdvanceId) {
      addToast({ type: 'error', message: 'Please select an advance to fund this PO' })
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
        priority,
        assigned_receiver_id: form.assigned_receiver_id || undefined,
        branch_id: form.branch_id || undefined,
        linkedProjectId: purpose === 'project' ? linkedProjectId || undefined : undefined,
        linkedMoId: purpose === 'manufacturing' ? linkedMoId || undefined : undefined,
        fundingSource,
        fundingAdvanceId: fundingSource === 'employee_advance' ? fundingAdvanceId : undefined,
        lines: lines
          .filter((l) => l.description || l.product_id)
          .map((l) => ({
            product_id: l.product_id || undefined,
            description: l.description,
            qty: parseFloat(l.qty),
            unit_price: parseFloat(l.unit_price),
            uom: l.uom,
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

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title="New Purchase Order"
        subtitle="Create a purchase order"
        backPath="/procurement/purchase-orders"
      />

      <form onSubmit={handleSubmit}>
        <Card
          style={{
            marginTop: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Row 1: Purpose + Project/MO */}
          <div
            data-tour="po-purpose-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
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
            {purpose === 'project' && (
              <SearchableSelect
                label="Project"
                value={linkedProjectId}
                onChange={(v) => {
                  setLinkedProjectId(v)
                }}
                options={projectOptions}
                placeholder="Search project…"
                minDropdownWidth={360}
              />
            )}
            {purpose === 'manufacturing' && (
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
            )}
          </div>

          {/* Row 2: Vendor + Currency */}
          <div
            data-tour="po-vendor-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <SearchableSelect
              label={purpose === 'manufacturing' ? 'Vendor (optional)' : 'Vendor *'}
              value={form.vendor_id}
              onChange={(v) => {
                setForm((f) => ({ ...f, vendor_id: v }))
              }}
              options={[
                {
                  value: '',
                  label:
                    purpose === 'manufacturing' ? 'Select vendor… (optional)' : 'Select vendor…',
                },
                ...vendors.map((v: { id: string; name: string }) => ({
                  value: v.id,
                  label: v.name,
                })),
              ]}
              placeholder="Search vendor…"
              minDropdownWidth={320}
            />
            <Select
              label="Currency"
              value={form.currency_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, currency_code: e.target.value }))
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {branches.length > 0 && (
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
            )}
          </div>

          {/* Funding Source row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Select
              label="Funding Source"
              value={fundingSource}
              onChange={(e) => {
                setFundingSource(e.target.value as 'vendor_ap' | 'employee_advance')
              }}
            >
              <option value="vendor_ap">Vendor (Accounts Payable)</option>
              <option value="employee_advance">Employee Advance</option>
            </Select>
            {fundingSource === 'employee_advance' && (
              <>
                <SearchableSelect
                  label="Employee"
                  value={fundingEmployeeId}
                  onChange={(v) => {
                    setFundingEmployeeId(v)
                  }}
                  options={employeeOptions}
                  placeholder="Search employee…"
                  minDropdownWidth={320}
                />
                <Select
                  label="Advance *"
                  value={fundingAdvanceId}
                  onChange={(e) => {
                    setFundingAdvanceId(e.target.value)
                  }}
                >
                  <option value="">
                    {fundingEmployeeId ? 'Select advance…' : 'Select an employee first'}
                  </option>
                  {fundingAdvances.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.advance_number} — {Number(a.outstanding_amount).toLocaleString()}{' '}
                      {a.currency_code} outstanding
                    </option>
                  ))}
                </Select>
              </>
            )}
          </div>
          {fundingSource === 'employee_advance' && (
            <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
              Employee defaults to this branch's assigned procurement buyer — pick a branch above
              to fill it in, or search for someone else. Finance will assign a GL account and cost
              center to each line during audit review, so no need to pick those here.
            </p>
          )}

          {/* Row 3: Analytic Account + Expected Delivery + FX Rate */}
          <div
            data-tour="po-delivery-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '16px',
            }}
          >
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
            <Input
              label="Expected Delivery"
              type="date"
              value={form.expected_delivery_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))
              }}
            />
            <Input
              label="FX Rate"
              type="number"
              step="0.0001"
              min="0"
              value={form.fx_rate}
              onChange={(e) => {
                setForm((f) => ({ ...f, fx_rate: e.target.value }))
              }}
            />
          </div>

          {/* Row 4: Received By + Priority */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
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
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  marginBottom: '6px',
                }}
              >
                Priority
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['low', 'high', 'emergency'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPriority(p)
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      border: `1.5px solid ${
                        priority === p
                          ? p === 'emergency'
                            ? '#dc2626'
                            : p === 'high'
                              ? '#d97706'
                              : theme.accent
                          : theme.border
                      }`,
                      background:
                        priority === p
                          ? p === 'emergency'
                            ? '#fef2f2'
                            : p === 'high'
                              ? '#fff7ed'
                              : (theme.accentBg ?? '#eff6ff')
                          : 'transparent',
                      color:
                        priority === p
                          ? p === 'emergency'
                            ? '#dc2626'
                            : p === 'high'
                              ? '#d97706'
                              : theme.accent
                          : theme.textMuted,
                    }}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              {priority === 'emergency' && (
                <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '5px' }}>
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

        {/* Lines */}
        <div data-tour="po-lines-card">
          <Card style={{ marginTop: '16px' }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.border}`,
                fontWeight: 600,
                color: theme.textPrimary,
              }}
            >
              Order Lines
            </div>
            <div style={{ margin: '12px' }}>
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
                padding: '8px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: `1px solid ${theme.border}`,
              }}
            >
              <Button
                data-tour="po-add-line"
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setLines((p) => [...p, emptyLine()])
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
              </span>
            </div>
          </Card>
        </div>

        <div
          style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}
        >
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              navigate('/procurement/purchase-orders')
            }}
          >
            Cancel
          </Button>
          <Button data-tour="submit-po-btn" variant="primary" type="submit" loading={loading}>
            Create Purchase Order
          </Button>
        </div>
      </form>
    </div>
  )
}
