import { useState } from 'react'
import { useAuthStore } from '../store/authStore'

// Which columns a person has chosen to show on a table, and how tightly its rows are packed,
// remembered in this browser so a refresh, or opening the next purchase order, doesn't put
// everything back.
//
// Only the columns the person actually switched are stored (an override of that column's
// default), never the whole list. That keeps a column that exists only at some stages (store
// price while pricing, say) following its own default until the person decides otherwise, and a
// column added later shows up by default. Switching a column back to its default deletes the
// override, so "customised" only ever means something is really different from the default.
//
// Kept per user and per table: the key carries the user id, so two people sharing one computer
// don't inherit each other's choice, and the PO lines and requisition lines don't share one.
// localStorage can be missing, full or hold anything (a private window, an older format, a
// hand-edited value), so every read and write is guarded and an unreadable value means defaults.

export type TableDensity = 'comfortable' | 'compact'

interface StoredView {
  columns: Record<string, boolean>
  density: TableDensity
}

const PREFIX = 'fnc_table_view_v1_'
const DEFAULT_VIEW: StoredView = { columns: {}, density: 'comfortable' }

function readView(storageKey: string): StoredView {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return DEFAULT_VIEW
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_VIEW
    const { columns, density } = parsed as { columns?: unknown; density?: unknown }
    const cleanColumns: Record<string, boolean> = {}
    if (typeof columns === 'object' && columns !== null && !Array.isArray(columns)) {
      for (const [key, value] of Object.entries(columns)) {
        if (typeof value === 'boolean') cleanColumns[key] = value
      }
    }
    return {
      columns: cleanColumns,
      density: density === 'compact' ? 'compact' : 'comfortable',
    }
  } catch {
    return DEFAULT_VIEW
  }
}

function writeView(storageKey: string, view: StoredView): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(view))
  } catch {
    // storage unavailable or full: the choice still applies until the page is reloaded
  }
}

export function useTableView(tableId: string) {
  const userId = useAuthStore((s) => s.user?.id) ?? 'anonymous'
  const storageKey = `${PREFIX}${userId}_${tableId}`
  const [state, setState] = useState(() => ({ key: storageKey, view: readView(storageKey) }))
  // the signed-in user can change while this stays mounted: read that person's choice instead
  const view = state.key === storageKey ? state.view : readView(storageKey)

  const update = (next: StoredView) => {
    setState({ key: storageKey, view: next })
    writeView(storageKey, next)
  }

  return {
    density: view.density,
    /** Whether a column is shown: the person's own choice if they made one, else its default. */
    isOn: (key: string, defaultOn: boolean): boolean => view.columns[key] ?? defaultOn,
    setColumn: (key: string, on: boolean, defaultOn: boolean) => {
      const columns: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(view.columns)) if (k !== key) columns[k] = v
      if (on !== defaultOn) columns[key] = on
      update({ ...view, columns })
    },
    /** Forget every column choice (the row spacing is a separate setting and stays). */
    resetColumns: () => {
      update({ ...view, columns: {} })
    },
    setDensity: (density: TableDensity) => {
      update({ ...view, density })
    },
    customized: Object.keys(view.columns).length > 0,
  }
}
