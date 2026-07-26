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

const FILTER_DEFAULTS = { search: '', status: '', source: '', fromDate: '', toDate: '' }
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
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

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'po', label: 'Purchase Order' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'inventory', label: 'Inventory' },
]

export default function JournalsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const currentFilters = { search, status: statusFilter, source: sourceFilter, fromDate, toDate }
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

  const [combineEntries, { loading: combining }] = useMutation(COMBINE_JOURNAL_ENTRIES)

  const entries: JournalEntry[] = data?.journalEntries ?? []
  const filtered = entries.filter((e) => {
    if (!search) return true
    const q = search.toLowerCase()
    return e.reference.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q)
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
          <FilterPresets
            presets={presets}
            onApply={(preset) => {
              const r = resolvePreset(preset)
              setSearch(r.search)
              setStatusFilter(r.status)
              setSourceFilter(r.source)
              setFromDate(r.fromDate)
              setToDate(r.toDate)
            }}
            onSave={(name) => {
              savePreset(name, currentFilters)
            }}
            onDelete={deletePreset}
          />
        </FilterBar>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                <th
                  style={{
                    padding: '8px 12px',
                    width: '40px',
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allDraftsSelected}
                    onChange={toggleSelectAll}
                    title="Select all drafts"
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                {['Reference', 'Date', 'Description', 'Source', 'Debit', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '8px 16px',
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '11px',
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}
                  >
                    No journal entries found
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const isDraft = e.status === 'draft'
                  const isSelected = selectedIds.has(e.id)
                  return (
                    <tr
                      key={e.id}
                      style={{
                        borderBottom: `1px solid ${theme.border}`,
                        background: isSelected ? `${theme.accent}22` : 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(ev) => {
                        if (!isSelected) ev.currentTarget.style.background = theme.bgSurface
                      }}
                      onMouseLeave={(ev) => {
                        ev.currentTarget.style.background = isSelected
                          ? `${theme.accent}22`
                          : 'transparent'
                      }}
                    >
                      <td
                        style={{ padding: '10px 12px' }}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          toggleSelect(e.id, isDraft)
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isDraft}
                          onChange={() => {
                            toggleSelect(e.id, isDraft)
                          }}
                          style={{
                            cursor: isDraft ? 'pointer' : 'not-allowed',
                            opacity: isDraft ? 1 : 0.35,
                          }}
                        />
                      </td>
                      <td
                        style={{ padding: '10px 16px' }}
                        onClick={() => {
                          navigate(`/finance/journals/${e.id}`)
                        }}
                      >
                        <span
                          style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}
                        >
                          {e.reference}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          color: theme.textSecondary,
                          fontSize: '13px',
                        }}
                        onClick={() => {
                          navigate(`/finance/journals/${e.id}`)
                        }}
                      >
                        {e.entry_date}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          color: theme.textSecondary,
                          fontSize: '13px',
                        }}
                        onClick={() => {
                          navigate(`/finance/journals/${e.id}`)
                        }}
                      >
                        {e.description ?? '—'}
                      </td>
                      <td
                        style={{ padding: '10px 16px' }}
                        onClick={() => {
                          navigate(`/finance/journals/${e.id}`)
                        }}
                      >
                        <Badge variant="neutral">{e.source_type ?? 'manual'}</Badge>
                      </td>
                      <td
                        style={{ padding: '10px 16px' }}
                        onClick={() => {
                          navigate(`/finance/journals/${e.id}`)
                        }}
                      >
                        {e.total_debit ? (
                          <AmountDisplay amount={parseFloat(e.total_debit)} currency="IQD" />
                        ) : (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                      <td
                        style={{ padding: '10px 16px' }}
                        onClick={() => {
                          navigate(`/finance/journals/${e.id}`)
                        }}
                      >
                        <Badge
                          variant={
                            e.status === 'posted'
                              ? 'success'
                              : e.status === 'draft'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {e.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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
