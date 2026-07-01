import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Input } from '../../../components/ui/Input'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TabBar } from '../../../components/ui/TabBar'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'
import { api } from '../../../lib/axios'
import {
  MY_PROFILE_QUERY,
  MY_SESSIONS_QUERY,
  UPDATE_PASSWORD,
  ENABLE_MFA,
  CONFIRM_MFA,
  DISABLE_MFA,
  REVOKE_MY_SESSION,
  REVOKE_ALL_MY_SESSIONS,
} from '../../../graphql/settings'

interface MyProfile {
  id: string
  email: string
  mfaEnabled: boolean
  lastLogin: string | null
  createdAt: string
}

interface MySession {
  id: string
  deviceName: string
  platform: string
  ipAddress: string
  createdAt: string
  lastActive: string
  isCurrent: boolean
}

interface ProfileData { myProfile: MyProfile }
interface SessionsData { mySessions: MySession[] }

const TABS = [
  { key: 'personal', label: 'Personal Info' },
  { key: 'profile', label: 'Account' },
  { key: 'password', label: 'Password' },
  { key: 'mfa', label: 'Two-Factor Auth' },
  { key: 'sessions', label: 'Sessions' },
]

const TAB_PATH: Record<string, string> = {
  '/settings/password': 'password',
  '/settings/two-factor': 'mfa',
  '/settings/sessions': 'sessions',
}

interface PersonalProfile {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  profilePicture: string | null
  jobTitle: string | null
  phone: string | null
  emergencyPhone: string | null
}

