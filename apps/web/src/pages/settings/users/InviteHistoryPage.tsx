import { useState, useEffect } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { api } from '../../../lib/axios'

interface InviteRecord {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'expired'
  invited_by: string
  invited_at: string
  accepted_at: string | null
}

const STATUS_BADGE: Record<string, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'neutral',
}

export default function InviteHistoryPage() {
  const { theme } = useTheme()
  const [invites, setInvites] = useState<InviteRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .get('/admin/users/invitations')
      .then((r: { data: { invitations?: InviteRecord[] } }) => setInvites(r.data.invitations ?? []))
      .catch(() => setInvites([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Invite History"
        subtitle="All user invitations sent from this platform"
      />

      <Card padding="none">
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Invitations</h3>
        </div>

        {loading ? (
          <div style={{ padding: '24px' }}>
            <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
          </div>
        ) : invites.length === 0 ? (
          <EmptyState title="No invitations sent" message="Invite users from the Users page." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Email', 'Role', 'Status', 'Invited By', 'Sent', 'Accepted'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr
                    key={inv.id}
                    style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '12px 14px', color: theme.textPrimary }}>{inv.email}</td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{inv.role}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={STATUS_BADGE[inv.status] ?? 'neutral'} size="sm">
                        {inv.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{inv.invited_by}</td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {new Date(inv.invited_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
