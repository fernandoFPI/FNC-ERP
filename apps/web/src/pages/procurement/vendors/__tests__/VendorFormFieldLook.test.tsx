// The vendor form is the last procurement form that drew its boxes in the plain style (36px, a pale edge) while the
// requisition, PO, receipt and return forms use the field look. Every text, number and select box of it now does too.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { themes } from '../../../../theme/tokens'
import type * as ApolloClientModule from '@apollo/client'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
  }
})
vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

const light = themes['light-flat']

beforeEach(() => {
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({ data: undefined, loading: false })
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
})

async function open() {
  const VendorForm = (await import('../VendorForm')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/vendors/new']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/vendors/new" element={<VendorForm />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('VendorForm boxes', () => {
  it('draws every text and number box in the field look', async () => {
    const { container } = await open()
    const boxes = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="file"])',
      ),
    ]
    expect(boxes.length).toBeGreaterThanOrEqual(8)
    for (const box of boxes) {
      expect(box).toHaveStyle({ height: '40px', borderRadius: '10px' })
      expect(box).toHaveStyle({ borderColor: light.borderField })
    }
  })

  it('draws the currency box the same way, as a native select with the shared chevron', async () => {
    const { container } = await open()
    const selects = [...container.querySelectorAll<HTMLSelectElement>('select')]
    expect(selects.length).toBeGreaterThan(0)
    for (const select of selects) {
      expect(select).toHaveStyle({ height: '40px', borderRadius: '10px' })
      expect(select.style.appearance).toBe('none')
    }
  })
})
