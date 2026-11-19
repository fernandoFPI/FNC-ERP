// PageHeader's opt-in `compact` option: on a phone the header is one row (back arrow, title, status, actions) with the
// subtitle as one quiet line. Anywhere else, and without the option, the header is the one every other page has.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { PageHeader } from '../PageHeader'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
  mockNavigate.mockClear()
})

const show = (props: Partial<React.ComponentProps<typeof PageHeader>> = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <PageHeader
          title="REQ-2026-0047"
          subtitle="Purpose: project"
          backPath="/procurement/requisitions"
          backLabel="Requisitions"
          status={<span>Market pricing</span>}
          actions={<button type="button">More</button>}
          {...props}
        />
      </ThemeProvider>
    </MemoryRouter>,
  )

/** The one row of the compact header: arrow, text block and actions are its children. */
const compactRow = () => {
  const row = screen.getByRole('heading', { level: 1 }).parentElement?.parentElement?.parentElement
  if (!row) throw new Error('row not found')
  return row
}

describe('PageHeader compact', () => {
  describe('on a phone', () => {
    it('puts the arrow, the title, the status and the actions in one row', () => {
      setWidth(390)
      show({ compact: true })
      const row = compactRow()
      expect(row).toHaveStyle({ display: 'flex' })
      expect(row.style.flexDirection).not.toBe('column')
      expect(row).toContainElement(screen.getByRole('button', { name: 'Requisitions' }))
      expect(row).toContainElement(screen.getByText('Market pricing'))
      expect(row).toContainElement(screen.getByRole('button', { name: 'More' }))
    })

    it('the back control is an arrow named by backLabel, with no text on screen, and goes to backPath', () => {
      setWidth(390)
      show({ compact: true })
      const back = screen.getByRole('button', { name: 'Requisitions' })
      expect(back.textContent).toBe('')
      expect(back).toHaveStyle({ width: '44px' })
      fireEvent.click(back)
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions')
    })

    it('without a backLabel the arrow is still named, with the generic "Back"', () => {
      setWidth(390)
      show({ compact: true, backLabel: undefined })
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    })

    it('keeps the subtitle to one line that ends in an ellipsis instead of wrapping', () => {
      setWidth(390)
      show({ compact: true })
      expect(screen.getByText('Purpose: project')).toHaveStyle({
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      })
    })

    it('lines the title up with the arrow when there is one, and does not when there is none', () => {
      setWidth(390)
      const { unmount } = show({ compact: true })
      expect(screen.getByRole('heading', { level: 1 }).parentElement?.parentElement).toHaveStyle({
        paddingTop: '8px',
      })
      unmount()
      show({ compact: true, backPath: undefined })
      expect(screen.queryByRole('button', { name: 'Requisitions' })).toBeNull()
      expect(
        screen.getByRole('heading', { level: 1 }).parentElement?.parentElement,
      ).not.toHaveStyle({
        paddingTop: '8px',
      })
    })

    it('draws no actions area when there are no actions', () => {
      setWidth(390)
      show({ compact: true, actions: undefined })
      expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
    })
  })

  describe('everywhere else it is the header every other page has', () => {
    it('on a phone without the option: the long-standing text link and a stacked layout', () => {
      setWidth(390)
      show()
      const back = screen.getByRole('button', { name: /requisitions/i })
      expect(back.textContent).toMatch(/requisitions/i)
      // title block and actions are stacked, not on one row
      expect(screen.getByRole('button', { name: 'More' }).parentElement?.parentElement).toHaveStyle(
        {
          flexDirection: 'column',
        },
      )
    })

    it('on a desktop with the option: nothing changes', () => {
      show({ compact: true })
      const back = screen.getByRole('button', { name: /requisitions/i })
      expect(back.textContent).toMatch(/requisitions/i)
      expect(screen.getByRole('heading', { level: 1 })).toHaveStyle({ fontSize: '24px' })
    })
  })
})
