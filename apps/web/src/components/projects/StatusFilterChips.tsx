import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { ChipButton } from '../ui/ChipButton'
import type { StatusOption } from '../../lib/projectProcurementFilter'

// The status filter above a list on a project's Procurement tab: an "All" chip and one chip per status that occurs in the list, each
// with its count; ticking several shows all of them, ticking none shows everything. It only draws; the page keeps the selection.

interface Props {
  options: StatusOption[]
  /** The ticked statuses (already limited to ones that occur in the list). */
  selected: string[]
  /** How many rows there are in all, for the "All" chip. */
  total: number
  onToggle: (value: string) => void
  onClear: () => void
}

export function StatusFilterChips({ options, selected, total, onToggle, onClear }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  // With one status there is nothing to choose between.
  if (options.length < 2) return null

  const withCount = (label: string, count: number) => (
    <>
      {/* the space keeps the button's name "Rejected 2" for a screen reader; in the flex row it only collapses */}
      {label}{' '}
      <span
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: theme.textSecondary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </span>
    </>
  )

  return (
    <div
      role="group"
      aria-label={t('proj.detail.filterByStatus')}
      style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}
    >
      <ChipButton selected={selected.length === 0} onClick={onClear}>
        {withCount(t('proj.detail.statusFilterAll'), total)}
      </ChipButton>
      {options.map((o) => (
        <ChipButton
          key={o.value}
          selected={selected.includes(o.value)}
          onClick={() => {
            onToggle(o.value)
          }}
        >
          {withCount(o.label, o.count)}
        </ChipButton>
      ))}
    </div>
  )
}
