import { useAuthStore } from '../store/authStore'
import { useCompanyStore } from '../store/companyStore'
import { api } from '../lib/axios'
import { decodeJWT } from '../lib/jwt'

type CompanyFromResponse = { id: string; name: string; currency_code?: string }

function getBrowserName(): string {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/')) return 'Safari'
  return 'Browser'
}

function applyAuthResponse(
  accessToken: string,
  refreshToken: string,
  user: { id: string; email: string; mfaEnabled: boolean; profileCompleted?: boolean },
  companies: CompanyFromResponse[],
) {
  const payload = decodeJWT(accessToken)
  const role = payload?.role ?? 'user'
  const companyId = payload?.companyId

  useAuthStore.getState().setAuth(
    { id: user.id, email: user.email, role, mfaEnabled: user.mfaEnabled, companyId, profileCompleted: user.profileCompleted ?? false },
    accessToken,
    refreshToken,
  )

  if (companies.length > 0) {
    const mapped = companies.map((c) => ({
      id: c.id,
      name: c.name,
      currencyCode: c.currency_code ?? '',
    }))
    useCompanyStore.getState().setCompanies(mapped)

    const current = useCompanyStore.getState().activeCompany
    const active =
      mapped.find((c) => c.id === companyId) ??
      (current ? (mapped.find((c) => c.id === current.id) ?? mapped[0]) : mapped[0])
    if (active) useCompanyStore.getState().setActiveCompany(active)
  }
}

export function useAuth() {
  const store = useAuthStore()

  async function login(email: string, password: string) {
    const res = await api.post<{
      requiresMFA: boolean
      tempToken?: string
      accessToken?: string
      refreshToken?: string
      user?: { id: string; email: string; mfaEnabled: boolean; profileCompleted?: boolean }
      companies?: CompanyFromResponse[]
    }>('/auth/login', {
      email,
      password,
      deviceName: getBrowserName(),
      platform: 'web',
      deviceToken: localStorage.getItem('fnc_device_token') ?? undefined,
    })

    if (res.data.requiresMFA && res.data.tempToken) {
      store.setMFAPending(res.data.tempToken)
      return { requiresMFA: true, tempToken: res.data.tempToken }
    }

    if (res.data.accessToken && res.data.refreshToken && res.data.user) {
      applyAuthResponse(
        res.data.accessToken,
        res.data.refreshToken,
        res.data.user,
        res.data.companies ?? [],
      )
      return { requiresMFA: false }
    }

    throw new Error('Unexpected login response')
  }

  async function verifyMFA(tempToken: string, totpCode: string, trustDevice?: boolean) {
    const res = await api.post<{
      accessToken: string
      refreshToken: string
      user: { id: string; email: string; mfaEnabled: boolean; profileCompleted?: boolean }
      companies?: CompanyFromResponse[]
      deviceToken?: string
    }>('/auth/mfa/verify', { tempToken, totpCode, trustDevice })

    if (res.data.deviceToken) {
      localStorage.setItem('fnc_device_token', res.data.deviceToken)
    }

    applyAuthResponse(
      res.data.accessToken,
      res.data.refreshToken,
      res.data.user,
      res.data.companies ?? [],
    )
  }

  function logout() {
    store.clearAuth()
    useCompanyStore.getState().setCompanies([])
    window.location.href = '/login'
  }

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    mfaPending: store.mfaPending,
    login,
    verifyMFA,
    logout,
  }
}
