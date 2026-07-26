import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutboxEventRow } from '../OutboxEventRow'
import { ThemeProvider } from '../../../theme/ThemeContext'

const mockEvent = {
  id: 'evt-1',
  service: 'finance',
  eventType: 'JOURNAL_POSTED',
  status: 'pending',
  attempts: 0,
  maxAttempts: 5,
  createdAt: '2026-06-07T10:00:00Z',
}

function wrap(props: React.ComponentProps<typeof OutboxEventRow>) {
  return render(
    <ThemeProvider>
      <table>
        <tbody>
          <OutboxEventRow {...props} />
        </tbody>
      </table>
    </ThemeProvider>,
  )
}

describe('OutboxEventRow', () => {
  it('renders event type', () => {
    wrap({ event: mockEvent })
    expect(screen.getByText('JOURNAL_POSTED')).toBeInTheDocument()
  })

  it('renders service name', () => {
    wrap({ event: mockEvent })
    expect(screen.getByText('finance')).toBeInTheDocument()
  })

  it('shows status badge', () => {
    wrap({ event: mockEvent })
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows attempts count', () => {
    wrap({ event: { ...mockEvent, attempts: 3, maxAttempts: 5 } })
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/\/ 5/)).toBeInTheDocument()
  })

  it('shows retry button for failed events', () => {
    const onRetry = vi.fn()
    wrap({ event: { ...mockEvent, status: 'failed' }, onRetry })
    const btn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not show retry button for pending events', () => {
    wrap({ event: mockEvent })
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('shows view payload button', () => {
    const onViewPayload = vi.fn()
    wrap({ event: mockEvent, onViewPayload })
    const btn = screen.getByRole('button', { name: /payload/i })
    fireEvent.click(btn)
    expect(onViewPayload).toHaveBeenCalledOnce()
  })

  it('renders delivered status badge', () => {
    wrap({ event: { ...mockEvent, status: 'delivered' } })
    expect(screen.getByText('delivered')).toBeInTheDocument()
  })

  it('shows last error when present', () => {
    wrap({ event: { ...mockEvent, status: 'failed', lastError: 'Connection timeout' } })
    expect(screen.getByText(/Connection timeout/)).toBeInTheDocument()
  })
})
