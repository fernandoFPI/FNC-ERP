import { useRef, useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { ActionButton } from '../ui/ActionButton'

interface ReceiptDropZoneProps {
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  onClear: () => void
  /** The button's text while nothing is attached yet. */
  browseLabel: string
  /** The button's text once there are files ("add more"). */
  addMoreLabel: string
  hint: string
  clearLabel: string
  removeLabel: (fileName: string) => string
  disabled?: boolean
}

// Only photos and PDFs are receipts; anything else dropped on the zone is ignored, as the picker's own filter does.
const isReceiptFile = (f: File) => f.type.startsWith('image/') || f.type === 'application/pdf'

/**
 * Where a buyer attaches the receipt: a dashed zone that takes files dropped on it or picked with the button,
 * and lists what is attached as chips, each with its own remove. The state (the list of files) stays with the
 * page, which uploads them when the purchase is recorded.
 */
export function ReceiptDropZone({
  files,
  onAdd,
  onRemove,
  onClear,
  browseLabel,
  addMoreLabel,
  hint,
  clearLabel,
  removeLabel,
  disabled = false,
}: ReceiptDropZoneProps) {
  const { theme } = useTheme()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      data-testid="receipt-drop-zone"
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => {
        setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (disabled) return
        const dropped = Array.from(e.dataTransfer.files).filter(isReceiptFile)
        if (dropped.length > 0) onAdd(dropped)
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: '10px',
        border: `1.5px dashed ${dragging ? theme.accent : theme.borderField}`,
        background: dragging ? theme.accentBg : theme.bgSurfaceHover,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length > 0) onAdd(picked)
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.textSecondary}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
        </svg>
        <span style={{ flex: 1, minWidth: '140px', fontSize: '13px', color: theme.textSecondary }}>
          {hint}
        </span>
        <ActionButton
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {files.length > 0 ? addMoreLabel : browseLabel}
        </ActionButton>
        {files.length > 0 && (
          <ActionButton variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
            {clearLabel}
          </ActionButton>
        )}
      </div>
      {files.length > 0 && (
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}
        >
          {files.map((f, i) => (
            <li
              // A file has no id; the same name can be picked twice, so the position keeps the keys apart.
              key={`${f.name}-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                maxWidth: '100%',
                height: '28px',
                padding: '0 4px 0 10px',
                borderRadius: '999px',
                border: `1px solid ${theme.borderStrong}`,
                background: theme.bgSurface,
                fontSize: '12px',
                color: theme.textPrimary,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '220px',
                }}
              >
                {f.name}
              </span>
              <button
                type="button"
                aria-label={removeLabel(f.name)}
                disabled={disabled}
                onClick={() => {
                  onRemove(i)
                }}
                style={{
                  width: '20px',
                  height: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: '50%',
                  background: 'transparent',
                  color: theme.textSecondary,
                  fontSize: '14px',
                  lineHeight: 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  padding: 0,
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
