import type { ReactNode } from 'react'
import { useTheme } from '../../theme/ThemeContext'

/**
 * A numbered heading for one of a form's cards, so the person can see the order the form is meant to be filled in
 * (what for, details, lines). Shared by the New Requisition form and the Record Goods Receipt form.
 */
export function SectionTitle({
  step,
  children,
  'data-tour': dataTour,
}: {
  step: number
  children: ReactNode
  /** Anchor for the onboarding walkthrough (components/help/tours.ts). */
  'data-tour'?: string
}) {
  const { theme } = useTheme()
  return (
    <div data-tour={dataTour} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span
        aria-hidden="true"
        style={{
          flex: 'none',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: '12px',
          fontWeight: 700,
          background: theme.accentSolid,
          color: theme.accentSolidText,
        }}
      >
        {step}
      </span>
      <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>{children}</span>
    </div>
  )
}
