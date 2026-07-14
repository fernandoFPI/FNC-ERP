import React, { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { useTheme } from '../../theme/ThemeContext'
import { PROJECT_QUERY, UPDATE_PROJECT } from '../../graphql/projects'
import { usePermission } from '../../hooks/usePermission'
import { SearchableSelect } from '../../components/ui/SearchableSelect'
import { api } from '../../lib/axios'

interface Employee { id: string; first_name: string; last_name: string; job_title?: string }

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

interface Props {
  projectId: string | null; open: boolean; onClose: () => void; onSaved?: () => void
}

export function EditProjectDrawer({ projectId, open, onClose, onSaved }: Props) {
  const { theme }   = useTheme()
  const { isSystemLevel } = usePermission()
  const [form,   setForm]   = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [customTypeMode,    setCustomTypeMode]    = useState(false)
  const [customTypeText,    setCustomTypeText]    = useState('')
  const [customTypeOptions, setCustomTypeOptions] = useState<Array<{ value: string; label: string }>>([])
  const [employees,         setEmployees]         = useState<Employee[]>([])

  const confirmCustomType = () => {
    const raw = customTypeText.trim()
    if (!raw) return
    const val   = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const label = raw.replace(/\b\w/g, c => c.toUpperCase())
    setCustomTypeOptions(prev => prev.some(o => o.value === val) ? prev : [...prev, { value: val, label }])
    setForm(f => ({ ...f, projectType: val }))
    setCustomTypeMode(false)
  }

  const { data } = useQuery(PROJECT_QUERY, {
    variables: { id: projectId }, skip: !projectId || !open, fetchPolicy: 'cache-and-network',
  })
  const [updateProject] = useMutation(UPDATE_PROJECT)

  useEffect(() => {
    if (!open) return
    api.get<Employee[]>('/hr/employees', { params: { limit: 200, status: 'active' } })
      .then(r => setEmployees(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
  }, [open])

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
      managerId:       p.managerId       ?? '',
    })
  }, [data])

  if (!open || !projectId) return null

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProject({
        variables: {
          id: projectId,
          input: {
            name:             form.name            || null,
            rfqNumber:        form.rfqNumber       || null,
            contractName:     form.contractName    || null,
            projectLocation:  form.projectLocation || null,
            projectType:      form.projectType     || null,
            clientName:       form.clientName      || null,
            clientContact:    form.clientContact   || null,
            projectValue:     form.projectValue    ? Number(form.projectValue) : null,
            budgetAmount:     form.budgetAmount    ? Number(form.budgetAmount) : null,
            budgetCurrency:   form.currencyCode    || null,
            plannedStartDate: form.startDate       || null,
            plannedEndDate:   form.endDate         || null,
            projectManagerId: form.managerId       || null,
          },
        },
      })
      onSaved?.(); onClose()
    } finally { setSaving(false) }
  }

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }

  const field = (key: string, label: string, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} style={inputStyle} value={form[key] ?? ''} onChange={set(key)} />
    </div>
  )

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} onClick={onClose} />
      <div style={{ position: 'fixed', right: 0, top: 0, height: '100%', width: '100%', maxWidth: '460px', background: theme.bgSurface, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '15px' }}>Edit Project</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: theme.textMuted, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {field('name',            'Project Name')}
          {field('rfqNumber',       'RFQ Number')}
          {field('contractName',    'Contract Name / Number')}
          {field('projectLocation', 'Project Location')}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={labelStyle}>Project Type</label>
            {customTypeMode ? (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  autoFocus
                  style={inputStyle}
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
                value={form.projectType ?? 'construction'}
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

          {field('clientName',    'Client Name')}
          {field('clientContact', 'Client Contact')}

          <SearchableSelect
            label="Project Manager"
            value={form.managerId ?? ''}
            onChange={(v) => setForm(f => ({ ...f, managerId: v }))}
            placeholder="Select project manager…"
            options={[
              { value: '', label: '— None —' },
              ...employees.map(e => ({
                value: e.id,
                label: `${e.first_name} ${e.last_name}${e.job_title ? ` — ${e.job_title}` : ''}`,
              })),
            ]}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {field('projectValue', 'Project Value', 'number')}
            {field('budgetAmount', 'Budget Amount', 'number')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <SearchableSelect
              label="Currency"
              value={form.currencyCode ?? ''}
              onChange={(v) => setForm(f => ({ ...f, currencyCode: v }))}
              options={CURRENCIES.map(c => ({ value: c, label: c }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {field('startDate', 'Start Date', 'date')}
            {field('endDate',   'End Date',   'date')}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: `1px solid ${theme.border}` }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '7px', border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: '7px', background: saving ? theme.border : theme.accent, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}
