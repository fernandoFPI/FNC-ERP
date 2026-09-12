import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_REQUISITION } from '../../../graphql/requisitions'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { COMPANY_BRANCHES_QUERY } from '../../../graphql/admin'
import { ACCOUNTS_QUERY, COST_CENTERS_QUERY } from '../../../graphql/finance'
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

interface ReqLineDraft {
  product_id: string
  description: string
  qty: string
  unit_price: string
  uom: string
  account_id: string
  cost_center_id: string
}

const emptyLine = (): ReqLineDraft => ({
  product_id: '',
  description: '',
  qty: '1',
  unit_price: '0',
  uom: 'pc',
  account_id: '',
  cost_center_id: '',
})

export default function RequisitionForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')

  const [purpose, setPurpose] = useState<'stock' | 'project'>('stock')
  const [projectId, setProjectId] = useState('')
  const [deliveryDestination, setDeliveryDestination] = useState<'' | 'inventory' | 'jobsite'>('')
  const [branchId, setBranchId] = useState('')
  const [priority, setPriority] = useState<'low' | 'high' | 'emergency'>('low')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ReqLineDraft[]>([emptyLine()])
  const formRef = useRef<HTMLFormElement>(null)

  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: {} })
  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { includeAll: true },
    skip: purpose !== 'project',
  })
  const { data: branchesData } = useQuery(COMPANY_BRANCHES_QUERY, {
    variables: { companyId: currentCompanyId },
    skip: !currentCompanyId,
  })
  const { data: accountsData } = useQuery(ACCOUNTS_QUERY, { variables: { isActive: true } })
  const { data: costCentersData } = useQuery(COST_CENTERS_QUERY)
  const [createRequisition, { loading }] = useMutation(CREATE_REQUISITION)

  const products: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    productsData?.products ?? []
  const projects: { id: string; code: string; name: string }[] = projectsData?.projects?.data ?? []
  const branches: { id: string; name: string; isActive: boolean }[] = (
    branchesData?.companyBranches ?? []
  ).filter((b: { isActive: boolean }) => b.isActive)
  const accounts: { id: string; code: string; name: string }[] = accountsData?.accounts ?? []
  const costCenters: { id: string; code: string; name: string }[] = costCentersData?.costCenters ?? []

  const productOptions = [
    { value: '', label: 'Custom item' },
    ...products.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku, keywords: p.name_ar ?? undefined })),
  ]
  const projectOptions = [
    { value: '', label: 'Select project…' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]

  const updateLine = (idx: number, field: keyof ReqLineDraft, value: string) => {
    setLines((prev) => {
      const next = [...prev]
      const line = { ...next[idx]!, [field]: value }
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
            onChange={(v) => updateLine(i, 'product_id', v)}
            options={productOptions}
            placeholder="Search by name or SKU…"
            minDropdownWidth={400}
          />
          <Input
            value={line.description}
            onChange={(e) => updateLine(i, 'description', e.target.value)}
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
        <Input value={line.uom} onChange={(e) => updateLine(i, 'uom', e.target.value)} />
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
          onChange={(e) => updateLine(i, 'qty', e.target.value)}
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
          onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
        />
      ),
    },
    {
      key: 'account_id',
      label: 'GL Account',
      width: '160px',
      render: (line, i) => (
        <Select
          value={line.account_id}
          onChange={(e) => updateLine(i, 'account_id', e.target.value)}
          options={[
            { value: '', label: 'Auto (default)' },
            ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
          ]}
        />
      ),
    },
    {
      key: 'cost_center_id',
      label: 'Cost Center',
      width: '160px',
      render: (line, i) => (
        <Select
          value={line.cost_center_id}
          onChange={(e) => updateLine(i, 'cost_center_id', e.target.value)}
          options={[
            { value: '', label: 'Auto (default)' },
            ...costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
          ]}
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (purpose === 'project' && !projectId) {
      addToast({ type: 'error', message: 'Please select a project' })
      return
    }
    if (purpose === 'project' && !deliveryDestination) {
      addToast({ type: 'error', message: 'Please select a delivery destination' })
      return
    }
    if (branches.length > 0 && !branchId) {
      addToast({ type: 'error', message: 'Please select a branch' })
      return
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
        priority,
        branch_id: branchId || undefined,
        notes: notes || undefined,
        lines: realLines.map((l) => ({
          product_id: l.product_id || undefined,
          description: l.description,
          qty: parseFloat(l.qty) || 0,
          unit_price: parseFloat(l.unit_price) || 0,
          uom: l.uom,
          accountId: l.account_id || undefined,
          costCenterId: l.cost_center_id || undefined,
        })),
      }
      const result = await createRequisition({ variables: { input } })
      addToast({ type: 'success', message: 'Requisition created' })
      const newId = result.data?.createRequisition?.id
      navigate(newId ? `/procurement/requisitions/${newId}` : '/procurement/requisitions')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        title="New Requisition"
        subtitle="Request items to be sourced from stock or purchased"
        backPath="/procurement/requisitions"
        actions={
          <Button
            type="button"
            variant="primary"
            loading={loading}
            onClick={() => formRef.current?.requestSubmit()}
          >
            Create Requisition
          </Button>
        }
      />

      <form ref={formRef} onSubmit={(e) => void handleSubmit(e)}>
        <Card style={{ padding: '24px', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Select
                label="Purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as 'stock' | 'project')}
              >
                <option value="stock">General Stock</option>
                <option value="project">Project Supply</option>
              </Select>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Select
                label={branches.length > 0 ? 'Branch *' : 'Branch'}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                options={[{ value: '', label: 'Select branch…' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Select
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'high' | 'emergency')}
              >
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="emergency">Emergency</option>
              </Select>
            </div>
          </div>

          {purpose === 'project' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <SearchableSelect
                  label="Project *"
                  value={projectId}
                  onChange={setProjectId}
                  options={projectOptions}
                  placeholder="Search project…"
                  minDropdownWidth={360}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <Select
                  label="Delivery Destination *"
                  value={deliveryDestination}
                  onChange={(e) => setDeliveryDestination(e.target.value as '' | 'inventory' | 'jobsite')}
                >
                  <option value="">Select destination…</option>
                  <option value="inventory">Delivered to inventory</option>
                  <option value="jobsite">Delivered directly to the jobsite</option>
                </Select>
              </div>
            </div>
          )}

          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Card>

        <Card style={{ marginTop: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>Lines</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
              Add each item — GL account and cost center default from the branch (and, for Project
              Supply, the project) when left on Auto.
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <LineItemEditor
              fields={lineFields}
              rows={lines}
              onRemoveRow={(idx) => setLines((p) => p.filter((_, i) => i !== idx))}
              removeDisabled={() => lines.length <= 1}
              onAddRow={() => setLines((p) => [...p, emptyLine()])}
            />
          </div>
        </Card>
      </form>
    </div>
  )
}
