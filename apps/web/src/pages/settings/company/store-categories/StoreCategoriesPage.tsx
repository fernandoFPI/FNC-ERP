import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { Badge } from '../../../../components/ui/Badge'
import { useToastStore } from '../../../../store/toastStore'
import { api } from '../../../../lib/axios'

interface StoreCategory {
  id: string
  name: string
  sku_prefix: string
  slug: string
  is_active: boolean
  created_at: string
}

export default function StoreCategoriesPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newPrefix, setNewPrefix] = useState('')
  const [adding, setAdding] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ categories: StoreCategory[] }>('/product-store-categories', {
        params: { includeInactive: 'true' },
      })
      .then((r) => {
        setCategories(r.data.categories)
      })
      .catch(() => {
        addToast({ type: 'error', message: t('settings.storecats.failedToLoadStoreCategories') })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [addToast])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd() {
    const name = newName.trim()
    const prefix = newPrefix.trim().toUpperCase()
    if (name.length < 2) {
      addToast({ type: 'error', message: t('settings.storecats.enterACategoryNameAtLeast') })
      return
    }
    if (!/^[A-Z0-9]{2,10}$/.test(prefix)) {
      addToast({ type: 'error', message: t('settings.storecats.prefixMustBe210Letters') })
      return
    }
    setAdding(true)
    try {
      await api.post('/product-store-categories', { name, sku_prefix: prefix })
      addToast({ type: 'success', message: `${name} added` })
      setNewName('')
      setNewPrefix('')
      load()
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('settings.storecats.failedAdd')
      addToast({ type: 'error', message })
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(cat: StoreCategory) {
    setTogglingId(cat.id)
    try {
      await api.patch(`/product-store-categories/${cat.id}/active`, { is_active: !cat.is_active })
      addToast({
        type: 'success',
        message: `${cat.name} ${cat.is_active ? 'deactivated' : 'reactivated'}`,
      })
      load()
    } catch {
      addToast({ type: 'error', message: t('settings.storecats.failedToUpdateCategory') })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <PageHeader
        title={t('settings.storecats.storeCategories')}
        subtitle={t('settings.storecats.theStoreSubCategoryListShown')}
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
        {t('settings.storecats.deactivatingACategoryOnlyHidesIt')}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '52px', borderRadius: '10px' }} />
          ))}
        </div>
      ) : (
        <Card padding="none" style={{ marginBottom: '16px' }}>
          {categories.length === 0 ? (
            <div style={{ padding: '20px', fontSize: '13px', color: theme.textMuted }}>
              {t('settings.storecats.noStoreCategoriesConfiguredYet')}
            </div>
          ) : (
            categories.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  opacity: c.is_active ? 1 : 0.55,
                  borderBottom:
                    i < categories.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
                }}
              >
                <div style={{ flex: 1, fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>
                  {c.name}
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: theme.textMuted,
                    width: '80px',
                  }}
                >
                  {c.sku_prefix}-###
                </div>
                {!c.is_active && <Badge variant="neutral">{t('settings.storecats.inactive')}</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  loading={togglingId === c.id}
                  onClick={() => void handleToggle(c)}
                >
                  {c.is_active ? t('settings.storecats.deactivate') : t('settings.storecats.reactivate')}
                </Button>
              </div>
            ))
          )}
        </Card>
      )}

      <Card style={{ padding: '16px 20px' }}>
        <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary, marginBottom: '10px' }}>
          {t('settings.storecats.addACategory')}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Input
            label={t('settings.storecats.name')}
            placeholder={t('settings.storecats.eGHardwareStore')}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
            }}
            style={{ width: '240px' }}
          />
          <Input
            label={t('settings.storecats.skuPrefix')}
            placeholder="HW"
            maxLength={10}
            value={newPrefix}
            onChange={(e) => {
              setNewPrefix(e.target.value.toUpperCase())
            }}
            style={{ width: '120px' }}
          />
          <Button variant="primary" loading={adding} onClick={() => void handleAdd()}>
            {t('settings.storecats.addCategory')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
