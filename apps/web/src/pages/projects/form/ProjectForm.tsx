import i18n, { tl } from '../../../i18n'
import { useTranslation } from 'react-i18next'
import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { PROJECT_QUERY, CREATE_RFQ, UPDATE_PROJECT } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { api } from '../../../lib/axios'
import type { CreateRfqMutation, CreateRfqMutationVariables, ProjectQuery, ProjectQueryVariables, UpdateProjectMutation, UpdateProjectMutationVariables } from '../../../graphql/generated'

interface Employee {
  id: string
  first_name: string
  last_name: string
  job_title?: string
}

const PROJECT_TYPES = [
  { value: 'construction', get label() { return i18n.t('proj.form.construction', { defaultValue: "Construction" }) } },
  { value: 'supply', get label() { return i18n.t('proj.form.supply', { defaultValue: "Supply" }) } },
  { value: 'direct_supply', get label() { return i18n.t('proj.form.directSupply', { defaultValue: "Direct Supply" }) } },
  { value: 'services', get label() { return i18n.t('proj.form.services', { defaultValue: "Services" }) } },
  { value: 'rental', get label() { return i18n.t('proj.form.rental', { defaultValue: "Rental" }) } },
  { value: 'fabrication', get label() { return i18n.t('proj.form.fabrication', { defaultValue: "Fabrication" }) } },
  { value: 'manpower_supply', get label() { return i18n.t('proj.form.manpowerSupply', { defaultValue: "Manpower Supply" }) } },
  { value: 'operation_maintenance', get label() { return i18n.t('proj.form.operationMaintenance', { defaultValue: "Operation & Maintenance" }) } },
  { value: 'epc', label: 'EPC' },
]
const CURRENCIES = ['IQD', 'USD', 'EUR', 'GBP']

const LIFECYCLE_STAGES = [
  'Client Enquiry',
  'Scope Review',
  'Bidding',
  'Client Approval',
  'Execution',
  'Closeout',
]

// Direct Supply skips the whole tender flow (no enquiry/scope review/
// bidding/client approval) — createRFQ creates it straight into execution,
// same as a normal project would land there only after approveRFQ. Just
// the two phases that are actually reachable.
const DIRECT_SUPPLY_STAGES = ['Execution', 'Closeout']

function stageFromStatus(status: string): number {
  if (status === 'completed') return 5
  if (status === 'approved') return 4
  if (status === 'submitted') return 3
  if (status === 'ongoing') return 1
  return 0
}

function directSupplyStageFromStatus(status: string): number {
  return status === 'completed' ? 1 : 0
}

interface FormState {
  name: string
  contractName: string
  projectLocation: string
  projectType: string
  clientName: string
  clientContact: string
  projectValue: string
  budgetAmount: string
  currencyCode: string
  startDate: string
  endDate: string
  description: string
  receivingDate: string
  submissionDate: string
  submissionTime: string
  siteVisitDate: string
  siteVisitTime: string
  questionDate: string
  questionTime: string
  rfqEstimatedCost: string
  managerId: string
}

const BLANK: FormState = {
  name: '',
  contractName: '',
  projectLocation: '',
  projectType: 'construction',
  clientName: '',
  clientContact: '',
  projectValue: '',
  budgetAmount: '',
  currencyCode: 'IQD',
  startDate: '',
  endDate: '',
  description: '',
  receivingDate: '',
  submissionDate: '',
  submissionTime: '',
  siteVisitDate: '',
  siteVisitTime: '',
  questionDate: '',
  questionTime: '',
  rfqEstimatedCost: '',
  managerId: '',
}

