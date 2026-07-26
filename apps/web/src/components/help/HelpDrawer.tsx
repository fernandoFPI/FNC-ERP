import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { findTopic, findTopicByKey, allTopics, helpGroups, type HelpTopic } from './helpContent'
import { startTour, tours } from './tours'
import 'driver.js/dist/driver.css'

interface Props {
  open: boolean
  onClose: () => void
}

export function HelpDrawer({ open, onClose }: Props) {
  const { theme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeTopic, setActiveTopic] = useState<HelpTopic | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Derive contextual topic from current route
  const routeTopic = findTopic(location.pathname)

  // When drawer opens, reset to contextual mode
  useEffect(() => {
    if (open) {
      setActiveTopic(null)
      setSearch('')
      setBrowseOpen(false)
      setTimeout(() => searchRef.current?.focus(), 150)
    }
  }, [open])

  // Route changes reset browse selection
  useEffect(() => {
    setActiveTopic(null)
  }, [location.pathname])

  const displayTopic = activeTopic ?? routeTopic

  const filtered = search.trim()
    ? allTopics.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.summary.toLowerCase().includes(search.toLowerCase()),
      )
    : []

  function handleTourStart() {
    if (!displayTopic?.tourKey) return
    onClose()
    setTimeout(() => {
      startTour(displayTopic.tourKey!, navigate, theme)
    }, 300)
  }

  const drawerWidth = 360

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 59,
            background: 'rgba(0,0,0,0.25)',
          }}
        />
      )}

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-label="Help & Guides"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: drawerWidth,
          height: '100dvh',
          zIndex: 60,
          background: theme.bgSurface,
          borderLeft: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : `translateX(${drawerWidth}px)`,
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.18)' : 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>❓</span>
            <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>
              Help & Guides
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close help"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.textSecondary,
              padding: '4px',
              display: 'flex',
              borderRadius: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.bgSurfaceHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div
          style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}
        >
          <div style={{ position: 'relative' }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: theme.textSecondary,
                pointerEvents: 'none',
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              placeholder="Search guides…"
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                background: theme.bgCanvas,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                color: theme.textPrimary,
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('')
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  padding: '2px',
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
          {/* Search results */}
          {search.trim() ? (
            <div style={{ padding: '12px 16px' }}>
              {filtered.length === 0 ? (
                <p
                  style={{
                    color: theme.textSecondary,
                    fontSize: '13px',
                    textAlign: 'center',
                    marginTop: '24px',
                  }}
                >
                  No guides found for "{search}"
                </p>
              ) : (
                filtered.map((topic) => (
                  <button
                    key={topic.key}
                    onClick={() => {
                      setActiveTopic(topic)
                      setSearch('')
                    }}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.bgSurfaceHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none'
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{topic.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary }}>
                        {topic.title}
                      </div>
                      <div
                        style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}
                      >
                        {topic.summary}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Contextual guide */}
              {displayTopic ? (
                <div style={{ padding: '16px' }}>
                  {/* Topic header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '24px' }}>{displayTopic.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: theme.textPrimary }}>
                        {displayTopic.title}
                      </div>
                      {activeTopic && (
                        <button
                          onClick={() => {
                            setActiveTopic(null)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: theme.accent,
                            fontSize: '12px',
                            padding: '0',
                            marginTop: '2px',
                          }}
                        >
                          ← Back to current page
                        </button>
                      )}
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: '13px',
                      color: theme.textSecondary,
                      margin: '0 0 16px',
                      lineHeight: '1.5',
                    }}
                  >
                    {displayTopic.summary}
                  </p>

                  {/* Tour button */}
                  {displayTopic.tourKey && tours[displayTopic.tourKey] && (
                    <button
                      onClick={handleTourStart}
                      style={{
                        width: '100%',
                        background: theme.accent,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Start guided tour — {tours[displayTopic.tourKey].title}
                    </button>
                  )}

                  {/* Steps */}
                  <div style={{ marginBottom: '20px' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: theme.textSecondary,
                        textTransform: 'uppercase',
                        marginBottom: '12px',
                      }}
                    >
                      How to use
                    </div>
                    {displayTopic.steps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: theme.accent + '22',
                            color: theme.accent,
                            fontSize: '12px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: '1px',
                          }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              color: theme.textPrimary,
                              marginBottom: '3px',
                            }}
                          >
                            {step.title}
                          </div>
                          <div
                            style={{
                              fontSize: '13px',
                              color: theme.textSecondary,
                              lineHeight: '1.5',
                            }}
                          >
                            {step.body}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tips */}
                  {displayTopic.tips.length > 0 && (
                    <div
                      style={{
                        background: theme.accent + '12',
                        border: `1px solid ${theme.accent}30`,
                        borderRadius: '8px',
                        padding: '12px 14px',
                        marginBottom: '20px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: theme.accent,
                          marginBottom: '8px',
                        }}
                      >
                        💡 Tips
                      </div>
                      {displayTopic.tips.map((tip, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: i < displayTopic.tips.length - 1 ? '6px' : 0,
                          }}
                        >
                          <span style={{ color: theme.accent, flexShrink: 0 }}>•</span>
                          <span
                            style={{
                              fontSize: '13px',
                              color: theme.textSecondary,
                              lineHeight: '1.5',
                            }}
                          >
                            {tip}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Divider */}
                  <div style={{ height: '1px', background: theme.border, margin: '4px 0 16px' }} />
                </div>
              ) : (
                <div style={{ padding: '24px 16px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>❓</div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                    Browse topics below or search for a guide above.
                  </div>
                </div>
              )}

              {/* Browse all topics */}
              <div style={{ padding: '0 16px' }}>
                <button
                  onClick={() => {
                    setBrowseOpen((v) => !v)
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0',
                    marginBottom: browseOpen ? '12px' : '0',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: theme.textSecondary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Browse all topics
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    style={{
                      color: theme.textSecondary,
                      transform: browseOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {browseOpen &&
                  helpGroups.map((group) => (
                    <div key={group.label} style={{ marginBottom: '16px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.textSecondary,
                          marginBottom: '6px',
                          paddingLeft: '2px',
                        }}
                      >
                        {group.label}
                      </div>
                      {group.topics.map((topic) => {
                        const isActive = displayTopic?.key === topic.key
                        return (
                          <button
                            key={topic.key}
                            onClick={() => {
                              setActiveTopic(topic)
                              setBrowseOpen(false)
                            }}
                            style={{
                              width: '100%',
                              background: isActive ? theme.accent + '18' : 'none',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '7px 10px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '2px',
                            }}
                            onMouseEnter={(e) => {
                              if (!isActive) e.currentTarget.style.background = theme.bgSurfaceHover
                            }}
                            onMouseLeave={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'none'
                            }}
                          >
                            <span style={{ fontSize: '15px', flexShrink: 0 }}>{topic.emoji}</span>
                            <span
                              style={{
                                fontSize: '13px',
                                color: isActive ? theme.accent : theme.textPrimary,
                                fontWeight: isActive ? 600 : 400,
                              }}
                            >
                              {topic.title}
                            </span>
                            {topic.tourKey && (
                              <span
                                style={{
                                  marginLeft: 'auto',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: theme.accent + '20',
                                  color: theme.accent,
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                              >
                                tour
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
