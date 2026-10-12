import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { ADD_PO_LINE_COMMENT, RESOLVE_PO_LINE_COMMENT } from '../../../graphql/procurement'
import type {
  AddPoLineCommentMutation,
  AddPoLineCommentMutationVariables,
  ResolvePoLineCommentMutation,
  ResolvePoLineCommentMutationVariables,
} from '../../../graphql/generated'

export interface LineComment {
  id: string
  comment: string
  created_by_name: string
  created_at: string
  flag?: 'info' | 'warning' | 'dispute' | null
  resolved: boolean
  resolved_at?: string | null
}

// Extracted out of RequisitionDetail.tsx — inlining this much nested JSX
// into that file's already huge single function pushed esbuild's transform
// over a memory ceiling (vitest's RequisitionDetail.test.tsx started OOMing
// during module collection, before any test body even ran). Self-contained
// so it also owns the add/resolve mutations rather than taking them as
// props. `poId` also accepts a requisition id — see migration 297 and the
// addPOLineComment/resolvePOLineComment resolvers.
export function LineCommentsModal({
  poId,
  lineId,
  description,
  comments,
  onClose,
  onChanged,
}: {
  poId: string
  lineId: string
  description: string
  comments: LineComment[]
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [newComment, setNewComment] = useState('')
  const [newFlag, setNewFlag] = useState<'' | 'info' | 'warning' | 'dispute'>('')
  const [addingComment, setAddingComment] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [addLineComment] = useMutation<
    AddPoLineCommentMutation,
    AddPoLineCommentMutationVariables
  >(ADD_PO_LINE_COMMENT)
  const [resolveLineComment] = useMutation<
    ResolvePoLineCommentMutation,
    ResolvePoLineCommentMutationVariables
  >(RESOLVE_PO_LINE_COMMENT)

  const FLAG_META: Record<string, { color: string; bg: string; label: string }> = {
    info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: t('po.detail.info') },
    warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: t('po.detail.warning') },
    dispute: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: t('po.detail.dispute') },
  }
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} | ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setAddingComment(true)
    try {
      await addLineComment({
        variables: { poId, lineId, comment: newComment.trim(), flag: newFlag || undefined },
      })
      onChanged()
      setNewComment('')
      setNewFlag('')
      addToast({ type: 'success', message: t('po.detail.commentAdded') })
    } catch {
      addToast({ type: 'error', message: t('po.detail.failedToAddComment') })
    } finally {
      setAddingComment(false)
    }
  }

  const handleResolve = async (commentId: string) => {
    setResolvingId(commentId)
    try {
      await resolveLineComment({ variables: { poId, commentId } })
      onChanged()
      addToast({ type: 'success', message: t('po.detail.flagResolved') })
    } catch {
      addToast({ type: 'error', message: t('po.detail.failedToResolveFlag') })
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: theme.bgSurface,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '500px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: theme.textPrimary }}>
            {t('po.detail.comments')}
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
            {t('po.detail.itemDescriptionLabel', { text: description })}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {comments.length === 0 && (
            <div
              style={{ padding: '24px 20px', textAlign: 'center', fontSize: '13px', color: theme.textMuted }}
            >
              {t('po.detail.noCommentsYet')}
            </div>
          )}
          {comments.map((c, idx) => {
            const fm = c.flag ? FLAG_META[c.flag] : null
            return (
              <div
                key={c.id}
                style={{
                  padding: '12px 20px',
                  borderBottom: idx < comments.length - 1 ? `1px solid ${theme.border}22` : 'none',
                  background: fm && !c.resolved ? fm.bg : 'transparent',
                  borderLeft: fm ? `3px solid ${c.resolved ? theme.border : fm.color}` : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    {fm && (
                      <div style={{ marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: c.resolved ? theme.bgCanvas : fm.bg,
                            color: c.resolved ? theme.textMuted : fm.color,
                            border: `1px solid ${c.resolved ? theme.border : fm.color}`,
                            textDecoration: c.resolved ? 'line-through' : 'none',
                          }}
                        >
                          {fm.label}
                          {c.resolved ? t('po.detail.resolved') : ''}
                        </span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '14px',
                        color: theme.textPrimary,
                        marginBottom: '4px',
                        opacity: c.resolved ? 0.6 : 1,
                      }}
                    >
                      {c.comment}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>
                      {c.created_by_name}&nbsp;&nbsp;{fmt(c.created_at)}
                      {c.resolved && c.resolved_at && (
                        <span style={{ marginLeft: '8px', color: '#10b981' }}>
                          {t('po.detail.resolvedOn', { date: fmt(c.resolved_at) })}
                        </span>
                      )}
                    </div>
                  </div>
                  {fm && !c.resolved && (
                    <button
                      onClick={() => void handleResolve(c.id)}
                      disabled={resolvingId === c.id}
                      style={{
                        flexShrink: 0,
                        padding: '4px 10px',
                        borderRadius: '5px',
                        border: `1px solid ${fm.color}`,
                        background: 'transparent',
                        color: fm.color,
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {resolvingId === c.id ? '…' : t('po.detail.resolve')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '8px' }}>
            {t('po.detail.addCommentN', { n: comments.length + 1 })}
          </div>
          <textarea
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value)
            }}
            rows={2}
            placeholder={t('po.detail.typeYourComment')}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgCanvas,
              color: theme.textPrimary,
              fontSize: '13px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAddComment()
            }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: theme.textMuted, alignSelf: 'center', marginRight: '2px' }}>
              {t('po.detail.flag2')}
            </span>
            {(
              [
                ['', t('po.detail.noneOption'), theme.textMuted, theme.border],
                ['info', t('po.detail.info'), '#3b82f6', '#3b82f6'],
                ['warning', t('po.detail.warning'), '#f59e0b', '#f59e0b'],
                ['dispute', t('po.detail.dispute'), '#ef4444', '#ef4444'],
              ] as [string, string, string, string][]
            ).map(([val, label, color, border]) => (
              <button
                key={val}
                onClick={() => {
                  setNewFlag(val as typeof newFlag)
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: '5px',
                  border: `1px solid ${newFlag === val ? border : theme.border}`,
                  background: newFlag === val ? `${color}18` : 'transparent',
                  color: newFlag === val ? color : theme.textMuted,
                  fontSize: '11px',
                  fontWeight: newFlag === val ? 700 : 400,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                background: 'transparent',
                color: theme.textPrimary,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {t('po.detail.close')}
            </button>
            <button
              onClick={() => void handleAddComment()}
              disabled={!newComment.trim() || addingComment}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                border: 'none',
                background: newComment.trim() ? theme.accent : theme.border,
                color: '#fff',
                fontSize: '13px',
                cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              {addingComment ? t('po.detail.adding') : t('po.detail.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
