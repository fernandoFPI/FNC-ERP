import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { Card } from '../Card'

// The onboarding walkthrough (components/help/tours.ts) finds its targets with [data-tour="..."]. The Card used to
// drop the attribute, so four of its anchors (the requisition form's details, lines and summary cards, and the PO
// form's lines card) pointed at nothing and the tour could not highlight them.
describe('Card data-tour', () => {
  it('puts the walkthrough anchor on the card itself', () => {
    const { container } = render(
      <ThemeProvider>
        <Card data-tour="req-details-card">content</Card>
      </ThemeProvider>,
    )
    const el = container.querySelector('[data-tour="req-details-card"]')
    expect(el).not.toBeNull()
    expect(el).toHaveTextContent('content')
  })

  it('adds no attribute when none is given', () => {
    const { container } = render(
      <ThemeProvider>
        <Card>content</Card>
      </ThemeProvider>,
    )
    expect(container.querySelector('[data-tour]')).toBeNull()
  })
})
