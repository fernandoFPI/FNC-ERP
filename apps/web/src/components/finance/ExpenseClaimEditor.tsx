import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { api } from '../../lib/axios'
import { lineFlagState, type LineFlagFields } from '../../lib/expenseClaimFlags'

export interface EditableClaimLine extends LineFlagFields {
  id: string
  line_number: number
  expense_date: string
  category_id: string | null
  category_name?: string | null
  description: string | null
  amount: number | string
}

export interface EditableClaim {
  id: string
  // 'rejected' (an approver sent it back) or 'draft' (new, or sent back from audit). Decides the
  // wording of the resubmit button; the server decides whether the caller may edit at all.
  status: string
  description: string | null
  notes: string | null
  currency_code: string
  lines: EditableClaimLine[]
}

interface EditorLine {
  // Stable React key. For a line that already exists it is the line's id, for a new one a random id.
  key: string
  id?: string
  lineNumber?: number
  expense_date: string
  category_id: string
  categoryName: string | null
  description: string
  amount: string
  flagReason: string | null
}

interface CategoryOption {
  id: string
  name: string
}

// One editor for the two states a claim can be fixed in, used on the claim page (people with
// Expense Claims access) and in the employee's own popup (everyone else). It saves through
// POST /finance/expense-claims/:id/revise, which updates lines in place by id: a line keeps its
// number, its receipts and its flag across an edit.
export function ExpenseClaimEditor({
  claim,
  onSaved,
  onCancel,
}: {
  claim: EditableClaim
  onSaved: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [description, setDescription] = useState(claim.description ?? '')
  const [notes, setNotes] = useState(claim.notes ?? '')
  const [currency, setCurrency] = useState(claim.currency_code)
  const [lines, setLines] = useState<EditorLine[]>(() =>
    claim.lines.map((l) => ({
      key: l.id,
      id: l.id,
      lineNumber: l.line_number,
      expense_date: l.expense_date.slice(0, 10),
      category_id: l.category_id ?? '',
      categoryName: l.category_name ?? null,
      description: l.description ?? '',
      amount: String(l.amount),
      flagReason: lineFlagState(l) === 'open' ? (l.flag_reason ?? null) : null,
    })),
  )
  const [categories, setCategories] = useState<CategoryOption[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // The self-service picker (names only, no GL detail): people who file claims do not hold
    // finance.expenses.view, which the full category list needs.
    api
      .get<CategoryOption[]>('/finance/expense-claims/categories/mine')
      .then((r) => {
        setCategories(r.data)
      })
      .catch(() => {
        setCategories([])
      })
  }, [])

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '12px',
    color: theme.textPrimary,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted }

  const updateLine = (key: string, patch: Partial<EditorLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        expense_date: new Date().toISOString().slice(0, 10),
        category_id: '',
        categoryName: null,
        description: '',
        amount: '',
        flagReason: null,
      },
    ])
  }
  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function save(resubmit: boolean) {
    if (lines.length === 0) {
      setError(t('fin.expEditor.atLeastOneLine'))
      return
    }
    for (const l of lines) {
      const amount = parseFloat(l.amount)
      // A line that already has a category keeps it without being picked again; a new one needs one.
      const needsCategory = !l.id && !l.category_id
      if (!l.expense_date || isNaN(amount) || amount <= 0 || needsCategory) {
        setError(t('fin.expEditor.everyLineNeeds'))
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await api.post(`/finance/expense-claims/${claim.id}/revise`, {
        description,
        notes,
        currency_code: currency,
        resubmit,
        lines: lines.map((l) => ({
          id: l.id,
          expense_date: l.expense_date,
          category_id: l.category_id || undefined,
          description: l.description,
          amount: parseFloat(l.amount),
        })),
      })
      onSaved()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } }
      setError(apiError.response?.data?.error?.message ?? t('fin.expEditor.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="expense-claim-editor">
      <p
        style={{
          margin: '0 0 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {t('fin.expEditor.title')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={labelStyle} htmlFor="exp-edit-description">
            {t('fin.expEditor.description')}
          </label>
          <input
            id="exp-edit-description"
            style={inputStyle}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
            }}
          />
        </div>
        <div style={{ width: '110px' }}>
          <label style={labelStyle} htmlFor="exp-edit-currency">
            {t('fin.expEditor.currency')}
          </label>
          <input
            id="exp-edit-currency"
            style={inputStyle}
            value={currency}
            maxLength={3}
            onChange={(e) => {
              setCurrency(e.target.value.toUpperCase())
            }}
          />
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <label style={labelStyle} htmlFor="exp-edit-notes">
            {t('fin.expEditor.notes')}
          </label>
          <input
            id="exp-edit-notes"
            style={inputStyle}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
            }}
          />
        </div>
      </div>

      {lines.map((l, i) => (
        <div
          key={l.key}
          data-testid="expense-editor-line"
          style={{
            marginBottom: '10px',
            paddingBottom: '10px',
            borderBottom: `1px solid ${theme.border}`,
            borderInlineStart: l.flagReason ? `4px solid ${theme.danger}` : undefined,
            paddingInlineStart: l.flagReason ? '8px' : undefined,
          }}
        >
          {l.flagReason && (
            <div
              style={{
                fontSize: '12px',
                color: theme.danger,
                marginBottom: '6px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {t('fin.expEditor.flagLabel', { reason: l.flagReason })}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div
              data-testid="expense-editor-line-number"
              style={{
                width: '34px',
                paddingBottom: '8px',
                fontSize: '12px',
                color: theme.textMuted,
                fontVariantNumeric: 'tabular-nums',
              }}
              title={l.id ? undefined : t('fin.expEditor.newLine')}
            >
              {l.lineNumber ?? '+'}
            </div>
            <div style={{ width: '130px' }}>
              <label style={labelStyle} htmlFor={`exp-edit-date-${l.key}`}>
                {t('fin.expEditor.date')}
              </label>
              <input
                id={`exp-edit-date-${l.key}`}
                type="date"
                style={inputStyle}
                value={l.expense_date}
                onChange={(e) => {
                  updateLine(l.key, { expense_date: e.target.value })
                }}
              />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={labelStyle}>{t('fin.expEditor.category')}</label>
              <Select
                value={l.category_id}
                onChange={(e) => {
                  updateLine(l.key, { category_id: e.target.value })
                }}
                options={[
                  {
                    value: '',
                    label:
                      categories === null
                        ? t('fin.expEditor.loadingCategories')
                        : l.id
                          ? `${t('fin.expEditor.keepCategory')}${l.categoryName ? ` (${l.categoryName})` : ''}`
                          : t('fin.expEditor.selectCategory'),
                  },
                  ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label style={labelStyle} htmlFor={`exp-edit-desc-${l.key}`}>
                {t('fin.expEditor.lineDescription')}
              </label>
              <input
                id={`exp-edit-desc-${l.key}`}
                style={inputStyle}
                value={l.description}
                onChange={(e) => {
                  updateLine(l.key, { description: e.target.value })
                }}
              />
            </div>
            <div style={{ width: '110px' }}>
              <label style={labelStyle} htmlFor={`exp-edit-amount-${l.key}`}>
                {t('fin.expEditor.amount')}
              </label>
              <input
                id={`exp-edit-amount-${l.key}`}
                type="number"
                min="0"
                style={inputStyle}
                value={l.amount}
                onChange={(e) => {
                  updateLine(l.key, { amount: e.target.value })
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                removeLine(l.key)
              }}
              disabled={lines.length <= 1}
            >
              {t('fin.expEditor.remove')}
            </Button>
          </div>
          {i === lines.length - 1 && l.id && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>
              {t('fin.expEditor.removeHint')}
            </div>
          )}
        </div>
      ))}

      <Button variant="ghost" size="sm" onClick={addLine}>
        {t('fin.expEditor.addLine')}
      </Button>

      {error && (
        <div role="alert" style={{ marginTop: '12px', fontSize: '12px', color: theme.danger }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
          marginTop: '16px',
          flexWrap: 'wrap',
        }}
      >
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('fin.expEditor.cancel')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void save(false)
          }}
          disabled={saving}
        >
          {t('fin.expEditor.save')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            void save(true)
          }}
          disabled={saving}
        >
          {claim.status === 'rejected'
            ? t('fin.expEditor.saveResubmit')
            : t('fin.expEditor.saveSubmit')}
        </Button>
      </div>
    </div>
  )
}
