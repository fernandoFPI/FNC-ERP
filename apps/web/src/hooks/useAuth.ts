import { useAuthStore } from '../store/authStore'
import { useCompanyStore, type Company } from '../store/companyStore'
import { api } from '../lib/axios'
import { decodeJWT } from '../lib/jwt'

interface CompanyFromResponse {
  id: string
  name: string
  currency_code?: string
}

const IMPERSONATION_COMPANY_STASH_KEY = 'fnc-impersonation-company-stash'

function stashCompaniesForImpersonation() {
  const { companies, activeCompany } = useCompanyStore.getState()
  sessionStorage.setItem(
    IMPERSONATION_COMPANY_STASH_KEY,
    JSON.stringify({ companies, activeCompany }),
  )
}

function restoreCompaniesAfterImpersonation() {
  const raw = sessionStorage.getItem(IMPERSONATION_COMPANY_STASH_KEY)
  sessionStorage.removeItem(IMPERSONATION_COMPANY_STASH_KEY)
  if (!raw) return
  try {
    const stash = JSON.parse(raw) as { companies: Company[]; activeCompany: Company | null }
    useCompanyStore.getState().setCompanies(stash.companies)
    if (stash.activeCompany) useCompanyStore.setState({ activeCompany: stash.activeCompany })
  } catch {
    /* stash corrupt or missing — nothing to restore, admin just re-picks a company */
  }
}

function getBrowserName(): string {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/')) return 'Safari'
  return 'Browser'
}

interface AuthResponseUser {
  id: string
  email: string
  mfaEnabled: boolean
  profileCompleted?: boolean
  employeeId?: string | null
}

function deriveUserAndCompany(accessToken: string, user: AuthResponseUser) {
  const payload = decodeJWT(accessToken)
  const role = payload?.role ?? 'user'
  const companyId = payload?.companyId
  return {
    userForStore: {
      id: user.id,
      email: user.email,
      role,
      mfaEnabled: user.mfaEnabled,
      companyId,
      profileCompleted: user.profileCompleted ?? false,
      employeeId: user.employeeId ?? null,
    },
    companyId,
  }
}

function applyCompanies(companies: CompanyFromResponse[], activeCompanyId: string | undefined) {
  if (companies.length === 0) return
  const mapped = companies.map((c) => ({
    id: c.id,
    name: c.name,
    currencyCode: c.currency_code ?? '',
  }))
  useCompanyStore.getState().setCompanies(mapped)

  const current = useCompanyStore.getState().activeCompany
  const active =
    mapped.find((c) => c.id === activeCompanyId) ??
    (current ? (mapped.find((c) => c.id === current.id) ?? mapped[0]) : mapped[0])
  if (active) useCompanyStore.getState().setActiveCompany(active)
}

function applyAuthResponse(
  accessToken: string,
  refreshToken: string,
  user: AuthResponseUser,
  companies: CompanyFromResponse[],
) {
  const { userForStore, companyId } = deriveUserAndCompany(accessToken, user)
  useAuthStore.getState().setAuth(userForStore, accessToken, refreshToken)
  applyCompanies(companies, companyId)
}

function applyImpersonationResponse(
  accessToken: string,
  refreshToken: string,
  user: AuthResponseUser,
  companies: CompanyFromResponse[],
) {
  const { userForStore, companyId } = deriveUserAndCompany(accessToken, user)
  useAuthStore.getState().startImpersonation(userForStore, accessToken, refreshToken)
  applyCompanies(companies, companyId)
}

export function useAuth() {
  const store = useAuthStore()

  async function login(email: string, password: string) {
    const res = await api.post<{
      requiresMFA: boolean
      tempToken?: string
      accessToken?: string
      refreshToken?: string
      user?: {
        id: string
        email: string
        mfaEnabled: boolean
        profileCompleted?: boolean
        employeeId?: string | null
      }
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
      user: {
        id: string
        email: string
        mfaEnabled: boolean
        profileCompleted?: boolean
        employeeId?: string | null
      }
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

  async function impersonate(userId: string, companyId: string) {
    const res = await api.post<{
      accessToken: string
      refreshToken: string
      user: {
        id: string
        email: string
        mfaEnabled: boolean
        profileCompleted?: boolean
        employeeId?: string | null
      }
      companies?: CompanyFromResponse[]
    }>('/auth/impersonate', { userId, companyId })

    stashCompaniesForImpersonation()
    applyImpersonationResponse(
      res.data.accessToken,
      res.data.refreshToken,
      res.data.user,
      res.data.companies ?? [],
    )
  }

  function exitImpersonation() {
    useAuthStore.getState().exitImpersonation()
    restoreCompaniesAfterImpersonation()
  }

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    mfaPending: store.mfaPending,
    impersonatedBy: store.impersonatedBy,
    login,
    verifyMFA,
    logout,
    impersonate,
    exitImpersonation,
  }
}
