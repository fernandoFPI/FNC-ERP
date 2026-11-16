// The top row of a project's analytic account page: what the project's cost adds up to in each currency, and of which kinds of
// cost (playbook #95).
//
// The row used to count only the journal lines TAGGED with the account (for NY-PRJ-2026-0032: "Total Lines 18", 1,210,250 IQD,
// the expense claims) directly above a cost ledger that said 10,131,604.55 IQD and 10,359.00 USD: two numbers on one page. Almost
// nothing is journal-tagged on purpose (playbook #84b), so the row now reads the same ledger the project header and the ledger
// card below it read. The kinds come from the server, summed over every row (the list below is cut at 500), so for each
// currency they add up to its total. Nothing is converted or added across currencies: one card per currency.
//
// When the person may not see the project, or the request failed, the row shows nothing: the ledger card below says why.

import { useTranslation } from 'react-i18next'
import { useQuery } from '@apollo/client'
import { PROJECT_COST_LEDGER_QUERY } from '../../graphql/projects'
import type {
  ProjectCostLedgerQuery,
  ProjectCostLedgerQueryVariables,
} from '../../graphql/generated'
import { useTheme } from '../../theme/ThemeContext'
import { Card } from '../ui/Card'
import { formatCurrency } from '../../lib/format'
import { COST_SOURCE_KEYS, orderCostKinds } from '../../lib/projectCostKinds'

export function ProjectCostSummaryCards({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { data, loading } = useQuery<ProjectCostLedgerQuery, ProjectCostLedgerQueryVariables>(
    PROJECT_COST_LEDGER_QUERY,
    { variables: { projectId }, fetchPolicy: 'cache-and-network' },
  )

  const ledger = data?.projectCostLedger
  if (!ledger) {
    return loading ? (
      <div
        className="skeleton"
        style={{ height: 120, marginBottom: '20px' }}
        data-testid="cost-summary-loading"
      />
    ) : null
  }
  if (ledger.totals.length === 0) return null

  const kindLabel = (sourceType: string | null): string => {
    if (!sourceType) return t('fin.analyticDetail.costSourceOther')
    const key = COST_SOURCE_KEYS[sourceType]
    return key ? t(key) : sourceType.replace(/_/g, ' ')
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '12px',
        marginBottom: '20px',
      }}
      data-testid="cost-summary"
    >
      {ledger.totals.map((tot) => {
        const kinds = orderCostKinds(
          ledger.byKind.filter((k) => k.currencyCode === tot.currencyCode),
        )
        return (
          <Card key={tot.currencyCode} padding="sm">
            <div data-testid={`cost-summary-${tot.currencyCode}`}>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' }}>
                {t('fin.analyticDetail.projectCostCardTitle', { currency: tot.currencyCode })}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '18px',
                  color: theme.textPrimary,
                  fontVariantNumeric: 'tabular-nums',
                  marginBottom: '8px',
                }}
                data-testid="cost-summary-total"
              >
                {formatCurrency(parseFloat(tot.amount), tot.currencyCode)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {kinds.map((k) => (
                  <div
                    key={k.sourceType ?? '(none)'}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      fontSize: '12px',
                    }}
                    data-testid="cost-summary-kind"
                  >
                    <span style={{ color: theme.textSecondary }}>{kindLabel(k.sourceType)}</span>
                    <span
                      style={{
                        color: theme.textPrimary,
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatCurrency(parseFloat(k.amount), k.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
