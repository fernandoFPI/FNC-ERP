import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useLazyQuery } from '@apollo/client'
import {
  JOURNAL_ENTRIES_QUERY,
  COMBINE_JOURNAL_ENTRIES,
  JOURNAL_ENTRY_QUERY,
  AUDIT_TRAIL_QUERY,
} from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { Card } from '../../../components/ui/Card'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Modal } from '../../../components/ui/Modal'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import { EntityAttachments } from '../../../components/inventory/EntityAttachments'
import { useToastStore } from '../../../store/toastStore'
import type {
  AuditTrailQuery,
  AuditTrailQueryVariables,
  CombineJournalEntriesMutation,
  CombineJournalEntriesMutationVariables,
  JournalEntriesQuery,
  JournalEntriesQueryVariables,
  JournalEntryQuery,
  JournalEntryQueryVariables,
} from '../../../graphql/generated'

const JE_ICON_PATHS: Record<string, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  'check-circle': (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 17.01" />
    </>
  ),
  'file-text': (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>
  ),
  'rotate-ccw': (
    <>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </>
  ),
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
}

function JEIcon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {JE_ICON_PATHS[name]}
    </svg>
  )
}

const FILTER_DEFAULTS = {
  search: '',
  status: '',
  source: '',
  fromDate: '',
  toDate: '',
  minAmount: '',
  maxAmount: '',
}

interface JournalEntryRow {
  id: string
  reference: string
  entry_date: string
  status: string
  description?: string | null
  source_type?: string | null
  source_id?: string | null
  total_debit?: string | null
  total_credit?: string | null
  created_by_email?: string | null
}

type JournalEntryDetail = NonNullable<JournalEntryQuery['journalEntry']>

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
]

// Every source_type a journal entry can actually be posted with, grouped by
// what kind of money movement it represents rather than colored one-by-one —
// revenue/cash-in (green), expense/cost recognition (amber), money to/from
// employees (blue), reversals (red, deliberately stands out), and internal/
// administrative entries (gray). `blurb` is the small muted subtitle shown
// under the description (mirrors the reference mockup's "Employee expense
// claim" / "Advance payment" style secondary line) — a reversal's own blurb
// is overridden with its real cancel_reason where one was recorded (see
// rowSubtitle below), so this default only ever shows for non-reversal rows.
const SOURCE_META: Record<string, { label: string; variant: BadgeVariant; blurb: string }> = {
  project_invoice: { label: 'Project Invoice', variant: 'success', blurb: 'Client invoice' },
  rental_invoice: { label: 'Rental Invoice', variant: 'success', blurb: 'Rental invoice' },
  invoice_payment: { label: 'Invoice Payment', variant: 'success', blurb: 'Invoice payment received' },

  vendor_invoice: { label: 'Vendor Invoice', variant: 'warning', blurb: 'Vendor invoice' },
  vendor_payment: { label: 'Vendor Payment', variant: 'warning', blurb: 'Vendor payment' },
  payroll_run: { label: 'Payroll', variant: 'warning', blurb: 'Payroll run' },
  depreciation: { label: 'Depreciation', variant: 'warning', blurb: 'Asset depreciation' },
  asset_disposal: { label: 'Asset Disposal', variant: 'warning', blurb: 'Asset disposal' },
  po_completion: { label: 'PO Completion', variant: 'warning', blurb: 'Purchase order completed' },
  manufacturing_order: { label: 'Manufacturing', variant: 'warning', blurb: 'Manufacturing order' },
  mo_completion: { label: 'Manufacturing', variant: 'warning', blurb: 'Manufacturing order completed' },
  retention: { label: 'Retention Held', variant: 'warning', blurb: 'Retention held' },
  retention_release: { label: 'Retention Release', variant: 'warning', blurb: 'Retention released' },
  expense_claim: { label: 'Expense Claim', variant: 'info', blurb: 'Employee expense claim' },

  employee_advance_issuance: { label: 'Advance Issued', variant: 'info', blurb: 'Advance payment' },
  advance_settlement: { label: 'Advance Settled', variant: 'info', blurb: 'Advance settlement' },
  advance_return: { label: 'Advance Returned', variant: 'info', blurb: 'Advance returned' },

  cancellation: { label: 'Reversal', variant: 'danger', blurb: 'Reversal' },

  combined: { label: 'Combined', variant: 'accent', blurb: 'Combined entries' },
  manual: { label: 'Manual', variant: 'neutral', blurb: 'Manual entry' },
  interco: { label: 'Intercompany', variant: 'neutral', blurb: 'Intercompany transaction' },
  interco_transaction: { label: 'Intercompany', variant: 'neutral', blurb: 'Intercompany transaction' },
  bank_entry: { label: 'Bank Entry', variant: 'neutral', blurb: 'Bank entry' },
}

