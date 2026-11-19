// The New Requisition form on a phone: Create sits in the bar fixed above the bottom navigation (where the thumb is, not
// at the top of a long scroll), the header is one row, and the page leaves room for the bar. A desktop keeps Create in
// the header.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    gql: actual.gql,
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

let FormLazy: React.ComponentType = () => null
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/procurement/requisitions/new']}>
      <ThemeProvider>
        <FormLazy />
      </ThemeProvider>
    </MemoryRouter>,
  )

beforeEach(async () => {
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({ data: undefined, loading: false })
  mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])
  FormLazy = (await import('../RequisitionForm')).default
})
afterEach(() => {
  setWidth(1024)
  vi.restoreAllMocks()
})

const createButtons = () => screen.getAllByRole('button', { name: /create requisition/i })

describe('RequisitionForm on a phone', () => {
  it('has one Create button, in a bar fixed above the bottom navigation', () => {
    setWidth(390)
    mount()
    expect(createButtons()).toHaveLength(1)
    // the button sits in a small column (progress line above it) inside the fixed bar
    const bar = createButtons()[0].parentElement?.parentElement
    if (!bar) throw new Error('the bar was not found')
    expect(bar).toHaveStyle({ position: 'fixed', left: '0px', right: '0px' })
    expect(bar.style.bottom).toContain('64px')
  })

  it('the bar button submits the form', () => {
    setWidth(390)
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined)
    mount()
    fireEvent.click(createButtons()[0])
    expect(requestSubmit).toHaveBeenCalledTimes(1)
  })

  it('has a one-row header with a back arrow, and the title is not crowded by a button', () => {
    setWidth(390)
    mount()
    const back = screen.getByRole('button', { name: /back/i })
    expect(back.textContent).toBe('')
    fireEvent.click(back)
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions')
    const row = screen.getByRole('heading', { level: 1 }).parentElement?.parentElement
      ?.parentElement
    expect(row).not.toContainElement(createButtons()[0])
  })

  it('leaves room under the form for the fixed bar and the bottom navigation', () => {
    setWidth(390)
    const { container } = mount()
    const page = container.firstElementChild as HTMLElement
    expect(page.style.padding).toContain('170px')
  })
})

describe('RequisitionForm on a desktop', () => {
  it('keeps the one Create button in the page header, not fixed to the screen', () => {
    mount()
    expect(createButtons()).toHaveLength(1)
    const button = createButtons()[0]
    let el: HTMLElement | null = button
    while (el) {
      expect(el.style.position).not.toBe('fixed')
      el = el.parentElement
    }
    // beside the title, as before: the button's actions area and the title block share the header's row
    const row = button.parentElement?.parentElement
    expect(row).toContainElement(screen.getByRole('heading', { level: 1 }))
  })

  it('submits the form from the header button', () => {
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined)
    mount()
    fireEvent.click(createButtons()[0])
    expect(requestSubmit).toHaveBeenCalledTimes(1)
  })

  it('has the text back link, not the phone arrow', () => {
    mount()
    expect(screen.getByRole('button', { name: /back/i }).textContent).toMatch(/back/i)
  })
})
