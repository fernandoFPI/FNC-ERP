import { useTranslation } from 'react-i18next'
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
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import type { BoMsQuery, BoMsQueryVariables, CreateManufacturingOrderMutation, CreateManufacturingOrderMutationVariables, ProjectsQuery, ProjectsQueryVariables, WorkCentersQuery, WorkCentersQueryVariables } from '../../../graphql/generated'

export default function ManufacturingOrderForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const addToast = useToastStore((s) => s.addToast)
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

  const { data: bomsData } = useQuery<BoMsQuery, BoMsQueryVariables>(BOMS_QUERY, { variables: { isActive: true } })
  const { data: wcsData } = useQuery<WorkCentersQuery, WorkCentersQueryVariables>(WORK_CENTERS_QUERY, { variables: { isActive: true } })
  const { data: projData } = useQuery<ProjectsQuery, ProjectsQueryVariables>(PROJECTS_QUERY, { variables: { status: 'active' } })
  const [createMO, { loading }] = useMutation<CreateManufacturingOrderMutation, CreateManufacturingOrderMutationVariables>(CREATE_MANUFACTURING_ORDER)

  const boms = bomsData?.boms ?? []
  const workCenters = wcsData?.workCenters ?? []
  const projects = projData?.projects.data ?? []

  // auto-select work center if only one
  useEffect(() => {
    if (workCenters.length === 1 && !form.work_center_id) {
      setForm((f) => ({ ...f, work_center_id: workCenters[0].id }))
    }
  }, [workCenters, form.work_center_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.bom_id) {
      addToast({ type: 'error', message: t('mfg.moForm.selectABom') })
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
      if (!res.data?.createManufacturingOrder) {
        addToast({ type: 'error', message: t('mfg.moForm.manufacturingOrderCreationDidNotReturn') })
        return
      }
      addToast({ type: 'success', message: t('mfg.moForm.manufacturingOrderCreated') })
      navigate(`/manufacturing/orders/${res.data.createManufacturingOrder.id}`)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader title={t('mfg.moForm.newManufacturingOrder')} subtitle={t('mfg.moForm.createFromBom')} />
      <Card style={{ marginTop: '20px' }}>
        <form
          onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}
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
                label={t('mfg.moForm.billOfMaterials')}
                value={form.bom_id}
                onChange={(v) => {
                  setForm((f) => ({ ...f, bom_id: v }))
                }}
                placeholder={t('mfg.moForm.selectBom')}
                options={boms.map((b) => ({
                  value: b.id,
                  label: `${b.product_name} v${b.version}`,
                }))}
              />
            </div>
            <Input
              label={t('mfg.moForm.qtyToProduce')}
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
                label={t('mfg.moForm.workCenter')}
                value={form.work_center_id}
                onChange={(v) => {
                  setForm((f) => ({ ...f, work_center_id: v }))
                }}
                placeholder={t('mfg.moForm.none')}
                options={workCenters.map((wc: { id: string; name: string }) => ({
                  value: wc.id,
                  label: wc.name,
                }))}
              />
            </div>
            <div>
              <SearchableSelect
                label={t('mfg.moForm.projectOptional')}
                value={form.project_id}
                onChange={(v) => {
                  setForm((f) => ({ ...f, project_id: v }))
                }}
                placeholder={t('mfg.moForm.none')}
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
              label={t('mfg.moForm.scheduledStart')}
              type="date"
              value={form.scheduled_start}
              onChange={(e) => {
                setForm((f) => ({ ...f, scheduled_start: e.target.value }))
              }}
            />
            <Input
              label={t('mfg.moForm.scheduledEnd')}
              type="date"
              value={form.scheduled_end}
              onChange={(e) => {
                setForm((f) => ({ ...f, scheduled_end: e.target.value }))
              }}
            />
          </div>

          <Input
            label={t('mfg.moForm.notes')}
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
              {t('mfg.moForm.cancel')}
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              {t('mfg.moForm.createMo')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