function sourceMeta(sourceType?: string | null): { label: string; variant: BadgeVariant; blurb: string } {
  const key = sourceType ?? 'manual'
  return (
    SOURCE_META[key] ?? {
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      variant: 'neutral',
      blurb: 'Journal entry',
    }
  )
}

// A couple of source_types share a label (manufacturing_order/mo_completion,
// interco/interco_transaction — two code paths posting the same kind of
// entry under different strings, a backend inconsistency of its own). The
// filter dropdown only needs one entry per label; badge coloring above
// still handles every underlying value correctly regardless.
const SOURCE_OPTIONS = Array.from(
  new Map(Object.entries(SOURCE_META).map(([value, meta]) => [meta.label, { value, label: meta.label }])).values(),
)

// A 'posted' entry whose source_type is 'cancellation' IS the reversal
// itself (the thing that voided some other entry) — relabeled "Reversed"
// rather than "Posted" so it reads as what it actually is, same real
// status under the hood (status stays 'posted' in the DB; this is display
// only). A genuinely 'cancelled' entry is the ORIGINAL row that got voided,
// kept separate ("Cancelled", gray) since it's a different fact.
function statusDisplay(entry: { status: string; source_type?: string | null }): {
  label: string
  variant: BadgeVariant
} {
  if (entry.status === 'posted' && entry.source_type === 'cancellation') {
    return { label: 'Reversed', variant: 'warning' }
  }
  if (entry.status === 'posted') return { label: 'Posted', variant: 'success' }
  if (entry.status === 'draft') return { label: 'Draft', variant: 'info' }
  if (entry.status === 'cancelled') return { label: 'Cancelled', variant: 'neutral' }
  return { label: entry.status, variant: 'neutral' }
}

function rowSubtitle(entry: { source_type?: string | null; cancel_reason?: string | null }): string {
  if (entry.source_type === 'cancellation' && entry.cancel_reason?.trim()) {
    // Cleans up the "Void of X: <reason>" convention cancelJournalEntry
    // writes into description — the reason alone reads better as a subtitle.
    return entry.cancel_reason.trim()
  }
  return sourceMeta(entry.source_type).blurb
}

function monthBounds(offsetMonths: number): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(first), to: fmt(last) }
}

function formatDateShort(iso: string): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function sumDebit(entries: JournalEntryRow[], predicate: (e: JournalEntryRow) => boolean): number {
  return entries.filter(predicate).reduce((s, e) => s + (parseFloat(e.total_debit ?? '0') || 0), 0)
}

function trendPct(current: number, previous: number): { pct: number | null; up: boolean } {
  if (previous <= 0) return { pct: null, up: current > 0 }
  const pct = ((current - previous) / previous) * 100
  return { pct: Math.round(pct * 10) / 10, up: pct >= 0 }
}

function initials(label: string | null | undefined): string {
  if (!label) return '?'
  const parts = label.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '').toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? '')
}

