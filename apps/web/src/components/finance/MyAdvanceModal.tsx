import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@apollo/client'
import { PROJECTS_QUERY } from '../../graphql/projects'
import type { ProjectsQuery, ProjectsQueryVariables } from '../../graphql/generated'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from '../ui/Modal'
import { Badge, type BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { SearchableSelect } from '../ui/SearchableSelect'
import { Textarea } from '../ui/Textarea'
import { AmountDisplay } from '../ui/AmountDisplay'
import { api } from '../../lib/axios'
import { useToastStore } from '../../store/toastStore'

export interface MyAdvance {
  id: string
  advance_number: string
  purpose: string | null
  project_id: string | null
  project_code?: string | null
  project_name?: string | null
  amount: number | string
  currency_code: string
  status: string
  rejection_reason?: string | null
  // From GET /finance/advances/mine: the same rule the server applies on save (the person who filed it, or an admin).
  can_revise?: boolean
}

const errorMessage = (err: unknown, fallback: string): string => {
  const apiError = err as { response?: { data?: { error?: { message?: string } } } }
  return apiError.response?.data?.error?.message ?? fallback
}

// What the person is told about where their request is, by status.
const STATUS_HINT: Record<string, string> = {
  pending_approval: 'fin.advRequest.hintPendingApproval',
  pending_issue: 'fin.advRequest.hintPendingIssue',
  approved: 'fin.advRequest.hintIssued',
}

// The form a person corrects a rejected request in. Rendered only while editing, so the project list is fetched only
// then and the fields always start from the request as it is now.
function AdvanceRequestEditor({
  advance,
  onCancel,
  onSaved,
}: {
  advance: MyAdvance
  onCancel: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const addToast = useToastStore((s) => s.addToast)
  const [amount, setAmount] = useState(String(Number(advance.amount)))
  const [currency, setCurrency] = useState(advance.currency_code)
  const [reason, setReason] = useState(advance.purpose ?? '')
  const [projectId, setProjectId] = useState(advance.project_id ?? '')
  const [saving, setSaving] = useState(false)

  const { data: projectsData } = useQuery<ProjectsQuery, ProjectsQueryVariables>(PROJECTS_QUERY, {
    variables: { includeAll: true, limit: 100 },
  })
  const projectOptions = [
    { value: '', label: t('fin.advRequest.noProject') },
    ...(projectsData?.projects.data ?? []).map((p) => ({
      value: p.id,
      label: `${p.code} — ${p.name}`,
    })),
  ]

  async function resubmit() {
    const nextAmount = parseFloat(amount)
    if (!(nextAmount > 0)) {
      addToast({ type: 'error', message: t('req.form.enterTheAdvanceAmount') })
      return
    }
    const unchanged =
      nextAmount === Number(advance.amount) &&
      currency === advance.currency_code &&
      reason.trim() === (advance.purpose ?? '').trim() &&
      projectId === (advance.project_id ?? '')
    if (unchanged) {
      addToast({ type: 'error', message: t('fin.advRequest.changeSomething') })
      return
    }
    setSaving(true)
    try {
      await api.post(`/finance/advances/${advance.id}/revise`, {
        amount: nextAmount,
        currency_code: currency,
        purpose: reason.trim(),
        project_id: projectId || null,
      })
      addToast({ type: 'success', message: t('fin.advRequest.resubmitted') })
      onSaved()
    } catch (err: unknown) {
      addToast({ type: 'error', message: errorMessage(err, t('fin.advRequest.couldNotResubmit')) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <Select
            label={t('req.form.currency')}
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
            }}
          >
            <option value="IQD">IQD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </Select>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <Input
            label={t('req.form.advanceAmount')}
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
            }}
          />
        </div>
      </div>
      <SearchableSelect
        label={t('req.form.projectOptional')}
        value={projectId}
        onChange={setProjectId}
        options={projectOptions}
        placeholder={t('req.form.searchProject')}
        minDropdownWidth={320}
      />
      <Textarea
        label={t('req.form.advanceReason')}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value)
        }}
        rows={3}
      />
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          {t('fin.advRequest.cancel')}
        </Button>
        <Button variant="primary" size="sm" loading={saving} onClick={() => void resubmit()}>
          {t('fin.advRequest.resubmit')}
        </Button>
      </div>
    </div>
  )
}

// The popup a person gets for their OWN advance request. Most people who ask for an advance hold no Advances
// permission, so they cannot open the Finance advance page; this is their view of it. For a request the manager
// rejected it shows the reason and lets them fix it and send it again, like an expense claim.
export function MyAdvanceModal({
  advance,
  statusLabel,
  statusVariant,
  onClose,
  onChanged,
}: {
  advance: MyAdvance | null
  statusLabel: string
  statusVariant: BadgeVariant
  onClose: () => void
  // The request was sent again: the page reloads its list and closes the popup.
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  // Which request the form is open for (not a boolean): a different request always opens in read mode.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Closing the popup ends the edit, so the same request reopens in read mode too.
  useEffect(() => {
    if (!advance) setEditingId(null)
  }, [advance])

  const rejected = advance?.status === 'rejected'
  // Only a rejected request can be corrected and sent again; the button follows the server's can_revise AND the status.
  const canRevise = rejected && !!advance.can_revise
  const editing = !!advance && editingId === advance.id
  const hintKey = advance ? STATUS_HINT[advance.status] : undefined

  return (
    <Modal open={!!advance} onClose={onClose} title={advance?.advance_number ?? ''} size="md">
      {advance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            <AmountDisplay
              amount={Number(advance.amount)}
              currency={advance.currency_code}
              size="sm"
            />
            {advance.project_code && (
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {advance.project_code} — {advance.project_name}
              </span>
            )}
            {canRevise && !editing && (
              <span style={{ marginInlineStart: 'auto' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingId(advance.id)
                  }}
                >
                  {t('fin.advRequest.editResubmit')}
                </Button>
              </span>
            )}
          </div>

          {hintKey && !editing && (
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{t(hintKey)}</div>
          )}

          {rejected && advance.rejection_reason && (
            <div
              style={{
                background: '#ef444410',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                color: '#ef4444',
                whiteSpace: 'pre-wrap',
              }}
            >
              <strong>{t('fin.advRequest.rejected')}</strong> {advance.rejection_reason}
              {canRevise && (
                <div style={{ marginTop: '6px', color: theme.textSecondary }}>
                  {t('fin.advRequest.sentBackHint')}
                </div>
              )}
            </div>
          )}

          {editing ? (
            <AdvanceRequestEditor
              advance={advance}
              onCancel={() => {
                setEditingId(null)
              }}
              onSaved={() => {
                setEditingId(null)
                onChanged()
              }}
            />
          ) : (
            <div
              style={{
                fontSize: '13px',
                color: advance.purpose ? theme.textPrimary : theme.textMuted,
                background: theme.bgCanvas,
                borderRadius: '8px',
                padding: '10px 12px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {advance.purpose ?? t('fin.advRequest.noReason')}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
