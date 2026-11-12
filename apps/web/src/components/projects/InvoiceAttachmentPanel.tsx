import { useRef, useState } from 'react'
import { useMutation } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { ActionButton } from '../ui/ActionButton'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Spinner } from '../ui/Spinner'
import { useToastStore } from '../../store/toastStore'
import { api } from '../../lib/axios'
import { uploadErrorDetail } from '../../lib/uploadMimeType'
import {
  PRINT_ATTACHMENT_ACCEPT,
  checkPrintAttachmentPick,
  forgetAttachmentPages,
  formatFileSize,
  readFileBytes,
  rememberAttachmentPages,
} from '../../lib/invoicePrintAttachment'
import { PrintAttachmentError, pagesFromBytes } from '../../lib/loadPrintAttachment'
import type { AttachmentPagesState } from '../../hooks/usePrintAttachmentPages'
import {
  REMOVE_INVOICE_PRINT_ATTACHMENT,
  SET_INVOICE_PRINT_ATTACHMENT,
} from '../../graphql/projects'
import type {
  RemoveInvoicePrintAttachmentMutation,
  RemoveInvoicePrintAttachmentMutationVariables,
  SetInvoicePrintAttachmentMutation,
  SetInvoicePrintAttachmentMutationVariables,
} from '../../graphql/generated'

export interface InvoicePrintAttachmentInfo {
  id: string
  fileId: string
  filename: string
  mimeType: string
  sizeBytes: number
}

interface InvoiceAttachmentPanelProps {
  invoiceId: string
  attachment: InvoicePrintAttachmentInfo | null | undefined
  /** Whether the pages of the attached file are ready to print (from usePrintAttachmentPages). */
  pages: AttachmentPagesState
  onRetry: () => void
  /** projects.invoices.edit: the server checks it again; the page only hides what it would refuse. */
  canEdit: boolean
  /** Called after the attachment was added, replaced or removed, so the invoice is read again. */
  onChanged: () => void
}

type Busy = 'preparing' | 'uploading' | 'removing' | null

/**
 * The one picture or PDF an invoice prints after its last page: what is attached, add / replace / remove, and whether
 * its pages are ready to print. A file is checked here (type, size, and for a PDF that it opens and has at most ten pages)
 * before anything is uploaded; the server checks the same rules again and is the authority.
 */
