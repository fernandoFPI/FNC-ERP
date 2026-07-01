import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PROJECT_CONTRACT_QUERY,
  CREATE_PROJECT_CONTRACT,
  UPDATE_PROJECT_CONTRACT,
  PROJECTS_QUERY,
  CREATE_CONTRACT_MILESTONE,
  UPDATE_CONTRACT_MILESTONE,
  DELETE_CONTRACT_MILESTONE,
} from '../../../graphql/projects'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const BILLING_METHODS: { value: string; label: string }[] = [
  { value: 'fixed_lump_sum', label: 'Fixed Lump Sum' },
  { value: 'milestone',      label: 'Milestone' },
  { value: 'cost_plus',      label: 'Cost Plus (Time & Material)' },
  { value: 'progress',       label: 'Progress (Percentage)' },
]

const CURRENCIES = [
  { value: 'IQD', label: 'IQD' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'AED', label: 'AED' },
  { value: 'SAR', label: 'SAR' },
  { value: 'TRY', label: 'TRY' },
]

interface MilestoneRow {
  id?: string
  name: string
  sequence: string
  billableAmount: string
  currencyCode: string
  status?: string
}

const BLANK_MILESTONE: MilestoneRow = {
  name: '',
  sequence: '',
  billableAmount: '',
  currencyCode: 'IQD',
}

