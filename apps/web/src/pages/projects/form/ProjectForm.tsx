import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { PROJECT_QUERY, CREATE_PROJECT, UPDATE_PROJECT } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const PROJECT_TYPES = [
  { value: 'construction',          label: 'Construction' },
  { value: 'supply',                label: 'Supply' },
  { value: 'services',              label: 'Services' },
  { value: 'rental',                label: 'Rental' },
  { value: 'fabrication',           label: 'Fabrication' },
  { value: 'manpower_supply',       label: 'Manpower Supply' },
  { value: 'operation_maintenance', label: 'Operation & Maintenance' },
  { value: 'epc',                   label: 'EPC' },
]
const CURRENCIES = ['IQD', 'USD', 'EUR', 'GBP']

interface FormState {
  name: string; rfqNumber: string; contractName: string; projectLocation: string
  projectType: string; clientName: string; clientContact: string
  projectValue: string; budgetAmount: string; currencyCode: string
  startDate: string; endDate: string; description: string
  receivingDate: string
  submissionDate: string; submissionTime: string
  siteVisitDate: string; siteVisitTime: string
  questionDate: string; questionTime: string
}

const BLANK: FormState = {
  name: '', rfqNumber: '', contractName: '', projectLocation: '',
  projectType: 'construction', clientName: '', clientContact: '',
  projectValue: '', budgetAmount: '', currencyCode: 'IQD',
  startDate: '', endDate: '', description: '',
  receivingDate: '',
  submissionDate: '', submissionTime: '',
  siteVisitDate: '', siteVisitTime: '',
  questionDate: '', questionTime: '',
}

