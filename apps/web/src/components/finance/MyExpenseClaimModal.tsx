import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from '../ui/Modal'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AmountDisplay } from '../ui/AmountDisplay'
import { EntityAttachments } from '../inventory/EntityAttachments'
import { ExpenseClaimEditor, type EditableClaimLine } from './ExpenseClaimEditor'
import { ExpenseLineFlag } from './ExpenseLineFlag'
import { lineFlagState } from '../../lib/expenseClaimFlags'

export interface MyExpenseClaim {
  id: string
  claim_number: string
  description: string | null
  notes?: string | null
  status: string
  total_amount: number | string
  currency_code: string
  project_code: string | null
  project_name: string | null
  rejection_reason?: string | null
  // From GET /finance/expense-claims/mine: the same rule the server applies on save.
  can_revise?: boolean
  lines?: (Omit<EditableClaimLine, 'category_id' | 'line_number' | 'amount'> & {
    category_id?: string | null
    line_number?: number
    amount: number | string
    currency_code: string
    flagged_by_name?: string | null
  })[]
}

// The read-only popup a person gets for their OWN expense claim. Most people who file claims hold
// no Expense Claims permission, so they cannot open the full claim page; this is their view of it.
// For a claim an approver sent back it shows the reason and the flagged lines, lets them upload
// the missing receipts, and opens the shared editor to fix the lines and resubmit.
export function MyExpenseClaimModal({
  claim,
  statusLabel,
  statusVariant,
  onClose,
  onChanged,
}: {
  claim: MyExpenseClaim | null
  statusLabel: string
  statusVariant: BadgeVariant
  onClose: () => void
  // The claim was edited or resubmitted: the page reloads its list and closes the popup.
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)

  // A different claim opens in read mode.
  useEffect(() => {
    setEditing(false)
  }, [claim?.id])

  const lines = claim?.lines ?? []
  const canRevise = !!claim?.can_revise
  const rejected = claim?.status === 'rejected'

  return (
    <Modal
      open={!!claim}
      onClose={onClose}
      title={claim?.claim_number ?? ''}
      description={claim?.description ?? undefined}
      size="lg"
    >
      {claim && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            <AmountDisplay
              amount={Number(claim.total_amount)}
              currency={claim.currency_code}
              size="sm"
            />
            {claim.project_code && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {claim.project_code} — {claim.project_name}
              </span>
            )}
            {canRevise && !editing && (
              <span style={{ marginInlineStart: 'auto' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditing(true)
                  }}
                >
                  {rejected ? t('fin.expDetail.editResubmit') : t('fin.expDetail.edit')}
                </Button>
              </span>
            )}
          </div>

          {rejected && claim.rejection_reason && (
            <div
              style={{
                background: '#ef444410',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                color: '#ef4444',
                whiteSpace: 'pre-wrap',
              }}
            >
              <strong>{t('fin.expDetail.rejected2')}</strong> {claim.rejection_reason}
              {canRevise && (
                <div style={{ marginTop: '6px', color: theme.textSecondary }}>
                  {t('fin.expDetail.sentBackHint')}
                </div>
              )}
            </div>
          )}

          {editing ? (
            <ExpenseClaimEditor
              claim={{
                id: claim.id,
                status: claim.status,
                description: claim.description,
                notes: claim.notes ?? null,
                currency_code: claim.currency_code,
                lines: lines.map((l) => ({
                  ...l,
                  line_number: l.line_number ?? 0,
                  category_id: l.category_id ?? null,
                })),
              }}
              onSaved={onChanged}
              onCancel={() => {
                setEditing(false)
              }}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {[
                    t('req.list.hdrNumber'),
                    t('req.list.hdrDate'),
                    t('req.list.hdrCategory'),
                    t('req.list.hdrDescription'),
                    t('req.list.hdrAmount'),
                  ].map((h, i, all) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 8px',
                        textAlign: i === all.length - 1 ? 'end' : 'start',
                        color: theme.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const flag = lineFlagState(l)
                  const edge =
                    flag === 'open' ? theme.danger : flag === 'fixed' ? theme.warning : null
                  return (
                    <Fragment key={l.id}>
                      <tr
                        data-testid="my-claim-line"
                        style={{
                          borderBottom: flag === 'none' ? `1px solid ${theme.border}` : undefined,
                          background: edge ? `${edge}0c` : undefined,
                          boxShadow: edge ? `inset 4px 0 0 ${edge}` : undefined,
                        }}
                      >
                        <td
                          style={{
                            padding: '6px 8px',
                            color: theme.textMuted,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {l.line_number ?? i + 1}
                        </td>
                        <td
                          style={{
                            padding: '6px 8px',
                            color: theme.textSecondary,
                            fontSize: '11px',
                          }}
                        >
                          {new Date(l.expense_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                          {l.category_name ?? '—'}
                        </td>
                        <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                          {l.description ?? '—'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'end' }}>
                          <AmountDisplay
                            amount={Number(l.amount)}
                            currency={l.currency_code}
                            size="sm"
                          />
                        </td>
                      </tr>
                      {flag !== 'none' && (
                        <tr
                          style={{
                            borderBottom: `1px solid ${theme.border}`,
                            background: edge ? `${edge}0c` : undefined,
                            boxShadow: edge ? `inset 4px 0 0 ${edge}` : undefined,
                          }}
                        >
                          <td colSpan={5} style={{ padding: '2px 8px 10px' }}>
                            <ExpenseLineFlag line={l} flaggedByName={l.flagged_by_name} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}

          {canRevise && (
            <EntityAttachments
              entityType="expense_claim"
              entityId={claim.id}
              title={t('fin.expDetail.receipts')}
              description={t('fin.expDetail.oneSharedReceiptForTheWhole')}
              uploadButtonLabel={t('fin.expDetail.uploadReceipt')}
              emptyMessage={t('fin.expDetail.noReceiptsAttached')}
              groupBy={[
                { match: 'expense_claim', title: t('fin.expDetail.sharedReceiptWholeClaim') },
                { match: 'expense_claim_line', title: t('fin.expDetail.perLineReceipts') },
              ]}
            />
          )}
        </div>
      )}
    </Modal>
  )
}
