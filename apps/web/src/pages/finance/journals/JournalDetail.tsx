import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  JOURNAL_ENTRY_QUERY, POST_JOURNAL_ENTRY, CANCEL_JOURNAL_ENTRY,
  AUDIT_JOURNAL_ENTRY, LINK_JOURNAL_POS,
} from '../../../graphql/finance'

import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { FileAttachments } from '../../../components/ui/FileAttachments'
import { useState, useRef, useMemo } from 'react'
import { useToastStore } from '../../../store/toastStore'
import { buildGeneralJournalHTML, JournalPrintLine } from '../../../lib/voucherHtml'

interface JournalLine {
  id: string
  account_id: string
  account_code?: string
  account_name?: string
  description?: string
  currency_code?: string
  debit: string
  credit: string
}

interface LinkedPO {
  po_id: string
  po_number: string
  vendor_name?: string
  status?: string
  total_amount?: string
  currency_code?: string
}

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showAuditDialog, setShowAuditDialog] = useState(false)
  const [poSearch, setPoSearch] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const { data, loading, refetch } = useQuery(JOURNAL_ENTRY_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })

  const [postEntry, { loading: posting }] = useMutation(POST_JOURNAL_ENTRY)
  const [cancelEntry, { loading: cancelling }] = useMutation(CANCEL_JOURNAL_ENTRY)
  const [auditEntry, { loading: auditing }] = useMutation(AUDIT_JOURNAL_ENTRY)
  const [linkPOs, { loading: linkingPOs }] = useMutation(LINK_JOURNAL_POS)

  const entry = data?.journalEntry
  const lines: JournalLine[] = entry?.lines ?? []
  const linkedPOs: LinkedPO[] = entry?.linked_pos ?? []

  async function handlePost() {
    try {
      await postEntry({ variables: { id }, refetchQueries: [{ query: JOURNAL_ENTRY_QUERY, variables: { id } }] })
      addToast({ type: 'success', message: 'Entry posted' })
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleCancel() {
    try {
      await cancelEntry({ variables: { id }, refetchQueries: [{ query: JOURNAL_ENTRY_QUERY, variables: { id } }] })
      addToast({ type: 'warning', message: 'Entry cancelled' })
      setShowCancelDialog(false)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleAudit() {
    try {
      await auditEntry({ variables: { id }, refetchQueries: [{ query: JOURNAL_ENTRY_QUERY, variables: { id } }] })
      addToast({ type: 'success', message: 'Entry signed off by auditor' })
      setShowAuditDialog(false)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const previewHtml = useMemo(() => {
    if (!entry) return ''
    const printLines: JournalPrintLine[] = lines.map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      description: l.description,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      currency_code: l.currency_code ?? 'IQD',
    }))
    return buildGeneralJournalHTML({
      reference: entry.reference,
      entry_date: entry.entry_date,
      description: entry.description,
      lines: printLines,
      linked_pos: linkedPOs,
      accountant_email: entry.accountant_email,
      auditor_email: entry.auditor_email,
      total_debit: parseFloat(entry.total_debit) || 0,
      total_credit: parseFloat(entry.total_credit) || 0,
      journalTemplateImage: entry.journal_template_image ?? null,
    })
  }, [entry, lines, linkedPOs])

  function handlePrint() {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print()
    }
  }

  if (loading && !entry) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!entry) return <div style={{ padding: '24px', color: theme.textMuted }}>Entry not found</div>

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={entry.reference}
        subtitle={entry.entry_date}
        backPath="/finance/journals"
        status={<Badge variant={entry.status === 'posted' ? 'success' : entry.status === 'draft' ? 'warning' : 'neutral'}>{entry.status}</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {entry.status === 'draft' && (
              <>
                <Button variant="primary" size="sm" onClick={handlePost} loading={posting}>Post</Button>
                <Button variant="danger" size="sm" onClick={() => setShowCancelDialog(true)}>Cancel Entry</Button>
              </>
            )}
            {entry.status === 'posted' && !entry.audited_at && (
              <Button variant="secondary" size="sm" onClick={() => setShowAuditDialog(true)}>Auditor Sign-off</Button>
            )}
            {entry.status === 'posted' && (
              <>
                <Button variant="ghost" size="sm" onClick={handlePrint}>Print</Button>
                <Button variant="danger" size="sm" onClick={() => setShowCancelDialog(true)}>Reverse</Button>
              </>
            )}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '20px', marginBottom: '16px' }}>
        {[
          ['Source', entry.source_type ?? 'manual'],
          ['Created by', entry.created_by_email ?? '—'],
          ['Total Debit', entry.total_debit ? parseFloat(entry.total_debit).toLocaleString() : '—'],
          ['Total Credit', entry.total_credit ? parseFloat(entry.total_credit).toLocaleString() : '—'],
          ...(entry.accountant_email ? [['Accountant', entry.accountant_email]] : []),
          ...(entry.auditor_email ? [['Auditor', entry.auditor_email]] : []),
          ...(entry.audited_at ? [['Audited at', new Date(entry.audited_at).toLocaleString()]] : []),
        ].map(([label, value]) => (
          <div key={label} style={{ background: theme.bgSurface, borderRadius: '8px', padding: '12px 16px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '14px', color: theme.textPrimary }}>{value}</div>
          </div>
        ))}
      </div>

      {entry.description && (
        <div style={{ background: theme.bgSurface, borderRadius: '8px', padding: '12px 16px', border: `1px solid ${theme.border}`, marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>{entry.description}</div>
        </div>
      )}

      {/* Lines */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>Journal Lines</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                {['Account', 'Description', 'Currency', 'Debit', 'Credit'].map((h) => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontFamily: 'monospace', color: theme.accent }}>{line.account_code}</span>
                    <span style={{ color: theme.textSecondary, marginLeft: '8px' }}>{line.account_name}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: theme.textMuted }}>{line.description ?? '—'}</td>
                  <td style={{ padding: '10px 16px', color: theme.textMuted }}>{line.currency_code ?? 'IQD'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    {parseFloat(line.debit) > 0 ? <AmountDisplay amount={parseFloat(line.debit)} currency={line.currency_code ?? 'IQD'} /> : <span style={{ color: theme.textMuted }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {parseFloat(line.credit) > 0 ? <AmountDisplay amount={parseFloat(line.credit)} currency={line.currency_code ?? 'IQD'} /> : <span style={{ color: theme.textMuted }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Linked POs panel */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>Linked Purchase Orders</span>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{linkedPOs.length} PO{linkedPOs.length !== 1 ? 's' : ''}</span>
        </div>
        {linkedPOs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
            No purchase orders linked to this journal entry.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                {['PO Number', 'Vendor', 'Status', 'Amount'].map((h) => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linkedPOs.map((po) => (
                <tr key={po.po_id}
                  onClick={() => navigate(`/procurement/purchase-orders/${po.po_id}`)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgSurface)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  style={{ cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontFamily: 'monospace', color: theme.accent, fontWeight: 600 }}>{po.po_number}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: theme.textSecondary }}>{po.vendor_name ?? '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <Badge variant={po.status === 'approved' ? 'success' : po.status === 'draft' ? 'warning' : 'neutral'}>{po.status ?? '—'}</Badge>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {po.total_amount ? (
                      <AmountDisplay amount={parseFloat(po.total_amount)} currency={po.currency_code ?? 'IQD'} />
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <FileAttachments entityType="finance/journals" entityId={id!} />

      {/* Print preview */}
      {entry.status === 'posted' && (
        <Card style={{ marginBottom: '16px', marginTop: '16px' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>Print Preview</span>
            <Button variant="primary" size="sm" onClick={handlePrint}>Print / Save as PDF</Button>
          </div>
          <div style={{ background: '#f5f5f5', overflow: 'hidden', borderRadius: '0 0 8px 8px' }}>
            <iframe
              ref={iframeRef}
              srcDoc={previewHtml}
              style={{ width: '100%', height: '1100px', border: 'none', display: 'block' }}
              title={`Journal Entry ${entry.reference}`}
            />
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={showCancelDialog}
        title="Cancel Journal Entry"
        message="Are you sure you want to cancel this journal entry? This action cannot be undone."
        confirmLabel="Cancel Entry"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
        loading={cancelling}
      />
      <ConfirmDialog
        open={showAuditDialog}
        title="Auditor Sign-off"
        message="Sign off this journal entry as auditor? This marks it as reviewed and approved for payment vouchers."
        confirmLabel="Sign Off"
        variant="primary"
        onConfirm={handleAudit}
        onCancel={() => setShowAuditDialog(false)}
        loading={auditing}
      />
    </div>
  )
}
