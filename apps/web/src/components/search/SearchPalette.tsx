import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { api } from '../../lib/axios'
import { NAV_SECTIONS } from '../shell/Sidebar'
import { usePermission } from '../../hooks/usePermission'
import { useCompanyStore } from '../../store/companyStore'

interface SearchItem {
  id: string
  type: string
  title: string
  subtitle: string
  meta: string
  status: string
  url: string
}

interface SearchGroup {
  type: string
  label: string
  items: SearchItem[]
}

interface SearchResponse {
  groups: SearchGroup[]
}

interface RecentItem {
  id: string
  type: string
  title: string
  subtitle: string
  url: string
}

interface Props {
  open: boolean
  prefill: string
  onClose: () => void
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  purchase_order: { label: 'PO', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  project: { label: 'PROJ', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  employee: { label: 'EMP', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  vendor: { label: 'VEN', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  project_invoice: { label: 'INV', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  rental_contract: { label: 'RC', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  page: { label: 'GO', color: '#64748b', bg: 'rgba(100,116,139,0.14)' },
}

// Flattened once from the sidebar's own nav tree (not re-typed by hand) —
// a real navigable page is either a top-level item with a real path (some
// sections, like Projects, are a single page with no sub-pages) or one of
// its children (sections like Finance use a synthetic '_f_...' path on the
// parent purely to group children, so only the children are real pages).
interface PageEntry {
  label: string
  path: string
  section: string
  permKeys?: string[]
  factoryOnly?: boolean
}

// factoryOnly lives only on the parent (e.g. "Manufacturing") in the source
// data, but the sidebar hides the whole item — parent AND every child —
// when the active company isn't a factory (section.items.filter(isItemVisible)
// runs before children ever get rendered). Propagate it down here so a
// non-factory user can't search their way to a page the sidebar hides.
function flattenNavPages(): PageEntry[] {
  const out: PageEntry[] = []
  for (const sec of NAV_SECTIONS) {
    for (const item of sec.items) {
      if (item.path.startsWith('/')) {
        out.push({
          label: item.label,
          path: item.path,
          section: sec.section,
          permKeys: item.permKeys,
          factoryOnly: item.factoryOnly,
        })
      }
      for (const child of item.children ?? []) {
        out.push({
          label: child.label,
          path: child.path,
          section: sec.section,
          permKeys: child.permKeys,
          factoryOnly: item.factoryOnly,
        })
      }
    }
  }
  return out
}

const NAV_PAGES = flattenNavPages()

const RECENT_KEY = 'fnc_search_recent'
const MAX_RECENT = 5

function loadRecents(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentItem[]
  } catch {
    return []
  }
}

function saveRecent(item: SearchItem) {
  const recents = loadRecents().filter((r) => r.id !== item.id)
  const next: RecentItem = {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    url: item.url,
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify([next, ...recents].slice(0, MAX_RECENT)))
}

export function SearchPalette({ open, prefill, onClose }: Props) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { canAny, isSystemLevel } = usePermission()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const isFactoryCompany = !!activeCompany?.name?.toLowerCase().includes('factory')
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [recents, setRecents] = useState<RecentItem[]>([])
  const prevOpen = useRef(false)

  // Instant, local "go to page" matches — no debounce, no API round trip.
  // Lets a query like "projects" jump straight to the Projects list page
  // even though no entity is literally named "projects".
  const pageGroup: SearchGroup | null = useMemo(() => {
    if (query.length < 2) return null
    const q = query.toLowerCase()
    const seen = new Set<string>()
    const items: SearchItem[] = []
    for (const p of NAV_PAGES) {
      if (!p.label.toLowerCase().includes(q)) continue
      if (seen.has(p.path)) continue
      if (p.factoryOnly && !isFactoryCompany) continue
      if (p.permKeys && p.permKeys.length > 0 && !isSystemLevel && !canAny(p.permKeys)) continue
      seen.add(p.path)
      items.push({
        id: `page:${p.path}`,
        type: 'page',
        title: p.label,
        subtitle: p.section,
        meta: '',
        status: '',
        url: p.path,
      })
    }
    return items.length > 0 ? { type: 'page', label: 'Go to', items } : null
  }, [query, canAny, isSystemLevel, isFactoryCompany])

  const displayGroups = pageGroup ? [pageGroup, ...groups] : groups

  // Reset and focus when palette opens
  useEffect(() => {
    if (open && !prevOpen.current) {
      setQuery(prefill)
      setGroups([])
      setActiveIdx(0)
      setLoading(false)
      setRecents(loadRecents())
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        const len = prefill.length
        inputRef.current?.setSelectionRange(len, len)
      })
    }
    prevOpen.current = open
  }, [open, prefill])

  // Debounced search
  useEffect(() => {
    if (!open) return
    if (query.length < 2) {
      setGroups([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      api
        .get<SearchResponse>('/search', { params: { q: query } })
        .then((r) => {
          const data = r.data as unknown as SearchResponse
          // handle both unwrapped and direct response shapes
          const g =
            (data as { groups?: SearchGroup[] }).groups ?? (r.data as unknown as SearchGroup[])
          setGroups(Array.isArray(g) ? g : [])
          setActiveIdx(0)
        })
        .catch(() => {
          setGroups([])
        })
        .finally(() => {
          setLoading(false)
        })
    }, 280)
    return () => {
      clearTimeout(timer)
    }
  }, [query, open])

  // Scroll active item into view
  useEffect(() => {
    document.querySelector(`[data-search-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const allItems = displayGroups.flatMap((g) => g.items)

  const handleSelect = useCallback(
    (item: SearchItem) => {
      saveRecent(item)
      navigate(item.url)
      onClose()
    },
    [navigate, onClose],
  )

  // Keyboard navigation (palette-level)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, allItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const item = allItems[activeIdx]
        if (item) handleSelect(item)
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [open, allItems, activeIdx, handleSelect])

  if (!open) return null

  const showRecents = query.length < 2 && recents.length > 0
  const showNoResults = query.length >= 2 && !loading && displayGroups.length === 0
  let flatIdx = 0

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'clamp(48px, 8vh, 100px)',
        paddingLeft: '16px',
        paddingRight: '16px',
        background: 'rgba(8, 14, 32, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '14px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '65vh',
        }}
      >
        {/* ── Input Row ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderBottom: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={loading ? theme.accent : theme.textMuted}
            strokeWidth="2"
            style={{ flexShrink: 0, transition: 'stroke 0.15s' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
            placeholder="Search purchase orders, projects, employees…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              color: theme.textPrimary,
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              flexShrink: 0,
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '5px',
              background: theme.bgCanvas,
              border: `1px solid ${theme.border}`,
              color: theme.textMuted,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Esc
          </kbd>
        </div>

        {/* ── Results Area ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Recent searches */}
          {showRecents && (
            <div style={{ padding: '8px 0' }}>
              <div
                style={{
                  padding: '4px 14px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Recent
              </div>
              {recents.map((r) => {
                const tc = TYPE_CONFIG[r.type]
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      navigate(r.url)
                      onClose()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '7px 14px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.bgSurfaceHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none'
                    }}
                  >
                    {tc && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '2px 5px',
                          borderRadius: '4px',
                          background: tc.bg,
                          color: tc.color,
                          letterSpacing: '0.05em',
                          minWidth: '28px',
                          textAlign: 'center',
                        }}
                      >
                        {tc.label}
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          color: theme.textPrimary,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.title}
                      </div>
                      {r.subtitle && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: theme.textMuted,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {r.subtitle}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Groups with results */}
          {displayGroups.map((group) => {
            const groupEl = (
              <div key={group.type} style={{ padding: '8px 0' }}>
                <div
                  style={{
                    padding: '4px 14px 6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const idx = flatIdx++
                  const active = idx === activeIdx
                  const tc = TYPE_CONFIG[item.type]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-search-idx={idx}
                      onClick={() => {
                        handleSelect(item)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        padding: '7px 14px',
                        background: active ? theme.accentBg : 'none',
                        border: 'none',
                        borderLeft: active ? `2px solid ${theme.accent}` : '2px solid transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => {
                        setActiveIdx(idx)
                        if (!active) e.currentTarget.style.background = theme.bgSurfaceHover
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = 'none'
                      }}
                    >
                      {tc && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '2px 5px',
                            borderRadius: '4px',
                            background: tc.bg,
                            color: tc.color,
                            letterSpacing: '0.05em',
                            minWidth: '28px',
                            textAlign: 'center',
                          }}
                        >
                          {tc.label}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '13px',
                            color: active ? theme.accent : theme.textPrimary,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: '11px',
                              color: theme.textMuted,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {item.meta && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '11px',
                            color: theme.textMuted,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.meta}
                        </span>
                      )}
                      {item.status && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '10px',
                            padding: '2px 7px',
                            borderRadius: '10px',
                            background: theme.bgCanvas,
                            color: theme.textMuted,
                            border: `1px solid ${theme.border}`,
                            whiteSpace: 'nowrap',
                            textTransform: 'capitalize',
                          }}
                        >
                          {item.status}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
            return groupEl
          })}

          {/* Empty query hint */}
          {query.length < 2 && !showRecents && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                Type at least 2 characters to search
              </div>
              <div
                style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px', opacity: 0.6 }}
              >
                Purchase orders · Projects · Employees · Vendors · Invoices · Rentals
              </div>
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                No results for "{query}"
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            padding: '8px 14px',
            borderTop: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          {[
            { key: '↑↓', label: 'navigate' },
            { key: 'Enter', label: 'open' },
            { key: 'Esc', label: 'close' },
          ].map(({ key, label }) => (
            <span
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: theme.textMuted,
              }}
            >
              <kbd
                style={{
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: theme.bgCanvas,
                  border: `1px solid ${theme.border}`,
                  fontSize: '10px',
                  fontFamily: 'inherit',
                }}
              >
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
