import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
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

  const columns: Column<InviteRecord>[] = [
    {
      key: 'email',
      header: 'Email',
      mobilePrimary: true,
      render: (inv) => <span style={{ color: theme.textPrimary }}>{inv.email}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobileSecondary: true,
      render: (inv) => (
        <Badge variant={STATUS_BADGE[inv.status] ?? 'neutral'} size="sm">
          {inv.status}
        </Badge>
      ),
    },
    {
      key: 'companies',
      header: 'Companies',
      mobilePriority: 1,
      render: (inv) =>
        inv.companies.length === 0 ? (
          <span style={{ color: theme.textSecondary }}>—</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {inv.companies.map((c) => (
              <span key={c.companyId} style={{ color: theme.textSecondary }}>
                {c.companyName} <span style={{ color: theme.textMuted }}>({c.role})</span>
              </span>
            ))}
          </div>
        ),
    },
    {
      key: 'invitedByEmail',
      header: 'Invited By',
      mobilePriority: 2,
      render: (inv) => (
        <span style={{ color: theme.textSecondary }}>{inv.invitedByEmail ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Sent',
      mobilePriority: 3,
      render: (inv) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(inv.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'acceptedAt',
      header: 'Accepted',
      mobilePriority: 4,
      render: (inv) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {inv.acceptedAt ? new Date(inv.acceptedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title="Invite History" subtitle="All user invitations sent from this platform" />

      <Card padding="none">
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Invitations
          </h3>
        </div>

        <Table
          columns={columns}
          data={invites}
          rowKey="id"
          loading={loading}
          emptyMessage="No invitations sent. Invite users from the Users page."
        />
      </Card>
    </div>
  )
}
