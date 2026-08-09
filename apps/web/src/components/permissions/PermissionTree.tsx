import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { PERMISSION_REGISTRY } from '../../lib/permissionRegistry'
import type { AccessLevel } from '../../lib/permissionRegistry'

const LEVEL_LABELS: Record<AccessLevel, string> = {
  none: 'None',
  view: 'View',
  edit: 'Edit',
  approve: 'Approve',
  admin: 'Admin',
}

const LEVEL_COLORS: Record<AccessLevel, string> = {
  none: '',
  view: '#3b82f6',
  edit: '#8b5cf6',
  approve: '#f59e0b',
  admin: '#ef4444',
}

// Every permission key's own suffix already says what it grants
// (`finance.ap.edit` IS the edit grant) — there is no independent "level" to
// pick separately. The one key with no view/edit/approve/admin suffix
// (`projects.cancel`) is treated as the most severe tier, matching how other
// single-word dangerous actions (e.g. rental.contracts.admin = "Terminate
// Contracts") use 'admin' rather than inventing a new level.
function impliedLevel(key: string): AccessLevel {
  const suffix = key.split('.').pop()
  if (suffix === 'view' || suffix === 'edit' || suffix === 'approve' || suffix === 'admin') {
    return suffix
  }
  return 'admin'
}

interface PermissionTreeProps {
  value: Record<string, AccessLevel>
  onChange: (next: Record<string, AccessLevel>) => void
  disabled?: boolean
}

interface SubmoduleSectionProps {
  moduleKey: string
  subKey: string
  subLabel: string
  permissions: { key: string; label: string }[]
  value: Record<string, AccessLevel>
  onChange: (key: string, level: AccessLevel) => void
  disabled?: boolean
  theme: ReturnType<typeof useTheme>['theme']
}

function SubmoduleSection({
  moduleKey: _moduleKey,
  subKey: _subKey,
  subLabel,
  permissions,
  value,
  onChange,
  disabled,
  theme,
}: SubmoduleSectionProps) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '4px 0',
          borderBottom: `1px solid ${theme.border}`,
          marginBottom: '6px',
        }}
      >
        {subLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {permissions.map((perm) => {
          const level = impliedLevel(perm.key)
          const current = value[perm.key] ?? 'none'
          const isEnabled = current !== 'none'
          return (
            <div
              key={perm.key}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}
            >
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={disabled}
                onChange={(e) => {
                  onChange(perm.key, e.target.checked ? level : 'none')
                }}
                style={{ cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: '12px',
                  color: isEnabled ? theme.textPrimary : theme.textMuted,
                  minWidth: '180px',
                  flexShrink: 0,
                }}
              >
                {perm.label}
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: `1px solid ${isEnabled ? LEVEL_COLORS[level] : theme.border}`,
                  background: isEnabled ? `${LEVEL_COLORS[level]}20` : 'transparent',
                  color: isEnabled ? LEVEL_COLORS[level] : theme.textMuted,
                  opacity: isEnabled ? 1 : 0.6,
                }}
              >
                {LEVEL_LABELS[level]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ModuleRowProps {
  moduleLabel: string
  submodules: { key: string; label: string; permissions: { key: string; label: string }[] }[]
  value: Record<string, AccessLevel>
  onChange: (key: string, level: AccessLevel) => void
  disabled?: boolean
  theme: ReturnType<typeof useTheme>['theme']
  moduleKey: string
}

function ModuleRow({
  moduleLabel,
  submodules,
  value,
  onChange,
  disabled,
  theme,
  moduleKey,
}: ModuleRowProps) {
  const [expanded, setExpanded] = useState(true)

  const allPermKeys = submodules.flatMap((s) => s.permissions.map((p) => p.key))
  const enabledCount = allPermKeys.filter((k) => (value[k] ?? 'none') !== 'none').length

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        marginBottom: '10px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => {
          setExpanded((v) => !v)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: theme.bgSurface,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {moduleLabel}
          </span>
          {enabledCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: theme.accentBg,
                color: theme.accent,
                fontWeight: 600,
              }}
            >
              {enabledCount} active
            </span>
          )}
        </div>
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '12px 16px', background: theme.bgCanvas }}>
          {submodules.map((sub) => (
            <SubmoduleSection
              key={sub.key}
              moduleKey={moduleKey}
              subKey={sub.key}
              subLabel={sub.label}
              permissions={sub.permissions}
              value={value}
              onChange={onChange}
              disabled={disabled}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PermissionTree({ value, onChange, disabled = false }: PermissionTreeProps) {
  const { theme } = useTheme()

  function handleChange(key: string, level: AccessLevel) {
    onChange({ ...value, [key]: level })
  }

  return (
    <div>
      {PERMISSION_REGISTRY.map((mod) => (
        <ModuleRow
          key={mod.key}
          moduleKey={mod.key}
          moduleLabel={mod.label}
          submodules={mod.submodules}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          theme={theme}
        />
      ))}
    </div>
  )
}
