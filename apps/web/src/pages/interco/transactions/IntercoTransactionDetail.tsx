import { useTranslation } from 'react-i18next'
import { enumLabel, useIsRtl } from '../../../i18n'
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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
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
  return m[status.toLowerCase()] ?? 'neutral'
}

function JournalEntryPreview({
  tx,
  theme,
}: {
  tx: IntercoTxDetail
  theme: Record<string, string>
}) {
  const { t } = useTranslation()
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

  const columns: Column<(typeof entries)[number]>[] = [
    {
      key: 'company',
      header: t('interco.txnDetail.company'),
      mobileSecondary: true,
      render: (e) => <span style={{ color: theme.textSecondary }}>{e.company}</span>,
    },
    {
      key: 'account',
      header: t('interco.txnDetail.account'),
      mobilePrimary: true,
      render: (e) => (
        <span style={{ color: theme.textPrimary, fontFamily: 'monospace', fontSize: '12px' }}>
          {e.account}
        </span>
      ),
    },
    {
      key: 'side',
      header: t('interco.txnDetail.side'),
      mobilePriority: 1,
      render: (e) => (
        <Badge variant={e.side === 'Debit' ? 'info' : 'warning'} size="sm">
          {e.side === 'Debit' ? t('interco.txnDetail.debit') : t('interco.txnDetail.credit')}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: t('interco.txnDetail.amount'),
      mobilePriority: 2,
      render: (e) => <AmountDisplay amount={e.amount} currency={e.currency} size="sm" />,
    },
  ]

  return (
    <div>
      <p style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
        {t('interco.txnDetail.theFollowingJournalEntriesWillBe')}
      </p>
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <Table columns={columns} data={entries} />
      </div>
      <p style={{ fontSize: 11, color: theme.textMuted, marginTop: 10, fontStyle: 'italic' }}>
        {t('interco.txnDetail.noteExactAccountsAreDeterminedAt')}
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
  accountType,
  onSet,
  setting,
}: {
  accountType: 'revenue' | 'expense'
  onSet: (accountId: string) => void
  setting: boolean
}) {
  const { t } = useTranslation()
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
        options={[{ value: '', label: t('interco.txnDetail.selectAccount') }, ...options]}
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
        {t('interco.txnDetail.set')}
      </Button>
    </div>
  )
}

export default function IntercoTransactionDetail() {
  const { t } = useTranslation()
  const rtl = useIsRtl()
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
      addToast({ type: 'success', message: t('interco.txnDetail.transactionPosted') })
      setShowJournalPreview(false)
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: INTERCO_TRANSACTION_QUERY, variables: { id } }],
  })

  const [cancelTx, { loading: cancelling }] = useMutation(CANCEL_INTERCO_TRANSACTION, {
    variables: { id },
    onCompleted: () => {
      addToast({ type: 'success', message: t('interco.txnDetail.transactionCancelled') })
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
      addToast({ type: 'success', message: t('interco.txnDetail.approvalRecorded') })
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
    refetchQueries: [{ query: INTERCO_TRANSACTION_QUERY, variables: { id } }],
  })

  const [setAccount, { loading: settingAccount }] = useMutation(SET_INTERCO_TRANSACTION_ACCOUNT, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('interco.txnDetail.postingAccountSet') })
      void refetch()
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
        <p style={{ color: theme.textMuted }}>{t('interco.txnDetail.transactionNotFound')}</p>
      </div>
    )
  }

  const isDraft = tx.status === 'pending'
  const eitherApproved = Boolean(tx.fromCompanyApprovedBy ?? tx.toCompanyApprovedBy)
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
        subtitle={`${enumLabel(tx.transactionType.replace('interco_', ''))} · ${tx.fromCompanyName} ${rtl ? '←' : '→'} ${tx.toCompanyName}`}
        backPath="/interco/transactions"
        backLabel={t('interco.txnDetail.transactions')}
        status={<Badge variant={statusVariant(tx.status)}>{enumLabel(tx.status)}</Badge>}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isDraft && !canPost && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {!eitherApproved
                  ? t('interco.txnDetail.awaitingApprovalFromAtLeastOne')
                  : t('interco.txnDetail.awaitingPostingAccountSelectionFromBoth')}
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
                {t('interco.txnDetail.post')}
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
                {t('interco.txnDetail.cancel')}
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
            border: `1px solid ${theme.warningBorder}`,
            background: theme.warningBg,
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
            {t('interco.txnDetail.companyApprovalsRequired')}
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
                    {t('interco.txnDetail.approved')}
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
                    void approveTx()
                  }}
                  loading={approving}
                >{t('interco.txnDetail.approveFor', { fromCompanyName: tx.fromCompanyName })}</Button>
              ) : (
                <Badge variant="neutral" size="sm">
                  {t('interco.txnDetail.pending')}
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
                    {t('interco.txnDetail.approved')}
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
                    void approveTx()
                  }}
                  loading={approving}
                >{t('interco.txnDetail.approveFor2', { toCompanyName: tx.toCompanyName })}</Button>
              ) : (
                <Badge variant="neutral" size="sm">
                  {t('interco.txnDetail.pending')}
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
            {t('interco.txnDetail.fromEntity')}
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.company')}</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.fromCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.account')}</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>
              {tx.fromAccountName ||
                tx.fromAccountId ||
                (canSetFromAccount ? (
                  <AccountPicker
                    accountType="revenue"
                    setting={settingAccount}
                    onSet={(accountId) => void setAccount({ variables: { id: tx.id, accountId } })}
                  />
                ) : (
                  '—'
                ))}
            </dd>
            {tx.fromJournalId && (
              <>
                <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.journal')}</dt>
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
            {t('interco.txnDetail.toEntity')}
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.company')}</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.toCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.account')}</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>
              {tx.toAccountName ||
                tx.toAccountId ||
                (canSetToAccount ? (
                  <AccountPicker
                    accountType="expense"
                    setting={settingAccount}
                    onSet={(accountId) => void setAccount({ variables: { id: tx.id, accountId } })}
                  />
                ) : (
                  '—'
                ))}
            </dd>
            {tx.toJournalId && (
              <>
                <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.journal')}</dt>
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
            {t('interco.txnDetail.transactionDetails')}
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.amount')}</dt>
            <dd style={{ margin: 0 }}>
              <AmountDisplay amount={tx.amount} currency={tx.currencyCode} size="md" />
            </dd>
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.type')}</dt>
            <dd style={{ margin: 0 }}>
              <Badge variant="neutral">{enumLabel(tx.transactionType)}</Badge>
            </dd>
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.description')}</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>{tx.description || '—'}</dd>
            <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.created')}</dt>
            <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
              {new Date(tx.createdAt).toLocaleString()}
            </dd>
            {tx.postedAt && (
              <>
                <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.posted')}</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {new Date(tx.postedAt).toLocaleString()}
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('interco.txnDetail.postedBy')}</dt>
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
        title={t('interco.txnDetail.reviewJournalEntries')}
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
              {t('interco.txnDetail.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void postTx()
              }}
              loading={posting}
            >
              {t('interco.txnDetail.confirmPost')}
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
          void cancelTx()
        }}
        title={t('interco.txnDetail.cancelTransaction')}
        message={t('interco.txnDetail.cancelTransactionThisActionCannotBe', { reference: tx.reference })}
        confirmLabel={t('interco.txnDetail.cancelTransaction')}
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  )
}