export function InvoiceAttachmentPanel({
  invoiceId,
  attachment,
  pages,
  onRetry,
  canEdit,
  onChanged,
}: InvoiceAttachmentPanelProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const [setAttachment] = useMutation<
    SetInvoicePrintAttachmentMutation,
    SetInvoicePrintAttachmentMutationVariables
  >(SET_INVOICE_PRINT_ATTACHMENT)
  const [removeAttachment] = useMutation<
    RemoveInvoicePrintAttachmentMutation,
    RemoveInvoicePrintAttachmentMutationVariables
  >(REMOVE_INVOICE_PRINT_ATTACHMENT)

  const key = (name: string, opts?: Record<string, unknown>) => t(`proj.invDetail.${name}`, opts)

  async function handlePick(file: File) {
    setProblem(null)
    const pick = checkPrintAttachmentPick(file)
    if (!pick.ok) {
      setProblem(
        key(
          pick.problem === 'type'
            ? 'printAttachmentBadType'
            : pick.problem === 'size'
              ? 'printAttachmentTooBig'
              : 'printAttachmentEmpty',
        ),
      )
      return
    }

    // 1. Open it here first: a damaged file, or a PDF over the page limit, is refused before anything is uploaded.
    setBusy('preparing')
    let printablePages: string[]
    try {
      printablePages = await pagesFromBytes(await readFileBytes(file), pick.mime)
    } catch (err) {
      setBusy(null)
      setProblem(
        err instanceof PrintAttachmentError && err.reason === 'tooLong' && err.detail
          ? key('printAttachmentTooLong', err.detail)
          : key('printAttachmentUnreadable'),
      )
      return
    }

    // 2. Upload, then attach. The pages just built are kept under the new file id, so the preview does not download
    //    and draw the same file again once the invoice is read back.
    setBusy('uploading')
    try {
      const reg = await api.post<{ fileId: string }>('/files/upload-url', {
        filename: file.name,
        mimeType: pick.mime,
        sizeBytes: file.size,
        category: 'attachment',
      })
      const fileId = reg.data.fileId
      await api.post(`/files/${fileId}/content`, file, { headers: { 'Content-Type': pick.mime } })
      rememberAttachmentPages(fileId, printablePages)
      await setAttachment({ variables: { invoiceId, fileId } })
      addToast({ type: 'success', message: key('printAttachmentSaved') })
      onChanged()
    } catch (err) {
      const detail = uploadErrorDetail(err) ?? (err instanceof Error ? err.message : null)
      const base = key('printAttachmentSaveFailed')
      setProblem(detail ? `${base}: ${detail}` : base)
    } finally {
      setBusy(null)
    }
  }

  async function handleRemove() {
    if (!attachment) return
    setProblem(null)
    setBusy('removing')
    try {
      await removeAttachment({ variables: { invoiceId } })
      forgetAttachmentPages(attachment.fileId)
      setConfirmRemove(false)
      addToast({ type: 'success', message: key('printAttachmentRemoved') })
      onChanged()
    } catch (err) {
      setConfirmRemove(false)
      const base = key('printAttachmentRemoveFailed')
      setProblem(err instanceof Error && err.message ? `${base}: ${err.message}` : base)
    } finally {
      setBusy(null)
    }
  }

  const working = busy !== null
  const statusLine = (() => {
    if (busy === 'preparing')
      return { text: key('printAttachmentPreparing'), tone: 'info' as const }
    if (busy === 'uploading')
      return { text: key('printAttachmentUploading'), tone: 'info' as const }
    if (!attachment) return null
    if (pages.status === 'loading')
      return { text: key('printAttachmentPreparing'), tone: 'info' as const }
    if (pages.status === 'ready')
      return {
        text: key('printAttachmentSheets', { sheets: pages.pages.length }),
        tone: 'ok' as const,
      }
    if (pages.status === 'failed') {
      const text =
        pages.reason === 'tooLong' && pages.detail
          ? key('printAttachmentTooLong', pages.detail)
          : pages.reason === 'unreadable'
            ? key('printAttachmentUnreadable')
            : key('printAttachmentLoadFailed')
      return { text, tone: 'error' as const }
    }
    return null
  })()
  const toneColor = (tone: 'info' | 'ok' | 'error') =>
    tone === 'error' ? theme.danger : tone === 'ok' ? theme.success : theme.textSecondary

  return (
    <div
      data-testid="invoice-attachment-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginBottom: '12px',
        padding: '14px 16px',
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        background: theme.bgSurface,
        textAlign: 'start',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={PRINT_ATTACHMENT_ACCEPT}
        aria-label={key('printAttachmentFile')}
        style={{ display: 'none' }}
        onChange={(e) => {
          const picked = e.target.files?.[0]
          e.target.value = ''
          if (picked) void handlePick(picked)
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {key('printAttachmentTitle')}
          </div>
          {canEdit && (
            <div style={{ marginTop: '2px', fontSize: '12px', color: theme.textSecondary }}>
              {key('printAttachmentHint')}
            </div>
          )}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ActionButton
              variant="outline"
              size="sm"
              disabled={working}
              loading={busy === 'preparing' || busy === 'uploading'}
              onClick={() => inputRef.current?.click()}
            >
              {attachment ? key('printAttachmentReplace') : key('printAttachmentAdd')}
            </ActionButton>
            {attachment && (
              <ActionButton
                variant="danger"
                size="sm"
                disabled={working}
                onClick={() => {
                  setConfirmRemove(true)
                }}
              >
                {key('printAttachmentRemove')}
              </ActionButton>
            )}
          </div>
        )}
      </div>

      {attachment ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            padding: '8px 12px',
            borderRadius: '10px',
            border: `1px solid ${theme.borderStrong}`,
            background: theme.bgSurfaceHover,
            fontSize: '13px',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '16px' }}>
            {attachment.mimeType === 'application/pdf' ? '📄' : '🖼'}
          </span>
          <span
            title={attachment.filename}
            style={{
              flex: '1 1 160px',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 600,
              color: theme.textPrimary,
            }}
          >
            {attachment.filename}
          </span>
          <span style={{ color: theme.textSecondary }}>{formatFileSize(attachment.sizeBytes)}</span>
        </div>
      ) : (
        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
          {key('printAttachmentNone')}
        </div>
      )}

      {statusLine && (
        <div
          data-testid="invoice-attachment-status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '12px',
            color: toneColor(statusLine.tone),
          }}
        >
          {statusLine.tone === 'info' && <Spinner size="sm" />}
          <span>{statusLine.text}</span>
          {pages.status === 'failed' &&
            attachment &&
            busy === null &&
            pages.reason === 'download' && (
              <ActionButton variant="ghost" size="sm" onClick={onRetry}>
                {key('printAttachmentRetry')}
              </ActionButton>
            )}
        </div>
      )}

      {problem && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: '10px',
            border: `1px solid ${theme.dangerBorder}`,
            background: theme.dangerBg,
            color: theme.danger,
            fontSize: '12px',
          }}
        >
          {problem}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={key('printAttachmentRemoveTitle')}
        message={key('printAttachmentRemoveMessage')}
        confirmLabel={key('printAttachmentRemove')}
        variant="danger"
        loading={busy === 'removing'}
        onConfirm={() => void handleRemove()}
        onCancel={() => {
          setConfirmRemove(false)
        }}
      />
    </div>
  )
}
