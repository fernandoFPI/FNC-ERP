import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { ACCOUNT_QUERY, ACCOUNT_LEDGER_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Button } from '../../../components/ui/Button'
import { DatePicker } from '../../../components/ui/DatePicker'

interface LedgerLine {
  id: string
  date: string
  reference?: string
  description?: string
  debit: string
  credit: string
  running_balance: string
  journal_entry_id: string
}

const PAGE_SIZE = 50

export default function AccountLedger() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const { data: accountData } = useQuery(ACCOUNT_QUERY, { variables: { id }, skip: !id })
  const { data, loading } = useQuery(ACCOUNT_LEDGER_QUERY, {
    variables: { accountId: id!, fromDate: fromDate || undefined, toDate: toDate || undefined, page, limit: PAGE_SIZE },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })

  const account = accountData?.account
  const ledger = data?.accountLedger
  const items: LedgerLine[] = ledger?.items ?? []
  const total = ledger?.total ?? 0

  const columns: Column<LedgerLine>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.date}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (r) => (
        <button
          onClick={() => navigate(`/finance/journals/${r.journal_entry_id}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontSize: '13px', fontFamily: 'monospace' }}
        >
          {r.reference ?? '—'}
        </button>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.description ?? '—'}</span>,
    },
    {
      key: 'debit',
      header: 'Debit',
      render: (r) => parseFloat(r.debit) > 0 ? <AmountDisplay amount={parseFloat(r.debit)} currency="IQD" /> : <span style={{ color: theme.textMuted }}>—</span>,
    },
    {
      key: 'credit',
      header: 'Credit',
      render: (r) => parseFloat(r.credit) > 0 ? <AmountDisplay amount={parseFloat(r.credit)} currency="IQD" /> : <span style={{ color: theme.textMuted }}>—</span>,
    },
    {
      key: 'running_balance',
      header: 'Balance',
      render: (r) => <AmountDisplay amount={parseFloat(r.running_balance)} currency="IQD" colored />,
    },
  ]

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title={account ? `${account.code} — ${account.name}` : 'Account Ledger'}
        subtitle="Transaction history"
        backPath="/finance/accounts"
      />

      <Card style={{ marginTop: '20px' }}>
        {/* Date filters */}
        <div style={{ display: 'flex', gap: '12px', padding: '16px', borderBottom: `1px solid ${theme.border}`, alignItems: 'flex-end' }}>
          <DatePicker label="From" value={fromDate} onChange={setFromDate} />
          <DatePicker label="To" value={toDate} onChange={setToDate} />
          <Button variant="ghost" size="sm" onClick={() => { setFromDate(''); setToDate('') }}>Clear</Button>
          <div style={{ flex: 1 }} />
          {ledger && (
            <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
              <span style={{ color: theme.textMuted }}>Total Debit: <strong style={{ color: theme.textPrimary }}>{parseFloat(ledger.totalDebit).toLocaleString()}</strong></span>
              <span style={{ color: theme.textMuted }}>Total Credit: <strong style={{ color: theme.textPrimary }}>{parseFloat(ledger.totalCredit).toLocaleString()}</strong></span>
              <span style={{ color: theme.textMuted }}>Net: <strong style={{ color: theme.textPrimary }}>{parseFloat(ledger.netBalance).toLocaleString()}</strong></span>
            </div>
          )}
        </div>

        <Table columns={columns} data={items} loading={loading} rowKey="id" />

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', padding: '16px', borderTop: `1px solid ${theme.border}` }}>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span style={{ alignSelf: 'center', color: theme.textMuted, fontSize: '13px' }}>Page {page} of {totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
