import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import {
  CREATE_JOURNAL_ENTRY,
  JOURNAL_ENTRIES_QUERY,
  ACCOUNTS_QUERY,
} from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { useToastStore } from '../../../store/toastStore'

interface JournalLine {
  account_id: string
  description: string
  currency_code: string
  debit: string
  credit: string
}

const emptyLine = (): JournalLine => ({
  account_id: '',
  description: '',
  currency_code: 'IQD',
  debit: '0',
  credit: '0',
})

export default function JournalForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()])

  const { data: accountsData } = useQuery(ACCOUNTS_QUERY, { variables: {} })
  const [createEntry, { loading }] = useMutation(CREATE_JOURNAL_ENTRY)

  const accounts = accountsData?.accounts ?? []
  // Header accounts exist for grouping/reporting only — they can't receive
  // journal lines (enforced by the trg_journal_lines_postable DB trigger), so
  // exclude them here rather than let the picker offer something the submit
  // would reject.
  const accountOptions = accounts
    .filter((a: { is_postable?: boolean }) => a.is_postable !== false)
    .map((a: { id: string; code: string; name: string }) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
    }))

  const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit || '0'), 0)
  const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit || '0'), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001

  function updateLine(i: number, field: keyof JournalLine, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(i: number) {
    if (lines.length <= 2) return
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isBalanced) {
      addToast({ type: 'error', message: 'Entry must be balanced (debits = credits)' })
      return
    }
    try {
      const input = {
        entry_date: entryDate,
        description: description || undefined,
        source_type: 'manual',
        lines: lines
          .filter((l) => l.account_id)
          .map((l) => ({
            account_id: l.account_id,
            description: l.description || undefined,
            currency_code: l.currency_code,
            debit: parseFloat(l.debit || '0'),
            credit: parseFloat(l.credit || '0'),
            fx_rate: 1,
          })),
      }
      await createEntry({
        variables: { input },
        refetchQueries: [{ query: JOURNAL_ENTRIES_QUERY, variables: {} }],
      })
      addToast({ type: 'success', message: 'Journal entry created' })
      navigate('/finance/journals')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const lineFields: LineItemField<JournalLine>[] = [
    {
      key: 'account_id',
      label: 'Account',
      render: (line, i) => (
        <Select
          value={line.account_id}
          onChange={(e) => {
            updateLine(i, 'account_id', e.target.value)
          }}
        >
          <option value="">Select account…</option>
          {accountOptions.map((o: { value: string; label: string }) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      width: '160px',
      render: (line, i) => (
        <Input
          value={line.description}
          onChange={(e) => {
            updateLine(i, 'description', e.target.value)
          }}
          placeholder="Description"
        />
      ),
    },
    {
      key: 'debit',
      label: 'Debit',
      width: '120px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.debit}
          onChange={(e) => {
            updateLine(i, 'debit', e.target.value)
          }}
        />
      ),
    },
    {
      key: 'credit',
      label: 'Credit',
      width: '120px',
      render: (line, i) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.credit}
          onChange={(e) => {
            updateLine(i, 'credit', e.target.value)
          }}
        />
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title="New Journal Entry"
        subtitle="Create a manual journal entry"
        backPath="/finance/journals"
      />

      <form onSubmit={handleSubmit}>
        <Card style={{ marginTop: '20px', padding: '20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '200px 1fr',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div data-tour="journal-entry-date">
              <Input
                label="Entry Date"
                type="date"
                value={entryDate}
                onChange={(e) => {
                  setEntryDate(e.target.value)
                }}
                required
              />
            </div>
            <div data-tour="journal-description">
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                }}
                rows={2}
                placeholder="Purpose of this entry…"
              />
            </div>
          </div>

          {/* Lines table */}
          <div data-tour="journal-lines-table">
            <LineItemEditor
              fields={lineFields}
              rows={lines}
              onRemoveRow={(i) => {
                removeLine(i)
              }}
              footerRow={{
                description: (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>
                    Totals
                  </span>
                ),
                debit: <AmountDisplay amount={totalDebit} currency="IQD" />,
                credit: <AmountDisplay amount={totalCredit} currency="IQD" />,
              }}
            />
          </div>

          {!isBalanced && totalDebit + totalCredit > 0 && (
            <div style={{ color: theme.danger, fontSize: '13px', marginTop: '8px' }}>
              Entry is not balanced. Difference:{' '}
              {Math.abs(totalDebit - totalCredit).toLocaleString()}
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <Button
              data-tour="add-line-btn"
              variant="ghost"
              size="sm"
              type="button"
              onClick={addLine}
            >
              + Add Line
            </Button>
          </div>
        </Card>

        <div
          style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}
        >
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              navigate('/finance/journals')
            }}
          >
            Cancel
          </Button>
          <Button
            data-tour="create-entry-btn"
            variant="primary"
            type="submit"
            loading={loading}
            disabled={!isBalanced}
          >
            Create Entry
          </Button>
        </div>
      </form>
    </div>
  )
}
