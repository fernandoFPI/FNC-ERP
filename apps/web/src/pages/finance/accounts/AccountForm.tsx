import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  ACCOUNT_QUERY,
  ACCOUNTS_QUERY,
  CREATE_ACCOUNT,
  UPDATE_ACCOUNT,
  GROUP_CHART_OF_ACCOUNTS_QUERY,
} from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Checkbox } from '../../../components/ui/Checkbox'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { useToastStore } from '../../../store/toastStore'
import type { AccountQuery, AccountQueryVariables, AccountsQuery, AccountsQueryVariables, CreateAccountMutation, CreateAccountMutationVariables, GroupChartOfAccountsQuery, GroupChartOfAccountsQueryVariables, UpdateAccountMutation, UpdateAccountMutationVariables } from '../../../graphql/generated'

const ACCOUNT_CATEGORIES = [
  'CASH', 'BANK', 'RECEIVABLE', 'PAYABLE', 'INTERCOMPANY', 'INVENTORY',
  'WIP', 'PREPAID', 'FIXED_ASSET', 'TAX', 'EQUITY', 'REVENUE', 'COGS', 'OPEX', 'OTHER',
]

export default function AccountForm() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data: existing } = useQuery<AccountQuery, AccountQueryVariables>(ACCOUNT_QUERY, {
    variables: { id: id ?? '' },
    skip: !isEdit,
    onCompleted: (d) => {
      if (d.account) {
        const a = d.account
        setForm({
          code: a.code,
          name: a.name,
          account_type: a.account_type,
          parent_id: a.parent_id ?? '',
          currency_code: a.currency_code,
          is_reconcilable: a.is_reconcilable ?? false,
          is_active: a.is_active,
          group_account_id: a.group_account_id ?? '',
          is_header: a.is_header ?? false,
          is_postable: a.is_postable ?? true,
          is_control_account: a.is_control_account ?? false,
          account_category: a.account_category ?? '',
        })
      }
    },
  })

  const { data: allAccounts } = useQuery<AccountsQuery, AccountsQueryVariables>(ACCOUNTS_QUERY, { variables: {} })
  const { data: groupAccountsData } = useQuery<GroupChartOfAccountsQuery, GroupChartOfAccountsQueryVariables>(GROUP_CHART_OF_ACCOUNTS_QUERY)
  const [createAccount, { loading: creating }] = useMutation<CreateAccountMutation, CreateAccountMutationVariables>(CREATE_ACCOUNT)
  const [updateAccount, { loading: updating }] = useMutation<UpdateAccountMutation, UpdateAccountMutationVariables>(UPDATE_ACCOUNT)

  const [form, setForm] = useState({
    code: '',
    name: '',
    account_type: '',
    parent_id: '',
    currency_code: 'IQD',
    is_reconcilable: false,
    is_active: true,
    group_account_id: '',
    is_header: false,
    is_postable: true,
    is_control_account: false,
    account_category: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.account_type) {
      addToast({ type: 'error', message: t('fin.accountForm.selectAnAccountType') })
      return
    }
    if (form.is_active && !/^\d{4}(-\d{2})?$/.test(form.code)) {
      addToast({
        type: 'error',
        message: t('fin.accountForm.accountCodeMustBe4Digits'),
      })
      return
    }
    try {
      const input = {
        code: form.code,
        name: form.name,
        account_type: form.account_type,
        parent_id: form.parent_id || null,
        currency_code: form.currency_code,
        is_reconcilable: form.is_reconcilable,
        is_active: form.is_active,
        group_account_id: form.group_account_id || null,
        is_header: form.is_header,
        is_postable: form.is_postable,
        is_control_account: form.is_control_account,
        account_category: form.account_category || null,
      }
      if (isEdit) {
        await updateAccount({ variables: { id, input } })
        addToast({ type: 'success', message: t('fin.accountForm.accountUpdated') })
      } else {
        await createAccount({
          variables: { input },
          refetchQueries: [{ query: ACCOUNTS_QUERY, variables: {} }],
        })
        addToast({ type: 'success', message: t('fin.accountForm.accountCreated') })
      }
      navigate('/finance/accounts')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const parentOptions = [
    { value: '', label: t('fin.accountForm.noneTopLevel') },
    ...(allAccounts?.accounts ?? []).filter((v): v is NonNullable<typeof v> => v !== null).map((a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
    })),
  ]

  // Only leaf group accounts are valid mapping targets — headers exist for
  // reporting/grouping, not for local accounts to map directly onto.
  const groupOptions = (
    groupAccountsData?.groupChartOfAccounts ?? []
  )
    .filter((g: { is_header: boolean }) => !g.is_header)
    .map((g: { id: string; code: string; name: string }) => ({
      value: g.id,
      label: `${g.code} — ${g.name}`,
    }))

  const loading = creating || updating
  const title = isEdit ? (existing?.account?.name ?? t('fin.accountForm.editAccount')) : t('fin.accountForm.newAccount')

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '800px' }}>
      <PageHeader
        title={title}
        subtitle={isEdit ? t('fin.accountForm.editAccountDetails') : t('fin.accountForm.addToChartOfAccounts')}
        backPath="/finance/accounts"
      />

      <Card style={{ marginTop: '20px' }}>
        <form
          onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label={t('fin.accountForm.accountCode')}
              value={form.code}
              onChange={(e) => {
                setForm((f) => ({ ...f, code: e.target.value }))
              }}
              required
              placeholder="e.g. 1200 or 3111-01"
            />
            <Select
              label={t('fin.accountForm.type')}
              value={form.account_type}
              onChange={(e) => {
                setForm((f) => ({ ...f, account_type: e.target.value }))
              }}
              required
            >
              <option value="" disabled>
                {t('fin.accountForm.selectType')}
              </option>
              <option value="asset">{t('fin.accountForm.asset')}</option>
              <option value="liability">{t('fin.accountForm.liability')}</option>
              <option value="equity">{t('fin.accountForm.equity')}</option>
              <option value="revenue">{t('fin.accountForm.revenue')}</option>
              <option value="expense">{t('fin.accountForm.expense')}</option>
            </Select>
          </div>

          <Input
            label={t('fin.accountForm.accountName')}
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            required
            placeholder={t('fin.accountForm.eGCashAndCashEquivalents')}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Select
              label={t('fin.accountForm.currency')}
              value={form.currency_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, currency_code: e.target.value }))
              }}
            >
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="TRY">TRY</option>
            </Select>
            <Select
              label={t('fin.accountForm.parentAccount')}
              value={form.parent_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, parent_id: e.target.value }))
              }}
            >
              {parentOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
            <SearchableSelect
              label={t('fin.accountForm.groupAccount')}
              value={form.group_account_id}
              onChange={(v) => {
                setForm((f) => ({ ...f, group_account_id: v }))
              }}
              placeholder={t('fin.accountForm.mapsToWhichGroupAccount')}
              options={groupOptions}
            />
            <Select
              label={t('fin.accountForm.category')}
              value={form.account_category}
              onChange={(e) => {
                setForm((f) => ({ ...f, account_category: e.target.value }))
              }}
            >
              <option value="">{t('fin.accountForm.none')}</option>
              {ACCOUNT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <Checkbox
              label={t('fin.accountForm.reconcilable')}
              checked={form.is_reconcilable}
              onChange={(checked) => {
                setForm((f) => ({ ...f, is_reconcilable: checked }))
              }}
            />
            <Checkbox
              label={t('fin.accountForm.active')}
              checked={form.is_active}
              onChange={(checked) => {
                setForm((f) => ({ ...f, is_active: checked }))
              }}
            />
            <Checkbox
              label={t('fin.accountForm.controlAccount')}
              checked={form.is_control_account}
              onChange={(checked) => {
                setForm((f) => ({ ...f, is_control_account: checked }))
              }}
            />
            <Checkbox
              label={t('fin.accountForm.headerGroupingOnlyNoPostings')}
              checked={form.is_header}
              onChange={(checked) => {
                // A header can't also be postable — the DB enforces this too
                // (chk_header_not_postable); keep the two in sync here so the
                // form never submits a combination the constraint would reject.
                setForm((f) => ({ ...f, is_header: checked, is_postable: checked ? false : f.is_postable }))
              }}
            />
            {!form.is_header && (
              <Checkbox
                label={t('fin.accountForm.postable')}
                checked={form.is_postable}
                onChange={(checked) => {
                  setForm((f) => ({ ...f, is_postable: checked }))
                }}
              />
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              borderTop: `1px solid ${theme.border}`,
              paddingTop: '16px',
            }}
          >
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate('/finance/accounts')
              }}
            >
              {t('fin.accountForm.cancel')}
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              {isEdit ? t('fin.accountForm.saveChanges') : t('fin.accountForm.createAccount')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
