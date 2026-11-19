// The progress strip on the requisition page: which phase is current, what the strip says, and how it
// looks on a phone.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import {
  REQUISITION_PHASES,
  getRequisitionPhaseLabel,
  getRequisitionStatusLabel,
} from '../../../lib/requisition-constants'
import { PhaseBar } from '../PhaseBar'

const phases = () =>
  REQUISITION_PHASES.map((p) => ({
    key: p.key,
    label: getRequisitionPhaseLabel(p.key),
    statuses: p.statuses,
  }))

const show = (status: string) =>
  render(
    <ThemeProvider>
      <PhaseBar
        phases={phases()}
        current={status}
        currentLabel={getRequisitionStatusLabel(status)}
        stoppedStatuses={['rejected', 'cancelled', 'deleted']}
      />
    </ThemeProvider>,
  )

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

afterEach(async () => {
  setWidth(1024)
  if (i18n.language !== 'en') {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

describe('PhaseBar', () => {
  it('names the current phase and status, and the step out of five', () => {
    show('market_pricing')
    expect(screen.getByText('Price · Market pricing')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
  })

  it('names both the phase and the status of a finished requisition', () => {
    show('completed')
    // "Done" is the phase, "Completed" the status: they differ, so both show.
    expect(screen.getByText(/Done · Completed/)).toBeInTheDocument()
  })

  it('shows just the status when the phase name and the status read the same', () => {
    render(
      <ThemeProvider>
        <PhaseBar
          phases={[{ key: 'p', label: 'Approved', statuses: ['approved'] }]}
          current="approved"
          currentLabel="Approved"
        />
      </ThemeProvider>,
    )
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.queryByText('Approved · Approved')).not.toBeInTheDocument()
  })

  it('shows the phase and status for the first and the approval steps', () => {
    const first = show('draft')
    expect(screen.getByText('Prepare · Draft')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
    first.unmount()
    show('pending_approval')
    expect(screen.getByText('Approve · Pending approval')).toBeInTheDocument()
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument()
  })

  it('marks only the current phase as the current step and ticks the finished ones', () => {
    show('market_pricing')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([
      null,
      'step',
      null,
      null,
      null,
    ])
    expect(within(items[0]).getByText('✓')).toBeInTheDocument()
    expect(within(items[2]).queryByText('✓')).not.toBeInTheDocument()
  })

  it('shows a finished requisition with every phase ticked and no current step', () => {
    show('completed')
    const items = screen.getAllByRole('listitem')
    expect(items.every((li) => li.getAttribute('aria-current') === null)).toBe(true)
    for (const li of items) expect(within(li).getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument()
  })

  it('shows a rejected requisition by its status, with no step count and no current step', () => {
    show('rejected')
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.queryByText(/^Step \d of 5$/)).not.toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.every((li) => li.getAttribute('aria-current') === null)).toBe(true)
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('shows a status that sits in no phase by its own name and ticks nothing', () => {
    render(
      <ThemeProvider>
        <PhaseBar phases={phases()} current="brand_new_status" currentLabel="Brand new status" />
      </ThemeProvider>,
    )
    expect(screen.getByText('Brand new status')).toBeInTheDocument()
    expect(screen.queryByText(/^Step \d of 5$/)).not.toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('on a phone, says the current step on one line and keeps the phase names for screen readers only', () => {
    setWidth(390)
    show('market_pricing')
    // The one visible line; the segments carry only hidden phase names.
    expect(screen.getByText('Price · Market pricing').tagName).toBe('STRONG')
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
    expect(screen.getByText('Prepare')).toBeInTheDocument()
    expect(screen.getByText('Prepare').style.position).toBe('absolute')
  })

  it('on a desktop, puts each phase name under its segment instead of a separate line', () => {
    show('market_pricing')
    expect(screen.getByText('Price · Market pricing').tagName).toBe('SPAN')
    expect(screen.getByText('Approve').style.position).not.toBe('absolute')
  })

  it('reads in Arabic, with the Arabic phase names and step count', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    show('market_pricing')
    expect(screen.getByText('الخطوة 2 من 5')).toBeInTheDocument()
    expect(screen.getByText(/التسعير ·/)).toBeInTheDocument()
  })
})
