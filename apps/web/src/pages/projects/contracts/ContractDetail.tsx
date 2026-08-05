import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PROJECT_CONTRACT_QUERY,
  REACH_MILESTONE,
  CREATE_PROJECT_INVOICE,
} from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { InvoiceBuilderResult } from '../../../components/ui/InvoiceBuilder'
import { InvoiceBuilder } from '../../../components/ui/InvoiceBuilder'
import { useToastStore } from '../../../store/toastStore'
import { useRecordLock } from '../../../hooks/useRecordLock'

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const lock = useRecordLock('project_contract', id)
  const addToast = useToastStore((s) => s.addToast)
  const [showInvoiceBuilder, setShowInvoiceBuilder] = useState(false)

  const { data, loading, refetch } = useQuery(PROJECT_CONTRACT_QUERY, {
    variables: { id },
    skip: !id,
  })
  const [reachMilestone] = useMutation(REACH_MILESTONE)
  const [createInvoice] = useMutation(CREATE_PROJECT_INVOICE)

  const contract = data?.projectContract

  async function handleCreateInvoice(result: InvoiceBuilderResult) {
    const defaultDue = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    try {
      await createInvoice({
        variables: {
          contractId: id,
          input: {
            billingMethod: result.billing_method,
            dueDate: result.due_date || defaultDue,
            notes: result.notes ?? null,
            discountPct: result.discount_pct,
            discountAmount: result.discount_amount,
            whtApplies: result.wht_applies,
            whtScenario: result.wht_scenario ?? undefined,
            whtRate: result.wht_rate,
            lines: result.lines.map((l) => ({
              description: l.description,
              sourceType: result.billing_method === 'milestone' ? 'milestone' : 'manual',
              qty: l.quantity,
              unitCost: l.unit_price,
              marginPct: 0,
              taxPct: l.tax_pct ?? 0,
            })),
          },
        },
      })
      addToast({ type: 'success', message: 'Invoice created' })
      refetch()
    } catch (err) {
      throw err
    }
  }

  if (loading || !contract)
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const cur = contract.currencyCode

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title={contract.contractName}
        subtitle={`${contract.contractNumber} · ${contract.clientName}`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="primary"
              size="sm"
              disabled={lock.lockedByOther}
              onClick={() => {
                setShowInvoiceBuilder(true)
              }}
            >
              Create Invoice
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={lock.lockedByOther}
              onClick={() => {
                navigate(`/projects/contracts/${id}/edit`)
              }}
            >
              Edit
            </Button>
          </div>
        }
      />

      {lock.lockedByOther && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            marginTop: '16px',
            background: `${theme.warning}1a`,
            border: `1px solid ${theme.warning}`,
            borderRadius: '8px',
            fontSize: '13px',
            color: theme.textPrimary,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: theme.warning,
              flexShrink: 0,
            }}
          />
          <strong>{lock.lockedByName}</strong>&nbsp;is currently working on this contract — actions
          are disabled until they finish.
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginTop: '20px',
        }}
      >
        {[
          { label: 'Contract Value', value: contract.contractValue, cur },
          { label: 'Invoiced', value: contract.totalInvoiced, cur },
          { label: 'Paid', value: contract.totalPaid, cur },
          { label: 'Outstanding', value: contract.outstanding, cur },
        ].map(({ label, value, cur: c }) => (
          <Card key={label} style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
              {label}
            </div>
            <AmountDisplay amount={value} currency={c} />
          </Card>
        ))}
      </div>

      {/* Milestones */}
      <Card style={{ marginTop: '16px', padding: '20px' }}>
        <div
          style={{
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '12px',
            fontSize: '14px',
          }}
        >
          Milestones
        </div>
        {(contract.milestones ?? []).map(
          (m: {
            id: string
            name: string
            sequence: number
            billableAmount: number
            status: string
            reachedAt?: string
          }) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: theme.textMuted, width: '20px' }}>
                  #{m.sequence}
                </span>
                <span style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>
                  {m.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <AmountDisplay amount={m.billableAmount} currency={cur} />
                {m.reachedAt && (
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>
                    {m.reachedAt.slice(0, 10)}
                  </span>
                )}
                <Badge variant={m.status === 'reached' ? 'success' : 'neutral'}>{m.status}</Badge>
                {m.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={lock.lockedByOther}
                    onClick={async () => {
                      await reachMilestone({ variables: { contractId: id, milestoneId: m.id } })
                      refetch()
                      addToast({ type: 'success', message: 'Milestone reached' })
                    }}
                  >
                    Mark Reached
                  </Button>
                )}
              </div>
            </div>
          ),
        )}
      </Card>

      {/* Invoices */}
      <Card style={{ marginTop: '16px', padding: '20px' }}>
        <div
          style={{
            fontWeight: 600,
            color: theme.textPrimary,
            marginBottom: '12px',
            fontSize: '14px',
          }}
        >
          Invoices
        </div>
        {(contract.invoices ?? []).map(
          (inv: {
            id: string
            invoiceNumber: string
            billingMethod: string
            grossTotal: number
            netPayable: number
            status: string
            invoiceDate: string
            dueDate: string
          }) => (
            <div
              key={inv.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: `1px solid ${theme.border}`,
                cursor: 'pointer',
              }}
              onClick={() => {
                navigate(`/projects/invoices/${inv.id}`)
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: 'monospace',
                    color: theme.accent,
                    fontSize: '13px',
                    marginRight: '8px',
                  }}
                >
                  {inv.invoiceNumber}
                </span>
                <Badge variant="neutral">{inv.billingMethod}</Badge>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  fontSize: '12px',
                  color: theme.textMuted,
                }}
              >
                <span>Due: {inv.dueDate}</span>
                <AmountDisplay amount={inv.netPayable} currency={cur} />
                <Badge
                  variant={
                    inv.status === 'paid'
                      ? 'success'
                      : inv.status === 'draft'
                        ? 'neutral'
                        : 'warning'
                  }
                >
                  {inv.status}
                </Badge>
              </div>
            </div>
          ),
        )}
        {(contract.invoices ?? []).length === 0 && (
          <div
            style={{
              color: theme.textMuted,
              fontSize: '13px',
              textAlign: 'center',
              padding: '20px',
            }}
          >
            No invoices yet
          </div>
        )}
      </Card>

      <InvoiceBuilder
        open={showInvoiceBuilder}
        projectId={id ?? ''}
        projectName={contract.contractName}
        contractAmount={contract.contractValue ?? 0}
        currency={cur}
        milestones={(contract.milestones ?? []).map(
          (m: { id: string; name: string; billableAmount: number; status: string }) => ({
            id: m.id,
            name: m.name,
            amount: m.billableAmount,
            status: m.status,
          }),
        )}
        onConfirm={handleCreateInvoice}
        onClose={() => {
          setShowInvoiceBuilder(false)
        }}
      />
    </div>
  )
}
