// The Log tab's timeline: what happened, who did it and when, with a rejection's reason as a quote.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import {
  getRequisitionLogActionLabel,
  getRequisitionLogActionTone,
} from '../../../lib/requisition-constants'
import { ActivityTimeline, type ActivityEntry } from '../ActivityTimeline'

const entry = (over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: 'e-1',
  action: 'confirm_inventory_check',
  actor_name: 'Sara Hassan',
  actor_position: 'store_keeper',
  notes: null,
  created_at: '2026-01-16T09:30:00.000Z',
  ...over,
})

const show = (entries: ActivityEntry[]) =>
  render(
    <ThemeProvider>
      <ActivityTimeline entries={entries} systemActor="System" />
    </ThemeProvider>,
  )

afterEach(async () => {
  if (i18n.language !== 'en') {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

describe('ActivityTimeline', () => {
  it('says what happened as a sentence, not as the raw action name', () => {
    show([entry()])
    expect(screen.getByText('Confirmed the inventory check')).toBeInTheDocument()
    expect(screen.queryByText(/confirm inventory check/i)).not.toBeInTheDocument()
  })

  it('names who did it, their position and when', () => {
    show([entry()])
    const item = screen.getByRole('listitem')
    expect(within(item).getByText(/Sara Hassan \(store_keeper\)/)).toBeInTheDocument()
    expect(within(item).getByText('2026-01-16 09:30')).toBeInTheDocument()
    expect(item.querySelector('time')).toHaveAttribute('datetime', '2026-01-16T09:30:00.000Z')
  })

  it('shows the system when no person is behind the entry, and no position when there is none', () => {
    show([entry({ actor_name: null, actor_position: null })])
    const item = screen.getByRole('listitem')
    expect(within(item).getByText(/System/)).toBeInTheDocument()
    expect(item.textContent).not.toContain('(')
  })

  it('draws a rejection reason as a quote under its step, and nothing when there is no note', () => {
    show([
      entry({ id: 'e-1', action: 'reject_to_market_pricing', notes: 'Prices look too high' }),
      entry({ id: 'e-2', action: 'approve', notes: null }),
    ])
    const [first, second] = screen.getAllByRole('listitem')
    expect(within(first).getByText('Prices look too high')).toBeInTheDocument()
    expect(within(second).queryByText('Prices look too high')).not.toBeInTheDocument()
    expect(second.querySelectorAll('div').length).toBeLessThan(first.querySelectorAll('div').length)
  })

  it('keeps the order it was given, oldest first', () => {
    show([
      entry({ id: 'e-1', action: 'submit_to_inventory_check' }),
      entry({ id: 'e-2', action: 'confirm_inventory_check' }),
      entry({ id: 'e-3', action: 'approve' }),
    ])
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Submitted for inventory check'),
      expect.stringContaining('Confirmed the inventory check'),
      expect.stringContaining('Approved'),
    ])
  })

  it('colours the dot by what kind of step it was: done, sent back, or ordinary', () => {
    show([
      entry({ id: 'e-1', action: 'approve' }),
      entry({ id: 'e-2', action: 'reject_to_market_pricing' }),
      entry({ id: 'e-3', action: 'confirm_inventory_check' }),
    ])
    const dot = (li: HTMLElement) => li.querySelector('span[style*="border-radius: 50%"]')
    const [approved, sentBack, ordinary] = screen.getAllByRole('listitem')
    expect(dot(approved)).toHaveStyle({ background: themes['light-flat'].success })
    expect(dot(sentBack)).toHaveStyle({ background: themes['light-flat'].danger })
    expect(dot(ordinary)).toHaveStyle({ background: themes['light-flat'].accent })
  })

  it('draws the connecting line between steps but not after the last one', () => {
    show([entry({ id: 'e-1' }), entry({ id: 'e-2' })])
    const [first, last] = screen.getAllByRole('listitem')
    expect(first.querySelectorAll('span[aria-hidden], div[aria-hidden] > span')).toHaveLength(2)
    expect(last.querySelectorAll('div[aria-hidden] > span')).toHaveLength(1)
  })

  it('reads the text in the readable greys, never the pale muted one', () => {
    show([entry({ notes: 'Because' })])
    expect(screen.getByText(/Sara Hassan/)).toHaveStyle({
      color: themes['light-flat'].textSecondary,
    })
    expect(screen.getByText(/Sara Hassan/)).not.toHaveStyle({
      color: themes['light-flat'].textMuted,
    })
    expect(screen.getByText('Confirmed the inventory check')).toHaveStyle({
      color: themes['light-flat'].textPrimary,
    })
  })

  it('shows an action it has no sentence for as its own words, so no entry is dropped', () => {
    show([entry({ action: 'some_future_action' })])
    expect(screen.getByText('some future action')).toBeInTheDocument()
  })

  it('reads in Arabic, with no raw key and the colour still decided by the action name', async () => {
    await i18n.changeLanguage('ar')
    show([entry({ action: 'approve' }), entry({ id: 'e-2', action: 'reject' })])
    expect(document.body.textContent).not.toMatch(/req\.logAction\./)
    expect(screen.getByText(getRequisitionLogActionLabel('approve'))).toBeInTheDocument()
    expect(getRequisitionLogActionLabel('approve')).not.toBe('Approved')
    const dot = (li: HTMLElement) => li.querySelector('span[style*="border-radius: 50%"]')
    const [approved, rejected] = screen.getAllByRole('listitem')
    expect(dot(approved)).toHaveStyle({ background: themes['light-flat'].success })
    expect(dot(rejected)).toHaveStyle({ background: themes['light-flat'].danger })
  })
})

describe('log action labels and tones', () => {
  const ACTIONS = [
    'submit_to_inventory_check',
    'confirm_inventory_check',
    'submit_to_market_pricing',
    'submit_to_price_verification',
    'submit_for_approval',
    'reject_verification_to_market_pricing',
    'reject_verification_to_store_pricing',
    'reject_verification_to_inventory_check',
    'reject_to_inventory_check',
    'reject_to_market_pricing',
    'reset_to_draft',
    'approve',
    'approved',
    'reject',
    'start_buying',
    'skip_buying',
    'finish_buying',
    'complete',
    'cancel',
    'delete',
    'edit_applied',
    'edit_approved',
    'edit_rejected',
  ]

  it('has a readable sentence for every action the gateway writes, none of them the raw name', () => {
    for (const action of ACTIONS) {
      const label = getRequisitionLogActionLabel(action)
      expect(label, action).not.toBe(action)
      expect(label, action).not.toContain('_')
      expect(label, action).not.toMatch(/^req\./)
    }
  })

  it.each([
    ['approve', 'success'],
    ['approved', 'success'],
    ['complete', 'success'],
    ['finish_buying', 'success'],
    ['edit_approved', 'success'],
    ['edit_applied', 'success'],
    ['reject', 'danger'],
    ['reject_to_market_pricing', 'danger'],
    ['reject_verification_to_store_pricing', 'danger'],
    ['cancel', 'danger'],
    ['delete', 'danger'],
    ['edit_rejected', 'danger'],
    ['submit_for_approval', 'info'],
    ['reset_to_draft', 'info'],
    ['something_new', 'info'],
  ])('%s is %s', (action, tone) => {
    expect(getRequisitionLogActionTone(action)).toBe(tone)
  })
})
