import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from '../../components/ui/Button'

export default function NotFoundPage() {
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
        gap: '24px',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(80px, 15vw, 140px)',
          fontWeight: 800,
          color: theme.border,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          userSelect: 'none',
        }}
      >
        404
      </div>

      <div>
        <h1
          style={{
            fontSize: 'clamp(22px, 4vw, 32px)',
            fontWeight: 700,
            color: theme.textPrimary,
            margin: '0 0 10px',
          }}
        >
          You're not supposed to be here!
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: theme.textMuted,
            margin: 0,
            maxWidth: '380px',
            lineHeight: 1.6,
          }}
        >
          The page you're looking for doesn't exist or was moved. Double-check the URL or head back
          to safety.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          variant="secondary"
          onClick={() => {
            navigate(-1)
          }}
        >
          Go Back
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            navigate('/dashboard')
          }}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  )
}
