import { useState } from 'react'

export interface FilterPreset {
  id: string
  name: string
  filters: Record<string, string>
  savedAt: string
}

const STORAGE_PREFIX = 'fnc_presets_v1_'
const MAX_PRESETS = 12

export function useFilterPresets(pageKey: string, defaults: Record<string, string>) {
  const storageKey = STORAGE_PREFIX + pageKey

  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as FilterPreset[]) : []
    } catch {
      return []
    }
  })

  function persist(next: FilterPreset[]) {
    setPresets(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // localStorage quota exceeded — fail silently
    }
  }

  function savePreset(name: string, current: Record<string, string>) {
    const trimmed = name.trim().slice(0, 50)
    if (!trimmed) return
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name: trimmed,
      filters: { ...current },
      savedAt: new Date().toISOString(),
    }
    persist([preset, ...presets.slice(0, MAX_PRESETS - 1)])
  }

  function deletePreset(id: string) {
    persist(presets.filter((p) => p.id !== id))
  }

  // Merge preset on top of current defaults — forward-compatible when new filter
  // dimensions are added later: old presets just get the new key's default value.
  function resolvePreset(preset: FilterPreset): Record<string, string> {
    return { ...defaults, ...preset.filters }
  }

  return { presets, savePreset, deletePreset, resolvePreset }
}
