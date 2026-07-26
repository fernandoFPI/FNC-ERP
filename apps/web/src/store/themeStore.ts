import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeKey } from '../theme/tokens'

interface ThemeState {
  themeKey: ThemeKey
  setTheme: (key: ThemeKey) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeKey: 'dark-glass' as ThemeKey,
      setTheme: (key) => {
        set({ themeKey: key })
      },
    }),
    {
      name: 'fnc-theme',
    },
  ),
)
