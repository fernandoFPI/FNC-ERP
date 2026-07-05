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
  it('shows both theme options when open', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }))
    expect(screen.getByText('Light flat')).toBeInTheDocument()
    expect(screen.getByText('Black')).toBeInTheDocument()
  })

  it('marks current theme as selected (shows checkmark)', () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }))
    // Default theme after localStorage.clear() is 'light-flat' (label 'Light flat')
    const lightFlatBtn = screen.getByText('Light flat').closest('button')
    expect(lightFlatBtn?.querySelector('svg')).toBeTruthy()
  })

  it('closes panel when clicking outside', async () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }))
    expect(screen.getByText('Light flat')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(screen.queryByText('Light flat')).not.toBeInTheDocument()
    })
  })
})
