import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from '../ui/Button'
import { lineFlagState, type LineFlagFields } from '../../lib/expenseClaimFlags'

// The review flag on one expense claim line: who flagged it, why, and (for an approver) a button
// to confirm the employee's fix. Renders nothing for a line with no live flag. Shared by the claim
// page and the employee's own popup so both show the same thing.
export function ExpenseLineFlag({
  line,
  flaggedByName,
  onResolve,
  resolving = false,
}: {
  line: LineFlagFields
  flaggedByName?: string | null
  // Given only to someone who may confirm a fix (finance.expenses.approve); the employee never sees the button.
  onResolve?: () => void
  resolving?: boolean
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const state = lineFlagState(line)
  if (state === 'none') return null
  const color = state === 'open' ? theme.danger : theme.warning
  return (
    <div data-testid="expense-line-flag" data-flag-state={state}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '2px 8px',
            borderRadius: '999px',
            background: `${color}18`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {state === 'open' ? t('fin.expLines.flagged') : t('fin.expLines.fixedAwaiting')}
        </span>
        <span style={{ fontSize: '11px', color: theme.textMuted }}>
          {t('fin.expLines.flaggedBy', { name: flaggedByName ?? t('fin.expLines.someone') })}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>
        {line.flag_reason}
      </div>
      {state === 'fixed' && onResolve && (
        <div style={{ marginTop: '8px' }}>
          <Button variant="secondary" size="sm" loading={resolving} onClick={onResolve}>
            {t('fin.expLines.resolve')}
          </Button>
        </div>
      )}
    </div>
  )
}
