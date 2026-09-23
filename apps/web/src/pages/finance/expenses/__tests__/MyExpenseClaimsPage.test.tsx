import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

const mockGet = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { employeeId: string } }) => unknown) =>
    selector({ user: { employeeId: 'emp-1' } }),
}))

const addToast = vi.fn()
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) => selector({ addToast }),
}))

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Regression: a claimant without projects.view (e.g. only holds a
// procurement position) got an empty category dropdown too — claims,
// categories, and projects used to load via one Promise.all, so the
// projects 403 failed the whole batch and silently dropped categories,
// even though the categories endpoint itself has no permission gate.
describe('MyExpenseClaimsPage — projects.view permission does not block categories', () => {
  it('loads claims and categories even when /projects 403s for this user', async () => {
    let projectsCall: Promise<unknown> = Promise.resolve()
    mockGet.mockImplementation((url: string) => {
      if (url === '/finance/expense-claims/mine') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/finance/expense-claims/categories/mine') {
        return Promise.resolve({
          data: [
            { id: 'cat-1', name: 'Travel' },
            { id: 'cat-2', name: 'Fuel' },
          ],
        })
      }
      if (url === '/projects') {
        projectsCall = Promise.reject({ response: { status: 403 } })
        return projectsCall
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    const MyExpenseClaimsPage = (await import('../MyExpenseClaimsPage')).default
    wrap(<MyExpenseClaimsPage />)

    const newClaimButton = await screen.findByRole('button', { name: /new claim/i })
    newClaimButton.click()

    await waitFor(() => {
      expect(screen.getByText('Travel')).toBeInTheDocument()
    })
    expect(screen.getByText('Fuel')).toBeInTheDocument()
    // The failure is expected/benign (no project access) — shouldn't
    // surface as an error toast.
    expect(addToast).not.toHaveBeenCalled()
    // Let the /projects rejection's own catch (setProjects/setLoading) settle
    // before the test ends, so React doesn't warn about an act()-less update.
    await projectsCall.catch(() => {})
  })

  it('shows an error toast when claims/categories themselves fail to load', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/finance/expense-claims/mine') {
        return Promise.reject(new Error('network error'))
      }
      if (url === '/finance/expense-claims/categories/mine') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/projects') {
        return Promise.resolve({ data: { data: [] } })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    const MyExpenseClaimsPage = (await import('../MyExpenseClaimsPage')).default
    wrap(<MyExpenseClaimsPage />)

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      )
    })
  })
})
