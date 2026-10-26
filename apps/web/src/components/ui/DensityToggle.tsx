import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import type { TableDensity } from '../../hooks/useTableView'

interface DensityToggleProps {
  value: TableDensity
  onChange: (density: TableDensity) => void
}

// Comfortable | Compact: how tightly a table's rows are packed.
export function DensityToggle({ value, onChange }: DensityToggleProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const options: { key: TableDensity; label: string }[] = [
    { key: 'comfortable', label: t('ui.tableView.comfortable') },
    { key: 'compact', label: t('ui.tableView.compact') },
  ]
  return (
    <div
      role="group"
      aria-label={t('ui.tableView.density')}
      style={{
        display: 'flex',
        border: `1px solid ${theme.borderInput}`,
        borderRadius: '8px',
        overflow: 'hidden',
        fontSize: '12px',
      }}
    >
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(o.key)
            }}
            style={{
              cursor: 'pointer',
              border: 'none',
              padding: '7px 10px',
              whiteSpace: 'nowrap',
              background: active ? theme.accent : theme.bgSurface,
              color: active ? '#ffffff' : theme.textSecondary,
              fontWeight: active ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
