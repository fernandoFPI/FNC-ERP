import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  RECHARGE_BUNDLES_QUERY,
  RECHARGE_COST_CENTER_QUERY,
  RECHARGE_ACCOUNTS_QUERY,
  CREATE_RECHARGE_BUNDLE,
  UPDATE_RECHARGE_BUNDLE,
  DELETE_RECHARGE_BUNDLE,
  SET_RECHARGE_COST_CENTER,
  SET_RECHARGE_ACCOUNTS,
} from '../../../graphql/recharge'
import { COST_CENTERS_QUERY, ACCOUNTS_QUERY } from '../../../graphql/finance'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
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
import type { AccountsQuery, AccountsQueryVariables, CostCentersQuery, CostCentersQueryVariables, CreateRechargeBundleMutation, CreateRechargeBundleMutationVariables, DeleteRechargeBundleMutation, DeleteRechargeBundleMutationVariables, RechargeAccountsQuery, RechargeAccountsQueryVariables, RechargeBundlesQuery, RechargeBundlesQueryVariables, RechargeCostCenterQuery, RechargeCostCenterQueryVariables, SetRechargeAccountsMutation, SetRechargeAccountsMutationVariables, SetRechargeCostCenterMutation, SetRechargeCostCenterMutationVariables, UpdateRechargeBundleMutation, UpdateRechargeBundleMutationVariables } from '../../../graphql/generated'

interface CostCenterOption {
  id: string
  name: string
  code: string
}

interface AccountOption {
  id: string
  code: string
  name: string
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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const addToast = useToastStore((s) => s.addToast)

  const { data, loading, refetch } = useQuery<RechargeBundlesQuery, RechargeBundlesQueryVariables>(RECHARGE_BUNDLES_QUERY, {
    variables: { activeOnly: false },
    fetchPolicy: 'cache-and-network',
  })
  const [createBundle, { loading: creating }] = useMutation<CreateRechargeBundleMutation, CreateRechargeBundleMutationVariables>(CREATE_RECHARGE_BUNDLE)
  const [updateBundle, { loading: updating }] = useMutation<UpdateRechargeBundleMutation, UpdateRechargeBundleMutationVariables>(UPDATE_RECHARGE_BUNDLE)
  const [deleteBundle] = useMutation<DeleteRechargeBundleMutation, DeleteRechargeBundleMutationVariables>(DELETE_RECHARGE_BUNDLE)

  const { data: costCentersData } = useQuery<CostCentersQuery, CostCentersQueryVariables>(COST_CENTERS_QUERY)
  const {
    data: currentCCData,
    loading: currentCCLoading,
    refetch: refetchCurrentCC,
  } = useQuery<RechargeCostCenterQuery, RechargeCostCenterQueryVariables>(RECHARGE_COST_CENTER_QUERY, { fetchPolicy: 'cache-and-network' })
  const [setRechargeCostCenter, { loading: savingCC }] = useMutation<SetRechargeCostCenterMutation, SetRechargeCostCenterMutationVariables>(SET_RECHARGE_COST_CENTER)
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
      addToast({ type: 'success', message: t('hr.bundles.rechargeCostCenterUpdated') })
      void refetchCurrentCC()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  const { data: accountsData } = useQuery<AccountsQuery, AccountsQueryVariables>(ACCOUNTS_QUERY, { variables: { isActive: true } })
  const {
    data: currentAccountsData,
    loading: currentAccountsLoading,
    refetch: refetchCurrentAccounts,
  } = useQuery<RechargeAccountsQuery, RechargeAccountsQueryVariables>(RECHARGE_ACCOUNTS_QUERY, { fetchPolicy: 'cache-and-network' })
  const [setRechargeAccounts, { loading: savingAccounts }] = useMutation<SetRechargeAccountsMutation, SetRechargeAccountsMutationVariables>(SET_RECHARGE_ACCOUNTS)
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [fundingAccountId, setFundingAccountId] = useState('')

