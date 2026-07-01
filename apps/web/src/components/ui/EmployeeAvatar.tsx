import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface EmployeeAvatarProps {
  firstName: string
  lastName: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  photoUrl?: string
  status?: 'active' | 'inactive' | 'on-leave'
}

const COLORS = ['#6C9BF5', '#5EC5A0', '#F5A66C', '#C56CBA', '#F56C6C', '#6CD9F5']

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return Math.abs(h)
}

const SIZES: Record<string, number> = { sm: 28, md: 36, lg: 48, xl: 64 }
const FONT: Record<string, number> = { sm: 11, md: 13, lg: 17, xl: 22 }
const DOT: Record<string, number> = { sm: 7, md: 9, lg: 11, xl: 14 }

export function EmployeeAvatar({
  firstName, lastName, size = 'md', photoUrl, status = 'active',
}: EmployeeAvatarProps) {
  const { theme } = useTheme()
  const px = SIZES[size]
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const bg = COLORS[hashName(`${firstName}${lastName}`) % COLORS.length]
  const dotColor = status === 'active' ? theme.success : status === 'on-leave' ? theme.info : theme.textMuted

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: px, height: px, flexShrink: 0 }}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`${firstName} ${lastName}`}
          style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: px, height: px, borderRadius: '50%',
          background: `${bg}33`, border: `1.5px solid ${bg}66`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: bg, fontSize: FONT[size], fontWeight: 600, userSelect: 'none',
        }}>
          {initials}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, right: 0,
        width: DOT[size], height: DOT[size], borderRadius: '50%',
        background: dotColor, border: `2px solid ${theme.bgSurface}`,
      }} />
    </div>
  )
}
