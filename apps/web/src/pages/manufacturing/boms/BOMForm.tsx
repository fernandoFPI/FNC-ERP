import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { BOM_QUERY, CREATE_BOM, UPDATE_BOM, BOMS_QUERY } from '../../../graphql/manufacturing'
import { PRODUCTS_QUERY } from '../../../graphql/inventory'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import type { BOMLine } from '../../../components/ui/BOMLinesEditor'
import { BOMLinesEditor } from '../../../components/ui/BOMLinesEditor'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { useBOMCostPreview } from '../../../hooks/useBOMCostPreview'
import { useToastStore } from '../../../store/toastStore'

export default function BOMForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const addToast = useToastStore((s) => s.addToast)
  const [form, setForm] = useState({
    finished_product_id: '',
    version: '1.0',
    qty_produced: '1',
    notes: '',
  })
  const [lines, setLines] = useState<BOMLine[]>([])

  const { data: bomData } = useQuery(BOM_QUERY, { variables: { id }, skip: !isEdit })
  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: { is_active: true } })
  const [createBOM, { loading: creating }] = useMutation(CREATE_BOM)
  const [updateBOM, { loading: updating }] = useMutation(UPDATE_BOM)

  const products = (productsData?.products ?? []).map(
    (p: {
      id: string
      name: string
      average_cost: string
      standard_cost?: string
      uom: string
    }) => ({
      id: p.id,
      name: p.name,
      standard_cost: parseFloat(p.standard_cost ?? p.average_cost ?? '0'),
      uom: p.uom,
    }),
  )

  const costPreview = useBOMCostPreview(
    lines.map((l) => ({
      component_product_id: l.component_product_id,
      qty: l.qty,
      unit_cost: l.unit_cost,
    })),
    parseFloat(form.qty_produced) || 1,
  )

  useEffect(() => {
    const b = bomData?.bom
    if (b) {
      setForm({
        finished_product_id: b.finished_product_id,
        version: b.version,
        qty_produced: String(b.qty_produced),
        notes: b.notes ?? '',
      })
      setLines(
        (b.lines ?? []).map(
          (l: {
            id: string
            component_product_id: string
            component_name?: string
            qty: number
            uom: string
            unit_cost: number
            sequence: number
          }) => ({
            id: l.id,
            component_product_id: l.component_product_id,
            component_name: l.component_name ?? '',
            qty: l.qty,
            uom: l.uom,
            unit_cost: l.unit_cost,
          }),
        ),
      )
    }
  }, [bomData])

  const productOptions = products.map((p: { id: string; name: string }) => ({
    value: p.id,
    label: p.name,
  }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.length === 0) {
      addToast({ type: 'error', message: 'Add at least one component' })
      return
    }
    const input = {
      ...form,
      qty_produced: parseFloat(form.qty_produced) || 1,
      lines: lines.map((l, idx) => ({
        component_product_id: l.component_product_id,
        qty: l.qty,
        uom: l.uom,
        unit_cost: l.unit_cost ?? 0,
        sequence: idx + 1,
      })),
    }
    try {
      if (isEdit) {
        await updateBOM({
          variables: { id, input },
          refetchQueries: [{ query: BOM_QUERY, variables: { id } }],
        })
        addToast({ type: 'success', message: 'BOM updated' })
        navigate(`/manufacturing/boms/${id}`)
      } else {
        const res = await createBOM({
          variables: { input },
          refetchQueries: [{ query: BOMS_QUERY }],
        })
        addToast({ type: 'success', message: 'BOM created' })
        navigate(`/manufacturing/boms/${res.data.createBOM.id}`)
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={isEdit ? 'Edit BOM' : 'New Bill of Materials'}
        subtitle="Define components and quantities"
      />

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}
      >
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            <SearchableSelect
              label="Finished Product"
              value={form.finished_product_id}
              onChange={(v) => {
                setForm((f) => ({ ...f, finished_product_id: v }))
              }}
              options={productOptions}
              placeholder="Select product…"
              required
            />
            <Input
              label="Version"
              value={form.version}
              onChange={(e) => {
                setForm((f) => ({ ...f, version: e.target.value }))
              }}
              required
            />
            <Input
              label="Qty Produced"
              type="number"
              step="0.001"
              value={form.qty_produced}
              onChange={(e) => {
                setForm((f) => ({ ...f, qty_produced: e.target.value }))
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
        </Card>

        <Card style={{ padding: '20px' }}>
          <BOMLinesEditor
            lines={lines}
            onChange={setLines}
            products={products}
            costPreview={costPreview ?? undefined}
          />
        </Card>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              navigate('/manufacturing/boms')
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={creating || updating}>
            {isEdit ? 'Save BOM' : 'Create BOM'}
          </Button>
        </div>
      </form>
    </div>
  )
}
