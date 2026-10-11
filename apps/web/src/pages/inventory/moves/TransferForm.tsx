import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_TRANSFER, STOCK_LOCATIONS_QUERY, PRODUCTS_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { useToastStore } from '../../../store/toastStore'
import type { CreateManualTransferMutation, CreateManualTransferMutationVariables, ProductsQuery, ProductsQueryVariables, StockLocationsQuery, StockLocationsQueryVariables } from '../../../graphql/generated'

interface TransferLine {
  product_id: string
  qty: string
  unit_cost: string
}

const emptyLine = (): TransferLine => ({ product_id: '', qty: '1', unit_cost: '0' })

export default function TransferForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    from_location_id: '',
    to_location_id: '',
    move_date: new Date().toISOString().split('T')[0],
    reference: '',
  })
  const [lines, setLines] = useState<TransferLine[]>([emptyLine()])

  const { data: locationsData } = useQuery<StockLocationsQuery, StockLocationsQueryVariables>(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: productsData } = useQuery<ProductsQuery, ProductsQueryVariables>(PRODUCTS_QUERY, { variables: {} })
  const [createTransfer, { loading }] = useMutation<CreateManualTransferMutation, CreateManualTransferMutationVariables>(CREATE_TRANSFER)

  const locations = locationsData?.stockLocations ?? []
  const products = productsData?.products ?? []

  const lineFields: LineItemField<TransferLine>[] = [
    {
      key: 'product_id',
      label: t('inv.transfer.product'),
      render: (line, i) => (
        <Select
          value={line.product_id}
          onChange={(e) => {
            setLines((p) =>
              p.map((l, idx) => (idx === i ? { ...l, product_id: e.target.value } : l)),
            )
          }}
          required
        >
          <option value="">{t('inv.transfer.selectProduct')}</option>
          {products.filter((v): v is NonNullable<typeof v> => v !== null).map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
              {p.name_ar ? ` (${p.name_ar})` : ''}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'qty',
      label: t('inv.transfer.qty'),
      width: '100px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={t('inv.transfer.qty')}
          value={line.qty}
          onChange={(e) => {
            setLines((p) => p.map((l, idx) => (idx === i ? { ...l, qty: e.target.value } : l)))
          }}
        />
      ),
    },
    {
      key: 'unit_cost',
      label: t('inv.transfer.unitCost'),
      width: '100px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={t('inv.transfer.cost')}
          value={line.unit_cost}
          onChange={(e) => {
            setLines((p) =>
              p.map((l, idx) => (idx === i ? { ...l, unit_cost: e.target.value } : l)),
            )
          }}
        />
      ),
    },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.from_location_id || !form.to_location_id) {
      addToast({ type: 'error', message: t('inv.transfer.selectBothLocations') })
      return
    }
    if (form.from_location_id === form.to_location_id) {
      addToast({ type: 'error', message: t('inv.transfer.sourceAndDestinationMustDiffer') })
      return
    }
    try {
      await createTransfer({
        variables: {
          input: {
            from_location_id: form.from_location_id,
            to_location_id: form.to_location_id,
            move_date: form.move_date,
            reference: form.reference || undefined,
            lines: lines
              .filter((l) => l.product_id)
              .map((l) => ({
                product_id: l.product_id,
                qty: parseFloat(l.qty),
                unit_cost: parseFloat(l.unit_cost) || undefined,
              })),
          },
        },
      })
      addToast({ type: 'success', message: t('inv.transfer.transferCreated') })
      navigate('/inventory/moves')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title={t('inv.transfer.manualTransfer')}
        subtitle={t('inv.transfer.moveStockBetweenLocations')}
        backPath="/inventory/moves"
      />

      <form onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}>
        <Card
          style={{
            marginTop: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Select
              label={t('inv.transfer.fromLocation')}
              value={form.from_location_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, from_location_id: e.target.value }))
              }}
              required
            >
              <option value="">{t('inv.transfer.select')}</option>
              {locations.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('inv.transfer.toLocation')}
              value={form.to_location_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, to_location_id: e.target.value }))
              }}
              required
            >
              <option value="">{t('inv.transfer.select')}</option>
              {locations.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label={t('inv.transfer.transferDate')}
              type="date"
              value={form.move_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, move_date: e.target.value }))
              }}
              required
            />
            <Input
              label={t('inv.transfer.reference')}
              value={form.reference}
              onChange={(e) => {
                setForm((f) => ({ ...f, reference: e.target.value }))
              }}
              placeholder={t('inv.transfer.optional')}
            />
          </div>
        </Card>

        <Card style={{ marginTop: '16px' }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: 600,
              color: theme.textPrimary,
            }}
          >
            {t('inv.transfer.lines')}
          </div>
          <div style={{ padding: '12px' }}>
            <LineItemEditor
              fields={lineFields}
              rows={lines}
              onRemoveRow={(i) => {
                setLines((p) => p.filter((_, idx) => idx !== i))
              }}
              removeDisabled={() => lines.length <= 1}
              onAddRow={() => {
                setLines((p) => [...p, emptyLine()])
              }}
              addLabel={t('inv.transfer.addLine')}
            />
          </div>
        </Card>

        <div
          style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}
        >
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              navigate('/inventory/moves')
            }}
          >
            {t('inv.transfer.cancel')}
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            {t('inv.transfer.createTransfer')}
          </Button>
        </div>
      </form>
    </div>
  )
}
