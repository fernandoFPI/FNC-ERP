import { useCallback, useState } from 'react'

// A list of ticked statuses that is kept for the browser tab (sessionStorage), so opening a purchase order or a requisition from a
// filtered list and coming back does not throw the filter away (playbook #70: a list that keeps its filters in component state loses
// them on Back). Read defensively: anything that is not a list of strings, or storage that is blocked, just means no filter.

function read(key: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function write(key: string, value: string[]): void {
  try {
    if (value.length === 0) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // blocked or full storage: the filter still works for this visit, it just is not remembered
  }
}

/** The ticked statuses for `storageKey`, and a setter that remembers them. A new key starts from what is stored under it. */
export function useStatusFilter(storageKey: string): [string[], (next: string[]) => void] {
  const [state, setState] = useState<{ key: string; value: string[] }>(() => ({
    key: storageKey,
    value: read(storageKey),
  }))
  // Another project (another key) must not inherit this one's filter: re-read when the key changes.
  const current = state.key === storageKey ? state.value : read(storageKey)
  const set = useCallback(
    (next: string[]) => {
      write(storageKey, next)
      setState({ key: storageKey, value: next })
    },
    [storageKey],
  )
  return [current, set]
}
