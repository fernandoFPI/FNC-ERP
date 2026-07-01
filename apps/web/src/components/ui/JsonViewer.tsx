import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from './Button'

interface JsonViewerProps {
  data: unknown
  collapsed?: boolean
  title?: string
}

interface JsonNodeProps {
  value: unknown
  depth: number
  defaultCollapsed: boolean
}

function JsonNode({ value, depth, defaultCollapsed }: JsonNodeProps) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(!defaultCollapsed)
  const indent = depth * 16

  if (value === null) {
    return <span style={{ color: theme.textMuted }}>null</span>
  }
  if (value === undefined) {
    return <span style={{ color: theme.textMuted }}>undefined</span>
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: theme.warning }}>{String(value)}</span>
  }
  if (typeof value === 'number') {
    return <span style={{ color: theme.info }}>{value}</span>
  }
  if (typeof value === 'string') {
    return <span style={{ color: theme.success }}>&quot;{value}&quot;</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: theme.textSecondary }}>[]</span>
    return (
      <span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSecondary, padding: '0 2px', fontFamily: 'monospace', fontSize: 13 }}
        >
          {open ? '▼' : '▶'}
        </button>
        <span style={{ color: theme.textSecondary }}>[</span>
        {open ? (
          <div style={{ paddingLeft: indent + 16 }}>
            {(value as unknown[]).map((item, i) => (
              <div key={i}>
                <JsonNode value={item} depth={depth + 1} defaultCollapsed={defaultCollapsed} />
                {i < value.length - 1 && <span style={{ color: theme.textMuted }}>,</span>}
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: theme.textMuted }}> {value.length} items </span>
        )}
        <span style={{ color: theme.textSecondary }}>]</span>
      </span>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span style={{ color: theme.textSecondary }}>{'{}'}</span>
    return (
      <span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSecondary, padding: '0 2px', fontFamily: 'monospace', fontSize: 13 }}
        >
          {open ? '▼' : '▶'}
        </button>
        <span style={{ color: theme.textSecondary }}>{'{'}</span>
        {open ? (
          <div style={{ paddingLeft: indent + 16 }}>
            {entries.map(([k, v], i) => (
              <div key={k}>
                <span style={{ color: theme.accent }}>&quot;{k}&quot;</span>
                <span style={{ color: theme.textSecondary }}>: </span>
                <JsonNode value={v} depth={depth + 1} defaultCollapsed={defaultCollapsed} />
                {i < entries.length - 1 && <span style={{ color: theme.textMuted }}>,</span>}
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: theme.textMuted }}> {entries.length} keys </span>
        )}
        <span style={{ color: theme.textSecondary }}>{'}'}</span>
      </span>
    )
  }
  return <span style={{ color: theme.textMuted }}>{String(value)}</span>
}

export function JsonViewer({ data, collapsed = false, title }: JsonViewerProps) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: theme.bgSurface,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgSurfaceHover,
      }}>
        <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 600 }}>
          {title ?? 'JSON'}
        </span>
        <Button onClick={handleCopy} size="sm">
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <div style={{
        padding: '12px 16px',
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.6,
        overflowX: 'auto',
        color: theme.textPrimary,
      }}>
        <JsonNode value={data} depth={0} defaultCollapsed={collapsed} />
      </div>
    </div>
  )
}
