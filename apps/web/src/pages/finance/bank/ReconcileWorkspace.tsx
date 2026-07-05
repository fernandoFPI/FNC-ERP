import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface BankAccount {
  id: string; name: string; bank_name: string | null; account_number: string | null
  currency_code: string; gl_account_id: string | null
  last_reconciled_date: string | null; last_reconciled_balance: number | null
}

interface StatementSummary {
  id: string; period: string; statement_date: string
  opening_balance: number; closing_balance: number
  status: 'draft' | 'in_progress' | 'reconciled'
  total_lines: number; matched_lines: number
}

interface MatchInfo {
  id: string; journal_entry_id: string; journal_line_id: string
  match_type: string; je_reference: string; je_description: string
}

interface StatementLine {
  id: string; line_number: number; transaction_date: string
  description: string; reference: string | null
  debit: number; credit: number; balance_after: number | null
  is_reconciled: boolean; matches: MatchInfo[] | null
}

interface GlEntry {
  id: string; journal_entry_id: string; reference: string
  description: string; line_description: string
  entry_date: string; debit: number; credit: number; source_type: string
}

interface StatementDetail extends StatementSummary {
  account_name: string; account_number: string | null; currency_code: string
  gl_account_id: string | null; bank_name: string | null
  lines: StatementLine[]
}

interface GLAccount { id: string; code: string; name: string }

function round2(n: number) { return Math.round(n * 100) / 100 }

const STMT_BADGE: Record<string, 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral', in_progress: 'warning', reconciled: 'success',
}

const emptyNewStmt = { period: '', statement_date: '', opening_balance: '', closing_balance: '', notes: '' }
const emptyLineDraft = { transaction_date: '', description: '', reference: '', debit: '', credit: '', balance_after: '' }

