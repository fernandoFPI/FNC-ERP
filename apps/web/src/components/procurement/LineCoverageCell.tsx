import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { lineCoverage, type CoverageLine } from '../../lib/poLineCoverage'

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

interface LineCoverageCellProps {
  line: CoverageLine
  /** Finance audit: also say how far short of, or over, the order the line is. */
  showDeviation?: boolean
}

/**
 * What has arrived of one line, out of what was ordered: "4/4", a bar that fills to match and, when stock covers part of it,
 * where it came from. The Lines table (also while it is being audited) draws it from here, so a line covered from stock reads the same
 * as the bar says (playbook #41: the table used to count only what was received).
 */
export function LineCoverageCell({ line, showDeviation = false }: LineCoverageCellProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const cov = lineCoverage(line)
  const color =
    cov.state === 'full'
      ? theme.success
      : cov.state === 'partial'
        ? theme.warning
        : theme.textSecondary
  const short = cov.covered < cov.ordered
  const over = cov.received > cov.ordered

  return (
    <div style={{ minWidth: '92px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {cov.state === 'full' && <span aria-hidden="true">✓</span>}
        <span>
          {fmt(cov.arrived)}/{fmt(cov.ordered)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('po.detail.coverage')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={cov.pct}
        style={{
          height: '4px',
          borderRadius: '2px',
          background: theme.border,
          overflow: 'hidden',
          marginTop: '5px',
        }}
      >
        <div
          style={{ height: '100%', width: `${cov.pct}%`, background: color, borderRadius: '2px' }}
        />
      </div>
      {cov.fromStock > 0 && (
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '3px' }}>
          {t('po.detail.receivedPlusStock', {
            received: fmt(cov.received),
            stock: fmt(cov.fromStock),
          })}
        </div>
      )}
      {showDeviation && short && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: theme.danger, marginTop: '3px' }}>
          {t('po.detail.shortBy', { qty: fmt(cov.ordered - cov.covered) })}
        </div>
      )}
      {showDeviation && over && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: theme.warning, marginTop: '3px' }}>
          {t('po.detail.overBy', { qty: fmt(cov.received - cov.ordered) })}
        </div>
      )}
    </div>
  )
}
