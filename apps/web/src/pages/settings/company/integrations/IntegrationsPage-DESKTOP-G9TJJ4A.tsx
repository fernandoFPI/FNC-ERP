import { useState, useEffect } from 'react'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Badge } from '../../../../components/ui/Badge'
import { useCompanyStore } from '../../../../store/companyStore'
import { api } from '../../../../lib/axios'

interface IntegrationStatus {
  smtp_configured: boolean
  smtp_host: string | null
  cbi_fx_configured: boolean
  cbi_last_sync: string | null
  cbi_stale: boolean
}

export default function IntegrationsPage() {
  const { theme } = useTheme()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .get('/finance/admin/integration-status')
      .then((r: { data: IntegrationStatus }) => setStatus(r.data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [activeCompany?.id])

  const smtpOk = status?.smtp_configured ?? false
  const cbiOk = status?.cbi_fx_configured ?? false
  const lastSync = status?.cbi_last_sync
    ? new Date(status.cbi_last_sync).toLocaleString()
    : null

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Integrations"
        subtitle="External service connections and API configurations"
      />

      {loading ? (
        <>
          <div className="skeleton" style={{ height: '80px', borderRadius: '12px', marginBottom: '12px' }} />
          <div className="skeleton" style={{ height: '80px', borderRadius: '12px' }} />
        </>
      ) : (
        <>
          {/* SMTP */}
          <Card padding="none" style={{ marginBottom: '12px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 20px',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Email Server (SMTP)</p>
                  <Badge variant={smtpOk ? 'success' : 'warning'} dot>
                    {smtpOk ? 'Connected' : 'Not configured'}
                  </Badge>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>
                  {smtpOk && status?.smtp_host
                    ? `Host: ${status.smtp_host}`
                    : 'Configure SMTP via environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'}
                </p>
              </div>
            </div>
          </Card>

          {/* CBI FX Feed */}
          <Card padding="none" style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 20px',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                    Central Bank of Iraq — FX Feed
                  </p>
                  <Badge
                    variant={!cbiOk ? 'warning' : status?.cbi_stale ? 'danger' : 'success'}
                    dot
                  >
                    {!cbiOk ? 'Not configured' : status?.cbi_stale ? 'Stale' : 'Live'}
                  </Badge>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>
                  {cbiOk
                    ? lastSync
                      ? `Last synced: ${lastSync}`
                      : 'Awaiting first sync'
                    : 'Configure via environment variable: CBI_FX_URL'}
                </p>
              </div>
            </div>
          </Card>

          <div style={{
            padding: '14px 18px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            fontSize: '12px',
            color: theme.textMuted,
          }}>
            Integration credentials are managed via server environment variables and applied at the service level. Restart the relevant service after updating environment configuration.
          </div>
        </>
      )}
    </div>
  )
}
