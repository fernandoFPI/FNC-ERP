// The new-requisition form drew its Priority box and its Expected Delivery date in the browser's own chrome (a black
// arrow, a thin pale edge, 36px) between searchable pickers in the newer style (40px, the readable edge), and its
// two-column rows put the second column at a different place on each row (flex rows with different basis sizes).
// Every box of the form is now in the one field look, and the rows of the details card are one grid.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { themes } from '../../../../theme/tokens'
import i18n from '../../../../i18n'
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
vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { companyId: string } }) => unknown) =>
    selector({ user: { companyId: 'company-1' } }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const light = themes['light-flat']

beforeEach(() => {
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({ data: undefined, loading: false })
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
})

async function open(purpose?: string) {
  const RequisitionForm = (await import('../RequisitionForm')).default
  const view = render(
    <MemoryRouter initialEntries={['/procurement/requisitions/new']}>
      <ThemeProvider>
        <RequisitionForm />
      </ThemeProvider>
    </MemoryRouter>,
  )
  if (purpose) fireEvent.click(screen.getByRole('radio', { name: purpose }))
  return view
}

// The native select that follows a form label (the summary card also prints some of these words).
const selectAfter = (label: string) => {
  for (const el of screen.getAllByText(label)) {
    if (el.tagName === 'LABEL' && el.nextElementSibling instanceof HTMLSelectElement) {
      return el.nextElementSibling
    }
  }
  throw new Error(`no native select after ${label}`)
}

// The Expected Delivery date box of an opened form.
const dateBox = (container: HTMLElement) => {
  const el = container.querySelector('input[type="date"]')
  if (!el) throw new Error('no date box')
  return el
}

// The row (a grid) that holds an element.
const gridRowOf = (el: Element) => {
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (n.style.display === 'grid') return n
  }
  throw new Error('not inside a grid row')
}

describe('RequisitionForm: every box is in the field look', () => {
  it('draws Priority as a native select in the field look, with the shared chevron', async () => {
    await open()
    const priority = selectAfter('Priority')
    expect(priority).toHaveStyle({ height: '40px', borderRadius: '10px' })
    expect(priority).toHaveStyle({ borderColor: light.borderField })
    expect(priority.style.appearance).toBe('none')
    expect(decodeURIComponent(priority.style.backgroundImage)).toContain('M2 4l4 4 4-4')
  })

  it('draws the Expected Delivery date and the notes the same way', async () => {
    const { container } = await open()
    const date = container.querySelector('input[type="date"]')
    expect(date).toHaveStyle({ height: '40px', borderRadius: '10px' })
    expect(date).toHaveStyle({ borderColor: light.borderField })
    const notes = container.querySelector('textarea')
    expect(notes).toHaveStyle({ borderRadius: '10px' })
    expect(notes).toHaveStyle({ borderColor: light.borderField })
  })

  it('draws the Project Supply destination and the line boxes the same way', async () => {
    const { container } = await open('Project Supply')
    expect(selectAfter('Delivery Destination *')).toHaveStyle({ height: '40px' })
    const lineBoxes = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[type="number"], input:not([type]), input[type="text"]',
      ),
    ]
    expect(lineBoxes.length).toBeGreaterThanOrEqual(3)
    for (const box of lineBoxes) {
      expect(box).toHaveStyle({ height: '40px', borderRadius: '10px' })
    }
  })

  it('draws the direct supply line currency as a field-look select', async () => {
    await open('Direct Supply')
    const currency = screen
      .getAllByRole<HTMLSelectElement>('combobox')
      .find((el) => el.value === 'IQD' && el.tagName === 'SELECT')
    expect(currency).toBeDefined()
    expect(currency).toHaveStyle({ height: '40px', borderRadius: '10px' })
  })
})

describe('RequisitionForm: the rows of the details card line up', () => {
  it('puts Branch and Priority on one grid row, and Received By and Expected Delivery on another', async () => {
    const { container } = await open()
    const priorityRow = gridRowOf(selectAfter('Priority'))
    expect(priorityRow).toHaveTextContent('Branch')
    const dateRow = gridRowOf(dateBox(container))
    expect(dateRow).toHaveTextContent('Received By')
    expect(dateRow).not.toBe(priorityRow)
  })

  it('gives every row the same two equal columns, so the second column starts at the same place', async () => {
    const { container } = await open()
    const rows = [gridRowOf(selectAfter('Priority')), gridRowOf(dateBox(container))]
    const templates = rows.map((r) => r.style.gridTemplateColumns)
    expect(new Set(templates).size).toBe(1)
    expect(templates[0]).toContain('repeat(auto-fit')
    for (const row of rows) {
      for (const cell of Array.from(row.children) as HTMLElement[]) {
        // no flex basis left over from the old rows: a basis is what made the columns drift
        expect(cell.style.flex).toBe('')
        expect(['0', '0px']).toContain(cell.style.minWidth)
      }
    }
  })

  it('keeps one column on a phone-width window', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true })
    try {
      const { container } = await open()
      const row = gridRowOf(dateBox(container))
      expect(row).toHaveStyle({ display: 'grid' })
      expect(row.style.gap).toBe('14px')
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        configurable: true,
        writable: true,
      })
    }
  })
})

describe('RequisitionForm: the hints are in the readable grey', () => {
  it('shows the expense receipt hint in textSecondary at 12px, not the pale muted 11px', async () => {
    await open('Expense')
    fireEvent.click(screen.getByLabelText(i18n.t('req.form.receiptPendingCheckbox')))
    const hints = screen.getAllByText(i18n.t('req.form.receiptAfterApproval'))
    expect(hints.length).toBeGreaterThan(0)
    for (const hint of hints) {
      expect(hint).toHaveStyle({ color: light.textSecondary, fontSize: '12px' })
    }
  })
})
