import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../auth/LoginPage'
import { ThemeProvider } from '../../theme/ThemeContext'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockLogin = vi.fn()
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: mockLogin }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

function wrap() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LoginPage />
      </ThemeProvider>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    wrap()
    expect(screen.getByPlaceholderText('you@fnc-group.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
  })

  it('shows loading state on submit', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {})) // never resolves
    wrap()
    fireEvent.change(screen.getByPlaceholderText('you@fnc-group.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    })
  })

  it('shows error message on failed login', async () => {
    const err = Object.assign(new Error(), {
      isAxiosError: true,
      response: { status: 401, data: { message: 'Invalid credentials' }, headers: {} },
    })
    // Make axios.isAxiosError return true for this error
    mockLogin.mockRejectedValue(err)
    const { default: axios } = await import('axios')
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true)
    wrap()
    fireEvent.change(screen.getByPlaceholderText('you@fnc-group.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('navigates to /mfa when requiresMFA is true', async () => {
    mockLogin.mockResolvedValue({ requiresMFA: true, tempToken: 'temp123' })
    wrap()
    fireEvent.change(screen.getByPlaceholderText('you@fnc-group.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/mfa', expect.objectContaining({ state: expect.objectContaining({ tempToken: 'temp123' }) }))
    })
  })

  it('navigates to /dashboard on successful login without MFA', async () => {
    mockLogin.mockResolvedValue({ requiresMFA: false })
    wrap()
    fireEvent.change(screen.getByPlaceholderText('you@fnc-group.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })
})
