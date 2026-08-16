import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { JOURNAL_ENTRIES_QUERY, COMBINE_JOURNAL_ENTRIES } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { FilterBar } from '../../../components/ui/FilterBar'
import { FilterPresets } from '../../../components/ui/FilterPresets'
import { useFilterPresets } from '../../../hooks/useFilterPresets'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

const FILTER_DEFAULTS = {
  search: '',
  status: '',
  source: '',
  fromDate: '',
  toDate: '',
  minAmount: '',
  maxAmount: '',
}
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'

interface JournalEntry {
  id: string
  reference: string
  entry_date: string
  status: string
  description?: string
  source_type?: string
  total_debit?: string
  total_credit?: string
  created_by_email?: string
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
]

// Every source_type a journal entry can actually be posted with, grouped by
// what kind of money movement it represents rather than colored one-by-one —
// revenue/cash-in (green), expense/cost recognition (amber), money to/from
// employees (blue), reversals (red, deliberately stands out), and internal/
// administrative entries (gray). Keeps the palette restrained instead of
// assigning a distinct color per exact backend string.
const SOURCE_META: Record<string, { label: string; variant: BadgeVariant }> = {
  project_invoice: { label: 'Project Invoice', variant: 'success' },
  rental_invoice: { label: 'Rental Invoice', variant: 'success' },
  invoice_payment: { label: 'Invoice Payment', variant: 'success' },

  vendor_invoice: { label: 'Vendor Invoice', variant: 'warning' },
  vendor_payment: { label: 'Vendor Payment', variant: 'warning' },
  payroll_run: { label: 'Payroll', variant: 'warning' },
  depreciation: { label: 'Depreciation', variant: 'warning' },
  asset_disposal: { label: 'Asset Disposal', variant: 'warning' },
  po_completion: { label: 'PO Completion', variant: 'warning' },
  manufacturing_order: { label: 'Manufacturing', variant: 'warning' },
  mo_completion: { label: 'Manufacturing', variant: 'warning' },
  retention: { label: 'Retention Held', variant: 'warning' },
  retention_release: { label: 'Retention Release', variant: 'warning' },

  employee_advance_issuance: { label: 'Advance Issued', variant: 'info' },
  advance_settlement: { label: 'Advance Settled', variant: 'info' },
  advance_return: { label: 'Advance Returned', variant: 'info' },

  cancellation: { label: 'Reversal', variant: 'danger' },

  combined: { label: 'Combined', variant: 'accent' },
  manual: { label: 'Manual', variant: 'neutral' },
  interco: { label: 'Intercompany', variant: 'neutral' },
  interco_transaction: { label: 'Intercompany', variant: 'neutral' },
  bank_entry: { label: 'Bank Entry', variant: 'neutral' },
}

