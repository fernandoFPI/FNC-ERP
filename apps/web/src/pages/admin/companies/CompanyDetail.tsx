import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  COMPANY_QUERY,
  COMPANY_USERS_QUERY,
  UPDATE_COMPANY,
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
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import type { AssignRoleMutation, AssignRoleMutationVariables, CompanyBranchesQuery, CompanyBranchesQueryVariables, CompanyQuery, CompanyQueryVariables, CompanyUsersQuery, CompanyUsersQueryVariables, CreateCompanyBranchMutation, CreateCompanyBranchMutationVariables, DeleteCompanyBranchMutation, DeleteCompanyBranchMutationVariables, UpdateCompanyBranchMutation, UpdateCompanyBranchMutationVariables, UpdateCompanyMutation, UpdateCompanyMutationVariables } from '../../../graphql/generated'

type Tab = 'overview' | 'branches' | 'users' | 'configuration' | 'interco'

interface CompanyUser {
  id: string
  email: string
  isActive: boolean
  lastLoginAt?: string | null
  roles: { id: string; role: string; module: string | null; isActive: boolean }[]
}

interface Branch {
  id: string
  companyId: string
  name: string
  address?: string | null
  city?: string | null
  countryCode: string
  phone?: string | null
  isActive: boolean
  createdAt: string
  defaultProcurementUserId?: string | null
  defaultProcurementUserEmail?: string | null
}

