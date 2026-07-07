import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../../theme/ThemeContext'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Card } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { Badge } from '../../../../components/ui/Badge'
import { useToastStore } from '../../../../store/toastStore'
import { api } from '../../../../lib/axios'

interface SequenceEntry {
  doc_type: string
  label: string
  prefix: string
  next_number: number
  pad_length: number
  year_in_number: boolean
  separator: string
  configured: boolean
  updated_at: string | null
  preview: string
}

type SequenceEdits = Partial<Omit<SequenceEntry, 'doc_type' | 'label' | 'configured' | 'updated_at' | 'preview'>>

export default function DocumentNumberingPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [sequences, setSequences] = useState<SequenceEntry[]>([])
  const [edits, setEdits] = useState<Record<string, SequenceEdits>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ sequences: SequenceEntry[] }>('/admin/document-sequences')
      .then((r) => setSequences(r.data.sequences))
      .catch(() => addToast({ type: 'error', message: 'Failed to load document sequences' }))
      .finally(() => setLoading(false))
  }, [addToast])

  useEffect(() => { void load() }, [load])

  function getField<K extends keyof SequenceEdits>(
    docType: string,
    key: K,
    fallback: SequenceEntry[K],
  ): SequenceEntry[K] {
    const e = edits[docType]
    return (e && key in e ? e[key] : fallback) as SequenceEntry[K]
  }

  function setField(docType: string, key: keyof SequenceEdits, value: unknown) {
    setEdits((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], [key]: value },
    }))
  }

  function buildPreview(docType: string, seq: SequenceEntry): string {
    const prefix        = getField(docType, 'prefix', seq.prefix)
    const nextNumber    = getField(docType, 'next_number', seq.next_number)
    const padLength     = getField(docType, 'pad_length', seq.pad_length)
    const yearInNumber  = getField(docType, 'year_in_number', seq.year_in_number)
    const separator     = getField(docType, 'separator', seq.separator)
    const num = String(nextNumber).padStart(padLength, '0')
    const sep = separator || '-'
    if (yearInNumber) {
      const yr = new Date().getFullYear()
      return `${prefix}${sep}${yr}${sep}${num}`
    }
    return `${prefix}${sep}${num}`
  }

  async function handleSave(seq: SequenceEntry) {
    const e = edits[seq.doc_type]
    if (!e || Object.keys(e).length === 0) {
      addToast({ type: 'info', message: 'No changes to save' })
      return
    }
    setSaving(seq.doc_type)
    try {
      const payload = {
        prefix:         getField(seq.doc_type, 'prefix', seq.prefix),
        next_number:    getField(seq.doc_type, 'next_number', seq.next_number),
        pad_length:     getField(seq.doc_type, 'pad_length', seq.pad_length),
        year_in_number: getField(seq.doc_type, 'year_in_number', seq.year_in_number),
        separator:      getField(seq.doc_type, 'separator', seq.separator),
      }
      await api.put(`/admin/document-sequences/${seq.doc_type}`, payload)
      addToast({ type: 'success', message: `${seq.label} sequence saved` })
      const newEdits = { ...edits }
      delete newEdits[seq.doc_type]
      setEdits(newEdits)
      void load()
    } catch {
      addToast({ type: 'error', message: 'Failed to save sequence' })
    } finally {
      setSaving(null)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: theme.textMuted,
    marginBottom: '4px',
    display: 'block',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
    fontSize: '13px',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '860px' }}>
      <PageHeader
        title="Document Numbering"
        subtitle="Configure prefix, format, and starting number for each document type"
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: '130px', borderRadius: '12px' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          {sequences.map((seq) => {
            const hasEdits = !!(edits[seq.doc_type] && Object.keys(edits[seq.doc_type]!).length > 0)
            const preview = buildPreview(seq.doc_type, seq)

            return (
              <Card key={seq.doc_type} style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: theme.textPrimary }}>{seq.label}</span>
                  {seq.configured
                    ? <Badge variant="success" size="sm">Configured</Badge>
                    : <Badge variant="neutral" size="sm">Default</Badge>}
                  <span style={{
                    marginLeft: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: theme.accent,
                    background: theme.accentBg,
                    border: `1px solid ${theme.accentBorder}`,
                    borderRadius: '6px',
                    padding: '3px 10px',
                    letterSpacing: '0.04em',
                  }}>
                    {preview}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 80px 80px 1fr', gap: '12px', alignItems: 'end' }}>
                  {/* Prefix */}
                  <div>
                    <label style={labelStyle}>Prefix</label>
                    <input
                      style={inputStyle}
                      value={getField(seq.doc_type, 'prefix', seq.prefix)}
                      onChange={(e) => setField(seq.doc_type, 'prefix', e.target.value)}
                      maxLength={20}
                      placeholder="PO"
                    />
                  </div>

                  {/* Separator */}
                  <div>
                    <label style={labelStyle}>Separator</label>
                    <input
                      style={inputStyle}
                      value={getField(seq.doc_type, 'separator', seq.separator)}
                      onChange={(e) => setField(seq.doc_type, 'separator', e.target.value)}
                      maxLength={5}
                      placeholder="-"
                    />
                  </div>

                  {/* Pad length */}
                  <div>
                    <label style={labelStyle}>Pad digits</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      max={10}
                      value={getField(seq.doc_type, 'pad_length', seq.pad_length)}
                      onChange={(e) => setField(seq.doc_type, 'pad_length', parseInt(e.target.value, 10) || 1)}
                    />
                  </div>

                  {/* Next number */}
                  <div>
                    <label style={labelStyle}>Next number</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      value={getField(seq.doc_type, 'next_number', seq.next_number)}
                      onChange={(e) => setField(seq.doc_type, 'next_number', parseInt(e.target.value, 10) || 1)}
                    />
                  </div>

                  {/* Year toggle + save */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: theme.textSecondary }}>
                      <input
                        type="checkbox"
                        checked={getField(seq.doc_type, 'year_in_number', seq.year_in_number)}
                        onChange={(e) => setField(seq.doc_type, 'year_in_number', e.target.checked)}
                        style={{ accentColor: theme.accent }}
                      />
                      Include year
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {hasEdits && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const next = { ...edits }
                            delete next[seq.doc_type]
                            setEdits(next)
                          }}
                        >
                          Reset
                        </Button>
                      )}
                      <Button
                        variant={hasEdits ? 'primary' : 'ghost'}
                        size="sm"
                        loading={saving === seq.doc_type}
                        disabled={!hasEdits}
                        onClick={() => void handleSave(seq)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>

                {seq.updated_at && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
                    Last updated {new Date(seq.updated_at).toLocaleDateString()}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <div style={{
        marginTop: '20px',
        padding: '12px 16px',
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '10px',
        fontSize: '12px',
        color: theme.textMuted,
      }}>
        <strong>Next number</strong> is the number that will be used on the <em>next</em> document created.
        Changing it does not affect existing documents. If no sequence is configured, numbers fall back to a timestamp-based format.
      </div>
    </div>
  )
}
