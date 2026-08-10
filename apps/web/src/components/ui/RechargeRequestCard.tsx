import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Badge, type BadgeVariant } from './Badge'

export interface RechargeRequestSummary {
  id: string
  requestedByEmail?: string | null
  costCenterName?: string | null
  bundleName?: string | null
  bundleAmount?: number | null
  bundleCurrencyCode?: string | null
  phoneNumber: string
  status: string
  createdAt: string
  photoPendingConfirmation: boolean
}

export const RECHARGE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  fulfilled: 'Sent — confirm receipt',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

export const RECHARGE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  fulfilled: 'accent',
  confirmed: 'success',
  cancelled: 'neutral',
}

function initialsOf(email?: string | null): string {
  if (!email) return '?'
  const name = email.split('@')[0].replace(/[._-]+/g, ' ')
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return email[0].toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const AVATAR_COLORS = ['#6C9BF5', '#5EC5A0', '#F5A66C', '#C56CBA', '#F56C6C', '#6CD9F5']
function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

interface RechargeRequestCardProps {
  request: RechargeRequestSummary
  onClick: () => void
  actions?: React.ReactNode
}

export function RechargeRequestCard({ request: r, onClick, actions }: RechargeRequestCardProps) {
  const { theme } = useTheme()
  const color = avatarColor(r.requestedByEmail ?? r.id)

  return (
    <div
      onClick={onClick}
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.1s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.accentBorder
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.border
      }}
    >
      {/* status accent stripe */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background:
            r.status === 'confirmed'
              ? theme.success
              : r.status === 'rejected'
                ? theme.danger
                : r.status === 'cancelled'
                  ? theme.textMuted
                  : r.status === 'pending'
                    ? theme.warning
                    : theme.accent,
        }}
      />

      <div
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: `${color}22`,
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initialsOf(r.requestedByEmail)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: theme.textPrimary,
                fontSize: '13px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.requestedByEmail ?? 'Unknown requester'}
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{timeAgo(r.createdAt)}</div>
          </div>
        </div>
        <Badge variant={RECHARGE_STATUS_VARIANTS[r.status] ?? 'neutral'}>
          {RECHARGE_STATUS_LABELS[r.status] ?? r.status}
        </Badge>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: theme.bgCanvas,
          borderRadius: '8px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: theme.textPrimary,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}
          >
            {r.phoneNumber}
          </div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
            {r.bundleName ?? 'Bundle'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.accent }}>
            {r.bundleAmount != null
              ? `${r.bundleAmount.toLocaleString()} ${r.bundleCurrencyCode ?? ''}`
              : '—'}
          </div>
          {r.costCenterName && (
            <div
              style={{
                fontSize: '10px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginTop: '2px',
              }}
            >
              {r.costCenterName}
            </div>
          )}
        </div>
      </div>

      {r.photoPendingConfirmation && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: theme.accent,
            fontWeight: 600,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Proof ready — confirm to view
        </div>
      )}

      {actions && (
        <div
          onClick={(e) => {
            e.stopPropagation()
          }}
          style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
