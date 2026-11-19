import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_REQUISITION } from '../../../graphql/requisitions'
import { PRODUCTS_QUERY, MY_COMPANIES_QUERY } from '../../../graphql/inventory'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { MANUFACTURING_ORDERS_QUERY } from '../../../graphql/manufacturing'
import { COMPANY_BRANCHES_QUERY } from '../../../graphql/admin'
import { EMPLOYEES_QUERY, ATTACH_FILE } from '../../../graphql/hr'
import { REQUEST_UPLOAD_URL } from '../../../graphql/procurement'
import { useAuthStore } from '../../../store/authStore'
import { useTheme } from '../../../theme/ThemeContext'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { StickyActionBar } from '../../../components/ui/Button'
import { ActionButton } from '../../../components/ui/ActionButton'
import { SectionTitle } from '../../../components/procurement/SectionTitle'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Textarea } from '../../../components/ui/Textarea'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { PurposeCards, type PurposeCardOption } from '../../../components/procurement/PurposeCards'
import {
  RequirementsChecklist,
  type Requirement,
} from '../../../components/procurement/RequirementsChecklist'
import { useToastStore } from '../../../store/toastStore'
import { useTourStore } from '../../../store/tourStore'
import { api } from '../../../lib/axios'
import type { AttachFileMutation, AttachFileMutationVariables, CompanyBranchesQuery, CompanyBranchesQueryVariables, CreateRequisitionMutation, CreateRequisitionMutationVariables, EmployeesQuery, EmployeesQueryVariables, ManufacturingOrdersQuery, ManufacturingOrdersQueryVariables, MyCompaniesQuery, MyCompaniesQueryVariables, ProductsQuery, ProductsQueryVariables, ProjectsQuery, ProjectsQueryVariables, RequestUploadUrlMutation, RequestUploadUrlMutationVariables } from '../../../graphql/generated'

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
}

const emptyExpenseLine = (): ExpenseLineDraft => ({
  expense_date: new Date().toISOString().slice(0, 10),
  category_id: '',
  description: '',
  amount: '',
})

interface ExpenseCategory {
  id: string
  name: string
}

// How the expense actually gets paid — reimburse the employee, settle it
// against one of their advances, or pay it out of a petty cash float — is no
// longer this form's call. The employee just submits lines + receipts
// (always via /expense-claims/request-self); Finance decides funding on the
// claim's own detail page, after approving its legitimacy (POST
// /:id/post-payment). See that route for why.

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
  // Only a direct supply asks for it: every other requisition is priced later (market pricing sets the currency),
  // but a direct supply has no pricing step, so the line's currency is chosen here and stays.
  currency: string
}

const emptyLine = (currency = 'IQD'): ReqLineDraft => ({
  product_id: '',
  description: '',
  qty: '1',
  unit_price: '0',
  uom: 'pc',
  currency,
})

// The currencies a line can be priced in (the same list market pricing offers).
const LINE_CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED']

type RequisitionPurpose =
  | 'stock'
  | 'project'
  | 'direct_supply'
  | 'manufacturing'
  | 'expense'
  | 'advance'

// One drawing per purpose, 24x24, stroke only, so the card's icon takes the accent colour.
function PurposeIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const PURPOSE_ICONS: Record<RequisitionPurpose, React.ReactNode> = {
  stock: (
    <PurposeIcon>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </PurposeIcon>
  ),
  project: (
    <PurposeIcon>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4" />
    </PurposeIcon>
  ),
  direct_supply: (
    <PurposeIcon>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </PurposeIcon>
  ),
  manufacturing: (
    <PurposeIcon>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM17 18h1M12 18h1M7 18h1" />
    </PurposeIcon>
  ),
  expense: (
    <PurposeIcon>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11" />
    </PurposeIcon>
  ),
  advance: (
    <PurposeIcon>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </PurposeIcon>
  ),
}

