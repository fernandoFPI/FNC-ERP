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

const ACCOUNT_CATEGORIES = [
  'CASH', 'BANK', 'RECEIVABLE', 'PAYABLE', 'INTERCOMPANY', 'INVENTORY',
  'WIP', 'PREPAID', 'FIXED_ASSET', 'TAX', 'EQUITY', 'REVENUE', 'COGS', 'OPEX', 'OTHER',
]

export default function AccountForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data: existing } = useQuery(ACCOUNT_QUERY, {
    variables: { id },
    skip: !isEdit,
    onCompleted: (d) => {
      if (d.account) {
        const a = d.account
        setForm({
          code: a.code,
          name: a.name,
          account_type: a.account_type,
          parent_id: a.parent_id ?? '',
          currency_code: a.currency_code ?? 'IQD',
          is_reconcilable: a.is_reconcilable ?? false,
          is_active: a.is_active ?? true,
          group_account_id: a.group_account_id ?? '',
          is_header: a.is_header ?? false,
          is_postable: a.is_postable ?? true,
          is_control_account: a.is_control_account ?? false,
          account_category: a.account_category ?? '',
        })
      }
    },
  })

  const { data: allAccounts } = useQuery(ACCOUNTS_QUERY, { variables: {} })
  const { data: groupAccountsData } = useQuery(GROUP_CHART_OF_ACCOUNTS_QUERY)
  const [createAccount, { loading: creating }] = useMutation(CREATE_ACCOUNT)
  const [updateAccount, { loading: updating }] = useMutation(UPDATE_ACCOUNT)

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
      addToast({ type: 'error', message: 'Select an account type' })
      return
    }
    if (form.is_active && !/^\d{4}$/.test(form.code)) {
      addToast({ type: 'error', message: 'Account code must be exactly 4 digits' })
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
        addToast({ type: 'success', message: 'Account updated' })
      } else {
        await createAccount({
          variables: { input },
          refetchQueries: [{ query: ACCOUNTS_QUERY, variables: {} }],
        })
        addToast({ type: 'success', message: 'Account created' })
      }
      navigate('/finance/accounts')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const parentOptions = [
    { value: '', label: 'None (top level)' },
    ...(allAccounts?.accounts ?? []).map((a: { id: string; code: string; name: string }) => ({
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
  const title = isEdit ? (existing?.account?.name ?? 'Edit Account') : 'New Account'

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '800px' }}>
      <PageHeader
        title={title}
        subtitle={isEdit ? 'Edit account details' : 'Add to chart of accounts'}
        backPath="/finance/accounts"
      />

      <Card style={{ marginTop: '20px' }}>
        <form
          onSubmit={handleSubmit}
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
              label="Account Code"
              value={form.code}
              onChange={(e) => {
                setForm((f) => ({ ...f, code: e.target.value }))
              }}
              required
              placeholder="e.g. 1001"
            />
            <Select
              label="Type"
              value={form.account_type}
              onChange={(e) => {
                setForm((f) => ({ ...f, account_type: e.target.value }))
              }}
              required
            >
              <option value="" disabled>
                Select type…
              </option>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </Select>
          </div>

          <Input
            label="Account Name"
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            required
            placeholder="e.g. Cash and Cash Equivalents"
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Select
              label="Currency"
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
              label="Parent Account"
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
              label="Group Account"
              value={form.group_account_id}
              onChange={(v) => {
                setForm((f) => ({ ...f, group_account_id: v }))
              }}
              placeholder="Maps to which group account?"
              options={groupOptions}
            />
            <Select
              label="Category"
              value={form.account_category}
              onChange={(e) => {
                setForm((f) => ({ ...f, account_category: e.target.value }))
              }}
            >
              <option value="">None</option>
              {ACCOUNT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <Checkbox
              label="Reconcilable"
              checked={form.is_reconcilable}
              onChange={(checked) => {
                setForm((f) => ({ ...f, is_reconcilable: checked }))
              }}
            />
            <Checkbox
              label="Active"
              checked={form.is_active}
              onChange={(checked) => {
                setForm((f) => ({ ...f, is_active: checked }))
              }}
            />
            <Checkbox
              label="Control account"
              checked={form.is_control_account}
              onChange={(checked) => {
                setForm((f) => ({ ...f, is_control_account: checked }))
              }}
            />
            <Checkbox
              label="Header (grouping only, no postings)"
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
                label="Postable"
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
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              {isEdit ? 'Save Changes' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