export default function ReconcileWorkspace() {
  const { accountId, statementId } = useParams<{ accountId: string; statementId?: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  // Account + statements list
  const [account, setAccount]     = useState<BankAccount | null>(null)
  const [statements, setStatements] = useState<StatementSummary[]>([])

  // Statement workspace
  const [stmt, setStmt]           = useState<StatementDetail | null>(null)
  const [glEntries, setGlEntries] = useState<GlEntry[]>([])
  const [loading, setLoading]     = useState(true)

  // Selection
  const [selectedBank, setSelectedBank] = useState<Set<string>>(new Set())
  const [selectedGl, setSelectedGl]     = useState<Set<string>>(new Set())

  // UI state
  const [autoMatching, setAutoMatching]   = useState(false)
  const [finalizing, setFinalizing]       = useState(false)
  const [showNewStmt, setShowNewStmt]     = useState(false)
  const [newStmt, setNewStmt]             = useState(emptyNewStmt)
  const [creatingStmt, setCreatingStmt]   = useState(false)
  const [showAddLines, setShowAddLines]   = useState(false)
  const [lineDrafts, setLineDrafts]       = useState([{ ...emptyLineDraft }])
  const [addingLines, setAddingLines]     = useState(false)
  const [showCreateEntry, setShowCreateEntry] = useState(false)
  const [createEntryLine, setCreateEntryLine] = useState<StatementLine | null>(null)
  const [offsetAccountId, setOffsetAccountId] = useState('')
  const [createEntryDesc, setCreateEntryDesc] = useState('')
  const [creatingEntry, setCreatingEntry] = useState(false)
  const [glAccounts, setGlAccounts]       = useState<GLAccount[]>([])

  // ── Load account + statements ─────────────────────────────────────────────
  const loadAccount = useCallback(async () => {
    if (!accountId) return
    try {
      const [acctRes, stmtsRes, glRes] = await Promise.all([
        api.get<BankAccount>(`/finance/bank/accounts/${accountId}`),
        api.get<StatementSummary[]>(`/finance/bank/accounts/${accountId}/statements`),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setAccount(acctRes.data)
      setStatements(stmtsRes.data)
      setGlAccounts(glRes.data)
    } catch { /* handled */ }
  }, [accountId])

  // ── Load statement detail + GL entries ────────────────────────────────────
  const loadStatement = useCallback(async () => {
    if (!statementId) return
    setLoading(true)
    try {
      const [stmtRes, glRes] = await Promise.all([
        api.get<StatementDetail>(`/finance/bank/statements/${statementId}`),
        api.get<GlEntry[]>(`/finance/bank/statements/${statementId}/gl-entries`),
      ])
      setStmt(stmtRes.data)
      setGlEntries(glRes.data)
      setSelectedBank(new Set())
      setSelectedGl(new Set())
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [statementId])

  useEffect(() => {
    void loadAccount()
    if (statementId) void loadStatement()
    else setLoading(false)
  }, [loadAccount, loadStatement, statementId])

  // ── Match calculations ─────────────────────────────────────────────────────
  const unreconciled = stmt?.lines.filter(l => !l.is_reconciled) ?? []

  const selectedBankNet = [...selectedBank].reduce((sum, id) => {
    const l = stmt?.lines.find(x => x.id === id)
    return sum + (l ? round2(Number(l.credit) - Number(l.debit)) : 0)
  }, 0)

  const selectedGlNet = [...selectedGl].reduce((sum, id) => {
    const e = glEntries.find(x => x.id === id)
    return sum + (e ? round2(Number(e.debit) - Number(e.credit)) : 0)
  }, 0)

  const matchDiff   = round2(selectedBankNet - selectedGlNet)
  const canMatch    = selectedBank.size > 0 && selectedGl.size > 0 && matchDiff === 0
  const canCreate   = selectedBank.size === 1 && selectedGl.size === 0 && !stmt?.lines.find(l => l.id === [...selectedBank][0])?.is_reconciled

  function toggleBank(id: string) {
    setSelectedBank(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleGl(id: string) {
    setSelectedGl(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleCreateStatement() {
    if (!accountId || !newStmt.period || !newStmt.statement_date) return
    setCreatingStmt(true)
    try {
      const r = await api.post<{ id: string }>(`/finance/bank/accounts/${accountId}/statements`, {
        period: newStmt.period,
        statement_date: newStmt.statement_date,
        opening_balance: Number(newStmt.opening_balance) || 0,
        closing_balance: Number(newStmt.closing_balance) || 0,
        notes: newStmt.notes || undefined,
      })
      navigate(`/finance/bank/${accountId}/reconcile/${r.data.id}`)
    } catch { /* handled */ }
    finally { setCreatingStmt(false) }
  }

  async function handleAutoMatch() {
    if (!statementId) return
    setAutoMatching(true)
    try {
      const r = await api.post<{ matched: number }>(`/finance/bank/statements/${statementId}/auto-match`)
      await loadStatement()
      if (r.data.matched === 0) alert('No automatic matches found. Try matching manually.')
      else alert(`Auto-matched ${r.data.matched} line(s).`)
    } catch { /* handled */ }
    finally { setAutoMatching(false) }
  }

  async function handleMatch() {
    if (!canMatch) return
    try {
      await api.post('/finance/bank/match', {
        statement_line_ids: [...selectedBank],
        journal_line_ids: [...selectedGl],
      })
      await loadStatement()
    } catch { /* handled */ }
  }

  async function handleUnmatch(lineId: string) {
    if (!confirm('Remove this match?')) return
    try {
      await api.delete(`/finance/bank/match/line/${lineId}`)
      await loadStatement()
    } catch { /* handled */ }
  }

  async function handleAddLines() {
    if (!statementId) return
    const valid = lineDrafts.filter(l => l.description && l.transaction_date && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (!valid.length) return
    setAddingLines(true)
    try {
      await api.post(`/finance/bank/statements/${statementId}/lines`, {
        lines: valid.map(l => ({
          transaction_date: l.transaction_date,
          description: l.description,
          reference: l.reference || undefined,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          balance_after: l.balance_after ? Number(l.balance_after) : undefined,
        })),
      })
      setLineDrafts([{ ...emptyLineDraft }])
      setShowAddLines(false)
      await loadStatement()
    } catch { /* handled */ }
    finally { setAddingLines(false) }
  }

  async function handleCreateEntry() {
    if (!createEntryLine || !offsetAccountId) return
    setCreatingEntry(true)
    try {
      await api.post(`/finance/bank/lines/${createEntryLine.id}/create-entry`, {
        offset_account_id: offsetAccountId,
        description: createEntryDesc || createEntryLine.description,
      })
      setShowCreateEntry(false)
      setCreateEntryLine(null)
      setOffsetAccountId('')
      setCreateEntryDesc('')
      await loadStatement()
    } catch { /* handled */ }
    finally { setCreatingEntry(false) }
  }

  async function handleFinalize() {
    if (!statementId || !confirm('Mark this statement as fully reconciled? This cannot be undone.')) return
    setFinalizing(true)
    try {
      await api.post(`/finance/bank/statements/${statementId}/finalize`)
      await loadStatement()
    } catch { /* handled */ }
    finally { setFinalizing(false) }
  }

  function openCreateEntry() {
    const lineId = [...selectedBank][0]
    const line   = stmt?.lines.find(l => l.id === lineId)
    if (!line) return
    setCreateEntryLine(line)
    setCreateEntryDesc(line.description)
    setShowCreateEntry(true)
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle = {
    background: theme.bgSurface, border: `1px solid ${theme.border}`,
    borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
    color: theme.textPrimary, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, marginBottom: '3px', display: 'block' as const }

  // ── Account overview (no statementId) ─────────────────────────────────────
  if (!statementId) {
    return (
      <div style={{ padding: '24px' }}>
        <PageHeader
          title={account?.name ?? 'Bank Account'}
          subtitle={[account?.bank_name, account?.account_number].filter(Boolean).join(' · ')}
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/finance/bank')}>← All Accounts</Button>
              <Button variant="primary" size="sm" onClick={() => setShowNewStmt(true)}>+ New Statement</Button>
            </div>
          }
        />

        {!account?.gl_account_id && (
          <div style={{ background: theme.warning + '20', border: `1px solid ${theme.warning}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: theme.textPrimary }}>
            ⚠ No GL account linked. Edit this account and link it to a chart of accounts entry to enable reconciliation.
          </div>
        )}

        <Card padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}>
                {['Period', 'Statement Date', 'Opening', 'Closing', 'Progress', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>Loading...</td></tr>}
              {!loading && !statements.length && (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
                  No statements yet. <span style={{ color: theme.accent, cursor: 'pointer' }} onClick={() => setShowNewStmt(true)}>Create the first statement →</span>
                </td></tr>
              )}
              {statements.map(s => {
                const pct = Number(s.total_lines) > 0 ? Math.round((Number(s.matched_lines) / Number(s.total_lines)) * 100) : 0
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px 14px', color: theme.textPrimary, fontWeight: 600, fontFamily: 'monospace' }}>{s.period}</td>
                    <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{new Date(s.statement_date).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 14px' }}><AmountDisplay amount={s.opening_balance} currency={account?.currency_code ?? 'IQD'} size="sm" /></td>
                    <td style={{ padding: '10px 14px' }}><AmountDisplay amount={s.closing_balance} currency={account?.currency_code ?? 'IQD'} size="sm" /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '60px', height: '4px', borderRadius: '2px', background: theme.border }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '2px', background: pct === 100 ? '#22c55e' : theme.accent }} />
                        </div>
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>{s.matched_lines}/{s.total_lines}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}><Badge variant={STMT_BADGE[s.status] ?? 'neutral'}>{s.status.replace('_', ' ')}</Badge></td>
                    <td style={{ padding: '10px 14px' }}>
                      <Button variant={s.status === 'reconciled' ? 'ghost' : 'primary'} size="sm"
                        onClick={() => navigate(`/finance/bank/${accountId}/reconcile/${s.id}`)}>
                        {s.status === 'reconciled' ? 'View' : 'Open'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

        {/* New Statement Modal */}
        {showNewStmt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <Card padding="lg" style={{ width: '420px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>New Bank Statement</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowNewStmt(false)}>✕</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Period (YYYY-MM) *</label>
                  <input style={inputStyle} placeholder="2025-12" value={newStmt.period} onChange={e => setNewStmt(f => ({ ...f, period: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Statement Date *</label>
                  <input style={inputStyle} type="date" value={newStmt.statement_date} onChange={e => setNewStmt(f => ({ ...f, statement_date: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Opening Balance</label>
                  <input style={inputStyle} type="number" value={newStmt.opening_balance} onChange={e => setNewStmt(f => ({ ...f, opening_balance: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Closing Balance *</label>
                  <input style={inputStyle} type="number" value={newStmt.closing_balance} onChange={e => setNewStmt(f => ({ ...f, closing_balance: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Notes</label>
                  <input style={inputStyle} value={newStmt.notes} onChange={e => setNewStmt(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <Button variant="ghost" size="sm" onClick={() => setShowNewStmt(false)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={() => void handleCreateStatement()} disabled={creatingStmt || !newStmt.period || !newStmt.statement_date}>
                  {creatingStmt ? 'Creating...' : 'Create & Open'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    )
  }

  // ── Workspace (statementId present) ───────────────────────────────────────
  if (loading) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading reconciliation workspace...</div>
  if (!stmt) return <div style={{ padding: '24px', color: theme.textMuted }}>Statement not found.</div>

  const totalLines   = Number(stmt.total_lines)
  const matchedLines = Number(stmt.matched_lines)
  const reconPct     = totalLines > 0 ? Math.round((matchedLines / totalLines) * 100) : 0
  const isReconciled = stmt.status === 'reconciled'
  const canFinalize  = !isReconciled && totalLines > 0 && matchedLines === totalLines

  return (
    <div style={{ padding: '24px', paddingBottom: selectedBank.size > 0 || selectedGl.size > 0 ? '120px' : '24px' }}>
      {/* Header */}
      <PageHeader
        title={stmt.account_name}
        subtitle={`${stmt.period} · ${stmt.bank_name ?? ''}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/bank/${accountId}`)}>← Statements</Button>
            <Badge variant={STMT_BADGE[stmt.status] ?? 'neutral'}>{stmt.status.replace('_', ' ')}</Badge>
            {!isReconciled && (
              <Button variant="secondary" size="sm" onClick={() => void handleAutoMatch()} disabled={autoMatching}>
                {autoMatching ? 'Matching...' : 'Auto-Match'}
              </Button>
            )}
            {!isReconciled && (
              <Button variant="ghost" size="sm" onClick={() => setShowAddLines(true)}>+ Add Lines</Button>
            )}
            <Button variant="primary" size="sm" onClick={() => void handleFinalize()} disabled={!canFinalize || finalizing}>
              {finalizing ? 'Finalizing...' : 'Finalize'}
            </Button>
          </div>
        }
      />

      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Opening Balance', value: <AmountDisplay amount={stmt.opening_balance} currency={stmt.currency_code} size="sm" /> },
          { label: 'Closing Balance', value: <AmountDisplay amount={stmt.closing_balance} currency={stmt.currency_code} size="sm" /> },
          { label: 'Statement Movement', value: <AmountDisplay amount={stmt.closing_balance - stmt.opening_balance} currency={stmt.currency_code} size="sm" colored /> },
          { label: 'Lines Matched', value: <span style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary }}>{matchedLines}/{totalLines}</span> },
        ].map(({ label, value }) => (
          <Card key={label} padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>{label}</p>
            {value}
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: theme.textMuted }}>Reconciliation Progress</span>
          <span style={{ fontSize: '11px', color: theme.textMuted }}>{reconPct}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: theme.border }}>
          <div style={{ width: `${reconPct}%`, height: '100%', borderRadius: '3px', background: reconPct === 100 ? '#22c55e' : theme.accent, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Main two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Left: Bank Statement Lines */}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
            Bank Statement — {unreconciled.length} unmatched
          </h3>
          <Card padding="none" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            {!stmt.lines.length && (
              <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>
                No lines yet. Click "Add Lines" to enter transactions.
              </div>
            )}
            {stmt.lines.map(line => {
              const isMatched  = line.is_reconciled
              const isSelected = selectedBank.has(line.id)
              const net        = round2(Number(line.credit) - Number(line.debit))
              return (
                <div
                  key={line.id}
                  onClick={() => !isMatched && toggleBank(line.id)}
                  style={{
                    padding: '10px 14px',
                    borderBottom: `1px solid ${theme.border}`,
                    background: isMatched ? theme.bgSurface + '80' : isSelected ? theme.accent + '15' : 'transparent',
                    border: isSelected ? `1px solid ${theme.accent}` : undefined,
                    cursor: isMatched ? 'default' : 'pointer',
                    opacity: isMatched ? 0.65 : 1,
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                        {isMatched && <span style={{ color: '#22c55e', fontSize: '11px' }}>✓</span>}
                        {!isMatched && isSelected && <span style={{ color: theme.accent, fontSize: '11px' }}>●</span>}
                        <span style={{ fontSize: '11px', color: theme.textMuted, fontFamily: 'monospace' }}>{line.transaction_date.slice(0, 10)}</span>
                        {line.reference && <span style={{ fontSize: '10px', color: theme.textMuted }}>{line.reference}</span>}
                      </div>
                      <p style={{ fontSize: '12px', color: theme.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.description}</p>
                      {isMatched && line.matches?.map(m => (
                        <p key={m.id} style={{ fontSize: '10px', color: theme.accent, margin: '2px 0 0' }}>
                          {m.match_type === 'created' ? '⊕' : '⇌'} {m.je_reference ?? m.je_description}
                        </p>
                      ))}
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: net >= 0 ? '#22c55e' : theme.danger ?? '#ef4444', margin: 0, fontFamily: 'monospace' }}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString()}
                      </p>
                      {isMatched && (
                        <button
                          onClick={e => { e.stopPropagation(); void handleUnmatch(line.id) }}
                          style={{ fontSize: '10px', color: theme.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginTop: '2px' }}
                        >
                          × unmatch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>

        {/* Right: GL Entries */}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '8px' }}>
            GL Entries — {glEntries.length} unmatched
          </h3>
          {!stmt.gl_account_id && (
            <div style={{ background: theme.warning + '20', border: `1px solid ${theme.warning}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', fontSize: '12px', color: theme.textPrimary }}>
              No GL account linked to this bank account — GL entries cannot be loaded.
            </div>
          )}
          <Card padding="none" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            {!glEntries.length && stmt.gl_account_id && (
              <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>
                No unmatched GL entries found for this period.
              </div>
            )}
            {glEntries.map(entry => {
              const isSelected = selectedGl.has(entry.id)
              const net        = round2(Number(entry.debit) - Number(entry.credit))
              return (
                <div
                  key={entry.id}
                  onClick={() => !isReconciled && toggleGl(entry.id)}
                  style={{
                    padding: '10px 14px',
                    borderBottom: `1px solid ${theme.border}`,
                    background: isSelected ? theme.accent + '15' : 'transparent',
                    border: isSelected ? `1px solid ${theme.accent}` : undefined,
                    cursor: isReconciled ? 'default' : 'pointer',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                        {isSelected && <span style={{ color: theme.accent, fontSize: '11px' }}>●</span>}
                        <span style={{ fontSize: '11px', color: theme.textMuted, fontFamily: 'monospace' }}>{entry.entry_date.slice(0, 10)}</span>
                        <span style={{ fontSize: '10px', color: theme.accent, fontFamily: 'monospace' }}>{entry.reference}</span>
                      </div>
                      <p style={{ fontSize: '12px', color: theme.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.line_description || entry.description}
                      </p>
                      <p style={{ fontSize: '10px', color: theme.textMuted, margin: '2px 0 0' }}>{entry.source_type?.replace('_', ' ')}</p>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: net >= 0 ? '#22c55e' : theme.danger ?? '#ef4444', margin: 0, fontFamily: 'monospace' }}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString()}
                      </p>
                      <p style={{ fontSize: '10px', color: theme.textMuted, margin: '2px 0 0' }}>
                        {Number(entry.debit) > 0 ? `DR ${Number(entry.debit).toLocaleString()}` : `CR ${Number(entry.credit).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>
      </div>

      {/* Sticky Match Panel */}
      {(selectedBank.size > 0 || selectedGl.size > 0) && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: theme.bgCanvas, borderTop: `2px solid ${theme.border}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 100,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>
              Bank: <strong>{selectedBank.size}</strong> selected
              {selectedBank.size > 0 && <span style={{ marginLeft: '6px', fontFamily: 'monospace', color: selectedBankNet >= 0 ? '#22c55e' : '#ef4444' }}>
                ({selectedBankNet >= 0 ? '+' : ''}{selectedBankNet.toLocaleString()})
              </span>}
            </span>
            <span style={{ margin: '0 16px', color: theme.border }}>|</span>
            <span style={{ fontSize: '12px', color: theme.textSecondary }}>
              GL: <strong>{selectedGl.size}</strong> selected
              {selectedGl.size > 0 && <span style={{ marginLeft: '6px', fontFamily: 'monospace', color: selectedGlNet >= 0 ? '#22c55e' : '#ef4444' }}>
                ({selectedGlNet >= 0 ? '+' : ''}{selectedGlNet.toLocaleString()})
              </span>}
            </span>
            {(selectedBank.size > 0 && selectedGl.size > 0) && (
              <>
                <span style={{ margin: '0 16px', color: theme.border }}>|</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: matchDiff === 0 ? '#22c55e' : '#ef4444' }}>
                  Difference: {matchDiff === 0 ? '0.00 ✓' : matchDiff.toLocaleString()}
                </span>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSelectedBank(new Set()); setSelectedGl(new Set()) }}>Clear</Button>
          {canCreate && (
            <Button variant="secondary" size="sm" onClick={openCreateEntry}>Create Journal Entry</Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void handleMatch()} disabled={!canMatch}>
            Confirm Match
          </Button>
        </div>
      )}

      {/* Add Lines Modal */}
      {showAddLines && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="lg" style={{ width: '700px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: theme.textPrimary }}>Add Statement Lines</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddLines(false)}>✕</Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Date *', 'Description *', 'Reference', 'Debit (Out)', 'Credit (In)', 'Balance After', ''].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: theme.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineDrafts.map((line, i) => (
                    <tr key={i}>
                      {(['transaction_date', 'description', 'reference', 'debit', 'credit', 'balance_after'] as const).map(field => (
                        <td key={field} style={{ padding: '4px 4px' }}>
                          <input
                            type={field === 'transaction_date' ? 'date' : ['debit','credit','balance_after'].includes(field) ? 'number' : 'text'}
                            style={{ ...inputStyle, fontSize: '11px', padding: '4px 6px', width: field === 'description' ? '160px' : field === 'transaction_date' ? '120px' : '90px' }}
                            value={line[field]}
                            onChange={e => setLineDrafts(prev => prev.map((l, j) => j === i ? { ...l, [field]: e.target.value } : l))}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '4px 4px' }}>
                        <button onClick={() => setLineDrafts(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLineDrafts(prev => [...prev, { ...emptyLineDraft }])} style={{ marginTop: '8px' }}>+ Add Row</Button>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowAddLines(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleAddLines()} disabled={addingLines}>
                {addingLines ? 'Saving...' : 'Save Lines'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Create Journal Entry Modal */}
      {showCreateEntry && createEntryLine && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="lg" style={{ width: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: theme.textPrimary }}>Create Journal Entry</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateEntry(false)}>✕</Button>
            </div>

            <div style={{ background: theme.bgSurface, borderRadius: '8px', padding: '10px 12px', marginBottom: '16px' }}>
              <p style={{ fontSize: '11px', color: theme.textMuted, margin: '0 0 4px' }}>Bank line</p>
              <p style={{ fontSize: '13px', color: theme.textPrimary, margin: '0 0 2px', fontWeight: 500 }}>{createEntryLine.description}</p>
              <p style={{ fontSize: '12px', color: theme.textSecondary, margin: 0, fontFamily: 'monospace' }}>
                {createEntryLine.transaction_date.slice(0, 10)} · {Number(createEntryLine.credit) > 0
                  ? `Credit +${Number(createEntryLine.credit).toLocaleString()}`
                  : `Debit -${Number(createEntryLine.debit).toLocaleString()}`}
              </p>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Offset GL Account *</label>
              <select style={inputStyle} value={offsetAccountId} onChange={e => setOffsetAccountId(e.target.value)}>
                <option value="">— Select account —</option>
                {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
              </select>
              <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>
                {Number(createEntryLine.credit) > 0
                  ? 'DR Bank / CR this account (e.g. Income, Liability)'
                  : 'DR this account / CR Bank (e.g. Expense, Asset)'}
              </p>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Description</label>
              <input style={inputStyle} value={createEntryDesc} onChange={e => setCreateEntryDesc(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateEntry(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleCreateEntry()} disabled={creatingEntry || !offsetAccountId}>
                {creatingEntry ? 'Creating...' : 'Create & Match'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
