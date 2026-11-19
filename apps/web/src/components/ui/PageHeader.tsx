import { useTranslation } from 'react-i18next'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface PageHeaderProps {
  title: string
  subtitle?: string
  status?: React.ReactNode
  actions?: React.ReactNode
  backPath?: string
  backLabel?: string
  badge?: React.ReactNode
  className?: string
  /**
   * Phone only, opt-in: one row instead of four. The back control is an arrow (named by `backLabel`),
   * the title, its status and the actions share the row, and the subtitle is one quiet line under the
   * title. The default header stays as it was for every other page.
   */
  compact?: boolean
}

export function PageHeader({
  title,
  subtitle,
  status,
  actions,
  backPath,
  backLabel,
  badge,
  className = '',
  compact = false,
}: PageHeaderProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const navigate = useNavigate()

  if (compact && isPhone) {
    const backName = backLabel ?? t('ui.generic.back')
    return (
      <div className={className} style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
          {backPath && (
            <button
              type="button"
              aria-label={backName}
              title={backName}
              onClick={() => {
                navigate(backPath)
              }}
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '44px',
                height: '40px',
                marginInlineStart: '-12px',
                color: theme.accent,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg
                className="rtl-flip"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          {/* The 8px of top padding puts the title's first line level with the back arrow's centre. */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: backPath ? '8px' : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h1>
              {badge}
              {status}
            </div>
            {subtitle && (
              <p
                style={{
                  fontSize: '13px',
                  color: theme.textSecondary,
                  margin: '2px 0 0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className={className} style={{ marginBottom: isPhone ? '16px' : '24px' }}>
      {backPath && (
        <button
          onClick={() => {
            navigate(backPath)
          }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: isPhone ? theme.accent : theme.textMuted,
            fontSize: isPhone ? '14px' : '12px',
            padding: isPhone ? '0 0 10px 0' : '0 0 8px 0',
            fontFamily: 'inherit',
            width: 'fit-content',
            minHeight: isPhone ? '44px' : undefined,
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = theme.textSecondary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = isPhone ? theme.accent : theme.textMuted
          }}
        >
          <svg
            className="rtl-flip"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel ?? t('ui.generic.back')}
        </button>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: isPhone ? 'flex-start' : 'flex-start',
          justifyContent: 'space-between',
          flexDirection: isPhone ? 'column' : 'row',
          gap: isPhone ? '12px' : '16px',
        }}
      >
        {/* Title block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1
                style={{
                  fontSize: isPhone ? '20px' : '24px',
                  fontWeight: isPhone ? 700 : 600,
                  color: theme.textPrimary,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h1>
              {badge && <div>{badge}</div>}
            </div>
            {subtitle && (
              <p
                style={{
                  fontSize: '13px',
                  color: theme.textSecondary,
                  marginTop: '3px',
                  margin: '3px 0 0',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {status && <div>{status}</div>}
        </div>

        {/* Actions */}
        {actions && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              flexShrink: isPhone ? undefined : 0,
              width: isPhone ? '100%' : undefined,
              flexWrap: 'wrap',
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
