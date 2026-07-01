import { useRef, useState } from 'react'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import { ENTITY_ATTACHMENTS_QUERY, ATTACH_FILE, DETACH_FILE, FILE_DOWNLOAD_URL_QUERY } from '../../../graphql/hr'
import { REQUEST_UPLOAD_URL } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

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

const CATEGORY_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'identity', label: 'Identity document' },
  { value: 'attachment', label: 'Attachment' },
  { value: 'report', label: 'Report' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  return '📎'
}

export function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const accessToken = useAuthStore((s) => s.accessToken)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadCategory, setUploadCategory] = useState('attachment')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)

  const { data, loading, refetch } = useQuery(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType: 'employee', entityId: employeeId },
    fetchPolicy: 'cache-and-network',
  })

  const [requestUploadUrl] = useMutation(REQUEST_UPLOAD_URL)
  const [attachFile] = useMutation(ATTACH_FILE)
  const [detachFile, { loading: detaching }] = useMutation(DETACH_FILE)
  const [getDownloadUrl] = useLazyQuery(FILE_DOWNLOAD_URL_QUERY)

  const attachments: Attachment[] = data?.entityAttachments ?? []

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setUploadLabel('')
    setUploadCategory('attachment')
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
          category: uploadCategory,
        },
      })
      const { fileId } = urlData.requestUploadUrl

      // Upload through gateway proxy — avoids browser-to-B2 CORS issues and works in dev mode
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
        const errJson = await proxyRes.json().catch(() => ({})) as { error?: { message?: string } }
        throw new Error(errJson?.error?.message ?? `Upload failed: ${proxyRes.statusText}`)
      }

      await attachFile({
        variables: {
          fileId,
          entityType: 'employee',
          entityId: employeeId,
          label: uploadLabel || undefined,
        },
      })

      addToast({ type: 'success', message: 'Document uploaded' })
      setUploadModalOpen(false); setPendingFile(null)
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
      a.href = url; a.download = filename; a.target = '_blank'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleDetach() {
    if (!deleteTarget) return
    try {
      await detachFile({ variables: { attachmentId: deleteTarget.id, entityType: 'employee', entityId: employeeId } })
      addToast({ type: 'success', message: 'Document removed' })
      setDeleteTarget(null); refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChosen} />

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>Documents ({attachments.length})</span>
          <Button variant="primary" size="sm" onClick={openFilePicker}>Upload document</Button>
        </div>

        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
        )}

        {!loading && attachments.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
            No documents uploaded yet
          </div>
        )}

        {!loading && attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {attachments.map((att, i) => (
              <div key={att.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                borderBottom: i < attachments.length - 1 ? `1px solid ${theme.border}` : undefined,
              }}>
                <span style={{ fontSize: '22px', flexShrink: 0 }}>{fileIcon(att.file.mimeType)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.label || att.file.originalFilename}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{att.file.originalFilename}</span>
                    <span>·</span>
                    <span>{formatBytes(att.file.sizeBytes)}</span>
                    <span>·</span>
                    <Badge variant="neutral" size="sm">{att.file.category}</Badge>
                    {att.createdAt && <><span>·</span><span>{att.createdAt.slice(0, 10)}</span></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(att.file.id, att.file.originalFilename)}>Download</Button>
                  <Button variant="ghost" size="sm" style={{ color: theme.danger }} onClick={() => setDeleteTarget(att)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Upload modal */}
      <Modal open={uploadModalOpen} onClose={() => { setUploadModalOpen(false); setPendingFile(null) }} title="Upload document" size="sm"
        footer={<><Button variant="secondary" onClick={() => { setUploadModalOpen(false); setPendingFile(null) }}>Cancel</Button><Button variant="primary" onClick={handleUpload} loading={uploading}>Upload</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {pendingFile && (
            <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', fontSize: '13px', color: theme.textSecondary }}>
              {fileIcon(pendingFile.type)} <strong>{pendingFile.name}</strong> — {formatBytes(pendingFile.size)}
            </div>
          )}
          <div>
            <SearchableSelect
              label="Category"
              value={uploadCategory}
              onChange={(v) => setUploadCategory(v)}
              options={CATEGORY_OPTIONS}
            />
          </div>
          <Input label="Label (optional)" value={uploadLabel} onChange={(e) => setUploadLabel(e.target.value)} placeholder="e.g. Employment contract 2025" />
        </div>
      </Modal>

      {/* Remove confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove document" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={handleDetach} loading={detaching}>Remove</Button></>}>
        <p style={{ margin: 0, color: theme.textPrimary, fontSize: '13px' }}>
          Remove <strong>{deleteTarget?.label || deleteTarget?.file.originalFilename}</strong> from this employee's record? The file will be detached but not permanently deleted.
        </p>
      </Modal>
    </div>
  )
}