export default function JournalsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const currentMonth = useMemo(() => monthBounds(0), [])
  const previousMonth = useMemo(() => monthBounds(-1), [])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [fromDate, setFromDate] = useState(currentMonth.from)
  const [toDate, setToDate] = useState(currentMonth.to)
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDateRange, setShowDateRange] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [sortKey, setSortKey] = useState<'entry_date' | 'total_debit'>('entry_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [panelId, setPanelId] = useState<string | null>(null)
  const [auditOpenFor, setAuditOpenFor] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const currentFilters = { search, status: statusFilter, source: sourceFilter, fromDate, toDate, minAmount, maxAmount }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets('journals', FILTER_DEFAULTS)
  const [showCombineDialog, setShowCombineDialog] = useState(false)
  const [combineDesc, setCombineDesc] = useState('')

  const { data, loading, refetch } = useQuery<JournalEntriesQuery, JournalEntriesQueryVariables>(JOURNAL_ENTRIES_QUERY, {
    variables: { status: statusFilter || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('journal_entry', () => void refetch())

  // Stat cards always reflect the real current/previous calendar month —
  // independent of whatever date range the table below is filtered to, same
  // convention as any "this month vs last month" KPI strip.
  const { data: curMonthData } = useQuery<JournalEntriesQuery, JournalEntriesQueryVariables>(JOURNAL_ENTRIES_QUERY, {
    variables: { fromDate: currentMonth.from, toDate: currentMonth.to },
    fetchPolicy: 'cache-and-network',
  })
  const { data: prevMonthData } = useQuery<JournalEntriesQuery, JournalEntriesQueryVariables>(JOURNAL_ENTRIES_QUERY, {
    variables: { fromDate: previousMonth.from, toDate: previousMonth.to },
    fetchPolicy: 'cache-first',
  })

  const [combineEntries, { loading: combining }] = useMutation<CombineJournalEntriesMutation, CombineJournalEntriesMutationVariables>(COMBINE_JOURNAL_ENTRIES)
  const [fetchDetail, { loading: detailLoading }] = useLazyQuery<JournalEntryQuery, JournalEntryQueryVariables>(JOURNAL_ENTRY_QUERY)
  const [fetchAudit, { data: auditData, loading: auditLoading }] = useLazyQuery<AuditTrailQuery, AuditTrailQueryVariables>(AUDIT_TRAIL_QUERY)
  const [detailCache, setDetailCache] = useState<Partial<Record<string, JournalEntryDetail>>>({})

  function loadDetail(id: string) {
    if (id in detailCache) return
    void fetchDetail({ variables: { id } }).then((r) => {
      const je = r.data?.journalEntry
      if (je) {
        setDetailCache((prev) => ({ ...prev, [id]: je }))
      }
    })
  }

  function selectRow(entry: JournalEntryRow) {
    const willExpand = expandedId !== entry.id
    setExpandedId(willExpand ? entry.id : null)
    setPanelId(willExpand ? entry.id : null)
    if (willExpand) loadDetail(entry.id)
  }

  function openAudit(id: string) {
    setAuditOpenFor(id)
    setOpenMenuId(null)
    void fetchAudit({ variables: { tableName: 'journal_entries', recordId: id } })
  }

  const entries: JournalEntryRow[] = (data?.journalEntries ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const curMonthEntries: JournalEntryRow[] = (curMonthData?.journalEntries ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  const prevMonthEntries: JournalEntryRow[] = (prevMonthData?.journalEntries ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const filtered = entries.filter((e) => {
    if (sourceFilter && e.source_type !== sourceFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !e.reference.toLowerCase().includes(q) &&
        !(e.description ?? '').toLowerCase().includes(q) &&
        !(e.created_by_email ?? '').toLowerCase().includes(q) &&
        !sourceMeta(e.source_type).label.toLowerCase().includes(q)
      ) {
        return false
      }
    }
    const amount = parseFloat(e.total_debit ?? '0')
    if (minAmount && amount < parseFloat(minAmount)) return false
    if (maxAmount && amount > parseFloat(maxAmount)) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'entry_date') return a.entry_date.localeCompare(b.entry_date) * dir
    return ((parseFloat(a.total_debit ?? '0') || 0) - (parseFloat(b.total_debit ?? '0') || 0)) * dir
  })

  function toggleSort(key: 'entry_date' | 'total_debit') {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Stat cards: Total is every entry's debit this month regardless of
  // status; Posted/Draft/Reversed are a breakdown by what actually happened
  // to it — a reversal entry (source_type='cancellation') counts as
  // Reversed even though its own status is 'posted', not double-counted
  // under Posted too. A voided original entry (status='cancelled') still
  // counts toward Total (real volume that moved this month) but isn't its
  // own card — Reversed already covers that side of the story.
  const statTotal = sumDebit(curMonthEntries, () => true)
  const statPosted = sumDebit(curMonthEntries, (e) => e.status === 'posted' && e.source_type !== 'cancellation')
  const statDraft = sumDebit(curMonthEntries, (e) => e.status === 'draft')
  const statReversed = sumDebit(curMonthEntries, (e) => e.source_type === 'cancellation')
  const prevTotal = sumDebit(prevMonthEntries, () => true)
  const prevPosted = sumDebit(prevMonthEntries, (e) => e.status === 'posted' && e.source_type !== 'cancellation')
  const prevDraft = sumDebit(prevMonthEntries, (e) => e.status === 'draft')
  const prevReversed = sumDebit(prevMonthEntries, (e) => e.source_type === 'cancellation')

  function toggleSelect(id: string, isDraft: boolean) {
    if (!isDraft) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const draftIds = sorted.filter((e) => e.status === 'draft').map((e) => e.id)
    if (draftIds.every((id) => selectedIds.has(id))) setSelectedIds(new Set())
    else setSelectedIds(new Set(draftIds))
  }

  async function handleCombine() {
    try {
      const result = await combineEntries({
        variables: { journalIds: Array.from(selectedIds), description: combineDesc.trim() || undefined },
      })
      const ref = result.data?.combineJournalEntries.reference
      addToast({ type: 'success', message: `Journals combined into ${ref ?? 'new entry'}` })
      setSelectedIds(new Set())
      setShowCombineDialog(false)
      setCombineDesc('')
      const newId = result.data?.combineJournalEntries.id
      if (newId) navigate(`/finance/journals/${newId}`)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const draftIds = sorted.filter((e) => e.status === 'draft').map((e) => e.id)
  const allDraftsSelected = draftIds.length > 0 && draftIds.every((id) => selectedIds.has(id))
  const selectedCount = selectedIds.size
  const panelEntry = panelId ? sorted.find((e) => e.id === panelId) ?? null : null
  const panelDetail = panelId ? detailCache[panelId] : undefined

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.borderInput}`,
    borderRadius: '8px',
    padding: '7px 10px',
    fontSize: '12px',
    color: theme.textPrimary,
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '24px', display: 'flex', gap: '20px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: theme.textPrimary }}>Journal Entries</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: theme.textMuted }}>
              Manage and track all journal entries across the system.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {selectedCount >= 2 && (
              <Button variant="secondary" size="sm" onClick={() => { setShowCombineDialog(true) }}>
                Combine {selectedCount} Entries
              </Button>
            )}
            {selectedCount === 1 && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>Select 1 more draft to combine</span>
            )}
            <Button
              data-tour="new-journal-btn"
              variant="primary"
              size="sm"
              onClick={() => { navigate('/finance/journals/new') }}
            >
              + New Entry
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          {(
            [
              { label: 'Total', value: statTotal, prev: prevTotal, color: theme.accent, bg: theme.accentBg, icon: 'layers' },
              { label: 'Posted', value: statPosted, prev: prevPosted, color: theme.success, bg: theme.successBg, icon: 'check-circle' },
              { label: 'Draft', value: statDraft, prev: prevDraft, color: theme.info, bg: theme.infoBg, icon: 'file-text' },
              { label: 'Reversed', value: statReversed, prev: prevReversed, color: theme.warning, bg: theme.warningBg, icon: 'rotate-ccw' },
            ] as const
          ).map((card) => {
            const trend = trendPct(card.value, card.prev)
            return (
              <Card key={card.label} style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: card.bg,
                      color: card.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      flexShrink: 0,
                    }}
                  >
                    <JEIcon name={card.icon} />
                  </div>
                  <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: 500 }}>{card.label}</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>
                  {Math.round(card.value).toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textMuted }}>IQD</span>
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px', color: trend.pct === null ? theme.textMuted : trend.up ? theme.success : theme.danger }}>
                  {trend.pct === null ? 'No prior data' : `${trend.up ? '↑' : '↓'} ${Math.abs(trend.pct)}% vs last month`}
                </div>
              </Card>
            )
          })}
        </div>

        <Card style={{ padding: '16px 16px 0' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', paddingBottom: '14px' }}>
            <div style={{ position: 'relative', flex: '1 1 280px', minWidth: '220px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, display: 'flex' }}>
                <JEIcon name="search" size={14} />
              </span>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value) }}
                placeholder="Search by reference, description, employee, source, amount…"
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', padding: '8px 60px 8px 30px' }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '10px',
                  color: theme.textMuted,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '4px',
                  padding: '1px 5px',
                }}
              >
                ⌘K
              </span>
            </div>
            <div style={{ width: '150px' }}>
              <Select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value) }}
                options={[{ value: '', label: 'All Status' }, ...STATUS_OPTIONS]}
              />
            </div>
            <div style={{ width: '170px' }}>
              <Select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value) }}
                options={[{ value: '', label: 'All Source' }, ...SOURCE_OPTIONS]}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setShowDateRange((v) => !v) }}
                style={{ ...inputStyle, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}><JEIcon name="calendar" size={14} /></span>
                {fromDate ? formatDateShort(fromDate) : 'From'} – {toDate ? formatDateShort(toDate) : 'To'}
              </button>
              {showDateRange && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    zIndex: 20,
                    background: theme.bgSurface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    padding: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-end',
                  }}
                >
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>
                    From
                    <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value) }} style={{ ...inputStyle, display: 'block', marginTop: '4px' }} />
                  </label>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>
                    To
                    <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value) }} style={{ ...inputStyle, display: 'block', marginTop: '4px' }} />
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => { setShowDateRange(false) }}>Done</Button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Button variant="secondary" size="sm" onClick={() => { setShowAdvanced((v) => !v) }}>
<span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}><JEIcon name="sliders" size={14} /></span>Advanced Filters
              </Button>
              {showAdvanced && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 20,
                    background: theme.bgSurface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    width: '280px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Amount Range
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
                    <input type="number" value={minAmount} onChange={(e) => { setMinAmount(e.target.value) }} placeholder="Min" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                    <span style={{ color: theme.textMuted }}>–</span>
                    <input type="number" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value) }} placeholder="Max" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
                    <FilterPresets
                      presets={presets}
                      onApply={(preset) => {
                        const r = resolvePreset(preset)
                        setSearch(r.search); setStatusFilter(r.status); setSourceFilter(r.source)
                        setFromDate(r.fromDate); setToDate(r.toDate); setMinAmount(r.minAmount); setMaxAmount(r.maxAmount)
                      }}
                      onSave={(name) => { savePreset(name, currentFilters) }}
                      onDelete={deletePreset}
                    />
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>{sorted.length} entries</span>
              <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => { setViewMode('list') }}
                  title="List view"
                  style={{
                    padding: '6px 9px',
                    background: viewMode === 'list' ? theme.accentBg : 'transparent',
                    color: viewMode === 'list' ? theme.accent : theme.textMuted,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <JEIcon name="list" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { setViewMode('grid') }}
                  title="Grid view"
                  style={{
                    padding: '6px 9px',
                    background: viewMode === 'grid' ? theme.accentBg : 'transparent',
                    color: viewMode === 'grid' ? theme.accent : theme.textMuted,
                    border: 'none',
                    borderLeft: `1px solid ${theme.border}`,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <JEIcon name="grid" size={14} />
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '14px',
                padding: '4px 0 20px',
              }}
            >
              {sorted.length === 0 && !loading && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: theme.textMuted, fontSize: '13px' }}>
                  No journal entries found
                </div>
              )}
              {sorted.map((e) => {
                const sd = statusDisplay(e)
                const meta = sourceMeta(e.source_type)
                return (
                  <Card
                    key={e.id}
                    style={{ padding: '14px', cursor: 'pointer', border: `1px solid ${theme.border}` }}
                    onClick={() => { navigate(`/finance/journals/${e.id}`) }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '12px' }}>{e.reference}</span>
                      <Badge variant={sd.variant} dot>{sd.label}</Badge>
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textPrimary, marginBottom: '2px' }}>{e.description ?? '—'}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px' }}>{rowSubtitle(e)}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <AmountDisplay amount={parseFloat(e.total_debit ?? '0')} currency="IQD" size="sm" />
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>{formatDateShort(e.entry_date)}</div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px', width: '34px' }}>
                      <input type="checkbox" checked={allDraftsSelected} onChange={toggleSelectAll} title="Select all drafts" style={{ cursor: 'pointer' }} />
                    </th>
                    <th style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500 }}>Reference</th>
                    <th
                      style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => { toggleSort('entry_date') }}
                    >
                      Date {sortKey === 'entry_date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500 }}>Description</th>
                    <th style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500 }}>Source</th>
                    <th style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500, textAlign: 'right' }}>Debit</th>
                    <th style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500, textAlign: 'right' }}>Credit</th>
                    <th
                      style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => { toggleSort('total_debit') }}
                    >
                      Amount {sortKey === 'total_debit' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th style={{ padding: '8px 10px', color: theme.textMuted, fontWeight: 500 }}>Status</th>
                    <th style={{ width: '32px' }} />
                  </tr>
                </thead>
                <tbody>
                  {loading && sorted.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}>Loading…</td></tr>
                  )}
                  {!loading && sorted.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}>No journal entries found</td></tr>
                  )}
                  {sorted.map((e) => {
                    const sd = statusDisplay(e)
                    const meta = sourceMeta(e.source_type)
                    const isDraft = e.status === 'draft'
                    const isExpanded = expandedId === e.id
                    const detail = detailCache[e.id]
                    return (
                      <Fragment key={e.id}>
                        <tr
                          onClick={() => { selectRow(e) }}
                          style={{
                            borderBottom: `1px solid ${theme.border}`,
                            background: isExpanded ? `${theme.accent}14` : undefined,
                            cursor: 'pointer',
                          }}
                        >
                          <td style={{ padding: '10px 6px' }} onClick={(ev) => { ev.stopPropagation() }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(e.id)}
                              disabled={!isDraft}
                              onChange={() => { toggleSelect(e.id, isDraft) }}
                              style={{ cursor: isDraft ? 'pointer' : 'not-allowed', opacity: isDraft ? 1 : 0.35 }}
                            />
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '12px' }}>{e.reference}</span>
                          </td>
                          <td style={{ padding: '10px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>{formatDateShort(e.entry_date)}</td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ color: theme.textPrimary }}>{e.description ?? '—'}</div>
                            <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '1px' }}>{rowSubtitle(e)}</div>
                          </td>
                          <td style={{ padding: '10px' }}><Badge variant={meta.variant}>{meta.label}</Badge></td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            {e.total_debit ? <AmountDisplay amount={parseFloat(e.total_debit)} currency="IQD" size="sm" /> : <span style={{ color: theme.textMuted }}>—</span>}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            {e.total_credit ? <AmountDisplay amount={parseFloat(e.total_credit)} currency="IQD" size="sm" /> : <span style={{ color: theme.textMuted }}>—</span>}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                            {e.total_debit ? <AmountDisplay amount={parseFloat(e.total_debit)} currency="IQD" size="sm" /> : <span style={{ color: theme.textMuted }}>—</span>}
                          </td>
                          <td style={{ padding: '10px' }}><Badge variant={sd.variant} dot>{sd.label}</Badge></td>
                          <td style={{ padding: '10px', position: 'relative' }} onClick={(ev) => { ev.stopPropagation() }}>
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(openMenuId === e.id ? null : e.id) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '14px', padding: '2px 6px' }}
                            >
                              ⋮
                            </button>
                            {openMenuId === e.id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: '8px',
                                  top: 'calc(100% + 2px)',
                                  zIndex: 30,
                                  background: theme.bgSurface,
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: '8px',
                                  boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                                  minWidth: '170px',
                                  overflow: 'hidden',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setOpenMenuId(null); navigate(`/finance/journals/${e.id}`) }}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textPrimary, fontSize: '12px' }}
                                >
                                  View Full Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { openAudit(e.id) }}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textPrimary, fontSize: '12px', borderTop: `1px solid ${theme.border}` }}
                                >
                                  View Audit Trail
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${e.id}-expanded`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td colSpan={10} style={{ padding: 0, background: theme.bgCanvas }}>
                              <div style={{ display: 'flex', gap: '16px', padding: '16px', flexWrap: 'wrap' }}>
                                <div style={{ flex: '2 1 360px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                    Journal Lines
                                  </div>
                                  {!detail && detailLoading ? (
                                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>Loading…</div>
                                  ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                      <thead>
                                        <tr style={{ color: theme.textMuted }}>
                                          <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Account</th>
                                          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                                          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Debit</th>
                                          <th style={{ textAlign: 'right', padding: '4px 0' }}>Credit</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(detail?.lines ?? []).map((l) => (
                                          <tr key={l.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                                            <td style={{ padding: '6px 8px 6px 0', color: theme.textPrimary }}>
                                              {l.account_code ? `${l.account_code} - ` : ''}{l.account_name ?? '—'}
                                            </td>
                                            <td style={{ padding: '6px 8px', color: theme.textSecondary }}>{l.description ?? '—'}</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right', color: theme.textPrimary }}>
                                              {parseFloat(l.debit) > 0 ? parseFloat(l.debit).toLocaleString() : '—'}
                                            </td>
                                            <td style={{ padding: '6px 0', textAlign: 'right', color: theme.textPrimary }}>
                                              {parseFloat(l.credit) > 0 ? parseFloat(l.credit).toLocaleString() : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}

                                  <div style={{ marginTop: '16px' }}>
                                    <EntityAttachments
                                      entityType="journal_entry"
                                      entityId={e.id}
                                      title="Attachments"
                                      emptyMessage="No attachments"
                                      recordLabel="this journal entry"
                                    />
                                  </div>
                                </div>
                                <div style={{ flex: '1 1 260px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                    Details
                                  </div>
                                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                    <tbody>
                                      {([
                                        ['Reference', e.reference],
                                        ['Date', formatDateShort(e.entry_date)],
                                        ['Created By', detail?.created_by_email ?? e.created_by_email ?? '—'],
                                        ['Source', meta.label],
                                        ['Status', sd.label],
                                        ['Description', e.description ?? '—'],
                                        ['Notes', detail?.cancel_reason ?? '—'],
                                      ] as [string, string][]).map(([k, v]) => (
                                        <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                          <td style={{ padding: '5px 0', color: theme.textMuted, width: '38%' }}>{k}</td>
                                          <td style={{ padding: '5px 0', color: theme.textPrimary }}>{v}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    style={{ marginTop: '10px' }}
                                    onClick={() => { navigate(`/finance/journals/${e.id}`) }}
                                  >
                                    View Full Details →
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Entry Details side panel */}
      {panelEntry && (
        <div style={{ width: '320px', flexShrink: 0 }}>
          <Card style={{ padding: '18px', position: 'sticky', top: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary, fontFamily: 'monospace' }}>{panelEntry.reference}</div>
              <button
                type="button"
                onClick={() => { setPanelId(null); setExpandedId(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '16px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '12px' }}>{formatDateShort(panelEntry.entry_date)}</div>

            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Source</div>
            <Badge variant={sourceMeta(panelEntry.source_type).variant}>{sourceMeta(panelEntry.source_type).label}</Badge>

            <div style={{ fontSize: '11px', color: theme.textMuted, margin: '12px 0 4px' }}>Description</div>
            <div style={{ fontSize: '12px', color: theme.textPrimary }}>{panelEntry.description ?? '—'}</div>

            <div style={{ fontSize: '11px', color: theme.textMuted, margin: '12px 0 6px' }}>Created By</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: theme.accentBg, color: theme.accent, fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {initials(panelDetail?.created_by_email ?? panelEntry.created_by_email)}
              </div>
              <span style={{ fontSize: '12px', color: theme.textPrimary }}>{panelDetail?.created_by_email ?? panelEntry.created_by_email ?? '—'}</span>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>
              Journal Lines
            </div>
            {detailLoading && !panelDetail ? (
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(panelDetail?.lines ?? []).map((l) => (
                  <div key={l.id} style={{ fontSize: '12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px' }}>
                    <div style={{ color: theme.textPrimary }}>{l.account_code ? `${l.account_code} - ` : ''}{l.account_name ?? '—'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted }}>
                      <span>{l.description ?? '—'}</span>
                      <span style={{ color: theme.textPrimary, fontWeight: 600 }}>
                        {parseFloat(l.debit) > 0 ? 'DR' : 'CR'} {Math.max(parseFloat(l.debit), parseFloat(l.credit)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>
              Meta Information
            </div>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <tbody>
                {([
                  ['Reference', panelEntry.reference],
                  ['Company', panelDetail?.company_name ?? '—'],
                  ['Currency', panelDetail?.lines?.[0]?.currency_code ?? 'IQD'],
                  ['Notes', panelDetail?.cancel_reason ?? '—'],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '5px 0', color: theme.textMuted, width: '38%' }}>{k}</td>
                    <td style={{ padding: '5px 0', color: theme.textPrimary }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Button variant="secondary" size="sm" style={{ marginTop: '14px', width: '100%' }} onClick={() => { openAudit(panelEntry.id) }}>
              View Audit Trail
            </Button>
          </Card>
        </div>
      )}

      {/* Audit Trail modal */}
      <Modal
        open={!!auditOpenFor}
        onClose={() => { setAuditOpenFor(null) }}
        title="Audit Trail"
        size="md"
      >
        {auditLoading && <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>}
        {!auditLoading && (auditData?.auditTrail ?? []).length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>No audit trail entries recorded for this entry.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(auditData?.auditTrail ?? []).map((a) => (
            <div key={a.id} style={{ borderLeft: `2px solid ${theme.accent}`, paddingLeft: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>{a.action}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                {a.userEmail ?? 'Unknown user'} · {new Date(a.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {showCombineDialog && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setShowCombineDialog(false) }}
        >
          <div
            style={{ background: theme.bgCanvas, borderRadius: '12px', padding: '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: `1px solid ${theme.border}` }}
            onClick={(ev) => { ev.stopPropagation() }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: theme.textPrimary, fontWeight: 600 }}>Combine {selectedCount} Journal Entries</h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: theme.textSecondary, lineHeight: '1.5' }}>
              All journal lines and PO links from the selected draft entries will be merged into one new draft. The original entries will be deleted.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Description (optional)
              </label>
              <input
                type="text"
                value={combineDesc}
                onChange={(e) => { setCombineDesc(e.target.value) }}
                placeholder="Leave blank to auto-generate"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '13px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => { setShowCombineDialog(false) }}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleCombine()} loading={combining}>Combine Entries</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
