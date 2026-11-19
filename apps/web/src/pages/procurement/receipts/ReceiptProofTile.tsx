import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../theme/ThemeContext'
import { ActionButton } from '../../../components/ui/ActionButton'

export type PhotoKind = 'vendor_receipt' | 'materials'

export interface PendingPhoto {
  id: string
  file: File
  previewUrl: string
  label: string
  kind: PhotoKind
  uploading: boolean
  error?: string
}

/** Where the proof stands: nothing yet, the buyer's copy is on file, added on this page, or skipped by an administrator. */
export type ProofStatus = 'missing' | 'onFile' | 'added' | 'skipped'

interface ReceiptProofTileProps {
  title: string
  hint: string
  status: ProofStatus
  statusLabel: string
  photos: PendingPhoto[]
  dragOver: boolean
  onDragOver: () => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onTakePhoto: () => void
  onAddFile: () => void
  onRemove: (photoId: string) => void
  /** Anchor for the onboarding walkthrough (components/help/tours.ts). */
  'data-tour'?: string
}

const THUMB_W = 104
const THUMB_H = 78

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

/**
 * One piece of proof of delivery (the vendor's receipt, a photo of the materials): a titled card with a status chip,
 * what has been added so far as thumbnails, and the two ways to add more (take a photo, pick a file) over a drop zone.
 */
export function ReceiptProofTile({
  title,
  hint,
  status,
  statusLabel,
  photos,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onTakePhoto,
  onAddFile,
  onRemove,
  'data-tour': dataTour,
}: ReceiptProofTileProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const tone =
    status === 'missing' || status === 'skipped'
      ? { fg: theme.warning, bg: theme.warningBg, border: theme.warningBorder }
      : { fg: theme.success, bg: theme.successBg, border: theme.successBorder }

  return (
    <section
      data-proof={status}
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px',
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        background: theme.bgSurface,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div data-tour={dataTour} style={{ fontWeight: 600, fontSize: '14px', color: theme.textPrimary }}>
          {title}
        </div>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: '999px',
            color: tone.fg,
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: theme.textSecondary }}>{hint}</div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          onDragOver()
        }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          borderRadius: '10px',
          border: `1.5px dashed ${dragOver ? theme.accent : theme.borderField}`,
          background: dragOver ? theme.accentBg : theme.bgSurfaceHover,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {photos.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {photos.map((photo) => (
              <div key={photo.id} style={{ position: 'relative', width: `${THUMB_W}px` }}>
                {photo.file.type === 'application/pdf' ? (
                  <div
                    style={{
                      width: `${THUMB_W}px`,
                      height: `${THUMB_H}px`,
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgSurface,
                      color: theme.textSecondary,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <FileIcon />
                    <span
                      style={{
                        fontSize: '11px',
                        maxWidth: `${THUMB_W - 12}px`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {photo.file.name}
                    </span>
                  </div>
                ) : (
                  <img
                    src={photo.previewUrl}
                    alt={photo.file.name}
                    style={{
                      width: `${THUMB_W}px`,
                      height: `${THUMB_H}px`,
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      display: 'block',
                    }}
                  />
                )}
                {photo.uploading && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.45)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  >
                    {t('receipt.form.uploading')}
                  </div>
                )}
                {photo.error && (
                  <div
                    role="alert"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: theme.danger,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: theme.dangerBg,
                      fontSize: '11px',
                      padding: '4px',
                      textAlign: 'center',
                    }}
                  >
                    {photo.error}
                  </div>
                )}
                <button
                  type="button"
                  aria-label={t('receipt.form.removePhoto', { name: photo.file.name })}
                  onClick={() => {
                    onRemove(photo.id)
                  }}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    insetInlineEnd: '4px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    lineHeight: '24px',
                    textAlign: 'center',
                    padding: 0,
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <ActionButton variant="outline" size="sm" icon={<CameraIcon />} onClick={onTakePhoto}>
            {t('receipt.form.takePhoto')}
          </ActionButton>
          <ActionButton variant="outline" size="sm" onClick={onAddFile}>
            {t('receipt.form.addPhotoPdf')}
          </ActionButton>
          <span style={{ fontSize: '12px', color: theme.textSecondary }}>{t('receipt.form.orDragDrop')}</span>
        </div>
      </div>
    </section>
  )
}
