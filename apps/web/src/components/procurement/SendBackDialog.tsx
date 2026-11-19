import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

export interface SendBackDestination {
  key: string
  label: string
  description: string
}

export interface SendBackFlaggedLine {
  id: string
  name: string
  reason: string
}

interface SendBackDialogProps {
  open: boolean
  onClose: () => void
  /** "Send REQ-2026-0050 back" */
  title: string
  /** Only the places this step is allowed to send the requisition to. */
  destinations: SendBackDestination[]
  flagged: SendBackFlaggedLine[]
  /** The overall note the person typed; empty means "use the reasons of the flagged lines". */
  note: string
  /** What is sent when the note is left empty (built from the flagged lines). */
  notePlaceholder: string
  onNoteChange: (value: string) => void
  loading?: boolean
  onConfirm: (destinationKey: string) => void
}

/**
 * The dialog behind a requisition's "Send back" button. The person has already ticked the lines and
 * said what is wrong on each; here they choose who gets it next (nothing is pre-selected, so a wrong
 * default can never send the work to the wrong team) and may edit the overall reason.
 */
export function SendBackDialog({
  open,
  onClose,
  title,
  destinations,
  flagged,
  note,
  notePlaceholder,
  onNoteChange,
  loading = false,
  onConfirm,
}: SendBackDialogProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [chosen, setChosen] = useState('')

  // Every opening starts with nothing chosen.
  useEffect(() => {
    if (open) setChosen('')
  }, [open])

  const picked = destinations.find((d) => d.key === chosen)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={t('req.detail.sendBackFlaggedHint', { count: flagged.length })}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose}>
            {t('req.detail.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={!picked}
            onClick={() => {
              if (picked) onConfirm(picked.key)
            }}
          >
            {picked
              ? t('req.detail.sendBackConfirm', { destination: picked.label })
              : t('req.detail.sendBackButton')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 0 }}>
          <legend
            style={{
              padding: 0,
              marginBottom: '8px',
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textSecondary,
            }}
          >
            {t('req.detail.sendBackChoose')}
          </legend>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {destinations.map((d) => {
              const on = d.key === chosen
              return (
                <label
                  key={d.key}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    padding: on ? '11px 13px' : '12px 14px',
                    border: on ? `2px solid ${theme.accent}` : `1px solid ${theme.borderStrong}`,
                    borderRadius: '10px',
                    background: on ? theme.accentBg : theme.bgSurface,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="send-back-destination"
                    value={d.key}
                    checked={on}
                    onChange={() => {
                      setChosen(d.key)
                    }}
                    style={{ marginTop: '3px' }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: theme.textPrimary,
                      }}
                    >
                      {d.label}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: theme.textSecondary,
                        marginTop: '2px',
                      }}
                    >
                      {d.description}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textSecondary,
              marginBottom: '6px',
            }}
          >
            {t('req.detail.sendBackFlaggedLines')}
          </div>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {flagged.map((f) => (
              <li
                key={f.id}
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>{f.name}</div>
                <div
                  style={{ color: theme.textPrimary, marginTop: '2px', overflowWrap: 'anywhere' }}
                >
                  {f.reason}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Textarea field
          label={t('req.detail.overallReasonAutoFilledFromFlagged')}
          value={note}
          onChange={(e) => {
            onNoteChange(e.target.value)
          }}
          placeholder={notePlaceholder}
          rows={3}
        />
      </div>
    </Modal>
  )
}
