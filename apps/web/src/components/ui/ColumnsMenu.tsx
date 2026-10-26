import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'

export interface ColumnsMenuItem {
  key: string
  label: string
  on: boolean
  /** Always shown: its box is ticked and can't be changed. */
  locked?: boolean
}

interface ColumnsMenuProps {
  items: ColumnsMenuItem[]
  onToggle: (key: string, on: boolean) => void
  onReset: () => void
  /** True when the person's choices differ from the defaults, which is what "Reset" undoes. */
  canReset: boolean
  /** Small print under the list, e.g. which columns can't be hidden. */
  note?: string
}

// "Columns · 6 of 9" button that opens a list of tick boxes, one per optional column. It only
// reports what was ticked; remembering the choice is useTableView's job.
export function ColumnsMenu({ items, onToggle, onReset, canReset, note }: ColumnsMenuProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [open])

  const shown = items.filter((i) => i.on || i.locked).length

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false)
          buttonRef.current?.focus()
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((v) => !v)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          background: open ? theme.accentBg : theme.bgSurface,
          border: `1px solid ${open ? theme.accentBorder : theme.borderInput}`,
          color: open ? theme.accent : theme.textPrimary,
          borderRadius: '8px',
          padding: '7px 11px',
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </svg>
        {t('ui.tableView.columnsCount', { shown, total: items.length })}
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={t('ui.tableView.showColumns')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            insetInlineEnd: 0,
            zIndex: 30,
            width: '248px',
            maxWidth: '86vw',
            background: theme.bgSurface,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: '10px',
            boxShadow: '0 10px 28px rgba(26, 26, 46, 0.18)',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: theme.textSecondary,
              marginBottom: '8px',
            }}
          >
            {t('ui.tableView.showColumns')}
          </div>
          {items.map((item) => (
            <label
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 0',
                fontSize: '13px',
                color: item.locked ? theme.textSecondary : theme.textPrimary,
                cursor: item.locked ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={item.on || !!item.locked}
                disabled={item.locked}
                onChange={(e) => {
                  onToggle(item.key, e.target.checked)
                }}
                style={{ accentColor: theme.accent }}
              />
              {item.label}
            </label>
          ))}
          {(!!note || canReset) && (
            <div
              style={{
                borderTop: `1px solid ${theme.border}`,
                marginTop: '8px',
                paddingTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {note && <div style={{ fontSize: '12px', color: theme.textSecondary }}>{note}</div>}
              {canReset && (
                <button
                  type="button"
                  onClick={onReset}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: theme.accent,
                  }}
                >
                  {t('ui.tableView.resetToDefault')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
