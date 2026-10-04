import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_REQUISITION } from '../../../graphql/requisitions'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { MANUFACTURING_ORDERS_QUERY } from '../../../graphql/manufacturing'
import { COMPANY_BRANCHES_QUERY } from '../../../graphql/admin'
import { EMPLOYEES_QUERY } from '../../../graphql/hr'
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
import { api } from '../../../lib/axios'
import type { CompanyBranchesQuery, CompanyBranchesQueryVariables, CreateRequisitionMutation, CreateRequisitionMutationVariables, EmployeesQuery, EmployeesQueryVariables, ManufacturingOrdersQuery, ManufacturingOrdersQueryVariables, ProductsQuery, ProductsQueryVariables, ProjectsQuery, ProjectsQueryVariables } from '../../../graphql/generated'

// Expense-purpose lines don't carry a product — they carry an expense
// category, which resolves to a GL account server-side exactly the way
// MyExpenseClaimsPage's self-service "New Claim" form already worked
// (POST /finance/expense-claims/request-self). Reusing that endpoint
// directly — rather than teaching createRequisition's po_lines-shaped
// schema about categories/GL accounts — means expense requisitions post
// through the exact same, already-hardened accounting path (including the
// fn_enforce_postable_account trigger) instead of a second, parallel one.
interface ExpenseLineDraft {
  expense_date: string
  category_id: string
  description: string
  amount: string
  // Only used/shown when expenseSource === 'advance' — a settlement line
  // defaults to the advance's own project but can override it per line
  // (one advance commonly covers spend across more than one project over
  // its life, e.g. fuel for several job sites). Left blank on the
  // 'reimburse' branch, which instead has one project for the whole claim.
  project_id?: string
}

const emptyExpenseLine = (): ExpenseLineDraft => ({
  expense_date: new Date().toISOString().slice(0, 10),
  category_id: '',
  description: '',
  amount: '',
  project_id: '',
})

interface ExpenseCategory {
  id: string
  name: string
}

// An expense is either paid out of an existing cash advance (settle it —
// no reimbursement owed, the company already gave the cash up front) or
// paid out of pocket (reimburse it). Both already exist as fully built,
// independent accounting paths — Employee Advances → Settlement and
// Expense Claims, respectively — this just gives both a single front door.
// Project/cost-center attribution is already wired into both: a
// reimbursement claim via its own (optional) project_id, a settlement via
// its advance's own project_id/cost_center_id as the per-line default
// (overridable per line — see ExpenseLineDraft.project_id above).
type ExpenseSource = 'reimburse' | 'advance'

interface MyAdvance {
  id: string
  advance_number: string
  purpose: string | null
  outstanding_amount: number
  currency_code: string
  status: string
}

// No GL account / cost center fields here — a requisition's requester has
// no reason to know either, and both already default automatically
// server-side (createRequisition: project's cost center for Project
// Supply, else the branch's; system_configuration's default account) when
// left unset. That's the only path now — nothing here can override it.
interface ReqLineDraft {
  product_id: string
  description: string
  qty: string
  unit_price: string
  uom: string
}

const emptyLine = (): ReqLineDraft => ({
  product_id: '',
  description: '',
  qty: '1',
  unit_price: '0',
  uom: 'pc',
})

