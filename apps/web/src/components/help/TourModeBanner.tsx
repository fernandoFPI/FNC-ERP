import { useTourStore } from '../../store/tourStore'
import { useTheme } from '../../theme/ThemeContext'

export function TourModeBanner() {
  const { isActive, tourTitle, currentStep, totalSteps, deactivate } = useTourStore()
  const { theme } = useTheme()

  if (!isActive) return null

  const bg = theme.bgSurface
  const border = theme.borderStrong
  const accent = theme.accent
  const text = theme.textPrimary
  const muted = theme.textSecondary

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        background: bg,
        borderBottom: `2px solid ${accent}`,
        color: text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 100001,
        fontSize: '13px',
        fontWeight: 500,
        gap: '12px',
        boxShadow: `0 2px 16px rgba(0,0,0,0.18)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontSize: '15px' }}>🎓</span>
        <span style={{ fontWeight: 700, color: accent }}>Tour Mode</span>
        <span style={{ color: border }}>—</span>
        <span style={{ color: text }}>{tourTitle}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {totalSteps > 0 && (
          <span style={{ fontSize: '12px', color: muted }}>
            Step {currentStep + 1} of {totalSteps}
          </span>
        )}
        <span
          style={{
            background: `${accent}18`,
            border: `1px solid ${accent}35`,
            color: accent,
            borderRadius: '4px',
            padding: '2px 10px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          Nothing is saved
        </span>
        <button
          onClick={deactivate}
          style={{
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
            borderRadius: '6px',
            color: accent,
            padding: '4px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${accent}28`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${accent}15`
          }}
        >
          Exit Tour
        </button>
      </div>
    </div>
  )
}
