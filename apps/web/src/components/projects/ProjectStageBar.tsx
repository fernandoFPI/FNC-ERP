import React, { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface Stage {
  id: string
  name: string
  sequence: number
  status: string
  completionPct: number
  plannedStartDate?: string
  plannedEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  notes?: string
}

interface Props {
  stages: Stage[]
  overallPct: number
  onStageClick?: (stage: Stage) => void
}

const stageColor = (status: string) => ({
  completed:   '#22c55e',
  active:      '#3b82f6',
  in_progress: '#3b82f6',
  pending:     '#d1d5db',
  cancelled:   '#f87171',
}[status] ?? '#d1d5db')

export function ProjectStageBar({ stages, overallPct, onStageClick }: Props) {
  const { theme } = useTheme()
  const [tooltip, setTooltip] = useState<{ stage: Stage; x: number; y: number } | null>(null)
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
        <span>Overall Completion</span>
        <span style={{ fontWeight: 600, color: theme.textPrimary }}>{overallPct ?? 0}%</span>
      </div>

      {/* Segmented bar */}
      <div style={{ display: 'flex', height: '18px', borderRadius: '999px', overflow: 'hidden', background: theme.border, gap: '1px' }}>
        {sorted.map(stage => (
          <div
            key={stage.id}
            style={{ flex: 1, background: theme.bgCanvas, cursor: 'pointer', position: 'relative' }}
            onMouseEnter={e => setTooltip({ stage, x: e.clientX, y: e.clientY })}
            onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
            onMouseLeave={() => setTooltip(null)}
            onClick={() => onStageClick?.(stage)}
          >
            <div style={{ height: '100%', width: `${stage.completionPct}%`, background: stageColor(stage.status) }} />
          </div>
        ))}
      </div>

      {/* Labels */}
      {sorted.length > 0 && (
        <div style={{ display: 'flex' }}>
          {sorted.map(stage => (
            <div key={stage.id} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textPrimary }}>{stage.completionPct}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', zIndex: 9999, left: tooltip.x + 12, top: tooltip.y - 10,
          background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', padding: '10px 12px', fontSize: '12px', pointerEvents: 'none', minWidth: '160px',
        }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>{tooltip.stage.name}</div>
          <div style={{ color: theme.textMuted }}>Status: <span style={{ color: theme.textPrimary, textTransform: 'capitalize' }}>{tooltip.stage.status.replace('_', ' ')}</span></div>
          <div style={{ color: theme.textMuted }}>Completion: <span style={{ color: theme.textPrimary }}>{tooltip.stage.completionPct}%</span></div>
          {tooltip.stage.plannedStartDate && <div style={{ color: theme.textMuted, marginTop: '2px' }}>Planned: {tooltip.stage.plannedStartDate} → {tooltip.stage.plannedEndDate ?? '—'}</div>}
          {tooltip.stage.notes && <div style={{ color: theme.textMuted, fontStyle: 'italic', marginTop: '4px' }}>{tooltip.stage.notes}</div>}
        </div>
      )}
    </div>
  )
}
