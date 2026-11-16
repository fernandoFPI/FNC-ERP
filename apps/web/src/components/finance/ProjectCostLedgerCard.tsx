// The project's cost ledger on its analytic account page (playbook #92).
//
// The analytic account page lists the journal lines TAGGED with the account, and almost nothing is tagged on purpose (an
// advance settlement of goods already booked at delivery must not tag the project again, or its cost would be counted twice,
// playbook #84b). A project's real cost sits in the cost ledger (jobsite deliveries, Store Outs, returns, posted journals),
// so a project with 175 cost entries said "No journal lines yet". This card lists that ledger.
//
// The data comes from the gateway's `projectCostLedger`, which applies the project's own "may this person see it" rule, so a
// person who can open the analytic account but not the project sees a short note instead of the figures.

import { useTranslation } from 'react-i18next'
import { useQuery } from '@apollo/client'
import { PROJECT_COST_LEDGER_QUERY } from '../../graphql/projects'
import type {
  ProjectCostLedgerQuery,
  ProjectCostLedgerQueryVariables,
} from '../../graphql/generated'
import { enumLabel } from '../../i18n'
import { useTheme } from '../../theme/ThemeContext'
import { Card } from '../ui/Card'
import { formatCurrency } from '../../lib/format'
import { COST_SOURCE_KEYS } from '../../lib/projectCostKinds'

export function ProjectCostLedgerCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { data, loading, error } = useQuery<
    ProjectCostLedgerQuery,
    ProjectCostLedgerQueryVariables
  >(PROJECT_COST_LEDGER_QUERY, { variables: { projectId }, fetchPolicy: 'cache-and-network' })

  const ledger = data?.projectCostLedger
  const sourceLabel = (sourceType: string | null): string => {
    if (!sourceType) return '—'
    const key = COST_SOURCE_KEYS[sourceType]
    return key ? t(key) : sourceType.replace(/_/g, ' ')
  }

  const headerStyle = {
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.border}`,
  } as const

  let body: React.ReactNode
  if (!ledger && loading) {
    body = (
      <div
        className="skeleton"
        style={{ height: 120, margin: '16px' }}
        data-testid="cost-ledger-loading"
      />
    )
  } else if (!ledger) {
    // not allowed to see the project, or the request failed: say so instead of showing an empty table
    body = (
      <div
        role={error ? 'status' : undefined}
        style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}
        data-testid="cost-ledger-unavailable"
      >
        {t('fin.analyticDetail.costLedgerUnavailable')}
      </div>
    )
  } else if (ledger.entries.length === 0) {
    body = (
      <div
        style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}
        data-testid="cost-ledger-empty"
      >
        {t('fin.analyticDetail.costLedgerEmpty')}
      </div>
    )
  } else {
    body = (
      <>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              {[
                { key: 'date', label: t('fin.analyticDetail.costDate'), end: false },
                { key: 'source', label: t('fin.analyticDetail.costSource'), end: false },
                { key: 'reference', label: t('fin.analyticDetail.costReference'), end: false },
                { key: 'category', label: t('fin.analyticDetail.costCategory'), end: false },
                { key: 'amount', label: t('fin.analyticDetail.costAmount'), end: true },
              ].map((h) => (
                <th
                  key={h.key}
                  style={{
                    textAlign: h.end ? 'end' : 'start',
                    padding: '8px 12px',
                    color: theme.textSecondary,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledger.entries.map((e) => (
              <tr
                key={e.id}
                style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                data-testid="cost-ledger-row"
              >
                <td
                  style={{ padding: '8px 12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}
                >
                  {e.entryDate ?? '—'}
                </td>
                <td style={{ padding: '8px 12px', color: theme.textPrimary }}>
                  {sourceLabel(e.sourceType)}
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    fontFamily: 'monospace',
                    color: theme.accent,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.reference ?? '—'}
                </td>
                <td style={{ padding: '8px 12px', color: theme.textSecondary }}>
                  {e.costCategory ? enumLabel(e.costCategory) : '—'}
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    textAlign: 'end',
                    color: theme.textPrimary,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatCurrency(parseFloat(e.amount), e.currencyCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ledger.truncated && (
          <div
            style={{ padding: '10px 16px', color: theme.textSecondary, fontSize: '12px' }}
            data-testid="cost-ledger-truncated"
          >
            {t('fin.analyticDetail.costLedgerTruncated', { count: ledger.entries.length })}
          </div>
        )}
      </>
    )
  }

  return (
    <Card padding="none" style={{ marginBottom: '16px' }}>
      <div style={headerStyle}>
        <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
          {t('fin.analyticDetail.costLedgerTitle')}
        </div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
          {t('fin.analyticDetail.costLedgerHint')}
        </div>
        {ledger && ledger.totals.length > 0 && (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}
            data-testid="cost-ledger-totals"
          >
            {ledger.totals.map((tot) => (
              <span
                key={tot.currencyCode}
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '12px',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCurrency(parseFloat(tot.amount), tot.currencyCode)}
              </span>
            ))}
          </div>
        )}
      </div>
      {body}
    </Card>
  )
}
