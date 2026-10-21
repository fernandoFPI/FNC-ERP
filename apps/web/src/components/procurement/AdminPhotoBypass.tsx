import { useTranslation } from 'react-i18next'
import { Checkbox } from '../ui/Checkbox'
import { Textarea } from '../ui/Textarea'
import { useTheme } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'

// Only a system administrator can confirm a goods receipt, or record a jobsite
// delivery, without the vendor receipt and materials photos. The server enforces
// the same rule (services/gateway/src/lib/receiptPhotoBypass.ts); this control is
// just how an admin asks for it, with the reason the server requires and records.
export const PHOTO_BYPASS_MAX_REASON = 500

export function useIsSystemAdmin(): boolean {
  return useAuthStore((s) => s.user?.role === 'system_admin')
}

// A bypass is ready to send only when it is ticked and justified.
export function photoBypassReady(enabled: boolean, reason: string): boolean {
  return enabled && reason.trim().length > 0
}

interface Props {
  enabled: boolean
  reason: string
  onEnabledChange: (enabled: boolean) => void
  onReasonChange: (reason: string) => void
}

export function AdminPhotoBypass({ enabled, reason, onEnabledChange, onReasonChange }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  return (
    <div
      data-testid="admin-photo-bypass"
      style={{
        marginTop: '12px',
        padding: '12px 14px',
        borderRadius: '8px',
        border: `1px solid ${theme.warningBorder}`,
        background: theme.warningBg,
      }}
    >
      <Checkbox label={t('receipt.bypass.label')} checked={enabled} onChange={onEnabledChange} />
      <div style={{ fontSize: '12px', color: theme.warning, marginTop: '6px' }}>
        {t('receipt.bypass.hint')}
      </div>
      {enabled && (
        <div style={{ marginTop: '10px' }}>
          <Textarea
            label={t('receipt.bypass.reasonLabel')}
            placeholder={t('receipt.bypass.reasonPlaceholder')}
            value={reason}
            onChange={(e) => {
              onReasonChange(e.target.value.slice(0, PHOTO_BYPASS_MAX_REASON))
            }}
            rows={2}
            required
          />
        </div>
      )}
    </div>
  )
}
