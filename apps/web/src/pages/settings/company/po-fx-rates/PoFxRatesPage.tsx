import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { useToastStore } from '../../../../store/toastStore'
import { api } from '../../../../lib/axios'

interface PoFxRate {
  currency_code: string
  rate_to_base: number
  is_default: boolean
  updated_at: string | null
}

export default function PoFxRatesPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [rates, setRates] = useState<PoFxRate[]>([])
  const [baseCurrency, setBaseCurrency] = useState('IQD')
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [newCurrency, setNewCurrency] = useState('')
  const [newRate, setNewRate] = useState('')
  const [adding, setAdding] = useState(false)
  const [settingDefault, setSettingDefault] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ rates: PoFxRate[]; base_currency: string }>('/admin/po-fx-rates')
      .then((r) => {
        setRates(r.data.rates)
        setBaseCurrency(r.data.base_currency)
      })
      .catch(() => {
        addToast({ type: 'error', message: 'Failed to load PO exchange rates' })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [addToast])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave(currencyCode: string) {
    const raw = edits[currencyCode]
    const rate = parseFloat(raw)
    if (!raw || isNaN(rate) || rate <= 0) {
      addToast({ type: 'error', message: 'Enter a positive rate' })
      return
    }
    setSaving(currencyCode)
    try {
      await api.put(`/admin/po-fx-rates/${currencyCode}`, { rate_to_base: rate })
      addToast({ type: 'success', message: `${currencyCode} rate saved` })
      const next = { ...edits }
      delete next[currencyCode]
      setEdits(next)
      load()
    } catch {
      addToast({ type: 'error', message: 'Failed to save rate' })
    } finally {
      setSaving(null)
    }
  }

  async function handleSetDefault(currencyCode: string) {
    setSettingDefault(currencyCode)
    try {
      await api.patch(`/admin/po-fx-rates/${currencyCode}/default`)
      addToast({ type: 'success', message: `${currencyCode} is now the default PO currency` })
      load()
    } catch {
      addToast({ type: 'error', message: 'Failed to set default' })
    } finally {
      setSettingDefault(null)
    }
  }

  async function handleDelete(currencyCode: string) {
    setDeleting(currencyCode)
    try {
      await api.delete(`/admin/po-fx-rates/${currencyCode}`)
      addToast({ type: 'success', message: `${currencyCode} rate removed` })
      load()
    } catch {
      addToast({ type: 'error', message: 'Failed to remove rate' })
    } finally {
      setDeleting(null)
    }
  }

  async function handleAdd() {
    const code = newCurrency.trim().toUpperCase()
    const rate = parseFloat(newRate)
    if (code.length !== 3) {
      addToast({ type: 'error', message: 'Currency code must be 3 letters (e.g. USD)' })
      return
    }
    if (code === baseCurrency) {
      addToast({
        type: 'error',
        message: `${code} is the base currency already — no rate needed`,
      })
      return
    }
    if (rates.some((r) => r.currency_code === code)) {
      addToast({ type: 'error', message: `${code} already has a rate — edit it below` })
      return
    }
    if (!newRate || isNaN(rate) || rate <= 0) {
      addToast({ type: 'error', message: 'Enter a positive rate' })
      return
    }
    setAdding(true)
    try {
      await api.put(`/admin/po-fx-rates/${code}`, { rate_to_base: rate })
      addToast({ type: 'success', message: `${code} rate added` })
      setNewCurrency('')
      setNewRate('')
      load()
    } catch {
      addToast({ type: 'error', message: 'Failed to add rate' })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <PageHeader
        title="PO Exchange Rates"
        subtitle={`Rates used to convert PO lines priced in another currency into the company's base currency (${baseCurrency})`}
      />

      <div
        style={{
          padding: '12px 16px',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          fontSize: '12px',
          color: theme.textMuted,
          marginTop: '16px',
          marginBottom: '16px',
        }}
      >
        Each rate applies to every PO going forward until you change it here — it is not looked
        up per-date automatically. A PO line priced in {baseCurrency} never needs a rate (it's
        already 1:1). Changing a rate here only affects lines priced after the change; existing
        PO lines keep the rate that was in effect when they were priced.
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: '60px', borderRadius: '10px' }} />
          ))}
        </div>
      ) : (
        <Card padding="none" style={{ marginBottom: '16px' }}>
          {rates.length === 0 ? (
            <div style={{ padding: '20px', fontSize: '13px', color: theme.textMuted }}>
              No exchange rates configured yet. Every PO line is currently assumed to already be
              in {baseCurrency}.
            </div>
          ) : (
            rates.map((r, i) => {
              const editVal = edits[r.currency_code]
              const hasEdit = editVal !== undefined && editVal !== String(r.rate_to_base)
              return (
                <div
                  key={r.currency_code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 20px',
                    borderBottom:
                      i < rates.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '70px',
                      fontWeight: 600,
                      color: theme.textPrimary,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {r.currency_code}
                    {r.is_default && (
                      <span
                        title="Default currency for new POs"
                        style={{ fontSize: '13px', lineHeight: 1 }}
                      >
                        ⭐
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>1 {r.currency_code} =</div>
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={editVal ?? String(r.rate_to_base)}
                    onChange={(e) => {
                      setEdits((prev) => ({ ...prev, [r.currency_code]: e.target.value }))
                    }}
                    style={{
                      width: '120px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgSurface,
                      color: theme.textPrimary,
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>{baseCurrency}</div>
                  {r.updated_at && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginLeft: 'auto' }}>
                      Updated {new Date(r.updated_at).toLocaleDateString()}
                    </div>
                  )}
                  {!r.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={settingDefault === r.currency_code}
                      onClick={() => void handleSetDefault(r.currency_code)}
                    >
                      Set as default
                    </Button>
                  )}
                  <Button
                    variant={hasEdit ? 'primary' : 'ghost'}
                    size="sm"
                    disabled={!hasEdit}
                    loading={saving === r.currency_code}
                    onClick={() => void handleSave(r.currency_code)}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === r.currency_code}
                    onClick={() => void handleDelete(r.currency_code)}
                  >
                    Remove
                  </Button>
                </div>
              )
            })
          )}
        </Card>
      )}

      <Card style={{ padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary, marginBottom: '10px' }}>
          Add a currency
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <Input
            label="Currency Code"
            placeholder="USD"
            maxLength={3}
            value={newCurrency}
            onChange={(e) => {
              setNewCurrency(e.target.value.toUpperCase())
            }}
            style={{ width: '110px' }}
          />
          <Input
            label={`Rate to ${baseCurrency}`}
            type="number"
            min={0}
            step="0.0001"
            placeholder="1450"
            value={newRate}
            onChange={(e) => {
              setNewRate(e.target.value)
            }}
            style={{ width: '160px' }}
          />
          <Button variant="primary" loading={adding} onClick={() => void handleAdd()}>
            Add Rate
          </Button>
        </div>
      </Card>
    </div>
  )
}
