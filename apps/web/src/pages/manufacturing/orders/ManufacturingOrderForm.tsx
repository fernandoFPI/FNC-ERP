import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  BOMS_QUERY,
  WORK_CENTERS_QUERY,
  CREATE_MANUFACTURING_ORDER,
  MANUFACTURING_ORDERS_QUERY,
} from '../../../graphql/manufacturing'
import { PROJECTS_QUERY } from '../../../graphql/projects'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { useBreakpoint } from '../../../hooks/useBreakpoint'

export default function ManufacturingOrderForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const addToast = useToastStore((s) => s.addToast)
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const [form, setForm] = useState({
    bom_id: searchParams.get('bomId') ?? '',
    qty_planned: '1',
    work_center_id: '',
    project_id: '',
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
  })

  const { data: bomsData } = useQuery(BOMS_QUERY, { variables: { isActive: true } })
  const { data: wcsData } = useQuery(WORK_CENTERS_QUERY, { variables: { isActive: true } })
  const { data: projData } = useQuery(PROJECTS_QUERY, { variables: { status: 'active' } })
  const [createMO, { loading }] = useMutation(CREATE_MANUFACTURING_ORDER)

  const boms = bomsData?.boms ?? []
  const workCenters = wcsData?.workCenters ?? []
  const projects = projData?.projects?.data ?? []

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
  }

  // auto-select work center if only one
  useEffect(() => {
    if (workCenters.length === 1 && !form.work_center_id) {
      setForm((f) => ({ ...f, work_center_id: workCenters[0].id }))
    }
  }, [workCenters, form.work_center_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.bom_id) {
      addToast({ type: 'error', message: 'Select a BOM' })
      return
    }
    const input = {
      bom_id: form.bom_id,
      qty_planned: parseFloat(form.qty_planned) || 1,
      work_center_id: form.work_center_id || null,
      project_id: form.project_id || null,
      scheduled_start: form.scheduled_start || null,
      scheduled_end: form.scheduled_end || null,
      notes: form.notes || null,
    }
    try {
      const res = await createMO({
        variables: { input },
        refetchQueries: [{ query: MANUFACTURING_ORDERS_QUERY }],
      })
      addToast({ type: 'success', message: 'Manufacturing order created' })
      navigate(`/manufacturing/orders/${res.data.createManufacturingOrder.id}`)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader title="New Manufacturing Order" subtitle="Create from BOM" />
      <Card style={{ marginTop: '20px' }}>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPhone ? '1fr' : '2fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <SearchableSelect
                label="Bill of Materials"
                value={form.bom_id}
                onChange={(v) => {
                  setForm((f) => ({ ...f, bom_id: v }))
                }}
                placeholder="Select BOM…"
                options={boms.map((b: { id: string; product_name?: string; version: string }) => ({
                  value: b.id,
                  label: `${b.product_name} v${b.version}`,
                }))}
              />
            </div>
            <Input
              label="Qty to Produce"
              type="number"
              step="0.001"
              min="0.001"
              value={form.qty_planned}
              onChange={(e) => {
                setForm((f) => ({ ...f, qty_planned: e.target.value }))
              }}
              required
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <SearchableSelect
                label="Work Center"
                value={form.work_center_id}
                onChange={(v) => {
                  setForm((f) => ({ ...f, work_center_id: v }))
                }}
                placeholder="None"
                options={workCenters.map((wc: { id: string; name: string }) => ({
                  value: wc.id,
                  label: wc.name,
                }))}
              />
            </div>
            <div>
              <SearchableSelect
                label="Project (optional)"
                value={form.project_id}
                onChange={(v) => {
                  setForm((f) => ({ ...f, project_id: v }))
                }}
                placeholder="None"
                options={projects.map((p: { id: string; name: string; code: string }) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}`,
                }))}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label="Scheduled Start"
              type="date"
              value={form.scheduled_start}
              onChange={(e) => {
                setForm((f) => ({ ...f, scheduled_start: e.target.value }))
              }}
            />
            <Input
              label="Scheduled End"
              type="date"
              value={form.scheduled_end}
              onChange={(e) => {
                setForm((f) => ({ ...f, scheduled_end: e.target.value }))
              }}
            />
          </div>

          <Input
            label="Notes"
            value={form.notes}
            onChange={(e) => {
              setForm((f) => ({ ...f, notes: e.target.value }))
            }}
          />

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate('/manufacturing/orders')
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              Create MO
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
