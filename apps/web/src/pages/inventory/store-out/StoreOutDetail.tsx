import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { MATERIAL_ISSUE_QUERY } from '../../../graphql/projects'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Table } from '../../../components/ui/Table'
import type { Column } from '../../../components/ui/Table'
import { EntityAttachments } from '../../../components/inventory/EntityAttachments'
import { buildStoreOutHTML } from '../../../lib/storeOutHtml'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { useCompany } from '../../../hooks/useCompany'

interface MILine {
  id: string
  productName: string | null
  sku: string | null
  uom: string | null
  fromLocationName: string | null
  toLocationName: string | null
  qtyIssued: number
  unitCost: number
  totalCost: number
  isInvoiced: boolean
}

interface MI {
  id: string
  issueNumber: string
  issueDate: string
  status: string
  notes: string | null
  poId: string | null
  poNumber: string | null
  projectCode: string | null
  projectName: string | null
  issuedByName: string | null
  createdAt: string
  lines: MILine[]
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'warning',
  issued: 'success',
  cancelled: 'danger',
}

const fmtAmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function StoreOutDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const { activeCompany } = useCompany()
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)

  const { data, loading } = useQuery(MATERIAL_ISSUE_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const mi: MI | undefined = data?.materialIssue

  if (loading && !mi)
    return <div style={{ padding: '48px', color: theme.textMuted }}>Loading…</div>
  if (!mi) return <div style={{ padding: '48px', color: theme.textMuted }}>Store Out not found.</div>

  const totalCost = mi.lines.reduce((s, l) => s + l.totalCost, 0)

  const columns: Column<MILine>[] = [
    {
      key: 'product',
      header: 'Item',
      render: (l) => (
        <div>
          <div style={{ color: theme.textPrimary, fontWeight: 500 }}>{l.productName ?? '—'}</div>
          {l.sku && <div style={{ fontSize: '11px', color: theme.textMuted }}>{l.sku}</div>}
        </div>
      ),
    },
    {
      key: 'route',
      header: 'From → To',
      render: (l) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {l.fromLocationName ?? '—'} → {l.toLocationName ?? '—'}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {l.qtyIssued} {l.uom ?? ''}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      render: (l) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(l.unitCost)}</span>,
    },
    {
      key: 'totalCost',
      header: 'Total',
      render: (l) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {fmtAmt(l.totalCost)}
        </span>
      ),
    },
  ]

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={mi.issueNumber}
        subtitle={`${mi.projectCode ? `${mi.projectCode} — ${mi.projectName ?? ''}` : 'No project'} • ${mi.issueDate.slice(0, 10)}`}
        backPath="/inventory/store-out"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[mi.status] ?? 'neutral'}>{mi.status}</Badge>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPrintModal(true)
              }}
            >
              Print
            </Button>
          </div>
        }
      />

      <Card style={{ marginTop: '20px', padding: '20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              Issued By
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary }}>
              {mi.issuedByName ?? '—'}
            </div>
          </div>
          {mi.poNumber && (
            <div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                Linked PO
              </div>
              <div style={{ fontSize: '13px', color: theme.textPrimary }}>{mi.poNumber}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
              Total Cost
            </div>
            <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 600 }}>
              {fmtAmt(totalCost)} IQD
            </div>
          </div>
        </div>
        {mi.notes && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '7px',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              fontSize: '12px',
              color: theme.textSecondary,
              marginBottom: '20px',
            }}
          >
            {mi.notes}
          </div>
        )}

        <Table<MILine> columns={columns} data={mi.lines} rowKey="id" emptyMessage="No items." />
      </Card>

      <div style={{ marginTop: '20px' }}>
        <EntityAttachments entityType="material_issue" entityId={mi.id} recordLabel="this Store Out" />
      </div>

      {/* Print dialog */}
      {showPrintModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => {
            setShowPrintModal(false)
          }}
        >
          <div
            style={{
              background: theme.bgSurface,
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              width: '94vw',
              maxWidth: '1100px',
              height: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>
                Print Store Out — {mi.issueNumber}
              </span>
              <button
                onClick={() => {
                  setShowPrintModal(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', background: '#f3f4f6', minHeight: 0 }}>
              <iframe
                ref={printIframeRef}
                srcDoc={buildStoreOutHTML({
                  issueNumber: mi.issueNumber,
                  issueDate: mi.issueDate,
                  status: mi.status,
                  notes: mi.notes,
                  projectCode: mi.projectCode,
                  projectName: mi.projectName,
                  poNumber: mi.poNumber,
                  issuedByName: mi.issuedByName,
                  companyName: activeCompany?.name,
                  lines: mi.lines.map((l) => ({
                    productName: l.productName,
                    sku: l.sku,
                    qtyIssued: l.qtyIssued,
                    uom: l.uom,
                    fromLocationName: l.fromLocationName,
                    toLocationName: l.toLocationName,
                    unitCost: l.unitCost,
                    totalCost: l.totalCost,
                  })),
                })}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={`Store Out ${mi.issueNumber}`}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '14px 20px',
                borderTop: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPrintModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => printIframeRef.current?.contentWindow?.print()}
              >
                Print / Save as PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
