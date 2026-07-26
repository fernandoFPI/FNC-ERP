import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { useAuthStore } from '../../../store/authStore'
import { usePermission } from '../../../hooks/usePermission'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useToastStore } from '../../../store/toastStore'
import {
  INTERCO_TRANSACTION_QUERY,
  POST_INTERCO_TRANSACTION,
  CANCEL_INTERCO_TRANSACTION,
  APPROVE_INTERCO_COMPANY,
  SET_INTERCO_TRANSACTION_ACCOUNT,
} from '../../../graphql/interco'
import { ACCOUNTS_QUERY } from '../../../graphql/finance'

interface IntercoTxDetail {
  id: string
  reference: string
  transactionType: string
  fromCompanyId: string
  fromCompanyName: string
  toCompanyId: string
  toCompanyName: string
  amount: number
  currencyCode: string
  description: string
  fromAccountId: string
  fromAccountName: string
  toAccountId: string
  toAccountName: string
  status: string
  postedAt: string | null
  postedBy: string | null
  fromJournalId: string | null
  toJournalId: string | null
  createdAt: string
  fromCompanyApprovedBy: string | null
  fromCompanyApprovedAt: string | null
  toCompanyApprovedBy: string | null
  toCompanyApprovedAt: string | null
}

interface TxDetailData {
  intercoTransaction: IntercoTxDetail
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    posted: 'success',
    draft: 'neutral',
    cancelled: 'danger',
    pending: 'warning',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

function JournalEntryPreview({
  tx,
  theme,
}: {
  tx: IntercoTxDetail
  theme: Record<string, string>
}) {
  const tdBase: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    borderBottom: `1px solid ${theme.tableBorder ?? theme.border}`,
  }

  const entries = [
    {
      company: tx.fromCompanyName,
      side: 'Debit',
      account: tx.fromAccountName || tx.fromAccountId || '—',
      amount: tx.amount,
      currency: tx.currencyCode,
    },
    {
      company: tx.fromCompanyName,
      side: 'Credit',
      account: tx.fromAccountName || tx.fromAccountId || '—',
      amount: tx.amount,
      currency: tx.currencyCode,
    },
    {
      company: tx.toCompanyName,
      side: 'Debit',
      account: tx.toAccountName || tx.toAccountId || '—',
      amount: tx.amount,
      currency: tx.currencyCode,
    },
    {
      company: tx.toCompanyName,
      side: 'Credit',
      account: tx.toAccountName || tx.toAccountId || '—',
      amount: tx.amount,
      currency: tx.currencyCode,
    },
  ]

  return (
    <div>
      <p style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
        The following journal entries will be created in both entities on posting:
      </p>
      <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: theme.bgSurfaceHover }}>
              <th
                style={{
                  ...tdBase,
                  textAlign: 'left',
                  fontWeight: 600,
                  color: theme.textMuted,
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Company
              </th>
              <th
                style={{
                  ...tdBase,
                  textAlign: 'left',
                  fontWeight: 600,
                  color: theme.textMuted,
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Account
              </th>
              <th
                style={{
                  ...tdBase,
                  textAlign: 'center',
                  fontWeight: 600,
                  color: theme.textMuted,
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Side
              </th>
              <th
                style={{
                  ...tdBase,
                  textAlign: 'right',
                  fontWeight: 600,
                  color: theme.textMuted,
                  fontSize: 11,
                  textTransform: 'uppercase',
                }}
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td style={{ ...tdBase, color: theme.textSecondary }}>{e.company}</td>
                <td
                  style={{
                    ...tdBase,
                    color: theme.textPrimary,
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  {e.account}
                </td>
                <td style={{ ...tdBase, textAlign: 'center' }}>
                  <Badge variant={e.side === 'Debit' ? 'info' : 'warning'} size="sm">
                    {e.side}
                  </Badge>
                </td>
                <td style={{ ...tdBase, textAlign: 'right' }}>
                  <AmountDisplay amount={e.amount} currency={e.currency} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: theme.textMuted, marginTop: 10, fontStyle: 'italic' }}>
        Note: Exact accounts are determined at creation time. This preview shows the transaction
        accounts on record.
      </p>
    </div>
  )
}

interface AccountOption {
  id: string
  code: string
  name: string
  account_type: string
}

function AccountPicker({
  id,
  accountType,
  onSet,
  setting,
}: {
  id: string
  accountType: 'revenue' | 'expense'
  onSet: (accountId: string) => void
  setting: boolean
}) {
  const { data } = useQuery<{ accounts: AccountOption[] }>(ACCOUNTS_QUERY, {
    variables: { type: accountType, isActive: true },
  })
  const [accountId, setAccountId] = useState('')
  const options = (data?.accounts ?? []).map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
  }))

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <Select
        value={accountId}
        onChange={(e) => {
          setAccountId(e.target.value)
        }}
        options={[{ value: '', label: 'Select account…' }, ...options]}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={!accountId}
        loading={setting}
        onClick={() => {
          onSet(accountId)
        }}
      >
        Set
      </Button>
    </div>
  )
}

