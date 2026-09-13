import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_REQUISITION } from '../../../graphql/requisitions'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { PROJECTS_QUERY } from '../../../graphql/projects'
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
  const [createRequisition, { loading }] = useMutation(CREATE_REQUISITION)

  const products: { id: string; sku: string; name: string; name_ar?: string | null; uom: string }[] =
    productsData?.products ?? []
  const projects: { id: string; code: string; name: string }[] = projectsData?.projects?.data ?? []
  const branches: { id: string; name: string; isActive: boolean }[] = (
    branchesData?.companyBranches ?? []
  ).filter((b: { isActive: boolean }) => b.isActive)

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

  return (
    <div style={{ padding: '24px' }}>
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
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* Left column ~70%: Requisition Details — mirrors PurchaseOrderForm's own "Order Details" card */}
          <div style={{ flex: '2 1 560px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Card style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>Requisition Details</div>
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
          </div>

          {/* Right column ~30%: Summary — mirrors PurchaseOrderForm's own sticky Order Summary sidebar */}
          <div style={{ flex: '1 1 280px', display: 'flex' }}>
            <Card style={{ padding: '24px', position: 'sticky', top: '20px', width: '100%' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary, marginBottom: '16px' }}>
                Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'Line Items', value: String(realLines.length) },
                  { label: 'Total Qty', value: totalQty.toLocaleString() },
                  { label: 'Est. Total', value: estTotal.toLocaleString() },
                  {
                    label: 'Priority',
                    value: priority.charAt(0).toUpperCase() + priority.slice(1),
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
                ) : (
                  'General stock requisition — not linked to a project'
                )}
              </div>
            </Card>
          </div>
        </div>

        <Card style={{ marginTop: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>Lines</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
              Add each item you need — GL account and cost center are worked out automatically later
              and aren't something you need to set here.
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
