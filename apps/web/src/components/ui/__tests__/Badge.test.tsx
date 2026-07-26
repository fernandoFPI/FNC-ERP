import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'
import { ThemeProvider } from '../../../theme/ThemeContext'

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('Badge', () => {
  it('renders success variant', () => {
    wrap(<Badge variant="success">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders warning variant correctly', () => {
    wrap(<Badge variant="warning">Pending</Badge>)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows dot when dot=true', () => {
    const { container } = wrap(
      <Badge variant="success" dot>
        Active
      </Badge>,
    )
    // dot is a child span inside the badge span
    const spans = container.querySelectorAll('span span')
    expect(spans.length).toBeGreaterThan(0)
  })
})
