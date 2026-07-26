import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { useToastStore } from '../../../../store/toastStore'
import {
  LIFECYCLE_CONFIG_QUERY,
  UPDATE_LIFECYCLE_PHASE,
  UPDATE_LIFECYCLE_MODULE,
  UPDATE_BID_SIMPLE_MODE,
  UPDATE_HIDE_RISK_REGISTER,
} from '../../../../graphql/projects'

interface Phase {
  key: string
  label: string
  sequence: number
  optional: boolean
}
interface ModuleGate {
  moduleKey: string
  minPhaseKey: string
  label: string | null
  sequence: number
}

// Fallback names for the tab/module keys (used if config label is null).
const MODULE_FALLBACK: Record<string, string> = {
  overview: 'Overview',
  client_documents: 'Client Documents',
  rfq_lines: 'Preliminary Engineering',
  bidding: 'Bidding Stage',
  contracts: 'Contract Management',
  engineering: 'Planning & Detailed Engineering',
  execution: 'Execution',
  handover: 'Handover',
  procurement: 'Procurement',
  cost_control: 'Cost Control',
  variation_orders: 'Variation Orders',
  risk_register: 'Risk Register',
  meetings: 'Meetings (MOM)',
  attachments: 'Attachments',
  team: 'Team',
  history: 'History',
}
const moduleName = (m: ModuleGate) => m.label ?? MODULE_FALLBACK[m.moduleKey] ?? m.moduleKey

