import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  RECHARGE_BUNDLES_QUERY,
  RECHARGE_COST_CENTER_QUERY,
  CREATE_RECHARGE_BUNDLE,
  UPDATE_RECHARGE_BUNDLE,
  DELETE_RECHARGE_BUNDLE,
  SET_RECHARGE_COST_CENTER,
} from '../../../graphql/recharge'
import { COST_CENTERS_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useToastStore } from '../../../store/toastStore'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { EmptyState } from '../../../components/ui/EmptyState'

interface CostCenterOption {
  id: string
  name: string
  code: string
}

interface Bundle {
  id: string
  name: string
  amount: number
  currencyCode: string
  isActive: boolean
  sortOrder: number
}

const CURRENCIES = ['IQD', 'USD']
const EMPTY_FORM = { name: '', amount: '', currencyCode: 'IQD', sortOrder: '0' }

export default function RechargeBundlesPage() {
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const addToast = useToastStore((s) => s.addToast)

  const { data, loading, refetch } = useQuery(RECHARGE_BUNDLES_QUERY, {
    variables: { activeOnly: false },
    fetchPolicy: 'cache-and-network',
  })
  const [createBundle, { loading: creating }] = useMutation(CREATE_RECHARGE_BUNDLE)
  const [updateBundle, { loading: updating }] = useMutation(UPDATE_RECHARGE_BUNDLE)
  const [deleteBundle] = useMutation(DELETE_RECHARGE_BUNDLE)

  const { data: costCentersData } = useQuery(COST_CENTERS_QUERY)
  const {
    data: currentCCData,
    loading: currentCCLoading,
    refetch: refetchCurrentCC,
  } = useQuery(RECHARGE_COST_CENTER_QUERY, { fetchPolicy: 'cache-and-network' })
  const [setRechargeCostCenter, { loading: savingCC }] = useMutation(SET_RECHARGE_COST_CENTER)
  const [selectedCCId, setSelectedCCId] = useState('')

  const costCenters: CostCenterOption[] = costCentersData?.costCenters ?? []
  const currentCC = currentCCData?.rechargeCostCenter as { id: string } | null | undefined

  useEffect(() => {
    if (currentCC?.id) setSelectedCCId(currentCC.id)
  }, [currentCC?.id])

  async function handleSaveCostCenter() {
    if (!selectedCCId) return
    try {
      await setRechargeCostCenter({ variables: { costCenterId: selectedCCId } })
      addToast({ type: 'success', message: 'Recharge cost center updated' })
      void refetchCurrentCC()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  const [modal, setModal] = useState<{ open: boolean; editing: Bundle | null }>({
    open: false,
    editing: null,
  })
  const [form, setForm] = useState(EMPTY_FORM)

  const bundles: Bundle[] = data?.rechargeBundles ?? []

  function openCreate() {
    setForm(EMPTY_FORM)
    setModal({ open: true, editing: null })
  }

  function openEdit(b: Bundle) {
    setForm({
      name: b.name,
      amount: String(b.amount),
      currencyCode: b.currencyCode,
      sortOrder: String(b.sortOrder),
    })
    setModal({ open: true, editing: b })
  }

  async function handleSave() {
    const amount = parseFloat(form.amount)
    if (!form.name.trim() || !amount || amount <= 0) {
      addToast({ type: 'error', message: 'Name and a positive amount are required' })
      return
    }
    const input = {
      name: form.name.trim(),
      amount,
      currencyCode: form.currencyCode,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    }
    try {
      if (modal.editing) {
        await updateBundle({ variables: { id: modal.editing.id, input } })
        addToast({ type: 'success', message: 'Bundle updated' })
      } else {
        await createBundle({ variables: { input } })
        addToast({ type: 'success', message: 'Bundle created' })
      }
      setModal({ open: false, editing: null })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleToggleActive(b: Bundle) {
    try {
      await updateBundle({ variables: { id: b.id, input: { isActive: !b.isActive } } })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleDelete(b: Bundle) {
    try {
      await deleteBundle({ variables: { id: b.id } })
      addToast({ type: 'success', message: 'Bundle removed' })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '900px' }}>
      <PageHeader
        title="Recharge Settings"
        subtitle="The bundle catalog and cost center for phone recharge requests"
        backPath="/recharge"
      />

      <Card style={{ padding: '20px', marginTop: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
          Recharge Cost Center
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
          Every recharge request is charged to this single cost center — its assigned fulfiller
          (set on the Cost Centers page in Finance) is who gets notified and sends the bundle.
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '420px' }}>
          <div style={{ flex: 1 }}>
            <Select
              label="Cost Center"
              value={selectedCCId}
              onChange={(e) => {
                setSelectedCCId(e.target.value)
              }}
              disabled={currentCCLoading}
            >
              <option value="">Select cost center…</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="primary"
            loading={savingCC}
            disabled={!selectedCCId || selectedCCId === currentCC?.id}
            onClick={() => void handleSaveCostCenter()}
          >
            Save
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Bundle Catalog</div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          + New Bundle
        </Button>
      </div>

      <div style={{ marginTop: '12px' }}>
        {!loading && bundles.length === 0 ? (
          <EmptyState
            title="No bundles yet"
            message="Add a recharge bundle so employees have something to request."
            action={
              <Button variant="primary" size="sm" onClick={openCreate}>
                New Bundle
              </Button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {bundles.map((b) => (
              <Card
                key={b.id}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: b.isActive ? 1 : 0.55,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: theme.accentBg,
                      color: theme.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '13px',
                    }}
                  >
                    {b.currencyCode}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: theme.textPrimary }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: '13px', color: theme.accent, fontWeight: 600 }}>
                      {b.amount.toLocaleString()} {b.currencyCode}
                    </div>
                  </div>
                  {!b.isActive && <Badge variant="neutral">Inactive</Badge>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      openEdit(b)
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleToggleActive(b)}>
                    {b.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(b)}>
                    Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modal.open}
        onClose={() => {
          setModal({ open: false, editing: null })
        }}
        title={modal.editing ? 'Edit Bundle' : 'New Bundle'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setModal({ open: false, editing: null })
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={creating || updating} onClick={() => void handleSave()}>
              {modal.editing ? 'Save changes' : 'Create Bundle'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            placeholder="e.g. 5,000 IQD Data Bundle"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: e.target.value }))
              }}
            />
            <Select
              label="Currency"
              value={form.currencyCode}
              onChange={(e) => {
                setForm((f) => ({ ...f, currencyCode: e.target.value }))
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => {
              setForm((f) => ({ ...f, sortOrder: e.target.value }))
            }}
          />
        </div>
      </Modal>
    </div>
  )
}