export default function ProfilePage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const { pathname } = useLocation()
  const setUser = useAuthStore((s) => s.setUser)

  const [activeTab, setActiveTab] = useState(() => TAB_PATH[pathname] ?? 'personal')

  useEffect(() => {
    setActiveTab(TAB_PATH[pathname] ?? 'personal')
  }, [pathname])

  // Personal info
  const fileRef = useRef<HTMLInputElement>(null)
  const [personal, setPersonal] = useState<PersonalProfile | null>(null)
  const [personalLoading, setPersonalLoading] = useState(false)
  const [personalForm, setPersonalForm] = useState({ firstName: '', lastName: '', jobTitle: '', phone: '', emergencyPhone: '' })
  const [personalSaving, setPersonalSaving] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'personal' || personal) return
    setPersonalLoading(true)
    api.get<PersonalProfile>('/users/me/profile')
      .then(r => {
        setPersonal(r.data)
        setPersonalForm({
          firstName: r.data.firstName ?? '',
          lastName: r.data.lastName ?? '',
          jobTitle: r.data.jobTitle ?? '',
          phone: r.data.phone ?? '',
          emergencyPhone: r.data.emergencyPhone ?? '',
        })
        if (r.data.profilePicture) setAvatarPreview(r.data.profilePicture)
      })
      .catch(() => addToast({ type: 'error', message: 'Failed to load profile' }))
      .finally(() => setPersonalLoading(false))
  }, [activeTab])

  async function savePersonal() {
    if (!personalForm.firstName.trim() || !personalForm.lastName.trim()) {
      addToast({ type: 'error', message: 'First and last name are required' }); return
    }
    setPersonalSaving(true)
    try {
      const { data } = await api.put<PersonalProfile>('/users/me/profile', {
        firstName: personalForm.firstName.trim(),
        lastName: personalForm.lastName.trim(),
        jobTitle: personalForm.jobTitle.trim() || undefined,
        phone: personalForm.phone.trim() || undefined,
        emergencyPhone: personalForm.emergencyPhone.trim() || undefined,
      })
      if (avatarFile) {
        const fd = new FormData(); fd.append('avatar', avatarFile)
        const av = await api.post<{ profilePicture: string }>('/users/me/avatar', fd)
        setAvatarPreview(av.data.profilePicture)
        setAvatarFile(null)
      }
      setPersonal(data)
      setUser({ firstName: data.firstName ?? undefined, lastName: data.lastName ?? undefined })
      addToast({ type: 'success', message: 'Profile updated' })
    } catch {
      addToast({ type: 'error', message: 'Failed to update profile' })
    } finally { setPersonalSaving(false) }
  }

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  // MFA state
  const [mfaSecret, setMfaSecret] = useState('')
  const [mfaOtpauthUrl, setMfaOtpauthUrl] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [disablePwd, setDisablePwd] = useState('')
  const [setupPhase, setSetupPhase] = useState<'idle' | 'setup' | 'confirm'>('idle')

  // Session confirmations
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)

  const { data: profileData, loading: profileLoading, refetch: refetchProfile } = useQuery<ProfileData>(MY_PROFILE_QUERY)

  const { data: sessionsData, loading: sessionsLoading, refetch: refetchSessions } = useQuery<SessionsData>(MY_SESSIONS_QUERY, {
    skip: activeTab !== 'sessions',
  })

  const [updatePassword, { loading: changingPwd }] = useMutation(UPDATE_PASSWORD, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Password updated' })
      setCurrentPassword(''); setNewPassword(''); setConfirmPwd('')
    },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [enableMFA, { loading: enablingMFA }] = useMutation(ENABLE_MFA, {
    onCompleted: (d) => {
      setMfaSecret(d.enableMFA.secret)
      setMfaOtpauthUrl(d.enableMFA.otpauthUrl)
      setSetupPhase('confirm')
    },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [confirmMFA, { loading: confirmingMFA }] = useMutation(CONFIRM_MFA, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'MFA enabled successfully' })
      setSetupPhase('idle'); setTotpCode(''); setMfaSecret(''); setMfaOtpauthUrl('')
      refetchProfile()
    },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [disableMFA, { loading: disablingMFA }] = useMutation(DISABLE_MFA, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'MFA disabled' })
      setDisablePwd('')
      refetchProfile()
    },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  const [revokeSession, { loading: revokingSession }] = useMutation(REVOKE_MY_SESSION, {
    onCompleted: () => { addToast({ type: 'success', message: 'Session revoked' }); setRevokeSessionId(null); refetchSessions() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setRevokeSessionId(null) },
  })

  const [revokeAllSessions, { loading: revokingAll }] = useMutation(REVOKE_ALL_MY_SESSIONS, {
    onCompleted: () => { addToast({ type: 'success', message: 'All other sessions revoked' }); setConfirmRevokeAll(false); refetchSessions() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setConfirmRevokeAll(false) },
  })

  const profile = profileData?.myProfile
  const sessions = sessionsData?.mySessions ?? []

  function handlePasswordChange() {
    if (newPassword !== confirmPwd) {
      addToast({ type: 'error', message: 'Passwords do not match' })
      return
    }
    if (newPassword.length < 8) {
      addToast({ type: 'error', message: 'Password must be at least 8 characters' })
      return
    }
    updatePassword({ variables: { currentPassword, newPassword } })
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title="My Profile" subtitle="Manage your account settings" />

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: '20px' }}>
        {activeTab === 'personal' && (
          <Card padding="md" style={{ maxWidth: '560px' }}>
            {personalLoading ? (
              <div className="skeleton" style={{ height: '320px', borderRadius: '8px' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
                      border: `2px dashed ${theme.border}`, background: theme.bgCanvas,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', overflow: 'hidden',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}
                  >
                    {avatarPreview
                      ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '28px' }}>📷</span>
                    }
                  </div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null
                      setAvatarFile(f)
                      if (f) setAvatarPreview(URL.createObjectURL(f))
                    }} />
                  <div>
                    <button onClick={() => fileRef.current?.click()}
                      style={{ fontSize: '13px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                      Change photo
                    </button>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>JPG, PNG or WebP · max 5 MB</div>
                  </div>
                </div>

                {/* Name */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input label="First Name *" value={personalForm.firstName}
                    onChange={e => setPersonalForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
                  <Input label="Last Name *" value={personalForm.lastName}
                    onChange={e => setPersonalForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
                </div>
                <Input label="Job Title" value={personalForm.jobTitle}
                  onChange={e => setPersonalForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="e.g. Project Manager" />

                {/* Email (read-only) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '6px' }}>Email</label>
                  <div style={{ padding: '9px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgCanvas, fontSize: '13px', color: theme.textMuted }}>
                    {personal?.email}
                  </div>
                </div>

                <Input label="Phone Number" type="tel" value={personalForm.phone}
                  onChange={e => setPersonalForm(f => ({ ...f, phone: e.target.value }))} placeholder="+964 770 000 0000" />
                <Input label="Emergency Contact Phone" type="tel" value={personalForm.emergencyPhone}
                  onChange={e => setPersonalForm(f => ({ ...f, emergencyPhone: e.target.value }))} placeholder="+964 770 111 1111" />

                <Button variant="primary" size="md" loading={personalSaving} onClick={() => { void savePersonal() }}
                  disabled={!personalForm.firstName.trim() || !personalForm.lastName.trim()}>
                  Save Changes
                </Button>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'profile' && (
          <Card padding="md">
            {profileLoading ? (
              <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
            ) : profile ? (
              <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: '13px' }}>
                <dt style={{ color: theme.textMuted }}>Email</dt>
                <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>{profile.email}</dd>
                <dt style={{ color: theme.textMuted }}>Two-Factor Auth</dt>
                <dd style={{ margin: 0 }}>
                  <Badge variant={profile.mfaEnabled ? 'success' : 'warning'} dot>
                    {profile.mfaEnabled ? 'Enabled' : 'Not Enabled'}
                  </Badge>
                </dd>
                <dt style={{ color: theme.textMuted }}>Last Login</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {profile.lastLogin ? new Date(profile.lastLogin).toLocaleString() : 'Never'}
                </dd>
                <dt style={{ color: theme.textMuted }}>Member Since</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {new Date(profile.createdAt).toLocaleDateString()}
                </dd>
              </dl>
            ) : null}
          </Card>
        )}

        {activeTab === 'password' && (
          <Card padding="md" style={{ maxWidth: '440px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginBottom: '20px' }}>Change Password</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Repeat new password"
                error={confirmPwd && newPassword !== confirmPwd ? 'Passwords do not match' : undefined}
              />
              <Button
                variant="primary"
                size="md"
                onClick={handlePasswordChange}
                loading={changingPwd}
                disabled={!currentPassword || !newPassword || !confirmPwd}
              >
                Update Password
              </Button>
            </div>
          </Card>
        )}

        {activeTab === 'mfa' && (
          <Card padding="md" style={{ maxWidth: '480px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Two-Factor Authentication</h3>
            {profile?.mfaEnabled ? (
              <div>
                <div style={{ marginBottom: '16px' }}><Badge variant="success" dot>MFA Enabled</Badge></div>
                <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '16px' }}>
                  Your account is protected with an authenticator app. To disable, enter your password below.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Input
                    placeholder="Current password"
                    type="password"
                    value={disablePwd}
                    onChange={(e) => setDisablePwd(e.target.value)}
                  />
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => disableMFA({ variables: { password: disablePwd } })}
                    loading={disablingMFA}
                    disabled={!disablePwd}
                  >
                    Disable MFA
                  </Button>
                </div>
              </div>
            ) : setupPhase === 'idle' ? (
              <div>
                <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '16px' }}>
                  Add an extra layer of security with a time-based one-time password (TOTP) authenticator app.
                </p>
                <Button variant="primary" size="md" onClick={() => { setSetupPhase('setup'); enableMFA() }} loading={enablingMFA}>
                  Enable Two-Factor Auth
                </Button>
              </div>
            ) : setupPhase === 'confirm' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '13px', color: theme.textSecondary }}>
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.):
                </p>
                {mfaOtpauthUrl && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px', background: '#ffffff', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                    <QRCode value={mfaOtpauthUrl} size={200} />
                  </div>
                )}
                <details style={{ fontSize: '12px', color: theme.textMuted }}>
                  <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Can't scan? Enter the code manually</summary>
                  <div style={{ marginTop: '8px', background: theme.bgSurfaceHover, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: theme.accent, letterSpacing: '0.1em', wordBreak: 'break-all' }}>
                    {mfaSecret}
                  </div>
                </details>
                <Input
                  label="Enter 6-digit code from your app"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
                  placeholder="000000"
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="primary" size="md" onClick={() => confirmMFA({ variables: { totpCode } })} loading={confirmingMFA} disabled={totpCode.length !== 6}>
                    Verify & Enable
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => { setSetupPhase('idle'); setMfaSecret(''); setMfaOtpauthUrl(''); setTotpCode('') }} disabled={confirmingMFA}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {activeTab === 'sessions' && (
          <Card padding="none">
            <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Active Sessions</h3>
              {sessions.filter(s => !s.isCurrent).length > 0 && (
                <Button variant="danger" size="sm" onClick={() => setConfirmRevokeAll(true)}>Revoke Other Sessions</Button>
              )}
            </div>
            {sessionsLoading ? (
              <div style={{ padding: '24px' }}>
                <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
              </div>
            ) : sessions.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {['Device', 'Platform', 'IP Address', 'Created', 'Last Active', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <td style={{ padding: '12px 14px', color: theme.textPrimary }}>
                          {s.deviceName}
                          {s.isCurrent && <span style={{ marginLeft: '8px' }}><Badge variant="accent" size="sm">Current</Badge></span>}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{s.platform}</td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>
                          {s.ipAddress === '::1' || s.ipAddress === '127.0.0.1' ? 'localhost' : (s.ipAddress ?? '—')}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{s.lastActive ? new Date(s.lastActive).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {!s.isCurrent && (
                            <Button variant="danger" size="sm" onClick={() => setRevokeSessionId(s.id)} loading={revokingSession && revokeSessionId === s.id}>
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No sessions" />
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!revokeSessionId}
        onClose={() => setRevokeSessionId(null)}
        onConfirm={() => { if (revokeSessionId) revokeSession({ variables: { sessionId: revokeSessionId } }) }}
        title="Revoke Session"
        message="Revoke this session? You will be logged out on that device."
        confirmLabel="Revoke"
        confirmVariant="danger"
        loading={revokingSession}
      />

      <ConfirmDialog
        open={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={() => { revokeAllSessions() }}
        title="Revoke Other Sessions"
        message="Log out all other devices? Your current session will not be affected."
        confirmLabel="Revoke All Others"
        confirmVariant="danger"
        loading={revokingAll}
      />
    </div>
  )
}
