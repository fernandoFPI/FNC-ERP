import { useState, useEffect, useRef, type RefObject } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomNav } from './BottomNav'
import { Toast } from '../ui/Toast'
import { HelpDrawer } from '../help/HelpDrawer'
import { TourModeBanner } from '../help/TourModeBanner'
import { useTheme } from '../../theme/ThemeContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useSwipeGesture } from '../../hooks/useSwipeGesture'

export function AppShell() {
  const { theme } = useTheme()
  const { isPhone, isTablet } = useBreakpoint()
  const location = useLocation()
  const [phoneDrawerOpen, setPhoneDrawerOpen] = useState(false)
  const [tabletSidebarExpanded, setTabletSidebarExpanded] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  useWebSocket()

  // Close phone drawer on route change
  useEffect(() => {
    setPhoneDrawerOpen(false)
  }, [location.pathname])

  // BottomNav "More" button opens phone sidebar drawer
  useEffect(() => {
    const handler = (_e: Event) => setPhoneDrawerOpen(true)
    window.addEventListener('fnc:open-sidebar', handler)
    return () => window.removeEventListener('fnc:open-sidebar', handler)
  }, [])

  // Help button opens the help drawer
  useEffect(() => {
    const handler = (_e: Event) => setHelpOpen(true)
    window.addEventListener('fnc:open-help', handler)
    return () => window.removeEventListener('fnc:open-help', handler)
  }, [])

  // Escape closes any open drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPhoneDrawerOpen(false)
        setTabletSidebarExpanded(false)
        setHelpOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Body scroll lock when phone drawer is open
  useEffect(() => {
    if (isPhone && phoneDrawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isPhone, phoneDrawerOpen])

  // Swipe to open/close phone sidebar (no-op on tablet/desktop since callbacks guard isPhone)
  useSwipeGesture(pageRef as RefObject<HTMLElement>, {
    onSwipeRight: () => { if (isPhone && !phoneDrawerOpen) setPhoneDrawerOpen(true) },
    onSwipeLeft:  () => { if (isPhone && phoneDrawerOpen) setPhoneDrawerOpen(false) },
  })

  // ── PHONE LAYOUT ────────────────────────────────────────────────────────────
  if (isPhone) {
    return (
      <div
        ref={pageRef}
        style={{
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: theme.bgCanvas,
          overflow: 'hidden',
        }}
      >
        {theme.hasOrbs && (
          <>
            <div className="orb orb-1" style={{ background: theme.orb1 }} />
            <div className="orb orb-2" style={{ background: theme.orb2 }} />
            <div className="orb orb-3" style={{ background: theme.orb3 }} />
          </>
        )}

        {/* Sidebar drawer + backdrop */}
        {phoneDrawerOpen && (
          <div
            onClick={() => setPhoneDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 49,
            }}
          />
        )}
        <Sidebar
          mobile
          expanded={phoneDrawerOpen}
          onClose={() => setPhoneDrawerOpen(false)}
        />

        <Topbar compact onMenuToggle={() => setPhoneDrawerOpen(true)} />

        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)',
          position: 'relative',
          zIndex: 1,
        }}>
          <Outlet />
        </main>

        <BottomNav />
        <Toast />
        <TourModeBanner />
        <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    )
  }

  // ── TABLET LAYOUT ────────────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <div style={{
        height: '100dvh',
        display: 'flex',
        position: 'relative',
        background: theme.bgCanvas,
        overflow: 'hidden',
      }}>
        {theme.hasOrbs && (
          <>
            <div className="orb orb-1" style={{ background: theme.orb1 }} />
            <div className="orb orb-2" style={{ background: theme.orb2 }} />
            <div className="orb orb-3" style={{ background: theme.orb3 }} />
          </>
        )}

        <Sidebar
          rail={!tabletSidebarExpanded}
          onToggle={() => setTabletSidebarExpanded((v) => !v)}
        />

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
          position: 'relative',
          zIndex: 1,
        }}>
          <Topbar compact onMenuToggle={() => setTabletSidebarExpanded((v) => !v)} />
          <main style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <Outlet />
          </main>
        </div>

        <Toast />
        <TourModeBanner />
        <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    )
  }

  // ── DESKTOP LAYOUT ── Keep exactly as it was — no changes ───────────────────
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      position: 'relative',
      background: theme.bgCanvas,
      overflow: 'hidden',
    }}>
      {theme.hasOrbs && (
        <>
          <div className="orb orb-1" style={{ background: theme.orb1 }} />
          <div className="orb orb-2" style={{ background: theme.orb2 }} />
          <div className="orb orb-3" style={{ background: theme.orb3 }} />
        </>
      )}

      <Sidebar />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        <Topbar />
        <main style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <Outlet />
        </main>
      </div>

      <Toast />
      <TourModeBanner />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
