import { useEffect } from 'react'
import { useBreadcrumbStore } from '../store/breadcrumbStore'

/**
 * Tells the top bar what to call a record in the breadcrumb. Call it on a record page with the id from the route and the record's own
 * human name once it has loaded (a number, a code, a name); until then, or when either is missing, the breadcrumb keeps its fallback.
 * Blank names are ignored (an empty string must not hide the fallback).
 */
export function useBreadcrumbTitle(id: string | undefined, title: string | null | undefined): void {
  useEffect(() => {
    const name = title?.trim()
    if (!id || !name) return
    useBreadcrumbStore.getState().setTitle(id, name)
  }, [id, title])
}
