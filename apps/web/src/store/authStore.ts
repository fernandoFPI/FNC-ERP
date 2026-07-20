import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeKey } from '../theme/tokens'

export type AccessLevel = 'none' | 'view' | 'edit' | 'approve' | 'admin'

export interface User {
  id: string
  email: string
  role: string          // system_admin | company_admin | module_admin | user
  mfaEnabled: boolean
  system_admin?: boolean
  companyId?: string
  employeeId?: string | null   // linked HR employee record; used for ID-based project-role matching
  permissions: Record<string, AccessLevel>
  profileCompleted: boolean
  firstName?: string
  lastName?: string
  profilePicture?: string | null
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  mfaPending: boolean
  tempToken: string | null
  themePreference: ThemeKey | null
  setAuth: (user: Omit<User, 'permissions'>, accessToken: string, refreshToken: string) => void
  setProfileCompleted: () => void
  setMFAPending: (tempToken: string) => void
  setAccessToken: (token: string) => void
  setUser: (user: Partial<User>) => void
  clearAuth: () => void
  loadPermissionsForCompany: (companyId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      mfaPending: false,
      tempToken: null,
      themePreference: null,

      setAuth: (user, accessToken, refreshToken) =>
        set({
          user: { ...user, permissions: {} },
          accessToken,
          refreshToken,
          isAuthenticated: true,
          mfaPending: false,
          tempToken: null,
        }),

      setProfileCompleted: () => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, profileCompleted: true } })
      },

      setMFAPending: (tempToken) =>
        set({ mfaPending: true, tempToken, isAuthenticated: false }),

      setAccessToken: (token) => set({ accessToken: token }),

      setUser: (partial) => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...partial } })
      },

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          mfaPending: false,
          tempToken: null,
          themePreference: null,
        }),

      loadPermissionsForCompany: async (companyId: string) => {
        const { user } = get()
        if (!user) return

        // Admins have implicit full access — no DB lookup needed
        if (user.role === 'system_admin' || user.role === 'company_admin') {
          set((state) => ({ user: { ...state.user!, permissions: {} } }))
          return
        }

        try {
          // Lazy import to avoid circular dep (axios.ts ↔ authStore.ts)
          const { api } = await import('../lib/axios')

          const result = await api.get<{
            data: {
              permissions: Array<{
                submodules: Array<{
                  permissions: Array<{ key: string; accessLevel: string }>
                }>
              }>
            }
          }>(`/auth/users/${user.id}/permissions`, { params: { company_id: companyId } })

          // Flatten nested registry structure into a key→level map
          const flat: Record<string, AccessLevel> = {}
          for (const mod of result.data.data.permissions) {
            for (const sub of mod.submodules) {
              for (const perm of sub.permissions) {
                if (perm.accessLevel !== 'none') {
                  flat[perm.key] = perm.accessLevel as AccessLevel
                }
              }
            }
          }

          set((state) => ({
            user: { ...state.user!, permissions: flat },
          }))
        } catch {
          // On failure keep existing permissions — don't lock the user out
        }
      },
    }),
    {
      name: 'fnc-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        themePreference: state.themePreference,
      }),
    },
  ),
)
