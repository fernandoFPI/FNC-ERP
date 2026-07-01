import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/axios'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useToastStore } from '../../store/toastStore'

interface ProfileResponse {
  id: string
  profileCompleted: boolean
  firstName: string
  lastName: string
}

interface ExistingProfile {
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  phone: string | null
  emergencyPhone: string | null
  profilePicture: string | null
}

export default function CompleteProfilePage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setProfileCompleted = useAuthStore((s) => s.setProfileCompleted)
  const setUser = useAuthStore((s) => s.setUser)
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    phone: '',
    emergencyPhone: '',
  })
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<typeof form>>({})
  const fileRef = useRef<HTMLInputElement>(null)


  function validate() {
    const e: Partial<typeof form> = {}
    if (!form.firstName.trim()) e.firstName = 'First name is required'
    if (!form.lastName.trim()) e.lastName = 'Last name is required'
    if (!form.jobTitle.trim()) e.jobTitle = 'Job title is required'
    if (!form.phone.trim()) e.phone = 'Phone number is required'
    if (!form.emergencyPhone.trim()) e.emergencyPhone = 'Emergency phone is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      // 1. Save profile fields
      const { data } = await api.put<ProfileResponse>('/users/me/profile', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        jobTitle: form.jobTitle.trim(),
        phone: form.phone.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
      })

      // 2. Upload avatar if selected
      if (avatar) {
        const fd = new FormData()
        fd.append('avatar', avatar)
        await api.post('/users/me/avatar', fd)
      }

      // 3. Update auth store
      setProfileCompleted()
      setUser({ firstName: data.firstName, lastName: data.lastName })
      addToast({ type: 'success', message: 'Profile saved — welcome!' })
      navigate('/', { replace: true })
    } catch {
      addToast({ type: 'error', message: 'Failed to save profile. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setAvatar(file)
    if (file) setPreview(URL.createObjectURL(file))
  }

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
    type = 'text',
  ) => (
    <Input
      key={key}
      label={label}
      type={type}
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      placeholder={placeholder}
      error={errors[key]}
    />
  )

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.bgCanvas,
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: theme.accentBg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px',
          }}>
            👤
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 6px' }}>
            Complete your profile
          </h1>
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
            Logged in as <strong style={{ color: theme.textSecondary }}>{user?.email}</strong>.
            Fill in your details to continue.
          </p>
        </div>

        <div style={{
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: '88px', height: '88px', borderRadius: '50%',
                border: `2px dashed ${theme.border}`,
                background: theme.bgCanvas,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}
            >
              {preview
                ? <img src={preview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '32px' }}>📷</span>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <span style={{ fontSize: '11px', color: theme.textMuted }}>
              {avatar ? avatar.name : 'Click to upload a profile photo (optional)'}
            </span>
          </div>

          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('firstName', 'First Name *', 'e.g. Ahmed')}
            {field('lastName', 'Last Name *', 'e.g. Al-Farage')}
          </div>

          {field('jobTitle', 'Job Title *', 'e.g. Project Manager')}

          {/* Email (read-only) */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '6px' }}>
              Email
            </label>
            <div style={{
              padding: '9px 12px', borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgCanvas,
              fontSize: '13px', color: theme.textMuted,
            }}>
              {user?.email}
            </div>
          </div>

          {field('phone', 'Phone Number *', 'e.g. +964 770 000 0000', 'tel')}
          {field('emergencyPhone', 'Emergency Contact Phone *', 'e.g. +964 770 111 1111', 'tel')}

          <Button
            variant="primary"
            size="md"
            onClick={() => { void handleSubmit() }}
            loading={saving}
            style={{ marginTop: '4px' }}
          >
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