const EMPTY_BRANCH = {
  name: '',
  address: '',
  city: '',
  countryCode: 'IQ',
  phone: '',
  isActive: true,
  defaultProcurementUserId: '',
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

// These images are stored as data: URIs, so downloading is just a client-side
// anchor click — the file's own MIME type (not the field, since e.g. the
// stamp keeps whatever format was originally uploaded) decides the extension.
function downloadDataUri(dataUri: string, filenameBase: string) {
  const mime = /^data:([^;]+);base64,/.exec(dataUri)?.[1] ?? 'image/png'
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
  const a = document.createElement('a')
  a.href = dataUri
  a.download = `${filenameBase}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function downloadButtonStyle(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    marginInlineStart: '8px',
    background: 'none',
    border: 'none',
    color: theme.textSecondary,
    fontSize: '12px',
    cursor: 'pointer',
    padding: '4px',
  }
}

export default function CompanyDetail() {
  const { t } = useTranslation()
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

  const { data, loading, refetch } = useQuery<CompanyQuery, CompanyQueryVariables>(COMPANY_QUERY, {
    variables: { id: id ?? '' },
    fetchPolicy: 'cache-and-network',
  })
  const { data: usersData } = useQuery<CompanyUsersQuery, CompanyUsersQueryVariables>(COMPANY_USERS_QUERY, {
    variables: { companyId: id ?? '' },
    fetchPolicy: 'cache-and-network',
  })
  const { data: branchesData, refetch: refetchBranches } = useQuery<CompanyBranchesQuery, CompanyBranchesQueryVariables>(COMPANY_BRANCHES_QUERY, {
    variables: { companyId: id ?? '' },
    fetchPolicy: 'cache-and-network',
    skip: !id,
  })

  const [assignRole, { loading: assigning }] = useMutation<AssignRoleMutation, AssignRoleMutationVariables>(ASSIGN_ROLE, {
    onCompleted: () => {
      setShowAssignRoleModal(false)
      setRoleForm({ userId: '', role: '', module: '' })
    },
  })
  const [updateCompanyMutation] = useMutation<UpdateCompanyMutation, UpdateCompanyMutationVariables>(UPDATE_COMPANY)
  const [createBranch, { loading: creatingBranch }] = useMutation<CreateCompanyBranchMutation, CreateCompanyBranchMutationVariables>(CREATE_COMPANY_BRANCH)
  const [updateBranch, { loading: updatingBranch }] = useMutation<UpdateCompanyBranchMutation, UpdateCompanyBranchMutationVariables>(UPDATE_COMPANY_BRANCH)
  const [deleteBranch] = useMutation<DeleteCompanyBranchMutation, DeleteCompanyBranchMutationVariables>(DELETE_COMPANY_BRANCH)

  const company = data?.company
  const users: CompanyUser[] = usersData?.companyUsers ?? []
  const branches: Branch[] = branchesData?.companyBranches ?? []

  if (loading) return <div style={{ padding: '48px', color: theme.textMuted }}>{t('admin.companyDetail.loading')}</div>
  if (!company)
    return <div style={{ padding: '48px', color: theme.textMuted }}>{t('admin.companyDetail.companyNotFound')}</div>

  const userColumns: Column<CompanyUser>[] = [
    {
      key: 'email',
      header: t('admin.companyDetail.email'),
      mobilePrimary: true,
      render: (u) => <span style={{ color: theme.textPrimary }}>{u.email}</span>,
    },
    {
      key: 'lastLoginAt',
      header: t('admin.companyDetail.lastLogin'),
      mobileSecondary: true,
      render: (u) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {u.lastLoginAt?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: t('admin.companyDetail.status'),
      mobilePriority: 1,
      render: (u) => (
        <Badge variant={u.isActive ? 'success' : 'neutral'}>
          {u.isActive ? t('admin.companyDetail.active') : t('admin.companyDetail.inactive')}
        </Badge>
      ),
    },
    {
      key: 'roles',
      header: t('admin.companyDetail.roles'),
      mobilePriority: 2,
      render: (u) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {u.roles.slice(0, 3).map((r) => (
            <Badge key={r.id} variant={r.isActive ? 'info' : 'neutral'}>
              {r.role}
            </Badge>
          ))}
          {u.roles.length > 3 && <Badge variant="neutral">+{u.roles.length - 3}</Badge>}
        </div>
      ),
    },
  ]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('admin.companyDetail.overview') },
    { key: 'branches', label: `Branches (${branches.length})` },
    { key: 'users', label: `Users (${users.length})` },
    { key: 'configuration', label: t('admin.companyDetail.configuration') },
    { key: 'interco', label: t('admin.companyDetail.interCompany') },
  ]

  function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', message: t('admin.companyDetail.pleaseSelectAnImageFile') })
      return
    }
    if (file.size > 500 * 1024) {
      addToast({ type: 'error', message: t('admin.companyDetail.stampImageMustBeUnder500') })
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      void updateCompanyMutation({ variables: { id: id ?? '', input: { stamp_image: base64 } } })
        .then(() => {
          addToast({ type: 'success', message: t('admin.companyDetail.stampUpdated') })
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
    void updateCompanyMutation({ variables: { id: id ?? '', input: { letterhead_image: base64 } } })
      .then(() => {
        addToast({ type: 'success', message: t('admin.companyDetail.letterheadUpdated') })
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
      addToast({ type: 'error', message: t('admin.companyDetail.pleaseSelectAPdfPngOr') })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast({ type: 'error', message: t('admin.companyDetail.fileMustBeUnder10Mb') })
      return
    }
    if (isPdf) {
      try {
        addToast({ type: 'info', message: t('admin.companyDetail.convertingPdfToImage') })
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
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get 2D canvas context')
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
      void updateCompanyMutation({ variables: { id: id ?? '', input: { pv_template_image: b64 } } })
        .then(() => {
          addToast({ type: 'success', message: t('admin.companyDetail.paymentVoucherTemplateUpdated') })
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
      void updateCompanyMutation({ variables: { id: id ?? '', input: { journal_template_image: b64 } } })
        .then(() => {
          addToast({ type: 'success', message: t('admin.companyDetail.generalJournalTemplateUpdated') })
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
      addToast({ type: 'error', message: t('admin.companyDetail.pleaseSelectAPdfPngOr') })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast({ type: 'error', message: t('admin.companyDetail.fileMustBeUnder10Mb') })
      return
    }

    if (isPdf) {
      try {
        addToast({ type: 'info', message: t('admin.companyDetail.convertingPdfToImage') })
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
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get 2D canvas context')
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
      defaultProcurementUserId: b.defaultProcurementUserId ?? '',
    })
    setBranchModal({ open: true, editing: b })
  }

  async function saveBranch() {
    try {
      const input = {
        ...branchForm,
        defaultProcurementUserId: branchForm.defaultProcurementUserId || null,
      }
      if (branchModal.editing) {
        await updateBranch({ variables: { id: branchModal.editing.id, input } })
        addToast({ type: 'success', message: t('admin.companyDetail.branchUpdated') })
      } else {
        await createBranch({ variables: { companyId: id ?? '', input } })
        addToast({ type: 'success', message: t('admin.companyDetail.branchCreated') })
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
      addToast({ type: 'success', message: t('admin.companyDetail.branchDeleted') })
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
              {company.isActive ? t('admin.companyDetail.active') : t('admin.companyDetail.inactive')}
            </Badge>
            {!company.setupCompleted && <Badge variant="warning">{t('admin.companyDetail.setupIncomplete')}</Badge>}
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
              {t('admin.companyDetail.identity')}
            </div>
            {[
              [t('admin.companyDetail.fLegalName'), company.legalName],
              [t('admin.companyDetail.fCountry'), company.countryCode],
              [t('admin.companyDetail.fCity'), company.city],
              [t('admin.companyDetail.fCurrency'), company.currencyCode],
              [t('admin.companyDetail.fVat'), company.vatNumber],
              [t('admin.companyDetail.fReg'), company.registrationNumber],
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
              {t('admin.companyDetail.companyStamp')}
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
                  src={company.stampImage}
                  alt={t('admin.companyDetail.companyStamp2')}
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
                {t('admin.companyDetail.noStampUploadedYet')}
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
              {company.stampImage ? t('admin.companyDetail.changeStamp') : t('admin.companyDetail.uploadStamp')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                style={{ display: 'none' }}
                onChange={handleStampUpload}
              />
            </label>
            {company.stampImage && (
              <button
                style={downloadButtonStyle(theme)}
                onClick={() => {
                  downloadDataUri(company.stampImage as string, `${company.name}-stamp`)
                }}
              >
                {t('admin.companyDetail.download')}
              </button>
            )}
            {company.stampImage && (
              <button
                style={{
                  marginInlineStart: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id: id ?? '', input: { stamp_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: t('admin.companyDetail.stampRemoved') })
                    void refetch()
                  })
                }
              >
                {t('admin.companyDetail.remove')}
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              {t('admin.companyDetail.pngJpgMax500KbAppears')}
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
              {t('admin.companyDetail.invoiceLetterhead')}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              {t('admin.companyDetail.whenSetThisImageIsUsed')}
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
                  src={company.letterheadImage}
                  alt={t('admin.companyDetail.letterheadPreview')}
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
                {t('admin.companyDetail.noLetterheadUploadedYet')}
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
              {company.letterheadImage ? t('admin.companyDetail.changeLetterhead') : t('admin.companyDetail.uploadLetterhead')}
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
                style={downloadButtonStyle(theme)}
                onClick={() => {
                  downloadDataUri(company.letterheadImage as string, `${company.name}-letterhead`)
                }}
              >
                {t('admin.companyDetail.download')}
              </button>
            )}
            {company.letterheadImage && (
              <button
                style={{
                  marginInlineStart: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id: id ?? '', input: { letterhead_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: t('admin.companyDetail.letterheadRemoved') })
                    void refetch()
                  })
                }
              >
                {t('admin.companyDetail.remove')}
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              {t('admin.companyDetail.pdfPngOrJpgMax10')}
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
              {t('admin.companyDetail.paymentVoucherTemplate')}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              {t('admin.companyDetail.theBlankFncPaymentVoucherForm')}
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
                  src={company.pvTemplateImage}
                  alt={t('admin.companyDetail.pvTemplatePreview')}
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
                {t('admin.companyDetail.noTemplateUploadedYet')}
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
              {company.pvTemplateImage ? t('admin.companyDetail.changeTemplate') : t('admin.companyDetail.uploadTemplate')}
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
                style={downloadButtonStyle(theme)}
                onClick={() => {
                  downloadDataUri(company.pvTemplateImage as string, `${company.name}-pv-template`)
                }}
              >
                {t('admin.companyDetail.download')}
              </button>
            )}
            {company.pvTemplateImage && (
              <button
                style={{
                  marginInlineStart: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id: id ?? '', input: { pv_template_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: t('admin.companyDetail.pvTemplateRemoved') })
                    void refetch()
                  })
                }
              >
                {t('admin.companyDetail.remove')}
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              {t('admin.companyDetail.pdfPngOrJpgMax102')}
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
              {t('admin.companyDetail.generalJournalTemplate')}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              {t('admin.companyDetail.theBlankFncGeneralJournalForm')}
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
                  src={company.journalTemplateImage}
                  alt={t('admin.companyDetail.journalTemplatePreview')}
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
                {t('admin.companyDetail.noTemplateUploadedYet')}
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
              {company.journalTemplateImage ? t('admin.companyDetail.changeTemplate') : t('admin.companyDetail.uploadTemplate')}
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
                style={downloadButtonStyle(theme)}
                onClick={() => {
                  downloadDataUri(
                    company.journalTemplateImage as string,
                    `${company.name}-journal-template`,
                  )
                }}
              >
                {t('admin.companyDetail.download')}
              </button>
            )}
            {company.journalTemplateImage && (
              <button
                style={{
                  marginInlineStart: '8px',
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() =>
                  void updateCompanyMutation({
                    variables: { id: id ?? '', input: { journal_template_image: null } },
                  }).then(() => {
                    addToast({ type: 'success', message: t('admin.companyDetail.journalTemplateRemoved') })
                    void refetch()
                  })
                }
              >
                {t('admin.companyDetail.remove')}
              </button>
            )}
            <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
              {t('admin.companyDetail.pdfPngOrJpgMax103')}
            </div>
          </Card>
        </div>
      )}

      {/* Branches */}
      {activeTab === 'branches' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <Button variant="primary" size="sm" onClick={openCreate}>
              {t('admin.companyDetail.addBranch')}
            </Button>
          </div>
          {branches.length === 0 ? (
            <Card style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>{t('admin.companyDetail.noBranchesAddedYet')}</div>
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
                      {b.isActive ? t('admin.companyDetail.active') : t('admin.companyDetail.inactive')}
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
                      {t('admin.companyDetail.edit')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleDeleteBranch(b.id)}>
                      {t('admin.companyDetail.delete')}
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
              {t('admin.companyDetail.assignRole')}
            </Button>
          </div>
          <Card>
            <Table
              columns={userColumns}
              data={users}
              rowKey="id"
              emptyMessage={t('admin.companyDetail.noUsersInThisCompany')}
              onRowClick={(u) => {
                navigate(`/admin/users/${u.id}`)
              }}
            />
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
            {t('admin.companyDetail.transferPricingMethod')}
          </div>
          <div style={{ fontSize: '15px', color: theme.textPrimary }}>
            {company.intercoTransferPricingMethod?.replace(/_/g, ' ') ?? t('admin.companyDetail.notConfigured')}
          </div>
        </Card>
      )}

      {/* Branch modal */}
      {branchModal.open && (
        <Modal
          open={branchModal.open}
          title={branchModal.editing ? t('admin.companyDetail.editBranch') : t('admin.companyDetail.addBranch')}
          onClose={() => {
            setBranchModal({ open: false, editing: null })
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '380px' }}>
            {[
              { label: t('admin.companyDetail.branchName'), key: 'name', placeholder: t('admin.companyDetail.eGBaghdadOffice') },
              { label: t('admin.companyDetail.address'), key: 'address', placeholder: t('admin.companyDetail.streetAddress') },
              { label: t('admin.companyDetail.city'), key: 'city', placeholder: t('admin.companyDetail.city') },
              { label: t('admin.companyDetail.countryCode'), key: 'countryCode', placeholder: 'IQ' },
              { label: t('admin.companyDetail.phone'), key: 'phone', placeholder: '+964 ...' },
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
              {t('admin.companyDetail.active')}
            </label>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                {t('admin.companyDetail.procurementBuyer')}
              </label>
              <div
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                }}
              >
                {t('admin.companyDetail.buyersNote')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    navigate('/procurement/positions')
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: theme.accent,
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'underline',
                  }}
                >
                  {t('admin.companyDetail.openPoPositions')}
                </button>
              </div>
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setBranchModal({ open: false, editing: null })
                }}
              >
                {t('admin.companyDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={creatingBranch || updatingBranch}
                disabled={!branchForm.name}
                onClick={() => void saveBranch()}
              >
                {branchModal.editing ? t('admin.companyDetail.saveChanges') : t('admin.companyDetail.addBranch')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign role modal */}
      {showAssignRoleModal && (
        <Modal
          open={showAssignRoleModal}
          title={t('admin.companyDetail.assignRole2')}
          onClose={() => {
            setShowAssignRoleModal(false)
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '360px' }}>
            {[
              { label: t('admin.companyDetail.userId'), key: 'userId', placeholder: t('admin.companyDetail.userUuid') },
              { label: t('admin.companyDetail.role'), key: 'role', placeholder: t('admin.companyDetail.eGAdminViewer') },
              { label: t('admin.companyDetail.module'), key: 'module', placeholder: t('admin.companyDetail.eGProcurementFinance') },
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
                {t('admin.companyDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={assigning}
                disabled={!roleForm.userId || !roleForm.role || !roleForm.module}
                onClick={() =>
                  void assignRole({
                    variables: {
                      input: {
                        user_id: roleForm.userId,
                        company_id: id ?? '',
                        role: roleForm.role,
                        module: roleForm.module,
                      },
                    },
                  })
                }
              >
                {t('admin.companyDetail.assign')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
