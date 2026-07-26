import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DLQEntryRow } from '../DLQEntryRow'
import { ThemeProvider } from '../../../theme/ThemeContext'

const mockEntry = {
  id: 'dlq-1',
  eventType: 'PAYROLL_FINALIZED',
  service: 'payroll',
  priority: 'critical' as const,
  status: 'pending',
  totalAttempts: 10,
  lastError: 'Database connection failed: could not connect to host',
  errorHistory: [
    { attempt: 1, error: 'timeout', at: '2026-06-07T08:00:00Z' },
    { attempt: 2, error: 'timeout', at: '2026-06-07T09:00:00Z' },
  ],
  createdAt: '2026-06-07T07:00:00Z',
}

function wrap(props: React.ComponentProps<typeof DLQEntryRow>) {
  return render(
    <ThemeProvider>
      <table>
        <tbody>
          <DLQEntryRow {...props} />
        </tbody>
      </table>
    </ThemeProvider>,
  )
}

describe('DLQEntryRow', () => {
  it('renders event type', () => {
    wrap({ entry: mockEntry, onRetry: vi.fn(), onDismiss: vi.fn(), onViewDetail: vi.fn() })
    expect(screen.getByText('PAYROLL_FINALIZED')).toBeInTheDocument()
  })

  it('renders priority badge', () => {
    wrap({ entry: mockEntry, onRetry: vi.fn(), onDismiss: vi.fn(), onViewDetail: vi.fn() })
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('shows total attempts', () => {
    wrap({ entry: mockEntry, onRetry: vi.fn(), onDismiss: vi.fn(), onViewDetail: vi.fn() })
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('shows truncated error message', () => {
    wrap({ entry: mockEntry, onRetry: vi.fn(), onDismiss: vi.fn(), onViewDetail: vi.fn() })
    expect(screen.getByText(/Database connection failed/)).toBeInTheDocument()
  })

  it('calls onRetry when Retry clicked', () => {
    const onRetry = vi.fn()
    wrap({ entry: mockEntry, onRetry, onDismiss: vi.fn(), onViewDetail: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('calls onDismiss when Dismiss clicked', () => {
    const onDismiss = vi.fn()
    wrap({ entry: mockEntry, onRetry: vi.fn(), onDismiss, onViewDetail: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('calls onViewDetail when Detail clicked', () => {
    const onViewDetail = vi.fn()
    wrap({ entry: mockEntry, onRetry: vi.fn(), onDismiss: vi.fn(), onViewDetail })
    fireEvent.click(screen.getByRole('button', { name: /detail/i }))
    expect(onViewDetail).toHaveBeenCalledOnce()
  })

  it('renders high priority badge', () => {
    wrap({
      entry: { ...mockEntry, priority: 'high' },
      onRetry: vi.fn(),
      onDismiss: vi.fn(),
      onViewDetail: vi.fn(),
    })
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('renders normal priority badge', () => {
    wrap({
      entry: { ...mockEntry, priority: 'normal' },
      onRetry: vi.fn(),
      onDismiss: vi.fn(),
      onViewDetail: vi.fn(),
    })
    expect(screen.getByText('normal')).toBeInTheDocument()
  })
})
