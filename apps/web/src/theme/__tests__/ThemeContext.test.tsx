import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../ThemeContext'
import { themes } from '../tokens'

// Mock the fetch used for backend persistence
global.fetch = vi.fn().mockResolvedValue({ ok: true })

function ThemeDisplay() {
  const { themeKey } = useTheme()
  return <div data-testid="key">{themeKey}</div>
}

function ThemeChanger({ target }: { target: string }) {
  const { setTheme } = useTheme()
  return <button onClick={() => setTheme(target as never)}>change</button>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.cssText = ''
  document.body.className = ''
})

describe('ThemeContext', () => {
  it('applies light-flat tokens to CSS custom properties on mount', () => {
    render(<ThemeProvider><div /></ThemeProvider>)
    const bg = document.documentElement.style.getPropertyValue('--bg-canvas')
    expect(bg).toBe(themes['light-flat'].bgCanvas)
  })

  it('switches tokens when setTheme is called', () => {
    const { getByText, getByTestId } = render(
      <ThemeProvider>
        <ThemeDisplay />
        <ThemeChanger target="black" />
      </ThemeProvider>
    )
    act(() => getByText('change').click())
    expect(getByTestId('key').textContent).toBe('black')
    const bg = document.documentElement.style.getPropertyValue('--bg-canvas')
    expect(bg).toBe(themes['black'].bgCanvas)
  })

  it('persists theme key to localStorage', () => {
    const { getByText } = render(
      <ThemeProvider>
        <ThemeChanger target="black" />
      </ThemeProvider>
    )
    act(() => getByText('change').click())
    expect(localStorage.getItem('fnc-theme')).toBe('black')
  })

  it('reads saved theme from localStorage on init', () => {
    localStorage.setItem('fnc-theme', 'black')
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )
    expect(getByTestId('key').textContent).toBe('black')
  })

  it('falls back to light-flat when localStorage value is invalid', () => {
    localStorage.setItem('fnc-theme', 'not-a-theme')
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    )
    expect(getByTestId('key').textContent).toBe('light-flat')
  })
})