export default function ProjectForm() {
  const navigate     = useNavigate()
  const { id }       = useParams()
  const { theme }    = useTheme()
  const isEdit       = !!id
  const [form,   setForm]   = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const addToast  = useToastStore((s) => s.addToast)
  const { isSystemLevel } = usePermission()
  const [customTypeMode,    setCustomTypeMode]    = useState(false)
  const [customTypeText,    setCustomTypeText]    = useState('')
  const [customTypeOptions, setCustomTypeOptions] = useState<Array<{ value: string; label: string }>>([])

  const confirmCustomType = () => {
    const raw = customTypeText.trim()
    if (!raw) return
    const val   = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const label = raw.replace(/\b\w/g, c => c.toUpperCase())
    setCustomTypeOptions(prev => prev.some(o => o.value === val) ? prev : [...prev, { value: val, label }])
    setForm(f => ({ ...f, projectType: val }))
    setCustomTypeMode(false)
  }
  const { data } = useQuery(PROJECT_QUERY, { variables: { id }, skip: !isEdit, fetchPolicy: 'cache-and-network' })
  const [createProject, { loading: creating }] = useMutation(CREATE_PROJECT)
  const [updateProject, { loading: updating }] = useMutation(UPDATE_PROJECT)
  const saving = creating || updating

  useEffect(() => {
    const p = data?.project
    if (!p) return
    setForm({
      name:            p.name            ?? '',
      rfqNumber:       p.rfqNumber       ?? '',
      contractName:    p.contractName    ?? '',
      projectLocation: p.projectLocation ?? '',
      projectType:     p.projectType     ?? 'construction',
      clientName:      p.clientName      ?? '',
      clientContact:   p.clientContact   ?? '',
      projectValue:    p.projectValue    != null ? String(p.projectValue) : '',
      budgetAmount:    p.budgetAmount    != null ? String(p.budgetAmount) : '',
      currencyCode:    p.budgetCurrency  ?? 'IQD',
      startDate:       p.plannedStartDate ?? '',
      endDate:         p.plannedEndDate   ?? '',
      description:     p.description     ?? '',
      receivingDate:   p.receivingDate   ?? '',
      submissionDate:  p.submissionDate  ?? '',
      submissionTime:  p.submissionTime  ? String(p.submissionTime).slice(0, 5) : '',
      siteVisitDate:   p.siteVisitDate   ?? '',
      siteVisitTime:   p.siteVisitTime   ? String(p.siteVisitTime).slice(0, 5) : '',
      questionDate:    p.questionDate    ?? '',
      questionTime:    p.questionTime    ? String(p.questionTime).slice(0, 5) : '',
    })
  }, [data])

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const validate = (): boolean => {
    const e: typeof errors = {}
    if (!form.name.trim())  e.name        = 'Required'
    if (!form.projectType)  e.projectType = 'Required'
    if (!form.currencyCode) e.currencyCode = 'Required'
    if (form.projectValue && isNaN(Number(form.projectValue))) e.projectValue = 'Must be a number'
    if (form.budgetAmount  && isNaN(Number(form.budgetAmount))) e.budgetAmount  = 'Must be a number'
    if (!form.receivingDate)   e.receivingDate  = 'Required'
    if (!form.submissionDate)  e.submissionDate = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    const input = {
      name:             form.name,
      rfqNumber:        form.rfqNumber       || null,
      contractName:     form.contractName    || null,
      projectLocation:  form.projectLocation || null,
      projectType:      form.projectType,
      clientName:       form.clientName      || null,
      clientContact:    form.clientContact   || null,
      projectValue:     form.projectValue    ? Number(form.projectValue) : null,
      budgetAmount:     form.budgetAmount    ? Number(form.budgetAmount) : null,
      budgetCurrency:   form.currencyCode,
      plannedStartDate: form.startDate       || null,
      plannedEndDate:   form.endDate         || null,
      description:      form.description     || null,
      receivingDate:    form.receivingDate   || null,
      submissionDate:   form.submissionDate  || null,
      submissionTime:   form.submissionTime  || null,
      siteVisitDate:    form.siteVisitDate   || null,
      siteVisitTime:    form.siteVisitTime   || null,
      questionDate:     form.questionDate    || null,
      questionTime:     form.questionTime    || null,
    }
    try {
      if (isEdit) {
        await updateProject({ variables: { id, input } })
        addToast({ type: 'success', message: 'Project updated' })
        navigate(`/projects/${id}`)
      } else {
        const res = await createProject({ variables: { input } })
        const newId = res.data?.createProject?.id
        addToast({ type: 'success', message: 'Project created' })
        navigate(newId ? `/projects/${newId}` : '/projects')
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message ?? 'Failed to save project' })
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }
  const inputStyle = (hasError?: boolean): React.CSSProperties => ({
    width: '100%', padding: '8px 10px', borderRadius: '7px', fontSize: '13px',
    border: `1px solid ${hasError ? '#ef4444' : theme.borderInput}`,
    background: theme.bgCanvas, color: theme.textPrimary, boxSizing: 'border-box',
  })

  const inp = (key: keyof FormState, label: string, type = 'text', placeholder?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={labelStyle}>
        {label}
        {errors[key] && <span style={{ color: '#ef4444', fontWeight: 400, marginLeft: '6px', textTransform: 'none' }}>{errors[key]}</span>}
      </label>
      <input id={key} type={type} style={inputStyle(!!errors[key])} value={form[key]} onChange={set(key)} placeholder={placeholder} />
    </div>
  )

  const secStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, paddingBottom: '8px', borderBottom: `1px solid ${theme.border}`, marginBottom: '14px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={isEdit ? 'Edit Project' : 'New Project'}
        subtitle={isEdit ? 'Update project details' : 'Create a new project'}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', paddingBottom: '80px' }}>
        {/* Identification */}
        <div style={{ marginBottom: '28px' }}>
          <div style={secStyle}>Identification</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {inp('name',         'Project Name *', 'text', 'Enter project name')}
            {inp('rfqNumber',    'RFQ Number')}
            {inp('contractName', 'Contract Name / Number')}
          </div>
        </div>

        {/* Classification */}
        <div style={{ marginBottom: '28px' }}>
          <div style={secStyle}>Classification</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Project Type *
                {errors.projectType && <span style={{ color: '#ef4444', fontWeight: 400, marginLeft: '6px', textTransform: 'none' }}>{errors.projectType}</span>}
              </label>
              {customTypeMode ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    autoFocus
                    style={inputStyle()}
                    placeholder="Enter new type label"
                    value={customTypeText}
                    onChange={e => setCustomTypeText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmCustomType()
                      if (e.key === 'Escape') setCustomTypeMode(false)
                    }}
                  />
                  <button type="button" disabled={!customTypeText.trim()} onClick={confirmCustomType}
                    style={{ padding: '0 12px', borderRadius: '7px', background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    Add
                  </button>
                  <button type="button" onClick={() => setCustomTypeMode(false)}
                    style={{ padding: '0 10px', borderRadius: '7px', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, cursor: 'pointer', fontSize: '13px' }}>
                    ✕
                  </button>
                </div>
              ) : (
                <SearchableSelect
                  value={form.projectType}
                  onChange={(v) => {
                    if (v === '__add_new__') { setCustomTypeMode(true); setCustomTypeText('') }
                    else setForm(f => ({ ...f, projectType: v }))
                  }}
                  options={[
                    ...PROJECT_TYPES,
                    ...customTypeOptions,
                    ...(isSystemLevel ? [{ value: '__add_new__', label: '＋ Add new type…' }] : []),
                  ]}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <SearchableSelect
                label="Currency *"
                value={form.currencyCode}
                onChange={(v) => setForm(f => ({ ...f, currencyCode: v }))}
                options={CURRENCIES.map(c => ({ value: c, label: c }))}
                error={errors.currencyCode}
              />
            </div>
            {inp('projectLocation', 'Project Location')}
          </div>
        </div>

        {/* Client */}
        <div style={{ marginBottom: '28px' }}>
          <div style={secStyle}>Client</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {inp('clientName',    'Client Name')}
            {inp('clientContact', 'Client Contact')}
          </div>
        </div>

        {/* Financials */}
        <div style={{ marginBottom: '28px' }}>
          <div style={secStyle}>Financials</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {inp('projectValue', 'Project Value', 'number', '0.00')}
            {inp('budgetAmount', 'Budget Amount', 'number', '0.00')}
          </div>
        </div>

        {/* Timeline */}
        <div style={{ marginBottom: '28px' }}>
          <div style={secStyle}>Timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              {inp('receivingDate', 'Receiving Date *', 'date')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {inp('submissionDate', 'Submission Date *', 'date')}
              {inp('submissionTime', 'Submission Time', 'time')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {inp('siteVisitDate', 'Site Visit Date', 'date')}
              {inp('siteVisitTime', 'Site Visit Time', 'time')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {inp('questionDate', 'Question Date', 'date')}
              {inp('questionTime', 'Question Time', 'time')}
            </div>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '28px' }}>
          <div style={secStyle}>Description</div>
          <textarea rows={4} style={{ ...inputStyle(), resize: 'none' }}
            placeholder="Project description…"
            value={form.description}
            onChange={set('description')}
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 24px', borderTop: `1px solid ${theme.border}`, background: theme.bgSurface, zIndex: 10 }}>
        <Button variant="secondary" onClick={() => navigate(isEdit ? `/projects/${id}` : '/projects')}>Cancel</Button>
        <Button variant="primary" disabled={saving} onClick={() => submit()}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
        </Button>
      </div>
    </div>
  )
}