export default function ProjectForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { theme } = useTheme()
  const isEdit = !!id
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const addToast = useToastStore((s) => s.addToast)
  const { isSystemLevel } = usePermission()
  const [customTypeMode, setCustomTypeMode] = useState(false)
  const [customTypeText, setCustomTypeText] = useState('')
  const [customTypeOptions, setCustomTypeOptions] = useState<{ value: string; label: string }[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  const confirmCustomType = () => {
    const raw = customTypeText.trim()
    if (!raw) return
    const val = raw
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
    const label = raw.replace(/\b\w/g, (c) => c.toUpperCase())
    setCustomTypeOptions((prev) =>
      prev.some((o) => o.value === val) ? prev : [...prev, { value: val, label }],
    )
    setForm((f) => ({ ...f, projectType: val }))
    setCustomTypeMode(false)
  }

  useEffect(() => {
    api
      .get<Employee[]>('/hr/employees', { params: { limit: 200, status: 'active' } })
      .then((r) => {
        setEmployees(Array.isArray(r.data) ? r.data : [])
      })
      .catch(() => {
        /* ignore: employee picker just stays empty if this fails */
      })
  }, [])

  const { data } = useQuery<ProjectQuery, ProjectQueryVariables>(PROJECT_QUERY, {
    variables: { id: id ?? '' },
    skip: !isEdit,
    fetchPolicy: 'cache-and-network',
  })
  const [createRFQ, { loading: creating }] = useMutation<CreateRfqMutation, CreateRfqMutationVariables>(CREATE_RFQ)
  const [updateProject, { loading: updating }] = useMutation<UpdateProjectMutation, UpdateProjectMutationVariables>(UPDATE_PROJECT)
  const saving = creating || updating

  const project = data?.project
  const isDirectSupply = form.projectType === 'direct_supply'
  const lifecycleStages = isDirectSupply ? DIRECT_SUPPLY_STAGES : LIFECYCLE_STAGES
  const stageIdx = isEdit
    ? isDirectSupply
      ? directSupplyStageFromStatus(project?.status ?? 'approved')
      : stageFromStatus(project?.status ?? 'pending')
    : 0
  const projectCode = isEdit ? project?.code : null

  useEffect(() => {
    const p = data?.project
    if (!p) return
    setForm({
      name: p.name,
      contractName: p.contractName ?? '',
      projectLocation: p.projectLocation ?? '',
      projectType: p.projectType,
      clientName: p.clientName ?? '',
      clientContact: p.clientContact ?? '',
      projectValue: p.projectValue != null ? String(p.projectValue) : '',
      budgetAmount: p.budgetAmount != null ? String(p.budgetAmount) : '',
      currencyCode: p.budgetCurrency ?? 'IQD',
      startDate: p.plannedStartDate ?? '',
      endDate: p.plannedEndDate ?? '',
      description: p.description ?? '',
      receivingDate: p.receivingDate ?? '',
      submissionDate: p.submissionDate ?? '',
      submissionTime: p.submissionTime ? String(p.submissionTime).slice(0, 5) : '',
      siteVisitDate: p.siteVisitDate ?? '',
      siteVisitTime: p.siteVisitTime ? String(p.siteVisitTime).slice(0, 5) : '',
      questionDate: p.questionDate ?? '',
      questionTime: p.questionTime ? String(p.questionTime).slice(0, 5) : '',
      rfqEstimatedCost: p.rfqEstimatedCost != null ? String(p.rfqEstimatedCost) : '',
      managerId: p.managerId ?? '',
    })
  }, [data])

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }

  const validate = (): boolean => {
    const e: typeof errors = {}
    if (!form.name.trim()) e.name = t('proj.form.required')
    if (!form.projectType) e.projectType = t('proj.form.required')
    if (form.projectValue && isNaN(Number(form.projectValue))) e.projectValue = t('proj.form.mustBeNumber')
    if (form.budgetAmount && isNaN(Number(form.budgetAmount))) e.budgetAmount = t('proj.form.mustBeNumber')
    if (!form.receivingDate) e.receivingDate = t('proj.form.required')
    if (!form.submissionDate) e.submissionDate = t('proj.form.required')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    const input = {
      name: form.name,
      contractName: form.contractName || null,
      projectLocation: form.projectLocation || null,
      projectType: form.projectType,
      clientName: form.clientName || null,
      clientContact: form.clientContact || null,
      projectValue: form.projectValue ? Number(form.projectValue) : null,
      budgetAmount: form.budgetAmount ? Number(form.budgetAmount) : null,
      budgetCurrency: form.currencyCode,
      plannedStartDate: form.startDate || null,
      plannedEndDate: form.endDate || null,
      description: form.description || null,
      receivingDate: form.receivingDate || null,
      submissionDate: form.submissionDate || null,
      submissionTime: form.submissionTime || null,
      siteVisitDate: form.siteVisitDate || null,
      siteVisitTime: form.siteVisitTime || null,
      questionDate: form.questionDate || null,
      questionTime: form.questionTime || null,
      rfqEstimatedCost: form.rfqEstimatedCost ? Number(form.rfqEstimatedCost) : null,
      projectManagerId: form.managerId || null,
    }
    try {
      if (isEdit) {
        await updateProject({ variables: { id, input } })
        addToast({ type: 'success', message: t('proj.form.projectUpdated') })
        navigate(`/projects/${id}`)
      } else {
        const res = await createRFQ({ variables: { input } })
        const newId = res.data?.createRFQ.id
        addToast({ type: 'success', message: t('proj.form.rfqCreated') })
        navigate(newId ? `/projects/${newId}` : '/projects')
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: '20px 22px',
    marginBottom: '16px',
  }

  const cardTitle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: theme.textMuted,
    marginBottom: '16px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: '5px',
  }

  const inputStyle = (hasError?: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '8px 10px',
    borderRadius: '7px',
    fontSize: '13px',
    border: `1px solid ${hasError ? '#ef4444' : theme.borderInput}`,
    background: theme.bgCanvas,
    color: theme.textPrimary,
    boxSizing: 'border-box',
  })

  const grid2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
  }
  const grid3: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '14px',
  }

  const field = (key: keyof FormState, label: string, type = 'text', placeholder?: string) => (
    <div>
      <label style={labelStyle}>
        {label}
        {errors[key] && (
          <span
            style={{ color: '#ef4444', fontWeight: 400, marginInlineStart: '6px', textTransform: 'none' }}
          >
            {errors[key]}
          </span>
        )}
      </label>
      <input
        type={type}
        style={inputStyle(!!errors[key])}
        value={form[key]}
        onChange={set(key)}
        placeholder={placeholder}
      />
    </div>
  )

  const dateTimeRow = (
    dateKey: keyof FormState,
    dateLabel: string,
    timeKey: keyof FormState,
    required?: boolean,
  ) => (
    <div style={grid2}>
      <div>
        <label style={labelStyle}>
          {dateLabel}
          {required ? ' *' : ''}
          {errors[dateKey] && (
            <span
              style={{
                color: '#ef4444',
                fontWeight: 400,
                marginInlineStart: '6px',
                textTransform: 'none',
              }}
            >
              {errors[dateKey]}
            </span>
          )}
        </label>
        <input
          type="date"
          style={inputStyle(!!errors[dateKey])}
          value={form[dateKey]}
          onChange={set(dateKey)}
        />
      </div>
      <div>
        <label style={labelStyle}>{t('proj.form.time')}</label>
        <input type="time" style={inputStyle()} value={form[timeKey]} onChange={set(timeKey)} />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={isEdit ? t('proj.form.editProject') : t('proj.form.newRfq')}
        subtitle={isEdit && projectCode ? projectCode : t('proj.form.createANewRequestForQuotation')}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', paddingBottom: '80px' }}>
        {/* ── Lifecycle bar ─────────────────────────────────── */}
        <div style={{ ...card, padding: '16px 22px' }}>
          <div style={{ ...cardTitle, marginBottom: '14px' }}>
            {isEdit ? t('proj.form.projectStage') : isDirectSupply ? t('proj.form.startingAtExecution') : t('proj.form.startingAtClientEnquiry')}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {lifecycleStages.map((s, i) => (
              <React.Fragment key={s}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '60px',
                  }}
                >
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background:
                        i < stageIdx
                          ? theme.accent
                          : i === stageIdx
                            ? theme.accent
                            : theme.bgCanvas,
                      border: `2px solid ${i <= stageIdx ? theme.accent : theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: i <= stageIdx ? '#fff' : theme.textMuted,
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {i < stageIdx ? '✓' : i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      marginTop: '5px',
                      textAlign: 'center',
                      lineHeight: 1.3,
                      color: i === stageIdx ? theme.accent : theme.textMuted,
                      fontWeight: i === stageIdx ? 700 : 400,
                    }}
                  >
                    {tl('proj.form.lifecycleOpts', s, s)}
                  </div>
                </div>
                {i < lifecycleStages.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: '2px',
                      marginTop: '12px',
                      background: i < stageIdx ? theme.accent : theme.border,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Identification ────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.identification')}</div>
          {!isEdit && (
            <div
              style={{
                marginBottom: '14px',
                padding: '8px 12px',
                background: theme.accentBg,
                border: `1px solid ${theme.accentBorder}`,
                borderRadius: '7px',
                fontSize: '12px',
                color: theme.textMuted,
              }}
            >
              {t('proj.form.rfqNumberAndProjectCodeAre')}
            </div>
          )}
          <div style={grid2}>
            {field('name', t('proj.form.projectTenderName'), 'text', t('proj.form.enterProjectName'))}
            {field('contractName', t('proj.form.contractNameNumber'))}
          </div>
        </div>

        {/* ── Classification ────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.classification')}</div>
          <div style={grid3}>
            <div>
              <label style={labelStyle}>
                {t('proj.form.projectType')}
                {errors.projectType && (
                  <span
                    style={{
                      color: '#ef4444',
                      fontWeight: 400,
                      marginInlineStart: '6px',
                      textTransform: 'none',
                    }}
                  >
                    {errors.projectType}
                  </span>
                )}
              </label>
              {customTypeMode ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    autoFocus
                    style={inputStyle()}
                    placeholder={t('proj.form.enterNewTypeLabel')}
                    value={customTypeText}
                    onChange={(e) => {
                      setCustomTypeText(e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmCustomType()
                      if (e.key === 'Escape') setCustomTypeMode(false)
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customTypeText.trim()}
                    onClick={confirmCustomType}
                    style={{
                      padding: '0 12px',
                      borderRadius: '7px',
                      background: theme.accent,
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('proj.form.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTypeMode(false)
                    }}
                    style={{
                      padding: '0 10px',
                      borderRadius: '7px',
                      background: 'transparent',
                      color: theme.textMuted,
                      border: `1px solid ${theme.border}`,
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <SearchableSelect
                  value={form.projectType}
                  onChange={(v) => {
                    if (v === '__add_new__') {
                      setCustomTypeMode(true)
                      setCustomTypeText('')
                    } else setForm((f) => ({ ...f, projectType: v }))
                  }}
                  options={[
                    ...PROJECT_TYPES,
                    ...customTypeOptions,
                    ...(isSystemLevel ? [{ value: '__add_new__', label: t('proj.form.addNewType') }] : []),
                  ]}
                />
              )}
            </div>
            <SearchableSelect
              label={t('proj.form.currency')}
              value={form.currencyCode}
              onChange={(v) => {
                setForm((f) => ({ ...f, currencyCode: v }))
              }}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              error={errors.currencyCode}
            />
            {field('projectLocation', t('proj.form.projectLocation'))}
          </div>
        </div>

        {/* ── Client ────────────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.client')}</div>
          <div style={grid2}>
            {field('clientName', t('proj.form.clientName'))}
            {field('clientContact', t('proj.form.clientContactEmail'))}
          </div>
        </div>

        {/* ── Team ──────────────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.team')}</div>
          <SearchableSelect
            label={t('proj.form.projectManager')}
            value={form.managerId}
            onChange={(v) => {
              setForm((f) => ({ ...f, managerId: v }))
            }}
            placeholder={t('proj.form.selectProjectManager')}
            options={[
              { value: '', label: t('proj.form.none') },
              ...employees.map((e) => ({
                value: e.id,
                label: `${e.first_name} ${e.last_name}${e.job_title ? ` — ${e.job_title}` : ''}`,
              })),
            ]}
          />
          <p style={{ margin: '10px 0 0', fontSize: '12px', color: theme.textMuted }}>
            {t('proj.form.additionalTeamMembersTechnicalCommercialSite')}
          </p>
        </div>

        {/* ── Financials ────────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.financials')}</div>
          <div style={grid3}>
            {field('projectValue', t('proj.form.bidPriceProjectValue'), 'number', '0.00')}
            {field('rfqEstimatedCost', t('proj.form.internalCostEstimate'), 'number', '0.00')}
            {field('budgetAmount', t('proj.form.budgetAmount'), 'number', '0.00')}
          </div>
        </div>

        {/* ── RFQ Dates ─────────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.rfqDates')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>
                {t('proj.form.receivingDate')}
                {errors.receivingDate && (
                  <span
                    style={{
                      color: '#ef4444',
                      fontWeight: 400,
                      marginInlineStart: '6px',
                      textTransform: 'none',
                    }}
                  >
                    {errors.receivingDate}
                  </span>
                )}
              </label>
              <input
                type="date"
                style={inputStyle(!!errors.receivingDate)}
                value={form.receivingDate}
                onChange={set('receivingDate')}
              />
            </div>
            {dateTimeRow('submissionDate', t('proj.form.submissionDeadline'), 'submissionTime', true)}
            {dateTimeRow('siteVisitDate', t('proj.form.siteVisit'), 'siteVisitTime')}
            {dateTimeRow('questionDate', t('proj.form.questionsDeadline'), 'questionTime')}
          </div>
        </div>

        {/* ── Execution Dates ───────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.executionDates')}</div>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: theme.textMuted }}>
            {t('proj.form.plannedProjectStartAndEndDates')}
          </p>
          <div style={grid2}>
            {field('startDate', t('proj.form.plannedStartDate'), 'date')}
            {field('endDate', t('proj.form.plannedEndDate'), 'date')}
          </div>
        </div>

        {/* ── Description ───────────────────────────────────── */}
        <div style={card}>
          <div style={cardTitle}>{t('proj.form.description')}</div>
          <textarea
            rows={4}
            style={{ ...inputStyle(), resize: 'vertical' }}
            placeholder={t('proj.form.projectDescriptionScopeSummarySpecialNotes')}
            value={form.description}
            onChange={set('description')}
          />
        </div>
      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          padding: '12px 24px',
          borderTop: `1px solid ${theme.border}`,
          background: theme.bgSurface,
          zIndex: 10,
        }}
      >
        <Button
          variant="secondary"
          onClick={() => {
            navigate(isEdit ? `/projects/${id}` : '/projects')
          }}
        >
          {t('proj.form.cancel')}
        </Button>
        <Button variant="primary" disabled={saving} onClick={() => void submit()}>
          {saving ? t('proj.form.saving') : isEdit ? t('proj.form.saveChanges') : t('proj.form.createRfq')}
        </Button>
      </div>
    </div>
  )
}
