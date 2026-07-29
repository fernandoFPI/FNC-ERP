import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { ScrollFadeRow } from './ScrollFadeRow'
import type { BadgeVariant } from './Badge'

export interface FilterChip {
  key: string
  label: string
  count: number
  variant?: BadgeVariant
}

interface FilterChipStripProps {
  chips: FilterChip[]
  activeKey: string
  onChange: (key: string) => void
  allLabel?: string
  allCount: number
  /** Background this strip sits on, for the ScrollFadeRow edge fade. Defaults to page canvas. */
  fadeColor?: string
}

// Horizontally-scrolling pill+count-badge filter strip — the "All / Draft (12) /
// Approved (4) / ..." pattern used above list pages. Distinct from TabBar
// (which drives page-section navigation, not a data filter).
export function FilterChipStrip({
  chips,
  activeKey,
  onChange,
  allLabel = 'All',
  allCount,
  fadeColor,
}: FilterChipStripProps) {
  const { theme } = useTheme()

  const variantColors: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
    success: { bg: theme.successBg, color: theme.success, border: theme.successBorder },
    warning: { bg: theme.warningBg, color: theme.warning, border: theme.warningBorder },
    danger: { bg: theme.dangerBg, color: theme.danger, border: theme.dangerBorder },
    info: { bg: theme.infoBg, color: theme.info, border: theme.infoBorder },
    neutral: { bg: theme.bgSurface, color: theme.textSecondary, border: theme.border },
    accent: { bg: theme.accentBg, color: theme.accent, border: theme.accentBorder },
  }

  return (
    <ScrollFadeRow fadeColor={fadeColor} style={{ gap: '6px', paddingBottom: '2px' }}>
      <button
        onClick={() => {
          onChange('')
        }}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '7px',
          cursor: 'pointer',
          border: `1px solid ${!activeKey ? theme.accentBorder : theme.border}`,
          background: !activeKey ? theme.accentBg : theme.bgSurface,
          color: !activeKey ? theme.accent : theme.textMuted,
          fontSize: '12px',
          fontWeight: !activeKey ? 600 : 400,
        }}
      >
        {allLabel}
        <span
          style={{
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            background: !activeKey ? theme.accent : theme.border,
            color: !activeKey ? '#fff' : theme.textMuted,
            padding: '0 4px',
          }}
        >
          {allCount}
        </span>
      </button>

      <div style={{ width: '1px', background: theme.border, margin: '4px 2px', flexShrink: 0 }} />

      {chips.map((chip) => {
        const active = activeKey === chip.key
        const vc = variantColors[chip.variant ?? 'neutral']
        return (
          <button
            key={chip.key}
            onClick={() => {
              onChange(active ? '' : chip.key)
            }}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              cursor: 'pointer',
              border: `1px solid ${active ? vc.border : theme.border}`,
              background: active ? vc.bg : theme.bgSurface,
              color: active ? vc.color : theme.textMuted,
              fontSize: '12px',
              fontWeight: active ? 600 : 400,
              opacity: chip.count === 0 ? 0.45 : 1,
            }}
          >
            {chip.label}
            <span
              style={{
                minWidth: '18px',
                height: '18px',
                borderRadius: '9px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                background: active ? vc.color : chip.count > 0 ? vc.bg : theme.border,
                color: active ? '#fff' : chip.count > 0 ? vc.color : theme.textMuted,
                padding: '0 4px',
              }}
            >
              {chip.count}
            </span>
          </button>
        )
      })}
    </ScrollFadeRow>
  )
}
