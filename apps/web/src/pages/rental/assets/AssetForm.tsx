import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  EQUIPMENT_ASSET_QUERY,
  CREATE_EQUIPMENT_ASSET,
  UPDATE_EQUIPMENT_ASSET,
  EQUIPMENT_ASSETS_QUERY,
} from '../../../graphql/rental'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { CreateEquipmentAssetMutation, CreateEquipmentAssetMutationVariables, EquipmentAssetQuery, EquipmentAssetQueryVariables, UpdateEquipmentAssetMutation, UpdateEquipmentAssetMutationVariables } from '../../../graphql/generated'

const STATUSES = ['available', 'rented', 'maintenance', 'reserved', 'retired']
const CATEGORIES = ['vehicle', 'machinery', 'equipment', 'tool', 'other']

export default function AssetForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'vehicle',
    serial_number: '',
    purchase_date: '',
    purchase_price: '',
    daily_rate: '',
    currency_code: 'IQD',
    maintenance_due_hours: '',
    status: 'available',
  })

  const { data } = useQuery<EquipmentAssetQuery, EquipmentAssetQueryVariables>(EQUIPMENT_ASSET_QUERY, { variables: { id: id ?? '' }, skip: !isEdit })
  const [createAsset, { loading: creating }] = useMutation<CreateEquipmentAssetMutation, CreateEquipmentAssetMutationVariables>(CREATE_EQUIPMENT_ASSET)
  const [updateAsset, { loading: updating }] = useMutation<UpdateEquipmentAssetMutation, UpdateEquipmentAssetMutationVariables>(UPDATE_EQUIPMENT_ASSET)

  useEffect(() => {
    const a = data?.equipmentAsset
    if (a) {
      setForm({
        name: a.name,
        description: a.description ?? '',
        category: a.category ?? 'vehicle',
        serial_number: a.serial_number ?? '',
        purchase_date: a.purchase_date ?? '',
        purchase_price: String(a.purchase_price ?? ''),
        daily_rate: String(a.daily_rate),
        currency_code: a.currency_code,
        maintenance_due_hours: String(a.maintenance_due_hours ?? ''),
        status: a.status,
      })
    }
  }, [data])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      ...form,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      daily_rate: parseFloat(form.daily_rate) || 0,
      maintenance_due_hours: form.maintenance_due_hours
        ? parseFloat(form.maintenance_due_hours)
        : null,
    }
    try {
      if (isEdit) {
        await updateAsset({
          variables: { id, input },
          refetchQueries: [{ query: EQUIPMENT_ASSET_QUERY, variables: { id } }],
        })
        addToast({ type: 'success', message: t('rental.assetForm.assetUpdated') })
        navigate(`/rental/assets/${id}`)
      } else {
        const res = await createAsset({
          variables: { input },
          refetchQueries: [{ query: EQUIPMENT_ASSETS_QUERY }],
        })
        if (!res.data?.createEquipmentAsset) {
          addToast({ type: 'error', message: t('rental.assetForm.assetCreationDidNotReturnA') })
          return
        }
        addToast({ type: 'success', message: t('rental.assetForm.assetCreated') })
        navigate(`/rental/assets/${res.data.createEquipmentAsset.id}`)
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title={isEdit ? t('rental.assetForm.editAsset') : t('rental.assetForm.newEquipmentAsset')}
        subtitle={isEdit ? t('rental.assetForm.updateAssetDetails') : t('rental.assetForm.addToFleet')}
      />
      <Card style={{ marginTop: '20px' }}>
        <form
          onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <Input
              label={t('rental.assetForm.assetName')}
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
              }}
              required
            />
            <div>
              <SearchableSelect
                label={t('rental.assetForm.category')}
                value={form.category}
                onChange={(v) => {
                  setForm((f) => ({ ...f, category: v }))
                }}
                options={CATEGORIES.map((c) => ({ value: c, label: enumLabel(c) }))}
              />
            </div>
          </div>
          <Input
            label={t('rental.assetForm.description')}
            value={form.description}
            onChange={(e) => {
              setForm((f) => ({ ...f, description: e.target.value }))
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label={t('rental.assetForm.serialNumber')}
              value={form.serial_number}
              onChange={(e) => {
                setForm((f) => ({ ...f, serial_number: e.target.value }))
              }}
            />
            <div>
              <SearchableSelect
                label={t('rental.assetForm.status')}
                value={form.status}
                onChange={(v) => {
                  setForm((f) => ({ ...f, status: v }))
                }}
                options={STATUSES.map((s) => ({ value: s, label: enumLabel(s) }))}
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
              label={t('rental.assetForm.purchaseDate')}
              type="date"
              value={form.purchase_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, purchase_date: e.target.value }))
              }}
            />
            <Input
              label={t('rental.assetForm.purchasePrice')}
              type="number"
              step="0.01"
              value={form.purchase_price}
              onChange={(e) => {
                setForm((f) => ({ ...f, purchase_price: e.target.value }))
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <Input
              label={t('rental.assetForm.dailyRate')}
              type="number"
              step="0.01"
              value={form.daily_rate}
              onChange={(e) => {
                setForm((f) => ({ ...f, daily_rate: e.target.value }))
              }}
              required
            />
            <div>
              <SearchableSelect
                label={t('rental.assetForm.currency')}
                value={form.currency_code}
                onChange={(v) => {
                  setForm((f) => ({ ...f, currency_code: v }))
                }}
                options={[
                  { value: 'IQD', label: t('rental.assetForm.iqd') },
                  { value: 'USD', label: t('rental.assetForm.usd') },
                  { value: 'EUR', label: t('rental.assetForm.eur') },
                ]}
              />
            </div>
          </div>
          <Input
            label={t('rental.assetForm.maintenanceDueHours')}
            type="number"
            step="1"
            value={form.maintenance_due_hours}
            onChange={(e) => {
              setForm((f) => ({ ...f, maintenance_due_hours: e.target.value }))
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate('/rental/assets')
              }}
            >
              {t('rental.assetForm.cancel')}
            </Button>
            <Button variant="primary" type="submit" loading={creating || updating}>
              {isEdit ? t('rental.assetForm.save') : t('rental.assetForm.createAsset')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
