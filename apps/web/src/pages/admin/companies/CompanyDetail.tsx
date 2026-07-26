import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  COMPANY_QUERY,
  COMPANY_USERS_QUERY,
  UPDATE_COMPANY,
  UPDATE_COMPANY_CONFIGURATION,
  ASSIGN_ROLE,
  COMPANY_BRANCHES_QUERY,
  CREATE_COMPANY_BRANCH,
  UPDATE_COMPANY_BRANCH,
  DELETE_COMPANY_BRANCH,
} from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { SystemConfigForm } from '../../settings/company/SystemConfigForm'
import { useToastStore } from '../../../store/toastStore'

type Tab = 'overview' | 'branches' | 'users' | 'configuration' | 'interco'

interface CompanyUser {
  id: string
  email: string
  isActive: boolean
  lastLoginAt?: string
  roles: { id: string; role: string; module: string; isActive: boolean }[]
}

interface Branch {
  id: string
  companyId: string
  name: string
  address?: string
  city?: string
  countryCode: string
  phone?: string
  isActive: boolean
  createdAt: string
}

const EMPTY_BRANCH = {
  name: '',
  address: '',
  city: '',
  countryCode: 'IQ',
  phone: '',
  isActive: true,
}

function inputStyle(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
    fontSize: '13px',
  }
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false)
  const [roleForm, setRoleForm] = useState({ userId: '', role: '', module: '' })

  // Branch state
  const [branchModal, setBranchModal] = useState<{ open: boolean; editing: Branch | null }>({
    open: false,
    editing: null,
  })
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH)

  const { data, loading, refetch } = useQuery(COMPANY_QUERY, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  })
  const { data: usersData } = useQuery(COMPANY_USERS_QUERY, {
    variables: { companyId: id },
    fetchPolicy: 'cache-and-network',
  })
  const { data: branchesData, refetch: refetchBranches } = useQuery(COMPANY_BRANCHES_QUERY, {
    variables: { companyId: id },
    fetchPolicy: 'cache-and-network',
    skip: !id,
  })

  const [assignRole, { loading: assigning }] = useMutation(ASSIGN_ROLE, {
    onCompleted: () => {
      setShowAssignRoleModal(false)
      setRoleForm({ userId: '', role: '', module: '' })
    },
  })
  const [updateCompanyMutation] = useMutation(UPDATE_COMPANY)
  const [createBranch, { loading: creatingBranch }] = useMutation(CREATE_COMPANY_BRANCH)
  const [updateBranch, { loading: updatingBranch }] = useMutation(UPDATE_COMPANY_BRANCH)
  const [deleteBranch] = useMutation(DELETE_COMPANY_BRANCH)

  const company = data?.company
  const users: CompanyUser[] = usersData?.companyUsers ?? []
  const branches: Branch[] = branchesData?.companyBranches ?? []

  if (loading) return <div style={{ padding: '48px', color: theme.textMuted }}>Loading…</div>
  if (!company)
    return <div style={{ padding: '48px', color: theme.textMuted }}>Company not found.</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'branches', label: `Branches (${branches.length})` },
    { key: 'users', label: `Users (${users.length})` },
    { key: 'configuration', label: 'Configuration' },
    { key: 'interco', label: 'Inter-company' },
  ]

  function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', message: 'Please select an image file' })
      return
    }
    if (file.size > 500 * 1024) {
      addToast({ type: 'error', message: 'Stamp image must be under 500 KB' })
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      void updateCompanyMutation({ variables: { id, input: { stamp_image: base64 } } })
        .then(() => {
          addToast({ type: 'success', message: 'Stamp updated' })
          void refetch()
        })
        .catch((err: unknown) => {
          addToast({ type: 'error', message: (err as Error).message })
        })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function saveLetterheadBase64(base64: string) {
    void updateCompanyMutation({ variables: { id, input: { letterhead_image: base64 } } })
      .then(() => {
        addToast({ type: 'success', message: 'Letterhead updated' })
        void refetch()
      })
      .catch((err: unknown) => {
        addToast({ type: 'error', message: (err as Error).message })
      })
  }

  async function handlePdfOrImageUpload(file: File, onBase64: (b64: string) => void) {
    const isPdf = file.type === 'application/pdf'
    const isImage = file.type === 'image/png' || file.type === 'image/jpeg'
    if (!isPdf && !isImage) {
      addToast({ type: 'error', message: 'Please select a PDF, PNG, or JPG file' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast({ type: 'error', message: 'File must be under 10 MB' })
      return
    }
    if (isPdf) {
      try {
        addToast({ type: 'info', message: 'Converting PDF to image…' })
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        onBase64(canvas.toDataURL('image/png'))
      } catch (err: unknown) {
        addToast({ type: 'error', message: 'Failed to read PDF: ' + (err as Error).message })
      }
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        onBase64(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  async function handlePvTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await handlePdfOrImageUpload(file, (b64) => {
      void updateCompanyMutation({ variables: { id, input: { pv_template_image: b64 } } })
        .then(() => {
          addToast({ type: 'success', message: 'Payment Voucher template updated' })
          void refetch()
        })
        .catch((err: unknown) => {
          addToast({ type: 'error', message: (err as Error).message })
        })
    })
  }

  async function handleJournalTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await handlePdfOrImageUpload(file, (b64) => {
      void updateCompanyMutation({ variables: { id, input: { journal_template_image: b64 } } })
        .then(() => {
          addToast({ type: 'success', message: 'General Journal template updated' })
          void refetch()
        })
        .catch((err: unknown) => {
          addToast({ type: 'error', message: (err as Error).message })
        })
    })
  }

  async function handleLetterheadUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isPdf = file.type === 'application/pdf'
    const isImage = file.type === 'image/png' || file.type === 'image/jpeg'

    if (!isPdf && !isImage) {
      addToast({ type: 'error', message: 'Please select a PDF, PNG, or JPG file' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast({ type: 'error', message: 'File must be under 10 MB' })
      return
    }

    if (isPdf) {
      try {
        addToast({ type: 'info', message: 'Converting PDF to image…' })
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
        const page = await pdf.getPage(1)
        // Render at 2× scale for crisp output on A4
        const viewport = page.getViewport({ scale: 2.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        const base64 = canvas.toDataURL('image/png')
        saveLetterheadBase64(base64)
      } catch (err: unknown) {
        addToast({ type: 'error', message: 'Failed to read PDF: ' + (err as Error).message })
      }
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        saveLetterheadBase64(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  function openCreate() {
    setBranchForm(EMPTY_BRANCH)
    setBranchModal({ open: true, editing: null })
  }

  function openEdit(b: Branch) {
    setBranchForm({
      name: b.name,
      address: b.address ?? '',
      city: b.city ?? '',
      countryCode: b.countryCode,
      phone: b.phone ?? '',
      isActive: b.isActive,
    })
    setBranchModal({ open: true, editing: b })
  }

  async function saveBranch() {
    try {
      if (branchModal.editing) {
        await updateBranch({ variables: { id: branchModal.editing.id, input: branchForm } })
        addToast({ type: 'success', message: 'Branch updated' })
      } else {
        await createBranch({ variables: { companyId: id, input: branchForm } })
        addToast({ type: 'success', message: 'Branch created' })
      }
      setBranchModal({ open: false, editing: null })
      void refetchBranches()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleDeleteBranch(branchId: string) {
    try {
      await deleteBranch({ variables: { id: branchId } })
      addToast({ type: 'success', message: 'Branch deleted' })
      void refetchBranches()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={company.name}
        subtitle={company.legalName ?? company.countryCode ?? ''}
        backPath="/admin/companies"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={company.isActive ? 'success' : 'neutral'}>
              {company.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {!company.setupCompleted && <Badge variant="warning">Setup incomplete</Badge>}
          </div>
        }
      />

      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: `1px solid ${theme.border}`,
          margin: '20px 0 16px',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key)
            }}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              color: activeTab === t.key ? theme.accent : theme.textMuted,
              borderBottom:
                activeTab === t.key ? `2px solid ${theme.accent}` : '2px solid transparent',
              fontWeight: activeTab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Identity
            </div>
            {[
              ['Legal name', company.legalName],
              ['Country', company.countryCode],
              ['City', company.city],
              ['Currency', company.currencyCode],
              ['VAT number', company.vatNumber],
              ['Reg. number', company.registrationNumber],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: `1px solid ${theme.border}22`,
                  fontSize: '13px',
                }}
              >
                <span style={{ color: theme.textMuted }}>{k}</span>
                <span style={{ color: theme.textPrimary }}>{v ?? '—'}</span>
              </div>
            ))}
          </Card>
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Company Stamp
            </div>
            {company.stampImage ? (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  display: 'inline-block',
                }}
              >
                <img
                  src={company.stampImage as string}
                  alt="Company stamp"
                  style={{
                    maxHeight: '100px',
                    maxWidth: '220px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '12px', fontSize: '13px', color: theme.textMuted }}>
                No stamp uploaded yet.
              </div>
            )}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                fontSize: '13px',
                color: theme.textSecondary,
                background: theme.bgSurface,
              }}
            >
              {company.stampImage ? 'Change stamp' : 'Upload stamp'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                style={{ display: 'none' }}
                onChange={handleStampUpload}
              />
            </label>
            {company.stampImage && (
              <button
                style={{
                  marginLeft: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id, input: { stamp_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: 'Stamp removed' })
                    void refetch()
                  })
                }
              >
                Remove
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              PNG / JPG, max 500 KB. Appears on invoice PDFs.
            </div>
          </Card>
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Invoice Letterhead
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              When set, this image is used as the full-page background of invoice PDFs instead of
              the default company header. Upload a PNG/JPG version of your letterhead template.
            </div>
            {company.letterheadImage ? (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  display: 'inline-block',
                }}
              >
                <img
                  src={company.letterheadImage as string}
                  alt="Letterhead preview"
                  style={{
                    maxHeight: '140px',
                    maxWidth: '280px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '12px', fontSize: '13px', color: theme.textMuted }}>
                No letterhead uploaded yet.
              </div>
            )}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                fontSize: '13px',
                color: theme.textSecondary,
                background: theme.bgSurface,
              }}
            >
              {company.letterheadImage ? 'Change letterhead' : 'Upload letterhead'}
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void handleLetterheadUpload(e)
                }}
              />
            </label>
            {company.letterheadImage && (
              <button
                style={{
                  marginLeft: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id, input: { letterhead_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: 'Letterhead removed' })
                    void refetch()
                  })
                }
              >
                Remove
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              PDF, PNG, or JPG — max 10 MB. PDF page 1 is auto-converted to an image. Must be A4
              proportions. Leave space in the middle for invoice content.
            </div>
          </Card>

          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Payment Voucher Template
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              The blank FNC payment voucher form (PDF or image). Used as print background so data
              values are overlaid on the pre-printed form fields.
            </div>
            {company.pvTemplateImage ? (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  display: 'inline-block',
                }}
              >
                <img
                  src={company.pvTemplateImage as string}
                  alt="PV template preview"
                  style={{
                    maxHeight: '140px',
                    maxWidth: '280px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '12px', fontSize: '13px', color: theme.textMuted }}>
                No template uploaded yet.
              </div>
            )}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                fontSize: '13px',
                color: theme.textSecondary,
                background: theme.bgSurface,
              }}
            >
              {company.pvTemplateImage ? 'Change template' : 'Upload template'}
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void handlePvTemplateUpload(e)
                }}
              />
            </label>
            {company.pvTemplateImage && (
              <button
                style={{
                  marginLeft: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id, input: { pv_template_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: 'PV template removed' })
                    void refetch()
                  })
                }
              >
                Remove
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              PDF, PNG, or JPG — max 10 MB. Must be the A4 portrait FNC payment voucher blank form.
            </div>
          </Card>

          <Card style={{ padding: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              General Journal Template
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              The blank FNC general journal form (PDF or image). Used as print background so data
              values are overlaid on the pre-printed form fields.
            </div>
            {company.journalTemplateImage ? (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  display: 'inline-block',
                }}
              >
                <img
                  src={company.journalTemplateImage as string}
                  alt="Journal template preview"
                  style={{
                    maxHeight: '140px',
                    maxWidth: '280px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '12px', fontSize: '13px', color: theme.textMuted }}>
                No template uploaded yet.
              </div>
            )}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                fontSize: '13px',
                color: theme.textSecondary,
                background: theme.bgSurface,
              }}
            >
              {company.journalTemplateImage ? 'Change template' : 'Upload template'}
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void handleJournalTemplateUpload(e)
                }}
              />
            </label>
            {company.journalTemplateImage && (
              <button
                style={{
                  marginLeft: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id, input: { journal_template_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: 'Journal template removed' })
                    void refetch()
                  })
                }
              >
                Remove
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              PDF, PNG, or JPG — max 10 MB. Must be the A4 portrait FNC general journal blank form.
            </div>
          </Card>
        </div>
      )}

      {/* Branches */}
      {activeTab === 'branches' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <Button variant="primary" size="sm" onClick={openCreate}>
              Add Branch
            </Button>
          </div>
          {branches.length === 0 ? (
            <Card style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>No branches added yet.</div>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '14px',
              }}
            >
              {branches.map((b) => (
                <Card key={b.id} style={{ padding: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                        {b.name}
                      </div>
                      {b.city && (
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                          {b.city}, {b.countryCode}
                        </div>
                      )}
                    </div>
                    <Badge variant={b.isActive ? 'success' : 'neutral'}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {b.address && (
                    <div
                      style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}
                    >
                      {b.address}
                    </div>
                  )}
                  {b.phone && (
                    <div
                      style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px' }}
                    >
                      {b.phone}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      paddingTop: '10px',
                      borderTop: `1px solid ${theme.border}`,
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        openEdit(b)
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleDeleteBranch(b.id)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users */}
      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAssignRoleModal(true)
              }}
            >
              Assign role
            </Button>
          </div>
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Email', 'Status', 'Roles', 'Last login'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: '32px',
                        textAlign: 'center',
                        color: theme.textMuted,
                        fontSize: '13px',
                      }}
                    >
                      No users in this company.
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: `1px solid ${theme.border}22`, cursor: 'pointer' }}
                    onClick={() => {
                      navigate(`/admin/users/${u.id}`)
                    }}
                  >
                    <td style={{ padding: '12px', fontSize: '13px', color: theme.textPrimary }}>
                      {u.email}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Badge variant={u.isActive ? 'success' : 'neutral'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {u.roles.slice(0, 3).map((r) => (
                          <Badge key={r.id} variant={r.isActive ? 'info' : 'neutral'}>
                            {r.role}
                          </Badge>
                        ))}
                        {u.roles.length > 3 && (
                          <Badge variant="neutral">+{u.roles.length - 3}</Badge>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px', color: theme.textMuted }}>
                      {u.lastLoginAt?.slice(0, 10) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeTab === 'configuration' && company.configuration && (
        <SystemConfigForm
          companyId={company.id}
          initialValues={company.configuration}
          onSaved={() => void refetch()}
        />
      )}

      {activeTab === 'interco' && (
        <Card style={{ padding: '24px' }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
            Transfer pricing method
          </div>
          <div style={{ fontSize: '15px', color: theme.textPrimary }}>
            {company.intercoTransferPricingMethod?.replace(/_/g, ' ') ?? 'Not configured'}
          </div>
        </Card>
      )}

      {/* Branch modal */}
      {branchModal.open && (
        <Modal
          open={branchModal.open}
          title={branchModal.editing ? 'Edit Branch' : 'Add Branch'}
          onClose={() => {
            setBranchModal({ open: false, editing: null })
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '380px' }}>
            {[
              { label: 'Branch name *', key: 'name', placeholder: 'e.g. Baghdad Office' },
              { label: 'Address', key: 'address', placeholder: 'Street address' },
              { label: 'City', key: 'city', placeholder: 'City' },
              { label: 'Country code', key: 'countryCode', placeholder: 'IQ' },
              { label: 'Phone', key: 'phone', placeholder: '+964 ...' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {label}
                </label>
                <input
                  value={branchForm[key as keyof typeof branchForm] as string}
                  onChange={(e) => {
                    setBranchForm({ ...branchForm, [key]: e.target.value })
                  }}
                  placeholder={placeholder}
                  style={inputStyle(theme)}
                />
              </div>
            ))}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: theme.textPrimary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={branchForm.isActive}
                onChange={(e) => {
                  setBranchForm({ ...branchForm, isActive: e.target.checked })
                }}
              />
              Active
            </label>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setBranchModal({ open: false, editing: null })
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={creatingBranch || updatingBranch}
                disabled={!branchForm.name}
                onClick={() => void saveBranch()}
              >
                {branchModal.editing ? 'Save changes' : 'Add Branch'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign role modal */}
      {showAssignRoleModal && (
        <Modal
          open={showAssignRoleModal}
          title="Assign Role"
          onClose={() => {
            setShowAssignRoleModal(false)
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '360px' }}>
            {[
              { label: 'User ID', key: 'userId', placeholder: 'User UUID' },
              { label: 'Role', key: 'role', placeholder: 'e.g. admin, viewer' },
              { label: 'Module', key: 'module', placeholder: 'e.g. procurement, finance' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {label}
                </label>
                <input
                  value={roleForm[key as keyof typeof roleForm]}
                  onChange={(e) => {
                    setRoleForm({ ...roleForm, [key]: e.target.value })
                  }}
                  placeholder={placeholder}
                  style={inputStyle(theme)}
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAssignRoleModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={assigning}
                disabled={!roleForm.userId || !roleForm.role || !roleForm.module}
                onClick={() =>
                  void assignRole({
                    variables: {
                      input: {
                        userId: roleForm.userId,
                        companyId: id,
                        role: roleForm.role,
                        module: roleForm.module,
                      },
                    },
                  })
                }
              >
                Assign
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
