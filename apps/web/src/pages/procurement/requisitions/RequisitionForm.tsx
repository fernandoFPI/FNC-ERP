import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
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
}

const emptyLine = (): ReqLineDraft => ({
  product_id: '',
  description: '',
  qty: '1',
  unit_price: '0',
  uom: 'pc',
})

export default function RequisitionForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
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
  const [requestUploadUrl] = useMutation<RequestUploadUrlMutation, RequestUploadUrlMutationVariables>(REQUEST_UPLOAD_URL)
  const [attachFile] = useMutation<AttachFileMutation, AttachFileMutationVariables>(ATTACH_FILE)
  const accessToken = useAuthStore((s) => s.accessToken)

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
    { value: '', label: t('req.form.customItem') },
    ...products.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku, keywords: p.name_ar ?? undefined })),
  ]
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
          <SearchableSelect
            value={line.product_id}
            onChange={(v) => { updateLine(i, 'product_id', v); }}
            options={productOptions}
            placeholder={t('req.form.searchByNameOrSku')}
            minDropdownWidth={400}
          />
          <Input
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
        <Input value={line.uom} onChange={(e) => { updateLine(i, 'uom', e.target.value); }} />
      ),
    },
    {
      key: 'qty',
      label: t('req.form.qty'),
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
      label: t('req.form.estUnitPrice'),
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
        <Input
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
        <Select
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
        <Input
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
        <Input
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
          <span style={{ fontSize: '11px', color: theme.textMuted }}>
            {t('req.form.receiptAfterApproval')}
          </span>
        ) : sameReceiptForAll ? (
          <span style={{ fontSize: '11px', color: theme.textMuted }}>{t('req.form.sharedReceiptBelow')}</span>
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
              <span style={{ fontSize: '10px', color: theme.textMuted }}>
                📎 {t('req.form.filesCount', { count: (pendingReceiptFiles[i] ?? []).length })}
              </span>
            )}
          </div>
        ),
    },
  ]

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
    const realExpenseLines = expenseLines
      .map((line, idx) => ({ line, files: pendingReceiptFiles[idx] ?? [] }))
      .filter((x) => x.line.amount && x.line.category_id)
    if (realExpenseLines.length === 0) {
      addToast({ type: 'error', message: t('req.form.addAtLeastOneLineWith') })
      return
    }
    setSubmittingExpense(true)
    try {
      const { data: claim } = await api.post<{ id: string; lines: { id: string }[] }>(
        '/finance/expense-claims/request-self',
        {
          description: notes || undefined,
          currency_code: expenseCurrency,
          project_id: projectId || undefined,
          receipt_pending: receiptPending,
          lines: realExpenseLines.map(({ line }) => ({
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
        for (let i = 0; i < realExpenseLines.length; i++) {
          const lineId = claim.lines[i]?.id
          if (!lineId) continue
          for (const file of realExpenseLines[i].files) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (purpose === 'expense') {
      await handleExpenseSubmit()
      return
    }
    if (!isTourMode) {
      if (purpose === 'project' && !projectId) {
        addToast({ type: 'error', message: t('req.form.pleaseSelectAProject') })
        return
      }
      if (purpose === 'project' && !deliveryDestination) {
        addToast({ type: 'error', message: t('req.form.pleaseSelectADeliveryDestination') })
        return
      }
      if (purpose === 'manufacturing' && !linkedMoId) {
        addToast({ type: 'error', message: t('req.form.pleaseSelectAManufacturingOrder') })
        return
      }
      if (branches.length > 0 && !branchId) {
        addToast({ type: 'error', message: t('req.form.pleaseSelectABranch') })
        return
      }
    }
    const realLines = lines.filter((l) => l.description || l.product_id)
    if (realLines.length === 0) {
      addToast({ type: 'error', message: t('req.form.addAtLeastOneLine') })
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
      addToast({ type: 'success', message: t('req.form.requisitionCreated') })
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
        title={t('req.form.newRequisition')}
        subtitle={t('req.form.requestItemsToBeSourcedFrom')}
        backPath="/procurement/requisitions"
        actions={
          <Button
            data-tour="submit-req-btn"
            type="button"
            variant="primary"
            loading={purpose === 'expense' ? submittingExpense : loading}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {t('req.form.createRequisition')}
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
          <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>{t('req.form.requisitionDetails')}</div>
          <div
            data-tour="req-purpose-row"
            style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}
          >
            <div style={{ flex: '1 1 200px' }}>
              <Select
                label={t('req.form.purpose')}
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value as 'stock' | 'project' | 'manufacturing' | 'expense')
                }}
              >
                <option value="stock">{t('req.form.generalStock')}</option>
                <option value="project">{t('req.form.projectSupply')}</option>
                <option value="manufacturing">{t('req.form.manufacturingBom')}</option>
                <option value="expense">{t('req.form.expense')}</option>
              </Select>
            </div>
            {purpose !== 'expense' && (
              <div style={{ flex: '1 1 200px' }}>
                <Select
                  label={branches.length > 0 ? t('req.form.branch') : t('req.form.branch2')}
                  value={branchId}
                  onChange={(e) => { setBranchId(e.target.value); }}
                  options={[{ value: '', label: t('req.form.selectBranch') }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                />
              </div>
            )}
            {purpose !== 'expense' && (
              <div style={{ flex: '1 1 160px' }}>
                <Select
                  label={t('req.form.priority')}
                  value={priority}
                  onChange={(e) => { setPriority(e.target.value as 'low' | 'high' | 'emergency'); }}
                >
                  <option value="low">{t('req.form.low')}</option>
                  <option value="high">{t('req.form.high')}</option>
                  <option value="emergency">{t('req.form.emergency')}</option>
                </Select>
              </div>
            )}
          </div>

          {purpose !== 'expense' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 200px' }}>
                <SearchableSelect
                  label={t('req.form.receivedBy')}
                  value={assignedReceiverId}
                  onChange={setAssignedReceiverId}
                  options={employeeOptions}
                  placeholder={t('req.form.searchEmployee')}
                  minDropdownWidth={320}
                />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <Input
                  label={t('req.form.expectedDeliveryOptional')}
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => { setExpectedDeliveryDate(e.target.value); }}
                />
              </div>
            </div>
          )}

          {purpose === 'expense' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <Select
                  label={t('req.form.currency')}
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
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                      📎 {t('req.form.filesAttached', { count: globalReceiptFiles.length })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {purpose === 'project' && (
            <div data-tour="req-project-row" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <SearchableSelect
                  label={t('req.form.project')}
                  value={projectId}
                  onChange={setProjectId}
                  options={projectOptions}
                  placeholder={isTourMode ? t('req.form.notNeededForThisWalkthrough') : t('req.form.searchProject')}
                  minDropdownWidth={360}
                  disabled={isTourMode}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Select
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
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                    {t('req.form.thisCompanyHasNoInventoryOfItsOwn')}
                  </div>
                )}
              </div>
            </div>
          )}

          {purpose === 'manufacturing' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <Select
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

          <div data-tour="req-notes">
            <Textarea label={t('req.form.notes')} value={notes} onChange={(e) => { setNotes(e.target.value); }} rows={2} />
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
                {t('req.form.summary')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {(purpose === 'expense'
                  ? [
                      { label: t('req.form.lineItems'), value: String(realExpenseLines.length) },
                      { label: t('req.form.total'), value: `${expenseTotal.toLocaleString()} ${expenseCurrency}` },
                    ]
                  : [
                      { label: t('req.form.lineItems'), value: String(realLines.length) },
                      { label: t('req.form.totalQty'), value: totalQty.toLocaleString() },
                      { label: t('req.form.estTotal'), value: estTotal.toLocaleString() },
                      {
                        label: t('req.form.priority'),
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
                    {t('req.form.forProject')}{' '}
                    <strong style={{ color: theme.textPrimary }}>
                      {selectedProject?.code ?? t('req.form.notSelected')}
                    </strong>
                  </>
                ) : purpose === 'expense' ? (
                  t('req.form.expenseSubmitHint')
                ) : (
                  t('req.form.generalStockHint')
                )}
              </div>
            </Card>
          </div>
        </div>

        <Card data-tour="req-lines-card" style={{ marginTop: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>{t('req.form.lines')}</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
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
