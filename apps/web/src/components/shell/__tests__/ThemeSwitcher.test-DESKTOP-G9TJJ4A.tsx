import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeSwitcher } from '../ThemeSwitcher'
import { ThemeProvider } from '../../../theme/ThemeContext'

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

function wrap() {
  return render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>
  )
}

describe('ThemeSwitcher', () => {
  it('shows all four theme options when open', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }))
    expect(screen.getByText('Dark glass')).toBeInTheDocument()
    expect(screen.getByText('Dark — white')).toBeInTheDocument()
    expect(screen.getByText('Light glass')).toBeInTheDocument()
    expect(screen.getByText('Light flat')).toBeInTheDocument()
  })

  it('marks current theme as selected (shows checkmark)', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }))
    // The active theme button contains a checkmark SVG
    const darkGlassBtn = screen.getByText('Dark glass').closest('button')
    expect(darkGlassBtn?.querySelector('svg')).toBeTruthy()
  })

  it('closes panel when clicking outside', async () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }))
    expect(screen.getByText('Dark glass')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(screen.queryByText('Dark glass')).not.toBeInTheDocument()
    })
  })
})
