// Shared revision-history timeline — one consistent look across modules
// (contracts now; eng-docs / client-docs / bids can adopt it later). Feed it a
// normalized list of revisions and it renders a current badge + supersede trail.

export interface RevisionItem {
  revision: number | string
  date?: string | null // when this revision was created
  by?: string | null // who created it
  summary?: string | null // change summary / note
  current?: boolean // the live revision
  meta?: { label: string; value: string }[] // extra fields (value, retention, …)
}

export function RevisionHistory({
  revisions,
  th,
  emptyText = 'No revisions yet.',
}: {
  revisions: RevisionItem[]
  th: Record<string, string>
  emptyText?: string
}) {
  if (!revisions.length) {
    return (
      <div style={{ fontSize: '13px', color: th.textMuted, padding: '12px 0' }}>{emptyText}</div>
    )
  }
  const sorted = [...revisions].sort((a, b) => Number(b.revision) - Number(a.revision))
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {sorted.map((r, i) => {
        const isLast = i === sorted.length - 1
        return (
          <div key={String(r.revision)} style={{ display: 'flex', gap: '12px' }}>
            {/* Rail */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  marginTop: '5px',
                  background: r.current ? '#15803d' : th.bgSurface,
                  border: r.current ? 'none' : `2px solid ${th.border}`,
                }}
              />
              {!isLast && (
                <div style={{ width: '2px', flex: 1, background: th.border, margin: '3px 0' }} />
              )}
            </div>
            {/* Body */}
            <div style={{ paddingBottom: isLast ? 0 : '14px', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: th.textPrimary }}>
                  Rev {r.revision}
                </span>
                {r.current && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      padding: '1px 7px',
                      borderRadius: '999px',
                      background: '#f0fdf4',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    Current
                  </span>
                )}
                {r.date && (
                  <span style={{ fontSize: '11px', color: th.textMuted }}>
                    {new Date(r.date).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {r.by && <span style={{ fontSize: '11px', color: th.textMuted }}>· {r.by}</span>}
              </div>
              {r.summary && (
                <div style={{ fontSize: '12px', color: th.textSecondary, marginTop: '2px' }}>
                  {r.summary}
                </div>
              )}
              {r.meta && r.meta.length > 0 && (
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {r.meta.map((m, j) => (
                    <span key={j} style={{ fontSize: '11px', color: th.textMuted }}>
                      <span style={{ fontWeight: 600 }}>{m.label}:</span> {m.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