export default function RequisitionForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  // One grid for every row of the details card: two equal columns that line up from row to row (flex rows with
  // different basis sizes put the second column at a different place on each row), one column on a phone.
  const detailsRow: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
    gap: isPhone ? '14px' : '18px 20px',
    alignItems: 'start',
  }
  const addToast = useToastStore((s) => s.addToast)
  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')
  // A company flagged requires_jobsite_delivery (see migration
  // 301_requires_jobsite_delivery) has no inventory of its own — every
  // project line goes straight to the jobsite, with no "Delivered to
  // Inventory" choice at all. Mirrors what createRequisition itself
  // already enforces server-side.
  const { data: companiesData } = useQuery<MyCompaniesQuery, MyCompaniesQueryVariables>(
    MY_COMPANIES_QUERY,
    { fetchPolicy: 'cache-first' },
  )
  const companyRequiresJobsiteDelivery =
    companiesData?.myCompanies?.find((c) => c.id === currentCompanyId)?.requires_jobsite_delivery ??
    false
  // Onboarding tour: the synthetic walkthrough has no real project/branch
  // to pick, so required-field validation is bypassed and the Project
  // picker disabled below — mirrors PurchaseOrderForm's own isTourMode
  // handling exactly.
  const isTourMode = useTourStore((s) => s.isActive)
  const [searchParams] = useSearchParams()

  const [purpose, setPurpose] = useState<RequisitionPurpose>('stock')
  // Expense and Advance are requests for MONEY, not goods: no branch, priority, receiver or delivery date, and the
  // request goes to Finance's own endpoint instead of creating a requisition.
  const isMoneyRequest = purpose === 'expense' || purpose === 'advance'
  // A direct supply is always tied to a project, delivered straight to the jobsite, and skips every pricing step: the
  // Est. Unit Price typed below is the price the approver sees.
  const isDirectSupply = purpose === 'direct_supply'
  const [projectId, setProjectId] = useState('')
  const [deliveryDestination, setDeliveryDestination] = useState<'' | 'inventory' | 'jobsite'>('')
  const [linkedMoId, setLinkedMoId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [assignedReceiverId, setAssignedReceiverId] = useState('')
  const [priority, setPriority] = useState<'low' | 'high' | 'emergency'>('low')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ReqLineDraft[]>([emptyLine()])
  // The currency of an expense claim or of an advance request (the two share the one selector).
  const [cashCurrency, setCashCurrency] = useState('IQD')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [submittingAdvance, setSubmittingAdvance] = useState(false)
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>([emptyExpenseLine()])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [submittingExpense, setSubmittingExpense] = useState(false)
  // Receipt photos — either one shared set for the whole expense or one set
  // per line, mirroring ItemsBoughtPage's sameReceiptForAll pattern. Kept as
  // in-memory Files until the claim is actually created (request-self),
  // then uploaded and attached to the resulting claim/line ids.
  const [sameReceiptForAll, setSameReceiptForAll] = useState(false)
  const [globalReceiptFiles, setGlobalReceiptFiles] = useState<File[]>([])
  const [pendingReceiptFiles, setPendingReceiptFiles] = useState<Record<number, File[]>>({})
  // Organizer hasn't spent the money yet — wants approval first and will
  // attach the receipt afterward, once it exists. Mutually exclusive with
  // the receipt-upload options below (nothing to attach yet either way).
  const [receiptPending, setReceiptPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (purpose !== 'expense' || expenseCategories.length > 0) return
    api
      .get<ExpenseCategory[]>('/finance/expense-claims/categories/mine')
      .then((r) => { setExpenseCategories(r.data); })
      .catch(() => { /* handled inline — line's category select just stays empty */ })
  }, [purpose, expenseCategories.length])

  useEffect(() => {
    if (companyRequiresJobsiteDelivery) setDeliveryDestination('jobsite')
  }, [companyRequiresJobsiteDelivery])

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
    skip: purpose !== 'project' && !isDirectSupply && !isMoneyRequest,
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
  const [requestUploadUrl] = useMutation<RequestUploadUrlMutation, RequestUploadUrlMutationVariables>(REQUEST_UPLOAD_URL)
  const [attachFile] = useMutation<AttachFileMutation, AttachFileMutationVariables>(ATTACH_FILE)
  const accessToken = useAuthStore((s) => s.accessToken)

  // The catalogue is thousands of products: filter and map it once per load, not on every keystroke in any field.
  const products: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
  useMemo(
    () => (productsData?.products ?? []).filter((x): x is NonNullable<typeof x> => x !== null),
    [productsData],
  )
  const projects: { id: string; code: string; name: string }[] = projectsData?.projects.data ?? []
  const mos: { id: string; mo_number: string; product_name?: string | null }[] =
    mosData?.manufacturingOrders ?? []
  const branches: { id: string; name: string; isActive: boolean }[] = (
    branchesData?.companyBranches ?? []
  ).filter((b: { isActive: boolean }) => b.isActive)
  const employees: { id: string; first_name: string; last_name: string; employee_number: string | null }[] =
    (employeesData?.employees ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const productOptions = useMemo(
    () => [
      { value: '', label: t('req.form.customItem') },
      ...products.map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: p.sku,
        keywords: p.name_ar ?? undefined,
      })),
    ],
    [products, t],
  )
  const projectOptions = [
    { value: '', label: t('req.form.selectProject') },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]
  const employeeOptions = [
    { value: '', label: t('req.form.none') },
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
      label: t('req.form.productDescription'),
      render: (line, i) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <SearchableSelect field
            value={line.product_id}
            onChange={(v) => { updateLine(i, 'product_id', v); }}
            options={productOptions}
            placeholder={t('req.form.searchByNameOrSku')}
            minDropdownWidth={400}
          />
          <Input field
            value={line.description}
            onChange={(e) => { updateLine(i, 'description', e.target.value); }}
            placeholder={t('req.form.description')}
          />
        </div>
      ),
    },
    {
      key: 'uom',
      label: t('req.form.uom'),
      width: '110px',
      render: (line, i) => (
        <Input field value={line.uom} onChange={(e) => { updateLine(i, 'uom', e.target.value); }} />
      ),
    },
    {
      key: 'qty',
      label: t('req.form.qty'),
      width: '90px',
      render: (line, i) => (
        <Input field
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
      label: t('req.form.estUnitPrice'),
      width: '120px',
      render: (line, i) => (
        <Input field
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(e) => { updateLine(i, 'unit_price', e.target.value); }}
        />
      ),
    },
    // A direct supply has no pricing step to set the currency later, so each line names it here.
    ...(isDirectSupply
      ? [
          {
            key: 'currency',
            label: t('req.form.currency'),
            width: '110px',
            render: (line: ReqLineDraft, i: number) => (
              <Select field
                value={line.currency}
                onChange={(e) => { updateLine(i, 'currency', e.target.value); }}
              >
                {LINE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            ),
          },
        ]
      : []),
    {
      key: 'total',
      label: t('req.form.total'),
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
      label: t('req.form.date'),
      width: '140px',
      render: (line, i) => (
        <Input field
          type="date"
          value={line.expense_date}
          onChange={(e) => { updateExpenseLine(i, 'expense_date', e.target.value); }}
        />
      ),
    },
    {
      key: 'category_id',
      label: t('req.form.category'),
      width: '200px',
      render: (line, i) => (
        <Select field
          value={line.category_id}
          onChange={(e) => { updateExpenseLine(i, 'category_id', e.target.value); }}
          options={[
            { value: '', label: t('req.form.category2') },
            ...expenseCategories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      ),
    },
    {
      key: 'description',
      label: t('req.form.description'),
      render: (line, i) => (
        <Input field
          value={line.description}
          onChange={(e) => { updateExpenseLine(i, 'description', e.target.value); }}
          placeholder={t('req.form.whatWasThisFor')}
        />
      ),
    },
    {
      key: 'amount',
      label: t('req.form.amount'),
      width: '120px',
      render: (line, i) => (
        <Input field
          type="number"
          min="0"
          step="0.01"
          value={line.amount}
          onChange={(e) => { updateExpenseLine(i, 'amount', e.target.value); }}
        />
      ),
    },
    {
      key: 'receipt',
      label: t('req.form.receipt'),
      width: '170px',
      render: (_line, i) =>
        receiptPending ? (
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>
            {t('req.form.receiptAfterApproval')}
          </span>
        ) : sameReceiptForAll ? (
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>{t('req.form.sharedReceiptBelow')}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                setPendingReceiptFiles((prev) => ({ ...prev, [i]: files }))
              }}
              style={{ fontSize: '11px', maxWidth: '160px' }}
            />
            {(pendingReceiptFiles[i] ?? []).length > 0 && (
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                📎 {t('req.form.filesCount', { count: (pendingReceiptFiles[i] ?? []).length })}
              </span>
            )}
          </div>
        ),
    },
  ]

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
  // A direct supply names a currency on every line, and nothing is ever added across currencies: one figure each.
  const estTotalLabel = isDirectSupply
    ? Object.entries(
        realLines.reduce<Record<string, number>>((acc, l) => {
          acc[l.currency] =
            (acc[l.currency] ?? 0) +
            (parseFloat(l.qty || '0') || 0) * (parseFloat(l.unit_price || '0') || 0)
          return acc
        }, {}),
      )
        .map(([currency, value]) => `${value.toLocaleString()} ${currency}`)
        .join(' · ') || '0'
    : estTotal.toLocaleString()
  const selectedProject = projects.find((p) => p.id === projectId)
  const realExpenseLines = expenseLines.filter((l) => l.amount && l.category_id)
  const expenseTotal = realExpenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  // What the form still needs before Create goes through. ONE list drives both the "Before you create it" card and the
  // refusal when Create is pressed (the first unmet item's message is the toast), so the card can never say "ready"
  // while Create refuses, or the other way round. The walkthrough (tour mode) has no real project, destination, order
  // or branch to pick, so those are not asked while it runs. Create itself is never disabled: pressing it names the
  // first thing missing.
  const requirements: (Requirement & { message: string })[] = []
  if (purpose === 'advance') {
    requirements.push({
      id: 'amount',
      label: t('req.form.checkAdvanceAmount'),
      message: t('req.form.enterTheAdvanceAmount'),
      done: parseFloat(advanceAmount) > 0,
    })
  } else if (purpose === 'expense') {
    requirements.push({
      id: 'lines',
      label: t('req.form.checkExpenseLines'),
      message: t('req.form.addAtLeastOneLineWith'),
      done: realExpenseLines.length > 0,
    })
  } else {
    if (!isTourMode) {
      if (purpose === 'project' || isDirectSupply) {
        requirements.push({
          id: 'project',
          label: t('req.form.checkProject'),
          message: t('req.form.pleaseSelectAProject'),
          done: Boolean(projectId),
        })
      }
      if (purpose === 'project') {
        requirements.push({
          id: 'destination',
          label: t('req.form.checkDestination'),
          message: t('req.form.pleaseSelectADeliveryDestination'),
          done: Boolean(deliveryDestination),
        })
      }
      if (purpose === 'manufacturing') {
        requirements.push({
          id: 'mo',
          label: t('req.form.checkMo'),
          message: t('req.form.pleaseSelectAManufacturingOrder'),
          done: Boolean(linkedMoId),
        })
      }
      if (branches.length > 0) {
        requirements.push({
          id: 'branch',
          label: t('req.form.checkBranch'),
          message: t('req.form.pleaseSelectABranch'),
          done: Boolean(branchId),
        })
      }
    }
    requirements.push({
      id: 'lines',
      label: t('req.form.checkLines'),
      message: t('req.form.addAtLeastOneLine'),
      done: realLines.length > 0,
    })
    // With no pricing step after a direct supply, the typed estimate is the only price the approver will see.
    if (isDirectSupply && !isTourMode) {
      requirements.push({
        id: 'price',
        label: t('req.form.checkDirectPrice'),
        message: t('req.form.directSupplyEveryLineNeedsAPrice'),
        done:
          realLines.length > 0 &&
          !realLines.some(
            (l) => !((parseFloat(l.qty) || 0) > 0) || !((parseFloat(l.unit_price) || 0) > 0),
          ),
      })
    }
  }

  // Mirrors ItemsBoughtPage's own uploadReceiptFile: requestUploadUrl gets a
  // fileId, then the actual bytes go straight to the files proxy endpoint.
  async function uploadReceiptFile(file: File): Promise<string> {
    const { data: urlData } = await requestUploadUrl({
      variables: {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        category: 'attachment',
      },
    })
    const fileId = urlData?.requestUploadUrl.fileId
    if (!fileId) throw new Error(t('req.form.couldNotPrepareUpload'))

    const apiBase = import.meta.env.VITE_API_URL
    const proxyRes = await fetch(`${apiBase}/api/v1/files/${fileId}/content`, {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    })
    if (!proxyRes.ok) {
      const errJson = (await proxyRes.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(errJson.error?.message ?? t('req.form.uploadFailed', { reason: proxyRes.statusText }))
    }
    return fileId
  }

  async function handleExpenseSubmit() {
    // Keep each surviving line paired with its own pending receipt files —
    // pendingReceiptFiles is keyed by index into the full expenseLines
    // array (same index updateExpenseLine/the Receipt column use), so this
    // filter has to walk both in lockstep rather than filtering lines alone.
    // (handleSubmit has already refused a claim with no such line: the `requirements` list is the one place that rule is.)
    const claimLines = expenseLines
      .map((line, idx) => ({ line, files: pendingReceiptFiles[idx] ?? [] }))
      .filter((x) => x.line.amount && x.line.category_id)
    setSubmittingExpense(true)
    try {
      const { data: claim } = await api.post<{ id: string; lines: { id: string }[] }>(
        '/finance/expense-claims/request-self',
        {
          description: notes || undefined,
          currency_code: cashCurrency,
          project_id: projectId || undefined,
          receipt_pending: receiptPending,
          lines: claimLines.map(({ line }) => ({
            expense_date: line.expense_date,
            category_id: line.category_id,
            description: line.description || undefined,
            amount: parseFloat(line.amount) || 0,
          })),
        },
      )

      // Attach receipts after the claim exists — shared receipts go on the
      // claim itself (entity_type='expense_claim'), per-line ones on each
      // resulting line (entity_type='expense_claim_line'), matched by
      // position since request-self returns lines in the same order they
      // were submitted.
      if (sameReceiptForAll && globalReceiptFiles.length > 0) {
        for (const file of globalReceiptFiles) {
          const fileId = await uploadReceiptFile(file)
          await attachFile({ variables: { fileId, entityType: 'expense_claim', entityId: claim.id } })
        }
      } else if (!sameReceiptForAll) {
        for (let i = 0; i < claimLines.length; i++) {
          const lineId = claim.lines[i]?.id
          if (!lineId) continue
          for (const file of claimLines[i].files) {
            const fileId = await uploadReceiptFile(file)
            await attachFile({ variables: { fileId, entityType: 'expense_claim_line', entityId: lineId } })
          }
        }
      }

      addToast({ type: 'success', message: t('req.form.expenseRequisitionSubmittedForApproval') })
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

  // An advance request goes through the same self-service endpoint the My Advances page uses: it lands waiting for the
  // manager, then the cashbox handler issues the cash. The reason typed in the notes box is the advance's purpose.
  async function handleAdvanceSubmit() {
    // (handleSubmit has already refused an amount that is not above zero: see `requirements`.)
    const amount = parseFloat(advanceAmount)
    setSubmittingAdvance(true)
    try {
      await api.post('/finance/advances/request-self', {
        amount,
        currency_code: cashCurrency,
        purpose: notes.trim() || undefined,
        project_id: projectId || undefined,
      })
      addToast({ type: 'success', message: t('req.form.advanceRequestSubmittedForApproval') })
      navigate('/procurement/requisitions')
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } }
      addToast({
        type: 'error',
        message: apiError.response?.data?.error?.message ?? (err as Error).message,
      })
    } finally {
      setSubmittingAdvance(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // The first thing the "Before you create it" card still lists is the one this names.
    const unmet = requirements.find((r) => !r.done)
    if (unmet) {
      addToast({ type: 'error', message: unmet.message })
      return
    }
    if (purpose === 'expense') {
      await handleExpenseSubmit()
      return
    }
    if (purpose === 'advance') {
      await handleAdvanceSubmit()
      return
    }
    try {
      const input = {
        purpose,
        project_id: purpose === 'project' || isDirectSupply ? projectId || undefined : undefined,
        // A direct supply's destination is fixed by the server (the jobsite), so none is sent.
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
          requested_currency_code: isDirectSupply ? l.currency : undefined,
        })),
      }
      const result = await createRequisition({ variables: { input } })
      addToast({ type: 'success', message: t('req.form.requisitionCreated') })
      const newId = result.data?.createRequisition.id
      navigate(newId ? `/procurement/requisitions/${newId}` : '/procurement/requisitions')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  // The submit button spins for whichever kind of request is being sent.
  const submitting =
    purpose === 'expense' ? submittingExpense : purpose === 'advance' ? submittingAdvance : loading
  const openRequirements = requirements.filter((r) => !r.done)
  const purposeOptions: PurposeCardOption<RequisitionPurpose>[] = (
    [
      ['stock', t('req.form.generalStock'), t('req.form.purposeStockDesc')],
      ['project', t('req.form.projectSupply'), t('req.form.purposeProjectDesc')],
      ['direct_supply', t('req.form.directSupply'), t('req.form.purposeDirectSupplyDesc')],
      ['manufacturing', t('req.form.manufacturingBom'), t('req.form.purposeManufacturingDesc')],
      ['expense', t('req.form.expense'), t('req.form.purposeExpenseDesc')],
      ['advance', t('req.form.advance'), t('req.form.purposeAdvanceDesc')],
    ] as const
  ).map(([value, title, description]) => ({ value, title, description, icon: PURPOSE_ICONS[value] }))

  return (
    <div
      style={{
        padding: isPhone ? '12px 16px calc(env(safe-area-inset-bottom, 0px) + 170px)' : '24px',
      }}
    >
      <PageHeader
        title={t('req.form.newRequisition')}
        subtitle={t('req.form.requestItemsToBeSourcedFrom')}
        backPath="/procurement/requisitions"
        compact
        // On a phone the Create button lives in the bar fixed above the bottom navigation (below the form),
        // where the thumb is, not at the top of a long scroll.
        actions={
          isPhone ? undefined : (
            <ActionButton
              data-tour="submit-req-btn"
              type="button"
              variant="solid"
              loading={submitting}
              onClick={() => formRef.current?.requestSubmit()}
            >
              {t('req.form.createRequisition')}
            </ActionButton>
          )
        }
      />

      <form ref={formRef} onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. What is it for? Everything below changes with this answer, so it comes first. */}
          <Card
            style={{
              padding: isPhone ? '16px' : '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: isPhone ? '12px' : '16px',
            }}
          >
            <SectionTitle step={1}>{t('req.form.stepPurpose')}</SectionTitle>
            <PurposeCards
              data-tour="req-purpose-row"
              label={t('req.form.purpose')}
              options={purposeOptions}
              value={purpose}
              onChange={setPurpose}
            />
          </Card>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Left column: the details and the lines */}
            <div
              style={{
                flex: '2 1 560px',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              <Card
                data-tour="req-details-card"
                style={{
                  padding: isPhone ? '16px' : '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isPhone ? '14px' : '18px',
                }}
              >
                <SectionTitle step={2}>{t('req.form.requisitionDetails')}</SectionTitle>

                {/* Only the fields that belong to the chosen purpose are drawn, the purpose's own ones first. */}
                {isMoneyRequest && (
                  <div style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <Select field
                        label={t('req.form.currency')}
                        value={cashCurrency}
                        onChange={(e) => { setCashCurrency(e.target.value); }}
                      >
                        <option value="IQD">IQD</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </Select>
                    </div>
                    {purpose === 'advance' && (
                      <div style={{ minWidth: 0 }}>
                        <Input field
                          label={t('req.form.advanceAmount')}
                          type="number"
                          min="0"
                          step="any"
                          value={advanceAmount}
                          onChange={(e) => { setAdvanceAmount(e.target.value); }}
                        />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <SearchableSelect field
                        label={t('req.form.projectOptional')}
                        value={projectId}
                        onChange={setProjectId}
                        options={projectOptions}
                        placeholder={t('req.form.searchProject')}
                        minDropdownWidth={360}
                      />
                    </div>
                  </div>
                )}

                {purpose === 'expense' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={receiptPending}
                        onChange={(e) => {
                          setReceiptPending(e.target.checked)
                        }}
                      />
                      {t('req.form.receiptPendingCheckbox')}
                    </label>
                    {!receiptPending && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={sameReceiptForAll}
                          onChange={(e) => { setSameReceiptForAll(e.target.checked); }}
                        />
                        {t('req.form.attachOneReceiptForTheWhole')}
                      </label>
                    )}
                    {!receiptPending && sameReceiptForAll && (
                      <div>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          onChange={(e) => {
                            setGlobalReceiptFiles(Array.from(e.target.files ?? []))
                          }}
                          style={{ fontSize: '12px' }}
                        />
                        {globalReceiptFiles.length > 0 && (
                          <div style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '4px' }}>
                            📎 {t('req.form.filesAttached', { count: globalReceiptFiles.length })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {purpose === 'project' && (
                  <div data-tour="req-project-row" style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <SearchableSelect field
                        label={t('req.form.project')}
                        value={projectId}
                        onChange={setProjectId}
                        options={projectOptions}
                        placeholder={isTourMode ? t('req.form.notNeededForThisWalkthrough') : t('req.form.searchProject')}
                        minDropdownWidth={360}
                        disabled={isTourMode}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Select field
                        label={t('req.form.deliveryDestination')}
                        value={deliveryDestination}
                        disabled={companyRequiresJobsiteDelivery}
                        onChange={(e) => { setDeliveryDestination(e.target.value as '' | 'inventory' | 'jobsite'); }}
                      >
                        {companyRequiresJobsiteDelivery ? (
                          <option value="jobsite">{t('req.form.deliveredDirectlyToTheJobsite')}</option>
                        ) : (
                          <>
                            <option value="">{t('req.form.selectDestination')}</option>
                            <option value="inventory">{t('req.form.deliveredToInventory')}</option>
                            <option value="jobsite">{t('req.form.deliveredDirectlyToTheJobsite')}</option>
                          </>
                        )}
                      </Select>
                      {companyRequiresJobsiteDelivery && (
                        <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                          {t('req.form.thisCompanyHasNoInventoryOfItsOwn')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Direct supply: always tied to a project, always delivered straight to the jobsite, so the destination is shown
                    (so nobody wonders where it goes) but is not a choice. */}
                {isDirectSupply && (
                  <div data-tour="req-project-row" style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <SearchableSelect field
                        label={t('req.form.project')}
                        value={projectId}
                        onChange={setProjectId}
                        options={projectOptions}
                        placeholder={isTourMode ? t('req.form.notNeededForThisWalkthrough') : t('req.form.searchProject')}
                        minDropdownWidth={360}
                        disabled={isTourMode}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Select field
                        label={t('req.form.directSupplyDestination')}
                        value="jobsite"
                        disabled
                        onChange={() => undefined}
                      >
                        <option value="jobsite">{t('req.form.deliveredDirectlyToTheJobsite')}</option>
                      </Select>
                      <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                        {t('req.form.directSupplyAlwaysDelivered')}
                      </div>
                    </div>
                  </div>
                )}

                {purpose === 'manufacturing' && (
                  <div style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <Select field
                        label={t('req.form.manufacturingOrder')}
                        value={linkedMoId}
                        onChange={(e) => { setLinkedMoId(e.target.value); }}
                      >
                        <option value="">{t('req.form.selectMo')}</option>
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

                {!isMoneyRequest && (
                  <div style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <Select field
                        label={branches.length > 0 ? t('req.form.branch') : t('req.form.branch2')}
                        value={branchId}
                        onChange={(e) => { setBranchId(e.target.value); }}
                        options={[{ value: '', label: t('req.form.selectBranch') }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Select field
                        label={t('req.form.priority')}
                        value={priority}
                        onChange={(e) => { setPriority(e.target.value as 'low' | 'high' | 'emergency'); }}
                      >
                        <option value="low">{t('req.form.low')}</option>
                        <option value="high">{t('req.form.high')}</option>
                        <option value="emergency">{t('req.form.emergency')}</option>
                      </Select>
                    </div>
                  </div>
                )}

                {!isMoneyRequest && (
                  <div style={detailsRow}>
                    <div style={{ minWidth: 0 }}>
                      <SearchableSelect field
                        label={t('req.form.receivedBy')}
                        value={assignedReceiverId}
                        onChange={setAssignedReceiverId}
                        options={employeeOptions}
                        placeholder={t('req.form.searchEmployee')}
                        minDropdownWidth={320}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Input field
                        label={t('req.form.expectedDeliveryOptional')}
                        type="date"
                        value={expectedDeliveryDate}
                        onChange={(e) => { setExpectedDeliveryDate(e.target.value); }}
                      />
                    </div>
                  </div>
                )}

                <div data-tour="req-notes">
                  <Textarea field
                    label={purpose === 'advance' ? t('req.form.advanceReason') : t('req.form.notes')}
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); }}
                    rows={2}
                  />
                </div>
              </Card>

              {/* An advance is one amount and a reason, so it has no lines to enter. */}
              {purpose !== 'advance' && (
                <Card data-tour="req-lines-card">
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
                    <SectionTitle step={3}>{t('req.form.lines')}</SectionTitle>
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px', marginInlineStart: '34px' }}>
                      {purpose === 'expense'
                        ? t('req.form.addEachExpenseCategoryDecidesThe')
                        : t('req.form.addEachItemYouNeedGl')}
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
                        onAddRow={() => { setLines((p) => [...p, emptyLine(p[p.length - 1]?.currency)]); }}
                        addButtonDataTour="req-add-line-btn"
                      />
                    )}
                  </div>
                </Card>
              )}
            </div>

            {/* Right column: what the request adds up to, and what it still needs. Stays in view beside a long list of lines. */}
            <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  width: '100%',
                  alignSelf: 'flex-start',
                  position: isPhone ? 'static' : 'sticky',
                  top: '20px',
                }}
              >
                <Card
                  data-tour="req-summary-sidebar"
                  style={{ padding: isPhone ? '16px' : '24px' }}
                >
                  <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary, marginBottom: '16px' }}>
                    {t('req.form.summary')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {(purpose === 'advance'
                      ? [
                          {
                            label: t('req.form.advanceAmount'),
                            value: `${(parseFloat(advanceAmount) || 0).toLocaleString()} ${cashCurrency}`,
                          },
                        ]
                      : purpose === 'expense'
                      ? [
                          { label: t('req.form.lineItems'), value: String(realExpenseLines.length) },
                          { label: t('req.form.total'), value: `${expenseTotal.toLocaleString()} ${cashCurrency}` },
                        ]
                      : [
                          { label: t('req.form.lineItems'), value: String(realLines.length) },
                          { label: t('req.form.totalQty'), value: totalQty.toLocaleString() },
                          { label: t('req.form.estTotal'), value: estTotalLabel },
                          {
                            label: t('req.form.priority'),
                            value: priority.charAt(0).toUpperCase() + priority.slice(1),
                          },
                        ]
                    ).map((kpi) => (
                      <div
                        key={kpi.label}
                        style={{
                          padding: isPhone ? '10px 12px' : '14px',
                          borderRadius: '10px',
                          background: theme.bgCanvas,
                          border: `1px solid ${theme.border}`,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 500, color: theme.textSecondary, marginBottom: '6px' }}>
                          {kpi.label}
                        </div>
                        <div
                          style={{
                            fontSize: isPhone ? '18px' : '20px',
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
                  <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                    {purpose === 'project' || isDirectSupply ? (
                      <>
                        {t('req.form.forProject')}{' '}
                        <strong style={{ color: theme.textPrimary }}>
                          {selectedProject?.code ?? t('req.form.notSelected')}
                        </strong>
                        {isDirectSupply && (
                          <div style={{ marginTop: '6px' }}>{t('req.form.directSupplySubmitHint')}</div>
                        )}
                      </>
                    ) : purpose === 'expense' ? (
                      t('req.form.expenseSubmitHint')
                    ) : purpose === 'advance' ? (
                      t('req.form.advanceSubmitHint')
                    ) : (
                      t('req.form.generalStockHint')
                    )}
                  </div>
                </Card>

                <RequirementsChecklist
                  data-tour="req-checklist"
                  title={t('req.form.beforeYouCreate')}
                  items={requirements}
                  progressLabel={t('req.form.checklistProgress', {
                    done: requirements.length - openRequirements.length,
                    total: requirements.length,
                  })}
                  readyLabel={t('req.form.checklistReady')}
                  doneText={t('req.form.checkDone')}
                  todoText={t('req.form.checkTodo')}
                />
              </div>
            </div>
          </div>
        </div>

        {isPhone && (
          <StickyActionBar>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              {openRequirements.length > 0 && (
                <div style={{ fontSize: '12px', color: theme.textSecondary, textAlign: 'center' }}>
                  {t('req.form.checklistProgress', {
                    done: requirements.length - openRequirements.length,
                    total: requirements.length,
                  })}
                  {' · '}
                  {t('req.form.checklistNext', { item: openRequirements[0].label })}
                </div>
              )}
              <ActionButton
                data-tour="submit-req-btn"
                type="button"
                variant="solid"
                size="lg"
                fullWidth
                loading={submitting}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {t('req.form.createRequisition')}
              </ActionButton>
            </div>
          </StickyActionBar>
        )}
      </form>
    </div>
  )
}
