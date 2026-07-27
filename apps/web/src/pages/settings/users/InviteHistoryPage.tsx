import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { USER_INVITATIONS_QUERY } from '../../../graphql/admin'

interface InvitationCompany {
  companyId: string
  companyName: string
  role: string
  module: string
}

interface InviteRecord {
  id: string
  email: string
  companies: InvitationCompany[]
  status: string
  invitedByEmail: string | null
  createdAt: string
  acceptedAt: string | null
}

interface UserInvitationsData {
  userInvitations: InviteRecord[]
}

const STATUS_BADGE: Record<string, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'neutral',
  cancelled: 'neutral',
}

export default function InviteHistoryPage() {
  const { theme } = useTheme()
  const { data, loading } = useQuery<UserInvitationsData>(USER_INVITATIONS_QUERY)
  const invites = data?.userInvitations ?? []

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title="Invite History" subtitle="All user invitations sent from this platform" />

      <Card padding="none">
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Invitations
          </h3>
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
                  {['Email', 'Companies', 'Status', 'Invited By', 'Sent', 'Accepted'].map((h) => (
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.tableRowHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: theme.textPrimary }}>{inv.email}</td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                      {inv.companies.length === 0 ? (
                        '—'
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {inv.companies.map((c) => (
                            <span key={c.companyId}>
                              {c.companyName} <span style={{ color: theme.textMuted }}>({c.role})</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={STATUS_BADGE[inv.status] ?? 'neutral'} size="sm">
                        {inv.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                      {inv.invitedByEmail ?? '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {inv.acceptedAt ? new Date(inv.acceptedAt).toLocaleDateString() : '—'}
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
