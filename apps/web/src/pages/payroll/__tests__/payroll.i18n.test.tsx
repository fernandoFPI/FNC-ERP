import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
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
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

function renderForm(Form: React.ComponentType) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Form />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// Regression: the "cannot create, a posted run exists" guard used to look for the English word "Cannot" in the
// warning text, so in Arabic an overlapping posted run no longer blocked submission.
describe('PayrollRunForm overlap guard is language independent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])
  })
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  async function fillOverlapping(status: string) {
    mockUseQuery.mockReturnValue({
      data: { payrollRuns: [{ id: 'r1', start_date: '2026-06-01', end_date: '2026-06-30', status }] },
      loading: false,
    })
    const Form = (await import('../runs/PayrollRunForm')).default
    const { container } = renderForm(Form)
    const [start, end] = Array.from(container.querySelectorAll('input[type="date"]'))
    fireEvent.change(start, { target: { value: '2026-06-10' } })
    fireEvent.change(end, { target: { value: '2026-06-20' } })
    fireEvent.blur(end)
    return container
  }

  for (const lang of ['en', 'ar'] as const) {
    it(`blocks creation when a posted run overlaps (${lang})`, async () => {
      await i18n.changeLanguage(lang)
      await fillOverlapping('posted')
      const submit = screen.getByRole('button', { name: i18n.t('payroll.runForm.createRun') })
      expect(submit).toBeDisabled()
    })

    it(`only warns, without blocking, for an overlapping draft run (${lang})`, async () => {
      await i18n.changeLanguage(lang)
      await fillOverlapping('draft')
      const submit = screen.getByRole('button', { name: i18n.t('payroll.runForm.createRun') })
      expect(submit).not.toBeDisabled()
      expect(screen.getByText(i18n.t('payroll.runForm.warningAnOverlappingPayrollRunExists'))).toBeInTheDocument()
    })
  }
})
