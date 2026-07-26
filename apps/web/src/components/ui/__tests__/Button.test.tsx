import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button'
import { ThemeProvider } from '../../../theme/ThemeContext'

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('Button', () => {
  it('renders primary variant', () => {
    wrap(<Button variant="primary">Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('shows spinner when loading=true', () => {
    wrap(
      <Button variant="primary" loading>
        Click me
      </Button>,
    )
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('is disabled when loading prop set', () => {
    wrap(
      <Button variant="primary" loading>
        Click me
      </Button>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when disabled prop set', () => {
    wrap(
      <Button variant="primary" disabled>
        Click me
      </Button>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', () => {
    const fn = vi.fn()
    wrap(
      <Button variant="primary" onClick={fn}>
        Click me
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', () => {
    const fn = vi.fn()
    wrap(
      <Button variant="primary" disabled onClick={fn}>
        Click me
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(fn).not.toHaveBeenCalled()
  })
})
