import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  ACCOUNT_QUERY,
  ACCOUNTS_QUERY,
  CREATE_ACCOUNT,
  UPDATE_ACCOUNT,
} from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Checkbox } from '../../../components/ui/Checkbox'
import { useToastStore } from '../../../store/toastStore'

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
        })
      }
    },
  })

  const { data: allAccounts } = useQuery(ACCOUNTS_QUERY, { variables: {} })
  const [createAccount, { loading: creating }] = useMutation(CREATE_ACCOUNT)
  const [updateAccount, { loading: updating }] = useMutation(UPDATE_ACCOUNT)

  const [form, setForm] = useState({
    code: '',
    name: '',
    account_type: 'expense',
    parent_id: '',
    currency_code: 'IQD',
    is_reconcilable: false,
    is_active: true,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const input = {
        code: form.code,
        name: form.name,
        account_type: form.account_type,
        parent_id: form.parent_id || undefined,
        currency_code: form.currency_code,
        is_reconcilable: form.is_reconcilable,
        is_active: form.is_active,
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
            >
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

          <div style={{ display: 'flex', gap: '24px' }}>
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
