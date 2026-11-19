import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { Modal } from '../../../components/ui/Modal'
import { ActionButton } from '../../../components/ui/ActionButton'
import { fieldTextareaStyle } from '../../../components/ui/fieldStyles'
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
//
// Drawn in the shared Modal (Escape, focus trap and focus back, a named dialog), with the flag colours taken from the
// theme: they were fixed light-theme literals.
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
  const { theme, themeKey } = useTheme()
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

  // a tint is the colour at 10% (`1a` is the alpha byte of the theme's hex colour)
  const FLAG_META: Record<string, { color: string; bg: string; label: string }> = {
    info: { color: theme.info, bg: `${theme.info}1a`, label: t('po.detail.info') },
    warning: { color: theme.warning, bg: `${theme.warning}1a`, label: t('po.detail.warning') },
    dispute: { color: theme.danger, bg: `${theme.danger}1a`, label: t('po.detail.dispute') },
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
    <Modal
      open
      onClose={onClose}
      title={t('po.detail.comments')}
      description={t('po.detail.itemDescriptionLabel', { text: description })}
      size="md"
      noPadding
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ maxHeight: '44vh', overflowY: 'auto', padding: '4px 0' }}>
          {comments.length === 0 && (
            <div
              style={{
                padding: '24px 20px',
                textAlign: 'center',
                fontSize: '13px',
                color: theme.textSecondary,
              }}
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
                  borderBottom: idx < comments.length - 1 ? `1px solid ${theme.border}` : 'none',
                  background: fm && !c.resolved ? fm.bg : 'transparent',
                  borderInlineStart: fm
                    ? `3px solid ${c.resolved ? theme.border : fm.color}`
                    : '3px solid transparent',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {fm && (
                      <div style={{ marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: c.resolved ? theme.bgCanvas : fm.bg,
                            color: c.resolved ? theme.textSecondary : fm.color,
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
                    <div style={{ fontSize: '11px', color: theme.textSecondary }}>
                      {c.created_by_name}&nbsp;&nbsp;{fmt(c.created_at)}
                      {c.resolved && c.resolved_at && (
                        <span style={{ marginInlineStart: '8px', color: theme.success }}>
                          {t('po.detail.resolvedOn', { date: fmt(c.resolved_at) })}
                        </span>
                      )}
                    </div>
                  </div>
                  {fm && !c.resolved && (
                    <ActionButton
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResolve(c.id)}
                      disabled={resolvingId === c.id}
                    >
                      {resolvingId === c.id ? '…' : t('po.detail.resolve')}
                    </ActionButton>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}` }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textSecondary,
              marginBottom: '8px',
            }}
          >
            {t('po.detail.addCommentN', { n: comments.length + 1 })}
          </div>
          <textarea
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value)
            }}
            rows={2}
            placeholder={t('po.detail.typeYourComment')}
            style={fieldTextareaStyle(theme, { size: 'sm', dark: themeKey === 'black' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAddComment()
            }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                color: theme.textSecondary,
                alignSelf: 'center',
                marginInlineEnd: '2px',
              }}
            >
              {t('po.detail.flag2')}
            </span>
            {(
              [
                ['', t('po.detail.noneOption'), theme.textSecondary, theme.border],
                ['info', t('po.detail.info'), theme.info, theme.info],
                ['warning', t('po.detail.warning'), theme.warning, theme.warning],
                ['dispute', t('po.detail.dispute'), theme.danger, theme.danger],
              ] as [string, string, string, string][]
            ).map(([val, label, color, border]) => (
              <button
                key={val}
                type="button"
                aria-pressed={newFlag === val}
                onClick={() => {
                  setNewFlag(val as typeof newFlag)
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${newFlag === val ? border : theme.border}`,
                  background: newFlag === val ? `${color}1a` : 'transparent',
                  color: newFlag === val ? color : theme.textSecondary,
                  fontSize: '11px',
                  fontWeight: newFlag === val ? 700 : 500,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <ActionButton variant="outline" onClick={onClose}>
              {t('po.detail.close')}
            </ActionButton>
            <ActionButton
              variant="solid"
              onClick={() => void handleAddComment()}
              disabled={!newComment.trim() || addingComment}
            >
              {addingComment ? t('po.detail.adding') : t('po.detail.add')}
            </ActionButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
