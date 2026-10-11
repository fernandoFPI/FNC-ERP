import i18n from '../../../i18n'
import { Trans, useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import {
  ENTITY_ATTACHMENTS_QUERY,
  ATTACH_FILE,
  DETACH_FILE,
  FILE_DOWNLOAD_URL_QUERY,
} from '../../../graphql/hr'
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
import type { AttachFileMutation, AttachFileMutationVariables, DetachFileMutation, DetachFileMutationVariables, EntityAttachmentsQuery, EntityAttachmentsQueryVariables, FileDownloadUrlQuery, FileDownloadUrlQueryVariables, RequestUploadUrlMutation, RequestUploadUrlMutationVariables } from '../../../graphql/generated'

type Attachment = EntityAttachmentsQuery['entityAttachments'][number]

const CATEGORY_OPTIONS = [
  { value: 'contract', get label() { return i18n.t('hr.empDocs.contract', { defaultValue: "Contract" }) } },
  { value: 'identity', get label() { return i18n.t('hr.empDocs.identityDocument', { defaultValue: "Identity document" }) } },
  { value: 'attachment', get label() { return i18n.t('hr.empDocs.attachment', { defaultValue: "Attachment" }) } },
  { value: 'report', get label() { return i18n.t('hr.empDocs.report', { defaultValue: "Report" }) } },
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
  const { t } = useTranslation()
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

  const { data, loading, refetch } = useQuery<EntityAttachmentsQuery, EntityAttachmentsQueryVariables>(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType: 'employee', entityId: employeeId },
    fetchPolicy: 'cache-and-network',
  })

  const [requestUploadUrl] = useMutation<RequestUploadUrlMutation, RequestUploadUrlMutationVariables>(REQUEST_UPLOAD_URL)
  const [attachFile] = useMutation<AttachFileMutation, AttachFileMutationVariables>(ATTACH_FILE)
  const [detachFile, { loading: detaching }] = useMutation<DetachFileMutation, DetachFileMutationVariables>(DETACH_FILE)
  const [getDownloadUrl] = useLazyQuery<FileDownloadUrlQuery, FileDownloadUrlQueryVariables>(FILE_DOWNLOAD_URL_QUERY)

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
      if (!urlData) throw new Error(t('hr.empDocs.failedToRequestUploadUrl'))
      const { fileId } = urlData.requestUploadUrl

      // Upload through gateway proxy — avoids browser-to-B2 CORS issues and works in dev mode
      const apiBase = import.meta.env.VITE_API_URL
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
        throw new Error(errJson.error?.message ?? t('hr.empDocs.uploadFailedStatus', { status: proxyRes.statusText }))
      }

      await attachFile({
        variables: {
          fileId,
          entityType: 'employee',
          entityId: employeeId,
          label: uploadLabel || undefined,
        },
      })

      addToast({ type: 'success', message: t('hr.empDocs.documentUploaded') })
      setUploadModalOpen(false)
      setPendingFile(null)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(fileId: string, filename: string) {
    try {
      const { data: dlData } = await getDownloadUrl({ variables: { fileId } })
      const url = dlData?.fileDownloadUrl.downloadUrl
      if (!url) throw new Error(t('hr.empDocs.noDownloadUrl'))
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
      await detachFile({
        variables: { attachmentId: deleteTarget.id, entityType: 'employee', entityId: employeeId },
      })
      addToast({ type: 'success', message: t('hr.empDocs.documentRemoved') })
      setDeleteTarget(null)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <input
        ref={fileInputRef}
        type="file"
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
          <span style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>{t('hr.empDocs.documents', { length: attachments.length })}</span>
          <Button variant="primary" size="sm" onClick={openFilePicker}>
            {t('hr.empDocs.uploadDocument')}
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
            {t('hr.empDocs.loading')}
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
            {t('hr.empDocs.noDocumentsUploadedYet')}
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
                <span style={{ fontSize: '22px', flexShrink: 0 }}>
                  {fileIcon(att.file.mimeType)}
                </span>
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
                    {att.label ?? att.file.originalFilename}
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
                    <span>·</span>
                    <Badge variant="neutral" size="sm">
                      {att.file.category}
                    </Badge>
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
                    onClick={() => void handleDownload(att.file.id, att.file.originalFilename)}
                  >
                    {t('hr.empDocs.download')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ color: theme.danger }}
                    onClick={() => {
                      setDeleteTarget(att)
                    }}
                  >
                    {t('hr.empDocs.remove')}
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
        title={t('hr.empDocs.uploadDocument')}
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
              {t('hr.empDocs.cancel')}
            </Button>
            <Button variant="primary" onClick={(...args: Parameters<typeof handleUpload>) => void handleUpload(...args)} loading={uploading}>
              {t('hr.empDocs.upload')}
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
          <div>
            <SearchableSelect
              label={t('hr.empDocs.category')}
              value={uploadCategory}
              onChange={(v) => {
                setUploadCategory(v)
              }}
              options={CATEGORY_OPTIONS}
            />
          </div>
          <Input
            label={t('hr.empDocs.labelOptional')}
            value={uploadLabel}
            onChange={(e) => {
              setUploadLabel(e.target.value)
            }}
            placeholder={t('hr.empDocs.eGEmploymentContract2025')}
          />
        </div>
      </Modal>

      {/* Remove confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null)
        }}
        title={t('hr.empDocs.removeDocument')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null)
              }}
            >
              {t('hr.empDocs.cancel')}
            </Button>
            <Button variant="danger" onClick={(...args: Parameters<typeof handleDetach>) => void handleDetach(...args)} loading={detaching}>
              {t('hr.empDocs.remove')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: theme.textPrimary, fontSize: '13px' }}><Trans i18nKey="hr.empDocs.removeFromThisEmployeeSRecord" values={{ value: deleteTarget?.label ?? deleteTarget?.file.originalFilename }} components={[<strong />]} /></p>
      </Modal>
    </div>
  )
}
