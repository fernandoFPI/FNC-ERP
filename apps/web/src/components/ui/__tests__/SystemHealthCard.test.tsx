import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SystemHealthCard } from '../SystemHealthCard'
import { ThemeProvider } from '../../../theme/ThemeContext'

function wrap(props: React.ComponentProps<typeof SystemHealthCard>) {
  return render(
    <ThemeProvider>
      <SystemHealthCard {...props} />
    </ThemeProvider>
  )
}

describe('SystemHealthCard', () => {
  it('renders service name', () => {
    wrap({ service: 'auth', status: 'ok', checks: {} })
    expect(screen.getByText('auth')).toBeInTheDocument()
  })

  it('shows OK status badge', () => {
    wrap({ service: 'finance', status: 'ok', checks: {} })
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('shows degraded status', () => {
    wrap({ service: 'gateway', status: 'degraded', checks: {} })
    expect(screen.getByText(/degraded/i)).toBeInTheDocument()
  })

  it('shows down status', () => {
    wrap({ service: 'hr', status: 'down', checks: {} })
    expect(screen.getByText(/down/i)).toBeInTheDocument()
  })

  it('shows latency when provided', () => {
    wrap({ service: 'inventory', status: 'ok', latencyMs: 45, checks: {} })
    expect(screen.getByText(/45/)).toBeInTheDocument()
  })

  it('shows uptime when provided', () => {
    wrap({ service: 'payroll', status: 'ok', checks: {}, uptime: 86400 })
    expect(screen.getByText(/1d 0h/)).toBeInTheDocument()
  })

  it('renders database check indicator', () => {
    wrap({ service: 'rental', status: 'ok', checks: { database: 'ok' } })
    expect(screen.getByText(/database/i)).toBeInTheDocument()
  })

  it('renders redis check indicator', () => {
    wrap({ service: 'rental', status: 'ok', checks: { redis: 'warn' } })
    expect(screen.getByText(/redis/i)).toBeInTheDocument()
  })
})
