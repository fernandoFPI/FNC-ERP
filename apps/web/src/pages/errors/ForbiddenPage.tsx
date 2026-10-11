import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from '../../components/ui/Button'

export default function ForbiddenPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '16px',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: theme.dangerBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          color: theme.danger,
        }}
      >
        🔒
      </div>
      <div>
        <h1
          style={{ fontSize: '24px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 8px' }}
        >
          {t('errors.forbidden.accessDenied')}
        </h1>
        <p style={{ fontSize: '14px', color: theme.textMuted, margin: 0, maxWidth: '360px' }}>
          {t('errors.forbidden.youDonTHavePermissionTo')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          variant="secondary"
          onClick={() => {
            navigate(-1)
          }}
        >
          {t('errors.forbidden.goBack')}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            navigate('/dashboard')
          }}
        >
          {t('errors.forbidden.dashboard')}
        </Button>
      </div>
    </div>
  )
}
