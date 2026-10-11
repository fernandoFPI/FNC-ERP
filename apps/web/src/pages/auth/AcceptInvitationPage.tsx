import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from '../../components/ui/Button'

interface InvitationCompany {
  companyName: string
  role: string
}

interface TokenInfo {
  email: string
  invitedByName: string
  companies: InvitationCompany[]
}

const passwordRequirements = [
  { key: 'req12', label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { key: 'reqUpper', label: 'At least one uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'reqLower', label: 'At least one lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'reqNumber', label: 'At least one number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'reqSpecial', label: 'At least one special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export default function AcceptInvitationPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [tokenError, setTokenError] = useState('')
  const [validating, setValidating] = useState(true)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!token) {
      setTokenError(t('auth.invite.noToken'))
      setValidating(false)
      return
    }
    axios
      .get(`/api/v1/auth/users/accept-invitation/validate?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setTokenInfo((res.data as { data: TokenInfo }).data)
        setValidating(false)
      })
      .catch(() => {
        setTokenError(t('auth.invite.invalidLink'))
        setValidating(false)
      })
  }, [token])

  const metReqs = passwordRequirements.filter((r) => r.test(password))
  const allMet = metReqs.length === passwordRequirements.length
  const passwordsMatch = password === confirmPassword

  const handleSubmit = async () => {
    if (!allMet || !passwordsMatch) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await axios.post('/api/v1/auth/users/accept-invitation', { token, password, confirmPassword })
      navigate('/login?accepted=1')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? t('auth.invite.failedAccept')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgSurface,
      }}
    >
      <div
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          background: theme.bgSurface,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: 'clamp(20px, 5vw, 40px)',
        }}
      >
        <div style={{ marginBottom: '28px' }}>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: theme.textPrimary,
              marginBottom: '6px',
            }}
          >
            {t('auth.invite.acceptInvitation')}
          </div>
          {validating && (
            <div style={{ color: theme.textMuted, fontSize: '13px' }}>
              {t('auth.invite.validatingYourInvitation')}
            </div>
          )}
          {tokenError && (
            <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>{tokenError}</div>
          )}
          {tokenInfo && !validating && (
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              {t('auth.invite.invitedBy', { name: tokenInfo.invitedByName })}
              <ul style={{ margin: '6px 0 0', paddingInlineStart: '18px' }}>
                {tokenInfo.companies.map((c) => (
                  <li key={c.companyName}>
                    <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
                      {c.companyName}
                    </span>{' '}
                    {t('auth.invite.as')} <span style={{ color: theme.accent }}>{c.role}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '8px' }}>
                {t('auth.invite.acceptingAs')} <span style={{ color: theme.textPrimary }}>{tokenInfo.email}</span>
              </div>
            </div>
          )}
        </div>

        {tokenInfo && !validating && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('auth.invite.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                  }}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    background: theme.bgSurface,
                    color: theme.textPrimary,
                    fontSize: '13px',
                  }}
                />
              </div>

              <div
                style={{
                  background: theme.bgSurface,
                  borderRadius: '8px',
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                {passwordRequirements.map((req) => {
                  const met = req.test(password)
                  return (
                    <div
                      key={req.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: met ? '#22c55e' : theme.textMuted,
                      }}
                    >
                      <span style={{ fontSize: '14px' }}>{met ? '✓' : '○'}</span>
                      {t(`auth.invite.${req.key}`)}
                    </div>
                  )
                })}
              </div>

              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('auth.invite.confirmPassword')}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: `1px solid ${confirmPassword && !passwordsMatch ? '#ef4444' : theme.border}`,
                    background: theme.bgSurface,
                    color: theme.textPrimary,
                    fontSize: '13px',
                  }}
                />
                {confirmPassword && !passwordsMatch && (
                  <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
                    {t('auth.invite.passwordsDoNotMatch')}
                  </div>
                )}
              </div>

              {submitError && (
                <div style={{ fontSize: '13px', color: '#ef4444' }}>{submitError}</div>
              )}

              <Button
                variant="primary"
                loading={submitting}
                disabled={!allMet || !passwordsMatch}
                onClick={() => void handleSubmit()}
                style={{ width: '100%', marginTop: '4px' }}
              >
                {t('auth.invite.setPasswordJoin')}
              </Button>
            </div>
          </>
        )}

        {tokenError && (
          <Button
            variant="ghost"
            onClick={() => {
              navigate('/login')
            }}
            style={{ marginTop: '16px', width: '100%' }}
          >
            {t('auth.invite.backToLogin')}
          </Button>
        )}
      </div>
    </div>
  )
}