export default function ContractForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const urlProjectId = searchParams.get('projectId') ?? ''
  const isEdit = !!id
  const addToast = useToastStore((s) => s.addToast)
  const { theme } = useTheme()

  const [selectedProjectId, setSelectedProjectId] = useState(urlProjectId)
  const [projectError, setProjectError] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [projectOpen, setProjectOpen] = useState(false)
  const projectRef = useRef<HTMLDivElement>(null)

  // Milestone state
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [newMilestone, setNewMilestone] = useState<MilestoneRow>({ ...BLANK_MILESTONE })
  const [confirmDeleteMilestone, setConfirmDeleteMilestone] = useState<string | null>(null)
  const [savingMilestoneId, setSavingMilestoneId] = useState<string | null>(null)
  const [addingMilestone, setAddingMilestone] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setProjectOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: projectsData } = useQuery(PROJECTS_QUERY, {
    variables: { limit: 200 },
    skip: isEdit || !!urlProjectId,
    fetchPolicy: 'cache-and-network',
  })
  const projectOptions: Array<{ id: string; name: string; code: string }> = projectsData?.projects?.data ?? []

  const [form, setForm] = useState({
    contractName: '',
    clientName: '',
    contractValue: '',
    currencyCode: 'IQD',
    defaultBillingMethod: 'fixed_lump_sum',
    defaultMarginPct: '0',
    retentionPct: '0',
    status: 'draft',
  })

  const { data, refetch } = useQuery(PROJECT_CONTRACT_QUERY, { variables: { id }, skip: !isEdit, fetchPolicy: 'cache-and-network' })
  const [createContract, { loading: creating }] = useMutation(CREATE_PROJECT_CONTRACT)
  const [updateContract, { loading: updating }] = useMutation(UPDATE_PROJECT_CONTRACT)
  const [createMilestone] = useMutation(CREATE_CONTRACT_MILESTONE)
  const [updateMilestone] = useMutation(UPDATE_CONTRACT_MILESTONE)
  const [deleteMilestone] = useMutation(DELETE_CONTRACT_MILESTONE)

  useEffect(() => {
    const c = data?.projectContract
    if (c) {
      setForm({
        contractName: c.contractName ?? '',
        clientName: c.clientName ?? '',
        contractValue: String(c.contractValue ?? ''),
        currencyCode: c.currencyCode ?? 'IQD',
        defaultBillingMethod: c.defaultBillingMethod ?? 'fixed_lump_sum',
        defaultMarginPct: String(c.defaultMarginPct ?? '0'),
        retentionPct: String(c.retentionPct ?? '0'),
        status: c.status ?? 'draft',
      })
      const loaded: MilestoneRow[] = (c.milestones ?? []).map((m: Record<string, unknown>) => ({
        id: String(m['id']),
        name: String(m['name'] ?? ''),
        sequence: String(m['sequence'] ?? '0'),
        billableAmount: String(m['billableAmount'] ?? '0'),
        currencyCode: String(m['currencyCode'] ?? 'IQD'),
        status: String(m['status'] ?? 'pending'),
      }))
      setMilestones(loaded)
    }
  }, [data])

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isEdit && !selectedProjectId) {
      setProjectError('Please select a project')
      return
    }
    setProjectError('')
    const input = {
      ...form,
      contractValue: parseFloat(form.contractValue) || 0,
      defaultMarginPct: parseFloat(form.defaultMarginPct) || 0,
      retentionPct: parseFloat(form.retentionPct) || 0,
    }
    try {
      if (isEdit) {
        await updateContract({ variables: { id, input } })
        addToast({ type: 'success', message: 'Contract updated' })
        navigate(`/projects/contracts/${id}`)
      } else {
        const res = await createContract({ variables: { projectId: selectedProjectId, input } })
        addToast({ type: 'success', message: 'Contract created' })
        navigate(`/projects/contracts/${res.data.createProjectContract.id}`)
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleAddMilestone() {
    if (!newMilestone.name.trim() || !newMilestone.billableAmount) {
      addToast({ type: 'error', message: 'Name and billable amount are required' })
      return
    }
    setAddingMilestone(true)
    try {
      await createMilestone({
        variables: {
          contractId: id,
          input: {
            name: newMilestone.name.trim(),
            sequence: parseInt(newMilestone.sequence) || 0,
            billableAmount: parseFloat(newMilestone.billableAmount),
            currencyCode: newMilestone.currencyCode,
          },
        },
      })
      addToast({ type: 'success', message: 'Milestone added' })
      setNewMilestone({ ...BLANK_MILESTONE })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setAddingMilestone(false)
    }
  }

  async function handleSaveMilestone(m: MilestoneRow) {
    if (!m.id) return
    setSavingMilestoneId(m.id)
    try {
      await updateMilestone({
        variables: {
          id: m.id,
          input: {
            name: m.name,
            sequence: parseInt(m.sequence) || 0,
            billableAmount: parseFloat(m.billableAmount),
            currencyCode: m.currencyCode,
          },
        },
      })
      addToast({ type: 'success', message: 'Milestone saved' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setSavingMilestoneId(null)
    }
  }

  async function handleDeleteMilestone(milestoneId: string) {
    try {
      await deleteMilestone({ variables: { id: milestoneId } })
      addToast({ type: 'success', message: 'Milestone removed' })
      await refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '8px 10px',
    borderBottom: `1px solid ${theme.border}`,
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '13px',
    color: theme.textPrimary,
    borderBottom: `1px solid ${theme.border}`,
    verticalAlign: 'middle',
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pending:   { bg: `${theme.accent}20`, text: theme.accent },
      reached:   { bg: '#10b98120',         text: '#10b981' },
      invoiced:  { bg: '#0ea5e920',         text: '#0ea5e9' },
      cancelled: { bg: '#ef444420',         text: '#ef4444' },
    }
    const c = colors[status] ?? colors['pending']
    return (
      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: c.bg, color: c.text, textTransform: 'capitalize' }}>
        {status}
      </span>
    )
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '960px' }}>
      <PageHeader title={isEdit ? 'Edit Contract' : 'New Contract'} subtitle="Project contract" />

      <Card style={{ marginTop: '20px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
          {!isEdit && !urlProjectId && (
            <div ref={projectRef}>
              <label style={{ display: 'block', fontSize: '12px', color: projectError ? '#ef4444' : theme.textSecondary, marginBottom: '4px', fontWeight: 500 }}>
                Project *{projectError && <span style={{ marginLeft: '6px', fontWeight: 400 }}>{projectError}</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  value={selectedProjectId
                    ? (() => { const p = projectOptions.find(o => o.id === selectedProjectId); return p ? `${p.code} — ${p.name}` : '' })()
                    : projectSearch}
                  placeholder="Search projects…"
                  onFocus={() => setProjectOpen(true)}
                  onChange={e => { setProjectSearch(e.target.value); setSelectedProjectId(''); setProjectOpen(true); setProjectError('') }}
                  onClick={() => setProjectOpen(true)}
                  style={{ ...selectStyle, cursor: 'text', paddingRight: '28px', borderColor: projectError ? '#ef4444' : undefined }}
                />
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: theme.textMuted, fontSize: '11px' }}>▾</span>
                {projectOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, maxHeight: '260px', overflowY: 'auto' }}>
                    <div style={{ padding: '8px' }}>
                      <input
                        autoFocus
                        value={projectSearch}
                        onChange={e => { setProjectSearch(e.target.value); setSelectedProjectId('') }}
                        placeholder="Type to search…"
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '5px', border: `1px solid ${theme.border}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>
                    {projectOptions
                      .filter(p => !projectSearch || `${p.code} ${p.name}`.toLowerCase().includes(projectSearch.toLowerCase()))
                      .map(p => (
                        <div
                          key={p.id}
                          onMouseDown={() => { setSelectedProjectId(p.id); setProjectSearch(''); setProjectOpen(false); setProjectError('') }}
                          style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: p.id === selectedProjectId ? theme.accent : theme.textPrimary, background: p.id === selectedProjectId ? `${theme.accent}15` : 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${theme.accent}10`)}
                          onMouseLeave={e => (e.currentTarget.style.background = p.id === selectedProjectId ? `${theme.accent}15` : 'transparent')}
                        >
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: theme.textMuted, marginRight: '8px' }}>{p.code}</span>
                          {p.name}
                        </div>
                      ))
                    }
                    {projectOptions.filter(p => !projectSearch || `${p.code} ${p.name}`.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: theme.textMuted }}>No projects found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <Input label="Contract Name" value={form.contractName} onChange={(e) => setForm(f => ({ ...f, contractName: e.target.value }))} required />
          <Input label="Client Name" value={form.clientName} onChange={(e) => setForm(f => ({ ...f, clientName: e.target.value }))} required />

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Input label="Contract Value" type="number" step="0.01" value={form.contractValue} onChange={(e) => setForm(f => ({ ...f, contractValue: e.target.value }))} required />
            <div>
              <SearchableSelect
                label="Currency"
                value={form.currencyCode}
                onChange={(v) => setForm(f => ({ ...f, currencyCode: v }))}
                options={CURRENCIES}
              />
            </div>
          </div>

          <div>
            <SearchableSelect
              label="Default Billing Method"
              value={form.defaultBillingMethod}
              onChange={(v) => setForm(f => ({ ...f, defaultBillingMethod: v }))}
              options={BILLING_METHODS}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <Input label="Default Margin %" type="number" step="0.1" value={form.defaultMarginPct} onChange={(e) => setForm(f => ({ ...f, defaultMarginPct: e.target.value }))} />
            <Input label="Retention %" type="number" step="0.1" value={form.retentionPct} onChange={(e) => setForm(f => ({ ...f, retentionPct: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={creating || updating}>{isEdit ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Card>

      {/* Milestones section — only available when editing an existing contract */}
      {isEdit && (
        <Card style={{ marginTop: '20px' }}>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>Milestones</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: theme.textMuted }}>
                Define payment milestones for milestone-based billing. Only <strong>pending</strong> milestones can be edited or deleted.
              </p>
            </div>

            {/* Existing milestones */}
            {milestones.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: '50px' }}>#</th>
                      <th style={thStyle}>Name</th>
                      <th style={{ ...thStyle, width: '160px' }}>Amount</th>
                      <th style={{ ...thStyle, width: '90px' }}>Currency</th>
                      <th style={{ ...thStyle, width: '90px' }}>Status</th>
                      <th style={{ ...thStyle, width: '120px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m, idx) => {
                      const isPending = !m.status || m.status === 'pending'
                      return (
                        <tr key={m.id ?? idx}>
                          <td style={tdStyle}>
                            {isPending ? (
                              <input
                                type="number"
                                value={m.sequence}
                                onChange={e => setMilestones(ms => ms.map((x, i) => i === idx ? { ...x, sequence: e.target.value } : x))}
                                style={{ ...selectStyle, width: '50px', padding: '4px 6px' }}
                              />
                            ) : (
                              <span style={{ fontFamily: 'monospace', color: theme.textMuted }}>{m.sequence}</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {isPending ? (
                              <input
                                value={m.name}
                                onChange={e => setMilestones(ms => ms.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                                style={{ ...selectStyle, padding: '4px 8px', width: '100%' }}
                              />
                            ) : (
                              <span>{m.name}</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {isPending ? (
                              <input
                                type="number"
                                step="0.01"
                                value={m.billableAmount}
                                onChange={e => setMilestones(ms => ms.map((x, i) => i === idx ? { ...x, billableAmount: e.target.value } : x))}
                                style={{ ...selectStyle, padding: '4px 8px', width: '100%' }}
                              />
                            ) : (
                              <span style={{ fontFamily: 'monospace' }}>{parseFloat(m.billableAmount).toLocaleString()}</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {isPending ? (
                              <select
                                value={m.currencyCode}
                                onChange={e => setMilestones(ms => ms.map((x, i) => i === idx ? { ...x, currencyCode: e.target.value } : x))}
                                style={{ ...selectStyle, padding: '4px 8px' }}
                              >
                                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontFamily: 'monospace' }}>{m.currencyCode}</span>
                            )}
                          </td>
                          <td style={tdStyle}>{statusBadge(m.status ?? 'pending')}</td>
                          <td style={tdStyle}>
                            {isPending && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  loading={savingMilestoneId === m.id}
                                  onClick={() => handleSaveMilestone(m)}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirmDeleteMilestone(m.id!)}
                                  style={{ color: '#ef4444' }}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add new milestone row */}
            <div style={{ background: theme.bgCanvas, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Add Milestone
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 150px 100px auto', gap: '10px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Seq</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newMilestone.sequence}
                    onChange={e => setNewMilestone(m => ({ ...m, sequence: e.target.value }))}
                    style={{ ...selectStyle, padding: '7px 8px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Name *</label>
                  <input
                    placeholder="Milestone name"
                    value={newMilestone.name}
                    onChange={e => setNewMilestone(m => ({ ...m, name: e.target.value }))}
                    style={{ ...selectStyle, padding: '7px 10px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Billable Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newMilestone.billableAmount}
                    onChange={e => setNewMilestone(m => ({ ...m, billableAmount: e.target.value }))}
                    style={{ ...selectStyle, padding: '7px 8px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Currency</label>
                  <select
                    value={newMilestone.currencyCode}
                    onChange={e => setNewMilestone(m => ({ ...m, currencyCode: e.target.value }))}
                    style={{ ...selectStyle, padding: '7px 8px' }}
                  >
                    {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={addingMilestone}
                    onClick={handleAddMilestone}
                    style={{ marginTop: '19px' }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirmDeleteMilestone}
        title="Delete Milestone"
        message="Remove this milestone? This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={async () => {
          if (confirmDeleteMilestone) await handleDeleteMilestone(confirmDeleteMilestone)
          setConfirmDeleteMilestone(null)
        }}
        onCancel={() => setConfirmDeleteMilestone(null)}
      />
    </div>
  )
}
