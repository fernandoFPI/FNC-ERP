import React, { useRef, useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { api } from '../../lib/axios'
import { Button } from './Button'
import { Spinner } from './Spinner'

interface Attachment {
  id: string
  file_id: string
  label: string
  filename: string
  size_bytes: number
  mime_type: string
  uploaded_by_email: string
  created_at: string
}

interface FileAttachmentsProps {
  entityType: string
  entityId: string
  category?: 'contract' | 'identity' | 'attachment' | 'report'
  readonly?: boolean
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ mime }: { mime: string }) {
  const isPdf = mime === 'application/pdf'
  const isImage = mime.startsWith('image/')
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      {isPdf ? (
        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></>
      ) : isImage ? (
        <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>
      ) : (
        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
      )}
    </svg>
  )
}

export function FileAttachments({ entityType, entityId, category = 'attachment', readonly = false }: FileAttachmentsProps) {
  const { theme } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  React.useEffect(() => {
    if (!entityId) return
    setLoading(true)
    api.get<Attachment[]>(`/${entityType}/${entityId}/attachments`)
      .then((r) => setAttachments(r.data as unknown as Attachment[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  async function handleUpload(file: File) {
    const MAX = 52_428_800 // 50 MB
    if (file.size > MAX) { setError('File too large (max 50 MB)'); return }
    setError(null)
    setUploading(true)
    setUploadProgress(0)
    try {
      const { data: { uploadUrl, fileId } } = await api.post<{ uploadUrl: string; fileId: string }>(
        '/files/upload-url', { filename: file.name, mimeType: file.type, size: file.size, category }
      )
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      setUploadProgress(80)
      await api.post(`/files/${fileId}/confirm`)
      setUploadProgress(90)
      await api.post(`/${entityType}/${entityId}/attachments`, { fileId, label: file.name })
      const r = await api.get<Attachment[]>(`/${entityType}/${entityId}/attachments`)
      setAttachments(r.data as unknown as Attachment[])
      setUploadProgress(100)
    } catch (err) {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleDownload(fileId: string) {
    try {
      const { data: { downloadUrl } } = await api.get<{ downloadUrl: string }>(`/files/${fileId}/download-url`)
      window.open(downloadUrl, '_blank')
    } catch { setError('Download failed') }
  }

  async function handleDelete(attachmentId: string) {
    try {
      await api.delete(`/${entityType}/${entityId}/attachments/${attachmentId}`)
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch { setError('Delete failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && (
        <div style={{ padding: '8px 12px', background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, borderRadius: '8px', fontSize: '12px', color: theme.danger }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Spinner size="md" /></div>
      ) : attachments.length === 0 && readonly ? (
        <p style={{ color: theme.textMuted, fontSize: '13px' }}>No attachments</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {attachments.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px', background: theme.bgSurface,
              border: `1px solid ${theme.border}`, borderRadius: '8px',
            }}>
              <span style={{ color: theme.textMuted }}><FileIcon mime={a.mime_type} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</p>
                <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
                  {formatBytes(a.size_bytes)} · {a.uploaded_by_email} · {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleDownload(a.file_id)} icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              } />
              {!readonly && (
                <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                  </svg>
                } />
              )}
            </div>
          ))}
        </div>
      )}

      {!readonly && (
        <>
          <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
          <div
            style={{
              border: `2px dashed ${dragOver ? theme.accent : theme.border}`,
              borderRadius: '10px', padding: '20px',
              textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
              background: dragOver ? theme.accentBg : 'transparent',
              transition: 'all 0.15s',
            }}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
          >
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Spinner size="md" />
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>Uploading… {uploadProgress}%</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 4px' }}>Drop file here or <span style={{ color: theme.accent }}>browse</span></p>
                <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>Max 50 MB</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