export default function LifecycleSettingsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const { data, loading, refetch } = useQuery(LIFECYCLE_CONFIG_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const [savePhase] = useMutation(UPDATE_LIFECYCLE_PHASE)
  const [saveModule] = useMutation(UPDATE_LIFECYCLE_MODULE)
  const [saveSimpleMode] = useMutation(UPDATE_BID_SIMPLE_MODE)
  const [saveHideRisk] = useMutation(UPDATE_HIDE_RISK_REGISTER)

  const phases: Phase[] = data?.lifecycleConfig?.phases ?? []
  const modules: ModuleGate[] = data?.lifecycleConfig?.modules ?? []
  const bidSimpleModeEnabled: boolean = data?.lifecycleConfig?.bidSimpleModeEnabled ?? false
  const hideRiskRegister: boolean = data?.lifecycleConfig?.hideRiskRegister ?? true

  const [phaseEdits, setPhaseEdits] = useState<
    Record<string, { label: string; optional: boolean }>
  >({})
  const [moduleLabelEdits, setModuleLabelEdits] = useState<Record<string, string>>({})
  const [simpleModeEdit, setSimpleModeEdit] = useState(false)
  const [hideRiskEdit, setHideRiskEdit] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (phases.length) {
      const seed: Record<string, { label: string; optional: boolean }> = {}
      for (const p of phases) seed[p.key] = { label: p.label, optional: p.optional }
      setPhaseEdits(seed)
    }
    if (modules.length) {
      const seed: Record<string, string> = {}
      for (const m of modules) seed[m.moduleKey] = moduleName(m)
      setModuleLabelEdits(seed)
    }
    if (data?.lifecycleConfig) {
      setSimpleModeEdit(bidSimpleModeEnabled)
      setHideRiskEdit(hideRiskRegister)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const phaseLabel = (key: string) => phases.find((p) => p.key === key)?.label ?? key

  async function commitPhase(p: Phase) {
    const edit = phaseEdits[p.key]
    if (!edit) return
    setSavingKey(`phase:${p.key}`)
    try {
      await savePhase({
        variables: { key: p.key, label: edit.label.trim() || p.label, optional: edit.optional },
      })
      addToast({ type: 'success', message: `Phase "${edit.label}" saved` })
      await refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingKey(null)
    }
  }

  async function commitModulePhase(moduleKey: string, minPhaseKey: string) {
    setSavingKey(`gate:${moduleKey}`)
    try {
      await saveModule({ variables: { moduleKey, minPhaseKey } })
      addToast({ type: 'success', message: `Tab now appears from "${phaseLabel(minPhaseKey)}"` })
      await refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingKey(null)
    }
  }

  async function commitModuleLabel(moduleKey: string) {
    const label = (moduleLabelEdits[moduleKey] ?? '').trim()
    if (!label) return
    setSavingKey(`label:${moduleKey}`)
    try {
      await saveModule({ variables: { moduleKey, label } })
      addToast({ type: 'success', message: `Tab renamed to "${label}"` })
      await refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingKey(null)
    }
  }

  async function commitSimpleMode() {
    setSavingKey('simpleMode')
    try {
      await saveSimpleMode({ variables: { enabled: simpleModeEdit } })
      addToast({
        type: 'success',
        message: `Simple bid mode ${simpleModeEdit ? 'enabled' : 'disabled'}`,
      })
      await refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingKey(null)
    }
  }

  async function commitHideRisk() {
    setSavingKey('hideRisk')
    try {
      await saveHideRisk({ variables: { hidden: hideRiskEdit } })
      addToast({
        type: 'success',
        message: `Risk Register tab ${hideRiskEdit ? 'hidden' : 'shown'}`,
      })
      await refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    } finally {
      setSavingKey(null)
    }
  }

  const th = theme
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: `1px solid ${th.border}`,
  }
  const selectStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: '7px',
    border: `1px solid ${th.border}`,
    background: th.bgCanvas,
    color: th.textPrimary,
    fontSize: '13px',
    minWidth: '180px',
  }
  const headCell: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    color: th.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      <PageHeader
        title="Project Lifecycle"
        subtitle="Rename phases and tabs, and control which tab appears from which phase. Phase order is fixed; everything else is yours to configure."
      />

      {loading && phases.length === 0 && (
        <div style={{ color: th.textMuted, fontSize: '13px', padding: '20px 0' }}>
          Loading lifecycle configuration…
        </div>
      )}

      {/* ── Phases ─────────────────────────────────────────────── */}
      <Card style={{ marginBottom: '20px' }}>
        <div
          style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: '4px' }}
        >
          Phases
        </div>
        <div style={{ fontSize: '12px', color: th.textMuted, marginBottom: '14px' }}>
          The six phases are fixed (they map to contract events). You can rename them and mark a
          phase optional (skippable, e.g. a design gate some tenders don't need).
        </div>
        <div
          style={{
            ...rowStyle,
            gridTemplateColumns: '28px 1fr 130px 90px',
            borderBottom: `2px solid ${th.border}`,
            paddingTop: 0,
          }}
        >
          {['#', 'Label', 'Optional', ''].map((h, i) => (
            <div key={i} style={headCell}>
              {h}
            </div>
          ))}
        </div>
        {phases.map((p) => {
          const edit = phaseEdits[p.key] ?? { label: p.label, optional: p.optional }
          const dirty = edit.label !== p.label || edit.optional !== p.optional
          return (
            <div key={p.key} style={{ ...rowStyle, gridTemplateColumns: '28px 1fr 130px 90px' }}>
              <div
                style={{
                  fontSize: '12px',
                  color: th.textMuted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {p.sequence}
              </div>
              <Input
                value={edit.label}
                onChange={(e) => {
                  setPhaseEdits((prev) => ({
                    ...prev,
                    [p.key]: { ...edit, label: e.target.value },
                  }))
                }}
                placeholder={p.key}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '12px',
                  color: th.textSecondary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={edit.optional}
                  onChange={(e) => {
                    setPhaseEdits((prev) => ({
                      ...prev,
                      [p.key]: { ...edit, optional: e.target.checked },
                    }))
                  }}
                />
                Skippable
              </label>
              <Button
                size="sm"
                variant={dirty ? 'primary' : 'secondary'}
                disabled={!dirty || savingKey === `phase:${p.key}`}
                onClick={() => void commitPhase(p)}
              >
                {savingKey === `phase:${p.key}` ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )
        })}
      </Card>

      {/* ── Tabs: name + gating ────────────────────────────────── */}
      <Card>
        <div
          style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: '4px' }}
        >
          Project Tabs
        </div>
        <div style={{ fontSize: '12px', color: th.textMuted, marginBottom: '14px' }}>
          Rename any tab and choose which phase it first appears in. Changes take effect on the next
          project page load — no code change needed.
        </div>
        <div
          style={{
            ...rowStyle,
            gridTemplateColumns: '1fr 200px 90px',
            borderBottom: `2px solid ${th.border}`,
            paddingTop: 0,
          }}
        >
          {['Tab name', 'Appears from phase', ''].map((h, i) => (
            <div key={i} style={headCell}>
              {h}
            </div>
          ))}
        </div>
        {modules.map((m) => {
          const current = moduleLabelEdits[m.moduleKey] ?? moduleName(m)
          const labelDirty = current.trim() !== moduleName(m)
          return (
            <div key={m.moduleKey} style={{ ...rowStyle, gridTemplateColumns: '1fr 200px 90px' }}>
              <Input
                value={current}
                onChange={(e) => {
                  setModuleLabelEdits((prev) => ({ ...prev, [m.moduleKey]: e.target.value }))
                }}
                placeholder={m.moduleKey}
              />
              <select
                style={selectStyle}
                value={m.minPhaseKey}
                disabled={savingKey === `gate:${m.moduleKey}`}
                onChange={(e) => void commitModulePhase(m.moduleKey, e.target.value)}
              >
                {phases.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant={labelDirty ? 'primary' : 'secondary'}
                disabled={!labelDirty || savingKey === `label:${m.moduleKey}`}
                onClick={() => void commitModuleLabel(m.moduleKey)}
              >
                {savingKey === `label:${m.moduleKey}` ? '…' : 'Save'}
              </Button>
            </div>
          )
        })}
      </Card>

      {/* ── Bidding display mode ───────────────────────────────── */}
      <Card style={{ marginTop: '20px' }}>
        <div
          style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: '4px' }}
        >
          Bidding Display Mode
        </div>
        <div style={{ fontSize: '12px', color: th.textMuted, marginBottom: '14px' }}>
          By default, Technical Bid and Commercial Bid show the full detailed tracking (deliverables
          table, cost items, quotations, approval workflow). Turning this on replaces both with a
          single ZIP upload zone per section instead — a simpler interim view. Nothing already
          entered is deleted when you switch either way.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '13px',
              color: th.textPrimary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={simpleModeEdit}
              onChange={(e) => {
                setSimpleModeEdit(e.target.checked)
              }}
            />
            Simple bid mode (ZIP upload only)
          </label>
          <Button
            size="sm"
            variant={simpleModeEdit !== bidSimpleModeEnabled ? 'primary' : 'secondary'}
            disabled={simpleModeEdit === bidSimpleModeEnabled || savingKey === 'simpleMode'}
            onClick={() => void commitSimpleMode()}
          >
            {savingKey === 'simpleMode' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>

      {/* ── Risk Register visibility ──────────────────────────────── */}
      <Card style={{ marginTop: '20px' }}>
        <div
          style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: '4px' }}
        >
          Risk Register
        </div>
        <div style={{ fontSize: '12px', color: th.textMuted, marginBottom: '14px' }}>
          Hides the Risk Register tab from every project. Nothing already logged is deleted — turn
          this back off to see it again.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '13px',
              color: th.textPrimary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={hideRiskEdit}
              onChange={(e) => {
                setHideRiskEdit(e.target.checked)
              }}
            />
            Hide Risk Register tab
          </label>
          <Button
            size="sm"
            variant={hideRiskEdit !== hideRiskRegister ? 'primary' : 'secondary'}
            disabled={hideRiskEdit === hideRiskRegister || savingKey === 'hideRisk'}
            onClick={() => void commitHideRisk()}
          >
            {savingKey === 'hideRisk' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
