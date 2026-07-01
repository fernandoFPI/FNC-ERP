import React, { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Badge } from './Badge'
import { Button } from './Button'
import { EmployeeAvatar } from './EmployeeAvatar'

interface OTRequest {
  id: string
  employeeName: string
  workDate: string
  regularHours: number
  overtimeHours: number
  overtimeMultiplier: number
  status: 'pending' | 'approved' | 'rejected'
  reviewNotes?: string
}

interface OvertimeRequestCardProps {
  request: OTRequest
  onApprove?: () => void
  onReject?: (notes: string) => void
  isManager: boolean
}

const [firstName, ...rest] = ['', '']

export function OvertimeRequestCard({ request, onApprove, onReject, isManager }: OvertimeRequestCardProps) {
  const { theme } = useTheme()
  const [showReject, setShowReject] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  const nameParts = request.employeeName.trim().split(' ')
  const fn = nameParts[0] ?? ''
  const ln = nameParts[nameParts.length - 1] ?? ''

  const statusVariant = request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'

  return (
    <div style={{
      background: theme.bgSurface,
      border: `1px solid ${theme.border}`,
      borderRadius: '10px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <EmployeeAvatar firstName={fn} lastName={ln} size="md" />
          <div>
            <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>{request.employeeName}</div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>{request.workDate}</div>
          </div>
        </div>
        <Badge variant={statusVariant}>{request.status}</Badge>
      </div>

      {/* Hours row */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {[
          { label: 'Regular', value: `${request.regularHours}h` },
          { label: 'Overtime', value: `${request.overtimeHours}h`, color: theme.warning },
          { label: 'Multiplier', value: `${request.overtimeMultiplier}×` },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'monospace', color: color ?? theme.textPrimary }}>{value}</div>
          </div>
        ))}
      </div>

      {request.reviewNotes && (
        <div style={{ fontSize: '12px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
          {request.reviewNotes}
        </div>
      )}

      {/* Actions */}
      {isManager && request.status === 'pending' && !showReject && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" size="sm" onClick={onApprove}>Approve</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowReject(true)}>Reject</Button>
        </div>
      )}

      {showReject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Rejection notes (required)…"
            rows={2}
            style={{
              width: '100%', padding: '8px', fontSize: '12px', fontFamily: 'inherit',
              background: theme.bgSurface, border: `1px solid ${theme.borderInput}`, borderRadius: '6px',
              color: theme.textPrimary, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="danger" size="sm" onClick={() => { onReject?.(rejectNotes); setShowReject(false) }} disabled={!rejectNotes.trim()}>
              Confirm Reject
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
