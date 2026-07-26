import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from './Modal'
import { Input } from './Input'
import { Button } from './Button'

export type ConditionRating = 1 | 2 | 3 | 4 | 5

export interface ConditionReport {
  asset_id: string
  report_date: string
  rating: ConditionRating
  checklist: Record<string, boolean>
  notes?: string
  gps_lat?: number
  gps_lng?: number
  photo_urls?: string[]
}

const DEFAULT_CHECKLIST = [
  'Body/Frame intact',
  'Engine/Motor OK',
  'Tires/Wheels OK',
  'Brakes functional',
  'Lights operational',
  'Safety equipment present',
  'Fluid levels OK',
  'Documentation on board',
]

interface Props {
  open: boolean
  assetId: string
  assetName: string
  onSubmit: (report: ConditionReport) => Promise<void>
  onClose: () => void
}

export function ConditionReportForm({ open, assetId, assetName, onSubmit, onClose }: Props) {
  const { theme } = useTheme()
  const [rating, setRating] = useState<ConditionRating>(3)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_CHECKLIST.map((k) => [k, true])),
  )
  const [notes, setNotes] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const RATING_COLORS: Record<number, string> = {
    1: theme.danger,
    2: theme.warning,
    3: theme.accent,
    4: theme.info ?? theme.accent,
    5: theme.success,
  }
  const RATING_LABELS: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Average',
    4: 'Good',
    5: 'Excellent',
  }

  function captureGPS() {
    setGpsLoading(true)
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsLoading(false)
      },
      () => {
        setGpsLoading(false)
      },
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({
        asset_id: assetId,
        report_date: new Date().toISOString().slice(0, 10),
        rating,
        checklist,
        notes: notes || undefined,
        gps_lat: gps?.lat,
        gps_lng: gps?.lng,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Condition Report — ${assetName}`}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          padding: '20px',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}
      >
        {/* Rating */}
        <div>
          <div
            style={{
              fontSize: '13px',
              color: theme.textSecondary,
              marginBottom: '8px',
              fontWeight: 500,
            }}
          >
            Overall Condition
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([1, 2, 3, 4, 5] as ConditionRating[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRating(r)
                }}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: `2px solid ${r === rating ? RATING_COLORS[r] : theme.border}`,
                  background: r === rating ? RATING_COLORS[r] : theme.bgSurface,
                  color: r === rating ? '#fff' : theme.textMuted,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  transition: 'all 0.15s',
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '4px', fontSize: '12px', color: RATING_COLORS[rating] }}>
            {RATING_LABELS[rating]}
          </div>
        </div>

        {/* Checklist */}
        <div>
          <div
            style={{
              fontSize: '13px',
              color: theme.textSecondary,
              marginBottom: '8px',
              fontWeight: 500,
            }}
          >
            Inspection Checklist
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {DEFAULT_CHECKLIST.map((item) => (
              <label
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: theme.textPrimary,
                }}
              >
                <input
                  type="checkbox"
                  checked={checklist[item] ?? false}
                  onChange={(e) => {
                    setChecklist((c) => ({ ...c, [item]: e.target.checked }))
                  }}
                  style={{ accentColor: theme.accent }}
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        {/* GPS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="ghost" size="sm" type="button" onClick={captureGPS} loading={gpsLoading}>
            Capture GPS
          </Button>
          {gps && (
            <span style={{ fontSize: '12px', color: theme.success, fontFamily: 'monospace' }}>
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
            </span>
          )}
        </div>

        <Input
          label="Notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            Submit Report
          </Button>
        </div>
      </form>
    </Modal>
  )
}