function sourceMeta(sourceType?: string): { label: string; variant: BadgeVariant } {
  const key = sourceType ?? 'manual'
  return (
    SOURCE_META[key] ?? {
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      variant: 'neutral',
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

export default function JournalsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const currentFilters = {
    search,
    status: statusFilter,
    source: sourceFilter,
    fromDate,
    toDate,
    minAmount,
    maxAmount,
  }
  const { presets, savePreset, deletePreset, resolvePreset } = useFilterPresets(
    'journals',
    FILTER_DEFAULTS,
  )
  const [showCombineDialog, setShowCombineDialog] = useState(false)
  const [combineDesc, setCombineDesc] = useState('')

  const { data, loading, refetch } = useQuery(JOURNAL_ENTRIES_QUERY, {
    variables: {
      status: statusFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      sourceType: sourceFilter || undefined,
    },
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('journal_entry', () => void refetch())

  const [combineEntries, { loading: combining }] = useMutation(COMBINE_JOURNAL_ENTRIES)

  const entries: JournalEntry[] = data?.journalEntries ?? []
  const filtered = entries.filter((e) => {
    if (search) {
      const q = search.toLowerCase()
      if (!e.reference.toLowerCase().includes(q) && !(e.description ?? '').toLowerCase().includes(q)) {
        return false
      }
    }
    const amount = parseFloat(e.total_debit ?? '0')
    if (minAmount && amount < parseFloat(minAmount)) return false
    if (maxAmount && amount > parseFloat(maxAmount)) return false
    return true
  })

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
    const draftIds = filtered.filter((e) => e.status === 'draft').map((e) => e.id)
    if (draftIds.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(draftIds))
    }
  }

  async function handleCombine() {
    try {
      const result = await combineEntries({
        variables: {
          journalIds: Array.from(selectedIds),
          description: combineDesc.trim() || undefined,
        },
      })
      const ref = result.data?.combineJournalEntries?.reference as string | undefined
      addToast({ type: 'success', message: `Journals combined into ${ref ?? 'new entry'}` })
      setSelectedIds(new Set())
      setShowCombineDialog(false)
      setCombineDesc('')
      const newId = result.data?.combineJournalEntries?.id as string | undefined
      if (newId) navigate(`/finance/journals/${newId}`)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const draftIds = filtered.filter((e) => e.status === 'draft').map((e) => e.id)
  const allDraftsSelected = draftIds.length > 0 && draftIds.every((id) => selectedIds.has(id))
  const selectedCount = selectedIds.size

  const columns: Column<JournalEntry>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      mobileAction: true,
      renderHeader: () => (
        <input
          type="checkbox"
          checked={allDraftsSelected}
          onChange={toggleSelectAll}
          title="Select all drafts"
          style={{ cursor: 'pointer' }}
        />
      ),
      render: (e) => {
        const isDraft = e.status === 'draft'
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(e.id)}
            disabled={!isDraft}
            onClick={(ev) => {
              ev.stopPropagation()
            }}
            onChange={() => {
              toggleSelect(e.id, isDraft)
            }}
            style={{ cursor: isDraft ? 'pointer' : 'not-allowed', opacity: isDraft ? 1 : 0.35 }}
          />
        )
      },
    },
    {
      key: 'reference',
      header: 'Reference',
      mobilePrimary: true,
      render: (e) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {e.reference}
        </span>
      ),
    },
    {
      key: 'entry_date',
      header: 'Date',
      mobileSecondary: true,
      render: (e) => e.entry_date,
    },
    {
      key: 'description',
      header: 'Description',
      render: (e) => e.description ?? '—',
    },
    {
      key: 'source_type',
      header: 'Source',
      render: (e) => {
        const meta = sourceMeta(e.source_type)
        return <Badge variant={meta.variant}>{meta.label}</Badge>
      },
    },
    {
      key: 'total_debit',
      header: 'Debit',
      render: (e) =>
        e.total_debit ? (
          <AmountDisplay amount={parseFloat(e.total_debit)} currency="IQD" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <Badge
          variant={e.status === 'posted' ? 'success' : e.status === 'draft' ? 'warning' : 'neutral'}
        >
          {e.status}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Journal Entries"
        subtitle={`${filtered.length} entries`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {selectedCount >= 2 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowCombineDialog(true)
                }}
              >
                Combine {selectedCount} Entries
              </Button>
            )}
            {selectedCount === 1 && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                Select 1 more draft to combine
              </span>
            )}
            <Button
              data-tour="new-journal-btn"
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/finance/journals/new')
              }}
            >
              New Entry
            </Button>
          </div>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              options: STATUS_OPTIONS,
              onChange: (v) => {
                setStatusFilter(v)
              },
            },
            {
              key: 'source',
              label: 'Source',
              value: sourceFilter,
              options: SOURCE_OPTIONS,
              onChange: (v) => {
                setSourceFilter(v)
              },
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          resultCount={filtered.length}
          onRefresh={() => refetch()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
              Amount
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value)
              }}
              placeholder="Min"
              style={{
                width: '90px',
                background: theme.bgSurface,
                border: `1px solid ${theme.borderInput}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: '12px', color: theme.textMuted }}>–</span>
            <input
              type="number"
              inputMode="decimal"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value)
              }}
              placeholder="Max"
              style={{
                width: '90px',
                background: theme.bgSurface,
                border: `1px solid ${theme.borderInput}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status)
              setSourceFilter(r.source)
              setFromDate(r.fromDate)
              setToDate(r.toDate)
              setMinAmount(r.minAmount)
              setMaxAmount(r.maxAmount)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>

        <Table
          columns={columns}
          data={filtered}
          rowKey="id"
          loading={loading && filtered.length === 0}
          emptyMessage="No journal entries found"
          onRowClick={(e) => {
            navigate(`/finance/journals/${e.id}`)
          }}
          getRowStyle={(e) => (selectedIds.has(e.id) ? { background: `${theme.accent}22` } : {})}
        />
      </Card>

      {showCombineDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setShowCombineDialog(false)
          }}
        >
          <div
            style={{
              background: theme.bgCanvas,
              borderRadius: '12px',
              padding: '28px',
              width: '460px',
              maxWidth: '95vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: `1px solid ${theme.border}`,
            }}
            onClick={(ev) => {
              ev.stopPropagation()
            }}
          >
            <h3
              style={{
                margin: '0 0 8px',
                fontSize: '16px',
                color: theme.textPrimary,
                fontWeight: 600,
              }}
            >
              Combine {selectedCount} Journal Entries
            </h3>
            <p
              style={{
                margin: '0 0 20px',
                fontSize: '13px',
                color: theme.textSecondary,
                lineHeight: '1.5',
              }}
            >
              All journal lines and PO links from the selected draft entries will be merged into one
              new draft. The original entries will be deleted.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: theme.textMuted,
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Description (optional)
              </label>
              <input
                type="text"
                value={combineDesc}
                onChange={(e) => {
                  setCombineDesc(e.target.value)
                }}
                placeholder="Leave blank to auto-generate"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCombineDialog(false)
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCombine} loading={combining}>
                Combine Entries
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