export default function IntercoTransactionDetail() {
  const { theme } = useTheme()
  const { id } = useParams<{ id: string }>()
  const addToast = useToastStore((s) => s.addToast)
  const user = useAuthStore((s) => s.user)

  const [showJournalPreview, setShowJournalPreview] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { can } = usePermission()

  const { data, loading, refetch } = useQuery<TxDetailData>(INTERCO_TRANSACTION_QUERY, {
    variables: { id },
    skip: !id,
  })

  const [postTx, { loading: posting }] = useMutation(POST_INTERCO_TRANSACTION, {
    variables: { id },
    onCompleted: () => {
      addToast({ type: 'success', message: 'Transaction posted' })
      setShowJournalPreview(false)
      refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: INTERCO_TRANSACTION_QUERY, variables: { id } }],
  })

  const [cancelTx, { loading: cancelling }] = useMutation(CANCEL_INTERCO_TRANSACTION, {
    variables: { id },
    onCompleted: () => {
      addToast({ type: 'success', message: 'Transaction cancelled' })
      setConfirmCancel(false)
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmCancel(false)
    },
    refetchQueries: [{ query: INTERCO_TRANSACTION_QUERY, variables: { id } }],
  })

  const [approveTx, { loading: approving }] = useMutation(APPROVE_INTERCO_COMPANY, {
    variables: { id },
    onCompleted: () => {
      addToast({ type: 'success', message: 'Approval recorded' })
      refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: INTERCO_TRANSACTION_QUERY, variables: { id } }],
  })

  const [setAccount, { loading: settingAccount }] = useMutation(SET_INTERCO_TRANSACTION_ACCOUNT, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Posting account set' })
      refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: INTERCO_TRANSACTION_QUERY, variables: { id } }],
  })

  const tx = data?.intercoTransaction

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          className="skeleton"
          style={{ height: '60px', borderRadius: '8px', marginBottom: '16px' }}
        />
        <div className="skeleton" style={{ height: '200px', borderRadius: '8px' }} />
      </div>
    )
  }

  if (!tx) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Transaction not found.</p>
      </div>
    )
  }

  const isDraft = tx.status === 'pending'
  const eitherApproved = Boolean(tx.fromCompanyApprovedBy || tx.toCompanyApprovedBy)
  const bothAccountsSet = Boolean(tx.fromAccountId && tx.toAccountId)
  const canPost = isDraft && eitherApproved && bothAccountsSet
  const canCancel = isDraft

  const isCompanyAdmin = can('interco.transactions.approve', 'approve')
  const isFromCompany = user?.companyId === tx.fromCompanyId
  const isToCompany = user?.companyId === tx.toCompanyId
  const canSetFromAccount = isCompanyAdmin && isFromCompany && !tx.fromAccountId && isDraft
  const canSetToAccount = isCompanyAdmin && isToCompany && !tx.toAccountId && isDraft
  const canApproveFrom = isCompanyAdmin && isFromCompany && !tx.fromCompanyApprovedBy && isDraft
  const canApproveTo = isCompanyAdmin && isToCompany && !tx.toCompanyApprovedBy && isDraft
  const showApprovalPanel = isDraft && isCompanyAdmin && (isFromCompany || isToCompany)

  const themeAsMap = theme as unknown as Record<string, string>

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={tx.reference}
        subtitle={`${tx.transactionType.replace('interco_', '')} · ${tx.fromCompanyName} → ${tx.toCompanyName}`}
        backPath="/interco/transactions"
        backLabel="Transactions"
        status={<Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isDraft && !canPost && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {!eitherApproved
                  ? 'Awaiting approval from at least one company'
                  : 'Awaiting posting account selection from both companies'}
              </span>
            )}
            {canPost && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowJournalPreview(true)
                }}
                loading={posting}
              >
                Post
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmCancel(true)
                }}
                loading={cancelling}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* Dual Approval Panel */}
      {showApprovalPanel && (
        <Card
          padding="md"
          style={{
            marginBottom: '16px',
            border: `1px solid ${theme.warningBorder ?? theme.border}`,
            background: theme.warningBg ?? theme.bgSurface,
          }}
        >
          <p
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '12px',
            }}
          >
            Company Approvals Required
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            {/* From company approval */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
              }}
            >
              <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                {tx.fromCompanyName}
              </p>
              {tx.fromCompanyApprovedBy ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Badge variant="success" size="sm">
                    Approved
                  </Badge>
                  {tx.fromCompanyApprovedAt && (
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>
                      {new Date(tx.fromCompanyApprovedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : canApproveFrom ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    approveTx()
                  }}
                  loading={approving}
                >
                  Approve for {tx.fromCompanyName}
                </Button>
              ) : (
                <Badge variant="neutral" size="sm">
                  Pending
                </Badge>
              )}
            </div>
            {/* To company approval */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
              }}
            >
              <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                {tx.toCompanyName}
              </p>
              {tx.toCompanyApprovedBy ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Badge variant="success" size="sm">
                    Approved
                  </Badge>
                  {tx.toCompanyApprovedAt && (
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>
                      {new Date(tx.toCompanyApprovedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : canApproveTo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    approveTx()
                  }}
                  loading={approving}
                >
                  Approve for {tx.toCompanyName}
                </Button>
              ) : (
                <Badge variant="neutral" size="sm">
                  Pending
                </Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        {/* From entity */}
        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            From Entity
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>Company</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.fromCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>Account</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>
              {tx.fromAccountName ||
                tx.fromAccountId ||
                (canSetFromAccount ? (
                  <AccountPicker
                    id={tx.id}
                    accountType="revenue"
                    setting={settingAccount}
                    onSet={(accountId) => setAccount({ variables: { id: tx.id, accountId } })}
                  />
                ) : (
                  '—'
                ))}
            </dd>
            {tx.fromJournalId && (
              <>
                <dt style={{ color: theme.textMuted }}>Journal</dt>
                <dd style={{ color: theme.accent, margin: 0 }}>{tx.fromJournalId}</dd>
              </>
            )}
          </dl>
        </Card>

        {/* To entity */}
        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            To Entity
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>Company</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.toCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>Account</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>
              {tx.toAccountName ||
                tx.toAccountId ||
                (canSetToAccount ? (
                  <AccountPicker
                    id={tx.id}
                    accountType="expense"
                    setting={settingAccount}
                    onSet={(accountId) => setAccount({ variables: { id: tx.id, accountId } })}
                  />
                ) : (
                  '—'
                ))}
            </dd>
            {tx.toJournalId && (
              <>
                <dt style={{ color: theme.textMuted }}>Journal</dt>
                <dd style={{ color: theme.accent, margin: 0 }}>{tx.toJournalId}</dd>
              </>
            )}
          </dl>
        </Card>

        {/* Transaction Details */}
        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Transaction Details
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>Amount</dt>
            <dd style={{ margin: 0 }}>
              <AmountDisplay amount={tx.amount} currency={tx.currencyCode} size="md" />
            </dd>
            <dt style={{ color: theme.textMuted }}>Type</dt>
            <dd style={{ margin: 0 }}>
              <Badge variant="neutral">{tx.transactionType}</Badge>
            </dd>
            <dt style={{ color: theme.textMuted }}>Description</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>{tx.description || '—'}</dd>
            <dt style={{ color: theme.textMuted }}>Created</dt>
            <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
              {new Date(tx.createdAt).toLocaleString()}
            </dd>
            {tx.postedAt && (
              <>
                <dt style={{ color: theme.textMuted }}>Posted</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {new Date(tx.postedAt).toLocaleString()}
                </dd>
                <dt style={{ color: theme.textMuted }}>Posted By</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {tx.postedBy}
                </dd>
              </>
            )}
          </dl>
        </Card>
      </div>

      {/* Journal Preview Dialog */}
      <Modal
        open={showJournalPreview}
        onClose={() => {
          setShowJournalPreview(false)
        }}
        title="Review Journal Entries"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowJournalPreview(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                postTx()
              }}
              loading={posting}
            >
              Confirm &amp; Post
            </Button>
          </div>
        }
      >
        <JournalEntryPreview tx={tx} theme={themeAsMap} />
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => {
          setConfirmCancel(false)
        }}
        onConfirm={() => {
          cancelTx()
        }}
        title="Cancel Transaction"
        message={`Cancel transaction ${tx.reference}? This action cannot be undone.`}
        confirmLabel="Cancel Transaction"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  )
}
