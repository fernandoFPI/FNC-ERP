import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import {
  ENTITY_ATTACHMENTS_QUERY,
  ATTACH_FILE,
  DETACH_FILE,
  FILE_DOWNLOAD_URL_QUERY,
} from '../../graphql/hr'
import { REQUEST_UPLOAD_URL } from '../../graphql/procurement'
import { useTheme } from '../../theme/ThemeContext'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { useToastStore } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'

interface GQLFile {
  id: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  category: string
  uploadedAt?: string
}

interface Attachment {
  id: string
  file: GQLFile
  label?: string
  isPrimary: boolean
  createdAt: string
  uploadedByEmail?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.startsWith('image/')) return '🖼️'
  return '📎'
}

// Lets a printable document (Store Out, Store In, ...) get printed, physically
// signed, then the scanned/photographed copy uploaded back onto the record —
// reuses the same generic document_attachments mechanism as
// EmployeeDocumentsTab, just pointed at whichever entityType/entityId owns it.
// entityType must be handled in verifyAttachmentEntityOwnershipGW (gateway
// resolvers.ts) or attachment writes for it are unscoped.
export function EntityAttachments({
  entityType,
  entityId,
  recordLabel = 'this record',
  title = 'Signed Documents',
  description,
  uploadButtonLabel = 'Upload signed copy',
}: {
  entityType: string
  entityId: string
  recordLabel?: string
  title?: string
  description?: string
  uploadButtonLabel?: string
}) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const accessToken = useAuthStore((s) => s.accessToken)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)

  const { data, loading, refetch } = useQuery(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType, entityId },
    fetchPolicy: 'cache-and-network',
  })

  const [requestUploadUrl] = useMutation(REQUEST_UPLOAD_URL)
  const [attachFile] = useMutation(ATTACH_FILE)
  const [detachFile, { loading: detaching }] = useMutation(DETACH_FILE)
  const [getDownloadUrl] = useLazyQuery(FILE_DOWNLOAD_URL_QUERY)

  const attachments: Attachment[] = data?.entityAttachments ?? []

  // Image thumbnails — fetched lazily per file since the signed download URL
  // (unlike the file list) isn't returned by ENTITY_ATTACHMENTS_QUERY.
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [thumbFailed, setThumbFailed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const toFetch = attachments.filter(
      (a) => a.file.mimeType.startsWith('image/') && !thumbnails[a.file.id] && !thumbFailed[a.file.id],
    )
    if (toFetch.length === 0) return
    let cancelled = false
    Promise.all(
      toFetch.map(async (att) => {
        try {
          const { data: dlData } = await getDownloadUrl({ variables: { fileId: att.file.id } })
          const url = dlData?.fileDownloadUrl?.downloadUrl
          return url ? ([att.file.id, url] as const) : null
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const r of results) if (r) next[r[0]] = r[1]
      if (Object.keys(next).length) setThumbnails((prev) => ({ ...prev, ...next }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setUploadLabel('')
    setUploadModalOpen(true)
    e.target.value = ''
  }

  async function handleUpload() {
    if (!pendingFile) return
    setUploading(true)
    try {
      const { data: urlData } = await requestUploadUrl({
        variables: {
          filename: pendingFile.name,
          mimeType: pendingFile.type || 'application/octet-stream',
          sizeBytes: pendingFile.size,
          category: 'attachment',
        },
      })
      const { fileId } = urlData.requestUploadUrl

      const apiBase = import.meta.env.VITE_API_URL as string
      const proxyRes = await fetch(`${apiBase}/api/v1/files/${fileId}/content`, {
        method: 'POST',
        body: pendingFile,
        headers: {
          'Content-Type': pendingFile.type || 'application/octet-stream',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      })
      if (!proxyRes.ok) {
        const errJson = (await proxyRes.json().catch(() => ({}))) as {
          error?: { message?: string }
        }
        throw new Error(errJson?.error?.message ?? `Upload failed: ${proxyRes.statusText}`)
      }

      await attachFile({
        variables: {
          fileId,
          entityType,
          entityId,
          label: uploadLabel || `Signed ${recordLabel}`,
        },
      })

      addToast({ type: 'success', message: 'Signed document uploaded' })
      setUploadModalOpen(false)
      setPendingFile(null)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(fileId: string, filename: string) {
    try {
      const { data: dlData } = await getDownloadUrl({ variables: { fileId } })
      const url = dlData?.fileDownloadUrl?.downloadUrl
      if (!url) throw new Error('No download URL')
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleDetach() {
    if (!deleteTarget) return
    try {
      const res = await detachFile({
        variables: {
          attachmentId: deleteTarget.id,
          entityType,
          entityId,
        },
      })
      if (res.data?.detachFile) {
        addToast({ type: 'success', message: 'Document removed' })
      } else {
        addToast({ type: 'error', message: 'Document was already removed' })
      }
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />

      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
              {title} ({attachments.length})
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
              {description ??
                `Print ${recordLabel}, get it signed, then upload a photo or scan of the signed copy here.`}
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={openFilePicker}>
            {uploadButtonLabel}
          </Button>
        </div>

        {loading && (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: theme.textMuted,
              fontSize: '13px',
            }}
          >
            Loading…
          </div>
        )}

        {!loading && attachments.length === 0 && (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: theme.textMuted,
              fontSize: '13px',
            }}
          >
            No signed documents uploaded yet
          </div>
        )}

        {!loading && attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {attachments.map((att, i) => (
              <div
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderBottom:
                    i < attachments.length - 1 ? `1px solid ${theme.border}` : undefined,
                }}
              >
                {thumbnails[att.file.id] ? (
                  <img
                    src={thumbnails[att.file.id]}
                    alt=""
                    onError={() => {
                      setThumbFailed((prev) => ({ ...prev, [att.file.id]: true }))
                      setThumbnails((prev) => {
                        const next = { ...prev }
                        delete next[att.file.id]
                        return next
                      })
                    }}
                    style={{
                      width: '40px',
                      height: '40px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '22px',
                      width: '40px',
                      textAlign: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {fileIcon(att.file.mimeType)}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: theme.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {att.label || att.file.originalFilename}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: theme.textMuted,
                      marginTop: '2px',
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{att.file.originalFilename}</span>
                    <span>·</span>
                    <span>{formatBytes(att.file.sizeBytes)}</span>
                    {att.createdAt && (
                      <>
                        <span>·</span>
                        <span>{att.createdAt.slice(0, 10)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(att.file.id, att.file.originalFilename)}
                  >
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ color: theme.danger }}
                    onClick={() => {
                      setDeleteTarget(att)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Upload modal */}
      <Modal
        open={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false)
          setPendingFile(null)
        }}
        title="Upload signed document"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setUploadModalOpen(false)
                setPendingFile(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpload} loading={uploading}>
              Upload
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {pendingFile && (
            <div
              style={{
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                color: theme.textSecondary,
              }}
            >
              {fileIcon(pendingFile.type)} <strong>{pendingFile.name}</strong> —{' '}
              {formatBytes(pendingFile.size)}
            </div>
          )}
          <Input
            label="Label (optional)"
            value={uploadLabel}
            onChange={(e) => {
              setUploadLabel(e.target.value)
            }}
            placeholder="e.g. Signed by site foreman"
          />
        </div>
      </Modal>

      {/* Remove confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null)
        }}
        title="Remove document"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDetach} loading={detaching}>
              Remove
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: theme.textPrimary, fontSize: '13px' }}>
          Remove <strong>{deleteTarget?.label || deleteTarget?.file.originalFilename}</strong> from{' '}
          {recordLabel}? The file will be detached but not permanently deleted.
        </p>
      </Modal>
    </div>
  )
}
