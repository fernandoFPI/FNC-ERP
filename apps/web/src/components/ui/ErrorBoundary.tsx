import React from 'react'
import { Card } from './Card'

interface State {
  hasError: boolean
  error: Error | null
}

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

// Vite throws a message matching this (wording varies slightly by browser)
// when a lazy-loaded route's hashed chunk file no longer exists on the
// server — someone had the app open across a deploy, then navigated to a
// route whose chunk was replaced with a new hash. The plain Retry button
// below just resets local state and re-runs the same import(), which fails
// identically since the old file is really gone; only a real page reload
// (fetching the current index.html + chunk manifest) fixes it.
const CHUNK_LOAD_ERROR_RE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i

// Guards against a reload loop: if a chunk is genuinely missing (not just a
// stale cache — e.g. a bad deploy), auto-reloading on every catch would hang
// the tab reloading forever. Only ever auto-reload once per tab.
const CHUNK_RELOAD_FLAG = 'fnc-chunk-reload-attempted'

function isChunkLoadError(error: Error | null): boolean {
  return !!error && CHUNK_LOAD_ERROR_RE.test(error.message)
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) return
    let alreadyTried = false
    try {
      alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'
      if (!alreadyTried) sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
    } catch {
      // storage unavailable — fall through to the manual Reload button instead
    }
    if (!alreadyTried) window.location.reload()
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      const chunkError = isChunkLoadError(this.state.error)
      return (
        <Card padding="md" style={{ margin: '24px' }}>
          <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '8px' }}>
            {chunkError ? 'A new version was deployed' : 'Something went wrong'}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            {chunkError
              ? 'This page was updated since you opened the app. Reload to get the latest version.'
              : (this.state.error?.message ?? 'An unexpected error occurred.')}
          </p>
          <button
            onClick={() => {
              if (chunkError) {
                window.location.reload()
                return
              }
              this.setState({ hasError: false, error: null })
            }}
            style={{
              marginTop: '12px',
              padding: '6px 14px',
              fontSize: '12px',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: '6px',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {chunkError ? 'Reload page' : 'Retry'}
          </button>
        </Card>
      )
    }
    return this.props.children
  }
}
