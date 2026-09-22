import { useEffect, useRef } from 'react'
import { useToastStore } from '../store/toastStore'

const POLL_INTERVAL_MS = 60_000

// Detects a new production deploy (apps/web/dist/version.txt changes — see
// .github/workflows/deploy.yml, which writes the deployed commit SHA into it
// right after the build) and reloads so a tab left open doesn't keep running
// stale JS indefinitely. No-op outside production builds — version.txt is
// only ever written by the deploy script, never present in local dev.
export function VersionCheck() {
  const addToast = useToastStore((s) => s.addToast)
  const baselineRef = useRef<string | null>(null)
  const triggeredRef = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    // Reloads only once the tab isn't the one being actively watched —
    // immediately if it's already backgrounded, otherwise the next time the
    // user switches away — rather than yanking the page out from under
    // someone mid-task on a fixed timer (a deploy can land while a buyer is
    // halfway through recording a purchase, and a forced reload a few
    // seconds later drops everything they'd filled in).
    function reloadWhenHidden() {
      if (document.hidden) window.location.reload()
    }

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
            message: "A new version is available — it'll load next time this tab is in the background, or click to refresh now.",
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
          if (document.hidden) {
            window.location.reload()
          } else {
            document.addEventListener('visibilitychange', reloadWhenHidden)
          }
        }
      } catch {
        // Offline, or the request was blocked — just try again next tick.
      }
    }

    void checkVersion()
    const interval = setInterval(() => void checkVersion(), POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', reloadWhenHidden)
    }
  }, [addToast])

  return null
}
