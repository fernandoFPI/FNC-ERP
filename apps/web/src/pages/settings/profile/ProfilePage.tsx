import { tl } from '../../../i18n'
import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
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
import type { ConfirmMfaMutation, ConfirmMfaMutationVariables, DisableMfaMutation, DisableMfaMutationVariables, EnableMfaMutation, EnableMfaMutationVariables, RevokeAllMySessionsMutation, RevokeAllMySessionsMutationVariables, RevokeMySessionMutation, RevokeMySessionMutationVariables, UpdatePasswordMutation, UpdatePasswordMutationVariables } from '../../../graphql/generated'

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

interface ProfileData {
  myProfile: MyProfile
}
interface SessionsData {
  mySessions: MySession[]
}

const TABS = [
  { key: 'personal', get label() { return i18n.t('settings.profile.personalInfo', { defaultValue: "Personal Info" }) } },
  { key: 'profile', get label() { return i18n.t('settings.profile.account', { defaultValue: "Account" }) } },
  { key: 'password', get label() { return i18n.t('settings.profile.password', { defaultValue: "Password" }) } },
  { key: 'mfa', get label() { return i18n.t('settings.profile.twoFactorAuth', { defaultValue: "Two-Factor Auth" }) } },
  { key: 'sessions', get label() { return i18n.t('settings.profile.sessions', { defaultValue: "Sessions" }) } },
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
  const { t } = useTranslation()
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
  const [personalForm, setPersonalForm] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    phone: '',
    emergencyPhone: '',
  })
  const [personalSaving, setPersonalSaving] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'personal' || personal) return
    setPersonalLoading(true)
    api
      .get<PersonalProfile>('/users/me/profile')
      .then((r) => {
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
      .catch(() => {
        addToast({ type: 'error', message: t('settings.profile.failedToLoadProfile') })
      })
      .finally(() => {
        setPersonalLoading(false)
      })
  }, [activeTab])

  async function savePersonal() {
    if (!personalForm.firstName.trim() || !personalForm.lastName.trim()) {
      addToast({ type: 'error', message: t('settings.profile.firstAndLastNameAreRequired') })
      return
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
        const fd = new FormData()
        fd.append('avatar', avatarFile)
        const av = await api.post<{ profilePicture: string }>('/users/me/avatar', fd)
        setAvatarPreview(av.data.profilePicture)
        setAvatarFile(null)
      }
      setPersonal(data)
      setUser({ firstName: data.firstName ?? undefined, lastName: data.lastName ?? undefined })
      addToast({ type: 'success', message: t('settings.profile.profileUpdated') })
    } catch {
      addToast({ type: 'error', message: t('settings.profile.failedToUpdateProfile') })
    } finally {
      setPersonalSaving(false)
    }
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

  const {
    data: profileData,
    loading: profileLoading,
    refetch: refetchProfile,
  } = useQuery<ProfileData>(MY_PROFILE_QUERY)

  const {
    data: sessionsData,
    loading: sessionsLoading,
    refetch: refetchSessions,
  } = useQuery<SessionsData>(MY_SESSIONS_QUERY, {
    skip: activeTab !== 'sessions',
  })

  const [updatePassword, { loading: changingPwd }] = useMutation<UpdatePasswordMutation, UpdatePasswordMutationVariables>(UPDATE_PASSWORD, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.profile.passwordUpdated') })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPwd('')
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [enableMFA, { loading: enablingMFA }] = useMutation<EnableMfaMutation, EnableMfaMutationVariables>(ENABLE_MFA, {
    onCompleted: (d) => {
      setMfaSecret(d.enableMFA.secret)
      setMfaOtpauthUrl(d.enableMFA.otpauthUrl)
      setSetupPhase('confirm')
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [confirmMFA, { loading: confirmingMFA }] = useMutation<ConfirmMfaMutation, ConfirmMfaMutationVariables>(CONFIRM_MFA, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.profile.mfaEnabledSuccessfully') })
      setSetupPhase('idle')
      setTotpCode('')
      setMfaSecret('')
      setMfaOtpauthUrl('')
      void refetchProfile()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [disableMFA, { loading: disablingMFA }] = useMutation<DisableMfaMutation, DisableMfaMutationVariables>(DISABLE_MFA, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.profile.mfaDisabled') })
      setDisablePwd('')
      void refetchProfile()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [revokeSession, { loading: revokingSession }] = useMutation<RevokeMySessionMutation, RevokeMySessionMutationVariables>(REVOKE_MY_SESSION, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.profile.sessionRevoked') })
      setRevokeSessionId(null)
      void refetchSessions()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setRevokeSessionId(null)
    },
  })

  const [revokeAllSessions, { loading: revokingAll }] = useMutation<RevokeAllMySessionsMutation, RevokeAllMySessionsMutationVariables>(REVOKE_ALL_MY_SESSIONS, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('settings.profile.allOtherSessionsRevoked') })
      setConfirmRevokeAll(false)
      void refetchSessions()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmRevokeAll(false)
    },
  })

  const profile = profileData?.myProfile
  const sessions = sessionsData?.mySessions ?? []

  function handlePasswordChange() {
    if (newPassword !== confirmPwd) {
      addToast({ type: 'error', message: t('settings.profile.passwordsDoNotMatch') })
      return
    }
    if (newPassword.length < 8) {
      addToast({ type: 'error', message: t('settings.profile.passwordMustBeAtLeast8') })
      return
    }
    void updatePassword({ variables: { currentPassword, newPassword } })
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader title={t('settings.profile.myProfile')} subtitle={t('settings.profile.manageYourAccountSettings')} />

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
                      width: '72px',
                      height: '72px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: `2px dashed ${theme.border}`,
                      background: theme.bgCanvas,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.border)}
                  >
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={t('settings.profile.avatar')}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '28px' }}>📷</span>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setAvatarFile(f)
                      if (f) setAvatarPreview(URL.createObjectURL(f))
                    }}
                  />
                  <div>
                    <button
                      onClick={() => fileRef.current?.click()}
                      style={{
                        fontSize: '13px',
                        color: theme.accent,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 500,
                      }}
                    >
                      {t('settings.profile.changePhoto')}
                    </button>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                      {t('settings.profile.jpgPngOrWebpMax5')}
                    </div>
                  </div>
                </div>

                {/* Name */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input
                    label={t('settings.profile.firstName')}
                    value={personalForm.firstName}
                    onChange={(e) => {
                      setPersonalForm((f) => ({ ...f, firstName: e.target.value }))
                    }}
                    placeholder={t('settings.profile.firstName2')}
                  />
                  <Input
                    label={t('settings.profile.lastName')}
                    value={personalForm.lastName}
                    onChange={(e) => {
                      setPersonalForm((f) => ({ ...f, lastName: e.target.value }))
                    }}
                    placeholder={t('settings.profile.lastName2')}
                  />
                </div>
                <Input
                  label={t('settings.profile.jobTitle')}
                  value={personalForm.jobTitle}
                  onChange={(e) => {
                    setPersonalForm((f) => ({ ...f, jobTitle: e.target.value }))
                  }}
                  placeholder={t('settings.profile.eGProjectManager')}
                />

                {/* Email (read-only) */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.textSecondary,
                      marginBottom: '6px',
                    }}
                  >
                    {t('settings.profile.email')}
                  </label>
                  <div
                    style={{
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgCanvas,
                      fontSize: '13px',
                      color: theme.textMuted,
                    }}
                  >
                    {personal?.email}
                  </div>
                </div>

                <Input
                  label={t('settings.profile.phoneNumber')}
                  type="tel"
                  value={personalForm.phone}
                  onChange={(e) => {
                    setPersonalForm((f) => ({ ...f, phone: e.target.value }))
                  }}
                  placeholder="+964 770 000 0000"
                />
                <Input
                  label={t('settings.profile.emergencyContactPhone')}
                  type="tel"
                  value={personalForm.emergencyPhone}
                  onChange={(e) => {
                    setPersonalForm((f) => ({ ...f, emergencyPhone: e.target.value }))
                  }}
                  placeholder="+964 770 111 1111"
                />

                <Button
                  variant="primary"
                  size="md"
                  loading={personalSaving}
                  onClick={() => {
                    void savePersonal()
                  }}
                  disabled={!personalForm.firstName.trim() || !personalForm.lastName.trim()}
                >
                  {t('settings.profile.saveChanges')}
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
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: '12px 16px',
                  fontSize: '13px',
                }}
              >
                <dt style={{ color: theme.textMuted }}>{t('settings.profile.email')}</dt>
                <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
                  {profile.email}
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('settings.profile.twoFactorAuth')}</dt>
                <dd style={{ margin: 0 }}>
                  <Badge variant={profile.mfaEnabled ? 'success' : 'warning'} dot>
                    {profile.mfaEnabled ? t('settings.profile.enabled') : t('settings.profile.notEnabled')}
                  </Badge>
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('settings.profile.lastLogin')}</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {profile.lastLogin ? new Date(profile.lastLogin).toLocaleString() : t('settings.profile.never')}
                </dd>
                <dt style={{ color: theme.textMuted }}>{t('settings.profile.memberSince')}</dt>
                <dd style={{ color: theme.textMuted, margin: 0, fontSize: '12px' }}>
                  {new Date(profile.createdAt).toLocaleDateString()}
                </dd>
              </dl>
            ) : null}
          </Card>
        )}

        {activeTab === 'password' && (
          <Card padding="md" style={{ maxWidth: '440px' }}>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '20px',
              }}
            >
              {t('settings.profile.changePassword')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Input
                label={t('settings.profile.currentPassword')}
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                }}
                placeholder={t('settings.profile.enterCurrentPassword')}
              />
              <Input
                label={t('settings.profile.newPassword')}
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                }}
                placeholder={t('settings.profile.atLeast8Characters')}
              />
              <Input
                label={t('settings.profile.confirmNewPassword')}
                type="password"
                value={confirmPwd}
                onChange={(e) => {
                  setConfirmPwd(e.target.value)
                }}
                placeholder={t('settings.profile.repeatNewPassword')}
                error={
                  confirmPwd && newPassword !== confirmPwd ? t('settings.profile.passwordsDoNotMatch') : undefined
                }
              />
              <Button
                variant="primary"
                size="md"
                onClick={handlePasswordChange}
                loading={changingPwd}
                disabled={!currentPassword || !newPassword || !confirmPwd}
              >
                {t('settings.profile.updatePassword')}
              </Button>
            </div>
          </Card>
        )}

        {activeTab === 'mfa' && (
          <Card padding="md" style={{ maxWidth: '480px' }}>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: theme.textPrimary,
                marginBottom: '16px',
              }}
            >
              {t('settings.profile.twoFactorAuthentication')}
            </h3>
            {profile?.mfaEnabled ? (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <Badge variant="success" dot>
                    {t('settings.profile.mfaEnabled')}
                  </Badge>
                </div>
                <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '16px' }}>
                  {t('settings.profile.yourAccountIsProtectedWithAn')}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Input
                    placeholder={t('settings.profile.currentPassword2')}
                    type="password"
                    value={disablePwd}
                    onChange={(e) => {
                      setDisablePwd(e.target.value)
                    }}
                  />
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => void disableMFA({ variables: { password: disablePwd } })}
                    loading={disablingMFA}
                    disabled={!disablePwd}
                  >
                    {t('settings.profile.disableMfa')}
                  </Button>
                </div>
              </div>
            ) : setupPhase === 'idle' ? (
              <div>
                <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '16px' }}>
                  {t('settings.profile.addAnExtraLayerOfSecurity')}
                </p>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setSetupPhase('setup')
                    void enableMFA()
                  }}
                  loading={enablingMFA}
                >
                  {t('settings.profile.enableTwoFactorAuth')}
                </Button>
              </div>
            ) : setupPhase === 'confirm' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '13px', color: theme.textSecondary }}>
                  {t('settings.profile.scanThisQrCodeWithYour')}
                </p>
                {mfaOtpauthUrl && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      padding: '20px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <QRCode value={mfaOtpauthUrl} size={200} />
                  </div>
                )}
                <details style={{ fontSize: '12px', color: theme.textMuted }}>
                  <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {t('settings.profile.canTScanEnterTheCode')}
                  </summary>
                  <div
                    style={{
                      marginTop: '8px',
                      background: theme.bgSurfaceHover,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      padding: '12px',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: '13px',
                      color: theme.accent,
                      letterSpacing: '0.1em',
                      wordBreak: 'break-all',
                    }}
                  >
                    {mfaSecret}
                  </div>
                </details>
                <Input
                  label={t('settings.profile.enter6DigitCodeFromYour')}
                  value={totpCode}
                  onChange={(e) => {
                    setTotpCode(e.target.value.slice(0, 6))
                  }}
                  placeholder="000000"
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void confirmMFA({ variables: { totpCode } })}
                    loading={confirmingMFA}
                    disabled={totpCode.length !== 6}
                  >
                    {t('settings.profile.verifyEnable')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      setSetupPhase('idle')
                      setMfaSecret('')
                      setMfaOtpauthUrl('')
                      setTotpCode('')
                    }}
                    disabled={confirmingMFA}
                  >
                    {t('settings.profile.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {activeTab === 'sessions' && (
          <Card padding="none">
            <div
              style={{
                padding: '16px 20px 12px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                {t('settings.profile.activeSessions')}
              </h3>
              {sessions.filter((s) => !s.isCurrent).length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setConfirmRevokeAll(true)
                  }}
                >
                  {t('settings.profile.revokeOtherSessions')}
                </Button>
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
                      {['Device', 'Platform', 'IP Address', 'Created', 'Last Active', ''].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              padding: '10px 14px',
                              textAlign: 'start',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: theme.textMuted,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              borderBottom: `1px solid ${theme.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h ? tl('settings.profile.sessionCols', h, h) : ''}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr
                        key={s.id}
                        style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = theme.tableRowHover
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <td style={{ padding: '12px 14px', color: theme.textPrimary }}>
                          {s.deviceName}
                          {s.isCurrent && (
                            <span style={{ marginInlineStart: '8px' }}>
                              <Badge variant="accent" size="sm">
                                {t('settings.profile.current')}
                              </Badge>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                          {s.platform}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: theme.textMuted,
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '12px',
                          }}
                        >
                          {s.ipAddress === '::1' || s.ipAddress === '127.0.0.1'
                            ? 'localhost'
                            : (s.ipAddress ?? '—')}
                        </td>
                        <td
                          style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}
                        >
                          {new Date(s.createdAt).toLocaleDateString()}
                        </td>
                        <td
                          style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}
                        >
                          {s.lastActive ? new Date(s.lastActive).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {!s.isCurrent && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setRevokeSessionId(s.id)
                              }}
                              loading={revokingSession && revokeSessionId === s.id}
                            >
                              {t('settings.profile.revoke')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={t('settings.profile.noSessions')} />
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!revokeSessionId}
        onClose={() => {
          setRevokeSessionId(null)
        }}
        onConfirm={() => {
          if (revokeSessionId) void revokeSession({ variables: { sessionId: revokeSessionId } })
        }}
        title={t('settings.profile.revokeSession')}
        message={t('settings.profile.revokeThisSessionYouWillBe')}
        confirmLabel={t('settings.profile.revoke')}
        confirmVariant="danger"
        loading={revokingSession}
      />

      <ConfirmDialog
        open={confirmRevokeAll}
        onClose={() => {
          setConfirmRevokeAll(false)
        }}
        onConfirm={() => {
          void revokeAllSessions()
        }}
        title={t('settings.profile.revokeOtherSessions')}
        message={t('settings.profile.logOutAllOtherDevicesYour')}
        confirmLabel={t('settings.profile.revokeAllOthers')}
        confirmVariant="danger"
        loading={revokingAll}
      />
    </div>
  )
}
