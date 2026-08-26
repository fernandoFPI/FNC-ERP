import { useEffect, useRef } from 'react'
import { useToastStore } from '../store/toastStore'

const POLL_INTERVAL_MS = 60_000
const RELOAD_DELAY_MS = 15_000

// Detects a new production deploy (apps/web/dist/version.txt changes — see
// .github/workflows/deploy.yml, which writes the deployed commit SHA into it
// right after the build) and forces a reload so a tab left open doesn't keep
// running stale JS indefinitely. No-op outside production builds —
// version.txt is only ever written by the deploy script, never present in
// local dev.
export function VersionCheck() {
  const addToast = useToastStore((s) => s.addToast)
  const baselineRef = useRef<string | null>(null)
  const triggeredRef = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    async function checkVersion() {
      try {
        const res = await fetch(`/version.txt?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const version = (await res.text()).trim()
        if (!version) return
        if (baselineRef.current === null) {
          baselineRef.current = version
          return
        }
        if (version !== baselineRef.current && !triggeredRef.current) {
          triggeredRef.current = true
          addToast({
            type: 'info',
            message: 'A new version is available — this page will refresh shortly to update.',
            actions: [
              {
                label: 'Refresh now',
                variant: 'primary',
                onClick: () => {
                  window.location.reload()
                },
              },
            ],
          })
          setTimeout(() => {
            window.location.reload()
          }, RELOAD_DELAY_MS)
        }
      } catch {
        // Offline, or the request was blocked — just try again next tick.
      }
    }

    void checkVersion()
    const interval = setInterval(() => void checkVersion(), POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
    }
  }, [addToast])

  return null
}
