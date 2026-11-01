import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../theme/ThemeContext'
import type { LineComment } from './LineCommentsModal'

// Same look and behaviour as the "+ Note" button in PurchaseOrderDetail's
// Notes column: "+ Note" while the line has no comments, "💬 N" once it has
// some, and the colour/label of the most severe unresolved flag (dispute >
// warning > info) once one is open. Kept as its own small component (not
// inlined in RequisitionDetail.tsx) for the same reason LineCommentsModal is:
// that file is already large enough to push esbuild over a memory ceiling in
// vitest. It opens the same LineCommentsModal, so a note added here is the
// same thread the PO page reads (po_line_comments, keyed by the line).
const FLAG_PRIORITY = ['dispute', 'warning', 'info'] as const
const FLAG_DOT: Record<(typeof FLAG_PRIORITY)[number], string> = {
  dispute: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
}

export function LineNoteButton({
  comments,
  onClick,
}: {
  comments: LineComment[]
  onClick: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const open = comments.filter((c) => c.flag && !c.resolved)
  const activeFlag = FLAG_PRIORITY.find((f) => open.some((c) => c.flag === f)) ?? null
  const dot = activeFlag ? FLAG_DOT[activeFlag] : null
  const total = comments.length

  const label = activeFlag
    ? t('req.detail.noteFlagOpen', { flag: t(`po.detail.${activeFlag}`), n: open.length })
    : total > 0
      ? `💬 ${total}`
      : t('req.detail.addNote')

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: dot ? `${dot}18` : total > 0 ? `${theme.accent}12` : theme.bgSurface,
        border: `1px solid ${dot ?? (total > 0 ? theme.accent : theme.border)}`,
        borderRadius: '6px',
        padding: '4px 10px',
        fontSize: '12px',
        color: dot ?? (total > 0 ? theme.accent : theme.textMuted),
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: dot,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </button>
  )
}