export default function RequisitionForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')
  // Onboarding tour: the synthetic walkthrough has no real project/branch
  // to pick, so required-field validation is bypassed and the Project
  // picker disabled below — mirrors PurchaseOrderForm's own isTourMode
  // handling exactly.
  const isTourMode = useTourStore((s) => s.isActive)
  const [searchParams] = useSearchParams()

  const [purpose, setPurpose] = useState<'stock' | 'project' | 'manufacturing' | 'expense'>('stock')
  const [projectId, setProjectId] = useState('')
  const [deliveryDestination, setDeliveryDestination] = useState<'' | 'inventory' | 'jobsite'>('')
  const [linkedMoId, setLinkedMoId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [assignedReceiverId, setAssignedReceiverId] = useState('')
  const [priority, setPriority] = useState<'low' | 'high' | 'emergency'>('low')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ReqLineDraft[]>([emptyLine()])
  const [expenseCurrency, setExpenseCurrency] = useState('IQD')
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>([emptyExpenseLine()])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [submittingExpense, setSubmittingExpense] = useState(false)
  const [expenseSource, setExpenseSource] = useState<ExpenseSource>('reimburse')
  const [myAdvances, setMyAdvances] = useState<MyAdvance[]>([])
  const [selectedAdvanceId, setSelectedAdvanceId] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (purpose !== 'expense' || expenseCategories.length > 0) return
    api
      .get<ExpenseCategory[]>('/finance/expense-claims/categories/mine')
      .then((r) => { setExpenseCategories(r.data); })
      .catch(() => { /* handled inline — line's category select just stays empty */ })
  }, [purpose, expenseCategories.length])

  useEffect(() => {
    if (purpose !== 'expense' || expenseSource !== 'advance' || myAdvances.length > 0) return
    api
      .get<MyAdvance[]>('/finance/advances/mine')
      .then((r) => { setMyAdvances(r.data); })
      .catch(() => { /* handled inline — advance picker just stays empty */ })
  }, [purpose, expenseSource, myAdvances.length])

  const eligibleAdvances = myAdvances.filter(
    (a) => ['approved', 'partially_settled'].includes(a.status) && Number(a.outstanding_amount) > 0,
  )
  const selectedAdvance = eligibleAdvances.find((a) => a.id === selectedAdvanceId)

  // Pre-fill from URL — mirrors PurchaseOrderForm's own ?projectId=/?moId=
  // handling, for entry points that already know which project or
  // manufacturing order this is for (ProjectDetail's "+ New Requisition",
  // ManufacturingOrderDetail's "Create PO for missing items"). The MO side
  // also carries specific line items via sessionStorage, written by
  // ManufacturingOrderDetail right before it navigates here — its own key
  // (req_prefill_lines), separate from PurchaseOrderForm's po_prefill_lines,
  // since that form's own manufacturing path is still reachable manually
  // and shouldn't share state with this one.
  useEffect(() => {
    const urlProjectId = searchParams.get('projectId')
    const urlMoId = searchParams.get('moId')
    if (urlMoId) {
      setPurpose('manufacturing')
      setLinkedMoId(urlMoId)
    } else if (urlProjectId) {
      setPurpose('project')
      setProjectId(urlProjectId)
    }
    const prefill = sessionStorage.getItem('req_prefill_lines')
    if (prefill) {
      try {
        const parsed = JSON.parse(prefill) as ReqLineDraft[]
        if (parsed.length > 0) setLines(parsed)
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('req_prefill_lines')
    }
  }, [searchParams])

  // A requisition line is a request to source/buy something — the point is
  // finding the item, not managing whose catalog it lives in — so also
  // surface the central warehouse's own products (they may never have been
  // interco'd into this company yet).
  const { data: productsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, {
    variables: { includeCentralWarehouse: true },
  })
  const { data: projectsData } = useQuery<ProjectsQuery, ProjectsQueryVariables>(PROJECTS_QUERY, {
    // Server default is 20 (newest-created first) — this picker needs the
    // whole company list, not just recent ones, so an older/already-approved
    // project isn't invisible. 100 is the resolver's actual hard cap
    // (Math.min(100, ...)), same value already used the same way by
    // MaterialReturnsPage/StoreOutPage/POPositionsPage.
    variables: { includeAll: true, limit: 100 },
    skip: purpose !== 'project' && purpose !== 'expense',
  })
  const { data: mosData } = useQuery<ManufacturingOrdersQuery, ManufacturingOrdersQueryVariables>(MANUFACTURING_ORDERS_QUERY, {
    variables: {},
    skip: purpose !== 'manufacturing',
  })
  const { data: branchesData } = useQuery<CompanyBranchesQuery, CompanyBranchesQueryVariables>(COMPANY_BRANCHES_QUERY, {
    variables: { companyId: currentCompanyId },
    skip: !currentCompanyId,
  })
  const { data: employeesData } = useQuery<EmployeesQuery, EmployeesQueryVariables>(EMPLOYEES_QUERY, { variables: { is_active: true } })
  const [createRequisition, { loading }] = useMutation<CreateRequisitionMutation, CreateRequisitionMutationVariables>(CREATE_REQUISITION)

  const products: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    (productsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const projects: { id: string; code: string; name: string }[] = projectsData?.projects.data ?? []
  const mos: { id: string; mo_number: string; product_name?: string | null }[] =
    mosData?.manufacturingOrders ?? []
  const branches: { id: string; name: string; isActive: boolean }[] = (
    branchesData?.companyBranches ?? []
  ).filter((b: { isActive: boolean }) => b.isActive)
  const employees: { id: string; first_name: string; last_name: string; employee_number: string | null }[] =
    (employeesData?.employees ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const productOptions = [
    { value: '', label: 'Custom item' },
    ...products.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku, keywords: p.name_ar ?? undefined })),
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
      sublabel: e.employee_number ?? undefined,
    })),
  ]

  const updateLine = (idx: number, field: keyof ReqLineDraft, value: string) => {
    setLines((prev) => {
      const next = [...prev]
      const line = { ...next[idx], [field]: value }
      if (field === 'product_id' && value) {
        const p = products.find((pp) => pp.id === value)
        if (p) {
          line.description = p.name
          line.uom = p.uom
        }
      }
      next[idx] = line
      return next
    })
  }

  const lineFields: LineItemField<ReqLineDraft>[] = [
    {
      key: 'product',
      label: 'Product / Description',
      render: (line, i) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <SearchableSelect
            value={line.product_id}
            onChange={(v) => { updateLine(i, 'product_id', v); }}
            options={productOptions}
            placeholder="Search by name or SKU…"
            minDropdownWidth={400}
          />
          <Input
            value={line.description}
            onChange={(e) => { updateLine(i, 'description', e.target.value); }}
            placeholder="Description"
          />
        </div>
      ),
    },
    {
      key: 'uom',
      label: 'UOM',
      width: '110px',
      render: (line, i) => (
        <Input value={line.uom} onChange={(e) => { updateLine(i, 'uom', e.target.value); }} />
      ),
    },
    {
      key: 'qty',
      label: 'Qty',
      width: '90px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.qty}
          onChange={(e) => { updateLine(i, 'qty', e.target.value); }}
        />
      ),
    },
    {
      key: 'unit_price',
      label: 'Est. Unit Price',
      width: '120px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(e) => { updateLine(i, 'unit_price', e.target.value); }}
        />
      ),
    },
    {
      key: 'total',
      label: 'Total',
      width: '90px',
      render: (line) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textPrimary, padding: '0 4px' }}>
          {(parseFloat(line.qty || '0') * parseFloat(line.unit_price || '0')).toLocaleString()}
        </span>
      ),
    },
  ]

  function updateExpenseLine(idx: number, field: keyof ExpenseLineDraft, value: string) {
    setExpenseLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const expenseLineFields: LineItemField<ExpenseLineDraft>[] = [
    {
      key: 'expense_date',
      label: 'Date',
      width: '140px',
      render: (line, i) => (
        <Input
          type="date"
          value={line.expense_date}
          onChange={(e) => { updateExpenseLine(i, 'expense_date', e.target.value); }}
        />
      ),
    },
    {
      key: 'category_id',
      label: 'Category',
      width: '200px',
      render: (line, i) => (
        <Select
          value={line.category_id}
          onChange={(e) => { updateExpenseLine(i, 'category_id', e.target.value); }}
          options={[
            { value: '', label: '— Category —' },
            ...expenseCategories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      ),
    },
    ...(expenseSource === 'advance'
      ? [
          {
            key: 'project_id',
            label: 'Project (optional)',
            width: '180px',
            render: (line: ExpenseLineDraft, i: number) => (
              <Select
                value={line.project_id ?? ''}
                onChange={(e) => { updateExpenseLine(i, 'project_id', e.target.value); }}
                options={[
                  {
                    value: '',
                    label: selectedAdvance?.purpose ? `Default (${selectedAdvance.purpose})` : 'Default (advance’s own)',
                  },
                  ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
                ]}
              />
            ),
          } satisfies LineItemField<ExpenseLineDraft>,
        ]
      : []),
    {
      key: 'description',
      label: 'Description',
      render: (line, i) => (
        <Input
          value={line.description}
          onChange={(e) => { updateExpenseLine(i, 'description', e.target.value); }}
          placeholder="What was this for?"
        />
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      width: '120px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.amount}
          onChange={(e) => { updateExpenseLine(i, 'amount', e.target.value); }}
        />
      ),
    },
  ]

  async function handleExpenseSubmit() {
    const realExpenseLines = expenseLines.filter((l) => l.amount && l.category_id)
    if (realExpenseLines.length === 0) {
      addToast({ type: 'error', message: 'Add at least one line with a category and amount' })
      return
    }
    if (expenseSource === 'advance' && !selectedAdvanceId) {
      addToast({ type: 'error', message: 'Select which advance this was paid from' })
      return
    }
    if (expenseSource === 'advance' && selectedAdvance) {
      const total = realExpenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
      if (total > Number(selectedAdvance.outstanding_amount) + 0.0001) {
        addToast({
          type: 'error',
          message: `Total exceeds this advance's outstanding amount (${selectedAdvance.outstanding_amount.toLocaleString()} ${selectedAdvance.currency_code})`,
        })
        return
      }
    }
    setSubmittingExpense(true)
    try {
      if (expenseSource === 'advance') {
        await api.post('/finance/advances/settlements/request-self', {
          advance_id: selectedAdvanceId,
          description: notes || undefined,
          lines: realExpenseLines.map((l) => ({
            line_date: l.expense_date,
            category_id: l.category_id,
            description:
              l.description || expenseCategories.find((c) => c.id === l.category_id)?.name || 'Expense',
            amount: parseFloat(l.amount) || 0,
            project_id: l.project_id || undefined,
          })),
        })
        addToast({ type: 'success', message: 'Settlement submitted for approval' })
      } else {
        await api.post('/finance/expense-claims/request-self', {
          description: notes || undefined,
          currency_code: expenseCurrency,
          project_id: projectId || undefined,
          lines: realExpenseLines.map((l) => ({
            expense_date: l.expense_date,
            category_id: l.category_id,
            description: l.description || undefined,
            amount: parseFloat(l.amount) || 0,
          })),
        })
        addToast({ type: 'success', message: 'Expense requisition submitted for approval' })
      }
      navigate('/procurement/requisitions')
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } }
      addToast({
        type: 'error',
        message: apiError.response?.data?.error?.message ?? (err as Error).message,
      })
    } finally {
      setSubmittingExpense(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (purpose === 'expense') {
      await handleExpenseSubmit()
      return
    }
    if (!isTourMode) {
      if (purpose === 'project' && !projectId) {
        addToast({ type: 'error', message: 'Please select a project' })
        return
      }
      if (purpose === 'project' && !deliveryDestination) {
        addToast({ type: 'error', message: 'Please select a delivery destination' })
        return
      }
      if (purpose === 'manufacturing' && !linkedMoId) {
        addToast({ type: 'error', message: 'Please select a manufacturing order' })
        return
      }
      if (branches.length > 0 && !branchId) {
        addToast({ type: 'error', message: 'Please select a branch' })
        return
      }
    }
    const realLines = lines.filter((l) => l.description || l.product_id)
    if (realLines.length === 0) {
      addToast({ type: 'error', message: 'Add at least one line' })
      return
    }
    try {
      const input = {
        purpose,
        project_id: purpose === 'project' ? projectId || undefined : undefined,
        delivery_destination: purpose === 'project' ? deliveryDestination || undefined : undefined,
        linked_mo_id: purpose === 'manufacturing' ? linkedMoId || undefined : undefined,
        priority,
        branch_id: branchId || undefined,
        assigned_receiver_id: assignedReceiverId || undefined,
        notes: notes || undefined,
        expected_delivery_date: expectedDeliveryDate || undefined,
        lines: realLines.map((l) => ({
          product_id: l.product_id || undefined,
          description: l.description,
          qty: parseFloat(l.qty) || 0,
          unit_price: parseFloat(l.unit_price) || 0,
          uom: l.uom,
        })),
      }
      const result = await createRequisition({ variables: { input } })
      addToast({ type: 'success', message: 'Requisition created' })
      const newId = result.data?.createRequisition.id
      navigate(newId ? `/procurement/requisitions/${newId}` : '/procurement/requisitions')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  // Summary sidebar stats — mirrors PurchaseOrderForm's own Order Summary
  // computation (realLines/totalQty), just without a per-line currency
  // breakdown since the creation form never collects one (Requisition
  // lines only pick up a currency later, at market pricing).
  const realLines = lines.filter((l) => l.description || l.product_id)
  const totalQty = realLines.reduce((s, l) => s + (parseFloat(l.qty || '0') || 0), 0)
  const estTotal = realLines.reduce(
    (s, l) => s + (parseFloat(l.qty || '0') || 0) * (parseFloat(l.unit_price || '0') || 0),
    0,
  )
  const selectedProject = projects.find((p) => p.id === projectId)
  const realExpenseLines = expenseLines.filter((l) => l.amount && l.category_id)
  const expenseTotal = realExpenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="New Requisition"
        subtitle="Request items to be sourced from stock or purchased"
        backPath="/procurement/requisitions"
        actions={
          <Button
            data-tour="submit-req-btn"
            type="button"
            variant="primary"
            loading={purpose === 'expense' ? submittingExpense : loading}
            onClick={() => formRef.current?.requestSubmit()}
          >
            Create Requisition
          </Button>
        }
      />

      <form ref={formRef} onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* Left column ~70%: Requisition Details — mirrors PurchaseOrderForm's own "Order Details" card */}
          <div style={{ flex: '2 1 560px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Card
          data-tour="req-details-card"
          style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}
        >
          <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>Requisition Details</div>
          <div
            data-tour="req-purpose-row"
            style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}
          >
            <div style={{ flex: '1 1 200px' }}>
              <Select
                label="Purpose"
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value as 'stock' | 'project' | 'manufacturing' | 'expense')
                }}
              >
                <option value="stock">General Stock</option>
                <option value="project">Project Supply</option>
                <option value="manufacturing">Manufacturing / BOM</option>
                <option value="expense">Expense</option>
              </Select>
            </div>
            {purpose === 'expense' ? (
              <div style={{ flex: '1 1 220px' }}>
                <Select
                  label="Paid"
                  value={expenseSource}
                  onChange={(e) => {
                    setExpenseSource(e.target.value as ExpenseSource)
                    setSelectedAdvanceId('')
                  }}
                >
                  <option value="reimburse">Out of pocket — reimburse me</option>
                  <option value="advance">From my cash advance</option>
                </Select>
              </div>
            ) : (
              <div style={{ flex: '1 1 200px' }}>
                <Select
                  label={branches.length > 0 ? 'Branch *' : 'Branch'}
                  value={branchId}
                  onChange={(e) => { setBranchId(e.target.value); }}
                  options={[{ value: '', label: 'Select branch…' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                />
              </div>
            )}
            {purpose !== 'expense' && (
              <div style={{ flex: '1 1 160px' }}>
                <Select
                  label="Priority"
                  value={priority}
                  onChange={(e) => { setPriority(e.target.value as 'low' | 'high' | 'emergency'); }}
                >
                  <option value="low">Low</option>
                  <option value="high">High</option>
                  <option value="emergency">Emergency</option>
                </Select>
              </div>
            )}
          </div>

          {purpose !== 'expense' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 200px' }}>
                <SearchableSelect
                  label="Received By"
                  value={assignedReceiverId}
                  onChange={setAssignedReceiverId}
                  options={employeeOptions}
                  placeholder="Search employee…"
                  minDropdownWidth={320}
                />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <Input
                  label="Expected Delivery (optional)"
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => { setExpectedDeliveryDate(e.target.value); }}
                />
              </div>
            </div>
          )}

          {purpose === 'expense' && expenseSource === 'reimburse' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <Select
                  label="Currency"
                  value={expenseCurrency}
                  onChange={(e) => { setExpenseCurrency(e.target.value); }}
                >
                  <option value="IQD">IQD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </Select>
              </div>
              <div style={{ flex: '1 1 240px' }}>
                <SearchableSelect
                  label="Project (optional)"
                  value={projectId}
                  onChange={setProjectId}
                  options={projectOptions}
                  placeholder="Search project…"
                  minDropdownWidth={360}
                />
              </div>
            </div>
          )}

          {purpose === 'expense' && expenseSource === 'advance' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 300px' }}>
                <Select
                  label="Which advance *"
                  value={selectedAdvanceId}
                  onChange={(e) => { setSelectedAdvanceId(e.target.value); }}
                  options={[
                    { value: '', label: 'Select advance…' },
                    ...eligibleAdvances.map((a) => ({
                      value: a.id,
                      label: `${a.advance_number} — ${Number(a.outstanding_amount).toLocaleString()} ${a.currency_code} outstanding${a.purpose ? ` (${a.purpose})` : ''}`,
                    })),
                  ]}
                />
                {eligibleAdvances.length === 0 && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                    No approved advance with an outstanding balance found on your account.
                  </div>
                )}
              </div>
            </div>
          )}

          {purpose === 'project' && (
            <div data-tour="req-project-row" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <SearchableSelect
                  label="Project *"
                  value={projectId}
                  onChange={setProjectId}
                  options={projectOptions}
                  placeholder={isTourMode ? 'Not needed for this walkthrough' : 'Search project…'}
                  minDropdownWidth={360}
                  disabled={isTourMode}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Select
                  label="Delivery Destination *"
                  value={deliveryDestination}
                  onChange={(e) => { setDeliveryDestination(e.target.value as '' | 'inventory' | 'jobsite'); }}
                >
                  <option value="">Select destination…</option>
                  <option value="inventory">Delivered to inventory</option>
                  <option value="jobsite">Delivered directly to the jobsite</option>
                </Select>
              </div>
            </div>
          )}

          {purpose === 'manufacturing' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <Select
                  label="Manufacturing Order *"
                  value={linkedMoId}
                  onChange={(e) => { setLinkedMoId(e.target.value); }}
                >
                  <option value="">Select MO…</option>
                  {mos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.mo_number}
                      {m.product_name ? ` — ${m.product_name}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          <div data-tour="req-notes">
            <Textarea label="Notes" value={notes} onChange={(e) => { setNotes(e.target.value); }} rows={2} />
          </div>
        </Card>
          </div>

          {/* Right column ~30%: Summary — mirrors PurchaseOrderForm's own sticky Order Summary sidebar */}
          <div style={{ flex: '1 1 280px', display: 'flex' }}>
            <Card
              data-tour="req-summary-sidebar"
              style={{ padding: '24px', position: 'sticky', top: '20px', width: '100%' }}
            >
              <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary, marginBottom: '16px' }}>
                Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {(purpose === 'expense'
                  ? [
                      { label: 'Line Items', value: String(realExpenseLines.length) },
                      { label: 'Total', value: `${expenseTotal.toLocaleString()} ${expenseCurrency}` },
                    ]
                  : [
                      { label: 'Line Items', value: String(realLines.length) },
                      { label: 'Total Qty', value: totalQty.toLocaleString() },
                      { label: 'Est. Total', value: estTotal.toLocaleString() },
                      {
                        label: 'Priority',
                        value: priority.charAt(0).toUpperCase() + priority.slice(1),
                      },
                    ]
                ).map((kpi) => (
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
                    <div style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, marginBottom: '6px' }}>
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: theme.textPrimary,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>
                {purpose === 'project' ? (
                  <>
                    For project{' '}
                    <strong style={{ color: theme.textPrimary }}>
                      {selectedProject?.code ?? '— not selected —'}
                    </strong>
                  </>
                ) : purpose === 'expense' ? (
                  expenseSource === 'advance'
                    ? "Submits for approval immediately — settles against the selected advance once approved, no reimbursement owed since you've already got the cash."
                    : 'Submits for approval immediately — Finance posts the reimbursement journal once approved.'
                ) : (
                  'General stock requisition — not linked to a project'
                )}
              </div>
            </Card>
          </div>
        </div>

        <Card data-tour="req-lines-card" style={{ marginTop: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>Lines</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
              {purpose === 'expense'
                ? expenseSource === 'advance'
                  ? "Add each expense — category decides the GL account; project and cost center come from the advance itself."
                  : 'Add each expense — category decides the GL account automatically.'
                : "Add each item you need — GL account and cost center are worked out automatically later and aren't something you need to set here."}
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {purpose === 'expense' ? (
              <LineItemEditor
                fields={expenseLineFields}
                rows={expenseLines}
                onRemoveRow={(idx) => { setExpenseLines((p) => p.filter((_, i) => i !== idx)); }}
                removeDisabled={() => expenseLines.length <= 1}
                onAddRow={() => { setExpenseLines((p) => [...p, emptyExpenseLine()]); }}
                addButtonDataTour="req-add-line-btn"
              />
            ) : (
              <LineItemEditor
                fields={lineFields}
                rows={lines}
                onRemoveRow={(idx) => { setLines((p) => p.filter((_, i) => i !== idx)); }}
                removeDisabled={() => lines.length <= 1}
                onAddRow={() => { setLines((p) => [...p, emptyLine()]); }}
                addButtonDataTour="req-add-line-btn"
              />
            )}
          </div>
        </Card>
      </form>
    </div>
  )
}
