import { useQuery } from '@apollo/client'
import { useNavigate } from 'react-router-dom'
import { MY_PO_QUEUE_QUERY } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { getPOStatusVariant, getPOStatusLabel, PO_STATUS_ACTIONS } from '../../../lib/po-constants'

interface QueueItem {
  id: string
  po_number: string
  status: string
  currency_code: string
  total_amount: string
  created_at: string
  updated_at: string
  organizer_id?: string
  project_id?: string
  vendor_id?: string
  vendor_name?: string
}

function daysWaiting(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function MyPOQueue() {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const navigate = useNavigate()

  const { data, loading } = useQuery(MY_PO_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })

  const items: QueueItem[] = data?.myPOQueue ?? []

  const grouped = items.reduce<Record<string, QueueItem[]>>((acc, item) => {
    const action = PO_STATUS_ACTIONS[item.status]
    const key = action ? action.label : 'Action needed'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div
      style={{
        ...pagePadding,
        margin: '0 auto',
        maxWidth: '1300px',
        paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined,
      }}
    >
      <PageHeader
        title="My PO Queue"
        subtitle={`${items.length} purchase order${items.length !== 1 ? 's' : ''} awaiting your action`}
      />

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted }}>Loading…</div>
      )}

      {!loading && items.length === 0 && (
        <Card style={{ marginTop: '24px', padding: '48px', textAlign: 'center' }}>
          <div style={{ color: theme.textMuted, fontSize: '14px' }}>
            No purchase orders awaiting your action.
          </div>
        </Card>
      )}

      {Object.entries(grouped).map(([actionLabel, group]) => (
        <div key={actionLabel} style={{ marginTop: '24px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px',
            }}
          >
            {actionLabel} ({group.length})
          </div>

          {isPhone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {group.map((item) => {
                const action = PO_STATUS_ACTIONS[item.status]
                const days = daysWaiting(item.updated_at)
                const isUrgent = days >= 3
                return (
                  <Card
                    key={item.id}
                    onClick={() => {
                      navigate(`/procurement/purchase-orders/${item.id}`)
                    }}
                    style={{
                      padding: '14px 16px',
                      cursor: 'pointer',
                      borderLeft: isUrgent ? `3px solid ${theme.danger}` : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: theme.accent,
                        }}
                      >
                        {item.po_number}
                      </span>
                      <Badge variant={getPOStatusVariant(item.status)} size="sm">
                        {getPOStatusLabel(item.status)}
                      </Badge>
                    </div>
                    <div
                      style={{ fontSize: '13px', color: theme.textPrimary, marginBottom: '4px' }}
                    >
                      {item.vendor_name ?? '—'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <AmountDisplay
                        amount={parseFloat(item.total_amount)}
                        currency={item.currency_code}
                      />
                      <span
                        style={{
                          fontSize: '11px',
                          color: isUrgent ? theme.danger : theme.textMuted,
                          fontWeight: isUrgent ? 600 : 400,
                        }}
                      >
                        {days === 0 ? 'Today' : `${days}d waiting`}
                        {action?.requiredPosition
                          ? ` · ${action.requiredPosition.replace(/_/g, ' ')}`
                          : action?.isOrganizer
                            ? ' · Organizer'
                            : ''}
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['PO Number', 'Vendor', 'Your role', 'Status', 'Total', 'Updated'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.map((item, idx) => {
                    const action = PO_STATUS_ACTIONS[item.status]
                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          navigate(`/procurement/purchase-orders/${item.id}`)
                        }}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: idx % 2 === 0 ? 'transparent' : `${theme.bgSurface}44`,
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = `${theme.accent}18`)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            idx % 2 === 0 ? 'transparent' : `${theme.bgSurface}44`)
                        }
                      >
                        <td
                          style={{
                            padding: '12px',
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            color: theme.accent,
                          }}
                        >
                          {item.po_number}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: theme.textPrimary }}>
                          {item.vendor_name ?? '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px', color: theme.textMuted }}>
                          {(action?.requiredPosition?.replace(/_/g, ' ') ?? action?.isOrganizer)
                            ? 'Organizer'
                            : '—'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <Badge variant={getPOStatusVariant(item.status)}>
                            {getPOStatusLabel(item.status)}
                          </Badge>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: theme.textPrimary }}>
                          <AmountDisplay
                            amount={parseFloat(item.total_amount)}
                            currency={item.currency_code}
                          />
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px', color: theme.textMuted }}>
                          {item.updated_at.slice(0, 10)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ))}
    </div>
  )
}
