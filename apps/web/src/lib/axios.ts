import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { decodeJWT } from './jwt'

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/v1`,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => {
    // Unwrap the { success, data } envelope every backend route returns
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = (response.data as { data: unknown }).data
    }
    return response
  },
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Prevent infinite retry loop: if this request was already a retry, bail out
      const config = error.config as (typeof error.config & { _retry?: boolean }) | undefined
      if (config?._retry) {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      const store = useAuthStore.getState()
      if (store.refreshToken) {
        try {
          const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/v1/auth/refresh`, {
            refreshToken: store.refreshToken,
          })
          const payload = (res.data?.data ?? res.data) as { accessToken: string }
          const { accessToken } = payload

          store.setAccessToken(accessToken)

          // Sync role from new token (company switch may have changed it)
          const decoded = decodeJWT(accessToken)
          if (decoded) {
            store.setUser({ role: decoded.role, companyId: decoded.companyId })
          }

          if (config) {
            config._retry = true
            config.headers.Authorization = `Bearer ${accessToken}`
            return api.request(config)
          }
        } catch {
          useAuthStore.getState().clearAuth()
          window.location.href = '/login'
        }
      } else {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