  const accounts: AccountOption[] = (accountsData?.accounts ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const currentAccounts = currentAccountsData?.rechargeAccounts as
    | { expenseAccountId: string | null; fundingAccountId: string | null }
    | undefined

  useEffect(() => {
    setExpenseAccountId(currentAccounts?.expenseAccountId ?? '')
    setFundingAccountId(currentAccounts?.fundingAccountId ?? '')
  }, [currentAccounts])

  async function handleSaveAccounts() {
    try {
      await setRechargeAccounts({
        variables: {
          expenseAccountId: expenseAccountId || null,
          fundingAccountId: fundingAccountId || null,
        },
      })
      addToast({ type: 'success', message: t('hr.bundles.rechargeAccountsUpdated') })
      void refetchCurrentAccounts()
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
      addToast({ type: 'error', message: t('hr.bundles.nameAndAPositiveAmountAre') })
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
        addToast({ type: 'success', message: t('hr.bundles.bundleUpdated') })
      } else {
        await createBundle({ variables: { input } })
        addToast({ type: 'success', message: t('hr.bundles.bundleCreated') })
      }
      setModal({ open: false, editing: null })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleToggleActive(b: Bundle) {
    try {
      await updateBundle({
        variables: {
          id: b.id,
          input: {
            name: b.name,
            amount: b.amount,
            currencyCode: b.currencyCode,
            sortOrder: b.sortOrder,
            isActive: !b.isActive,
          },
        },
      })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleDelete(b: Bundle) {
    try {
      await deleteBundle({ variables: { id: b.id } })
      addToast({ type: 'success', message: t('hr.bundles.bundleRemoved') })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '900px' }}>
      <PageHeader
        title={t('hr.bundles.rechargeSettings')}
        subtitle={t('hr.bundles.theBundleCatalogAndCostCenter')}
        backPath="/recharge"
      />

      <Card style={{ padding: '20px', marginTop: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
          {t('hr.bundles.rechargeCostCenter')}
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
          {t('hr.bundles.everyRechargeRequestIsChargedTo')}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '420px' }}>
          <div style={{ flex: 1 }}>
            <Select
              label={t('hr.bundles.costCenter')}
              value={selectedCCId}
              onChange={(e) => {
                setSelectedCCId(e.target.value)
              }}
              disabled={currentCCLoading}
            >
              <option value="">{t('hr.bundles.selectCostCenter')}</option>
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
            {t('hr.bundles.save')}
          </Button>
        </div>
      </Card>

      <Card style={{ padding: '20px', marginTop: '16px' }}>
        <div
          style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}
        >
          {t('hr.bundles.rechargeGlAccounts')}
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
          {t('hr.bundles.whenARequestIsFulfilledIts')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            alignItems: 'flex-end',
            maxWidth: '600px',
          }}
        >
          <SearchableSelect
            label={t('hr.bundles.expenseAccountDebit')}
            value={expenseAccountId}
            onChange={setExpenseAccountId}
            placeholder={currentAccountsLoading ? t('hr.bundles.loading') : t('hr.bundles.none')}
            options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
          />
          <SearchableSelect
            label={t('hr.bundles.fundingAccountCredit')}
            value={fundingAccountId}
            onChange={setFundingAccountId}
            placeholder={currentAccountsLoading ? t('hr.bundles.loading') : t('hr.bundles.none')}
            options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <Button
            variant="primary"
            loading={savingAccounts}
            disabled={
              expenseAccountId === (currentAccounts?.expenseAccountId ?? '') &&
              fundingAccountId === (currentAccounts?.fundingAccountId ?? '')
            }
            onClick={() => void handleSaveAccounts()}
          >
            {t('hr.bundles.save')}
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{t('hr.bundles.bundleCatalog')}</div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          {t('hr.bundles.newBundle')}
        </Button>
      </div>

      <div style={{ marginTop: '12px' }}>
        {!loading && bundles.length === 0 ? (
          <EmptyState
            title={t('hr.bundles.noBundlesYet')}
            message={t('hr.bundles.addARechargeBundleSoEmployees')}
            action={
              <Button variant="primary" size="sm" onClick={openCreate}>
                {t('hr.bundles.newBundle2')}
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
                  {!b.isActive && <Badge variant="neutral">{t('hr.bundles.inactive')}</Badge>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      openEdit(b)
                    }}
                  >
                    {t('hr.bundles.edit')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleToggleActive(b)}>
                    {b.isActive ? t('hr.bundles.deactivate') : t('hr.bundles.activate')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(b)}>
                    {t('hr.bundles.remove')}
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
        title={modal.editing ? t('hr.bundles.editBundle') : t('hr.bundles.newBundle2')}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setModal({ open: false, editing: null })
              }}
            >
              {t('hr.bundles.cancel')}
            </Button>
            <Button variant="primary" loading={creating || updating} onClick={() => void handleSave()}>
              {modal.editing ? t('hr.bundles.saveChanges') : t('hr.bundles.createBundle')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label={t('hr.bundles.name')}
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            placeholder={t('hr.bundles.eG5000IqdData')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label={t('hr.bundles.amount')}
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: e.target.value }))
              }}
            />
            <Select
              label={t('hr.bundles.currency')}
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
            label={t('hr.bundles.sortOrder')}
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
