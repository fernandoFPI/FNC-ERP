// The receipts-and-photos viewer of a purchase order, built to live in a window of its own (lib/poPhotoViewer.ts opens it): Finance
// drags it to a second screen and goes down the lines in the main window while the pictures stay in view. Every picture of the
// order is here, grouped: the buyers' receipts, the vendor receipt and the materials photos of each receipt, and the delivery
// photos. A big picture with zoom, drag, rotate and the arrow keys; a rail of thumbnails to choose from.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApolloClient, useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useIsRtl } from '../../i18n'
import { Spinner } from '../ui/Spinner'
import { ActionButton } from '../ui/ActionButton'
import { ENTITY_ATTACHMENTS_QUERY, FILE_DOWNLOAD_URL_QUERY } from '../../graphql/hr'
import { PO_PHOTOS_QUERY } from '../../graphql/procurement'
import { REQUISITION_PHOTOS_QUERY } from '../../graphql/requisitions'
import { clampScale, saveViewerGeometry, stepScale, windowGeometry } from '../../lib/poPhotoViewer'

type GroupKey = 'buyer' | 'vendor' | 'materials' | 'delivery' | 'other'
const GROUP_ORDER: GroupKey[] = ['buyer', 'vendor', 'materials', 'delivery', 'other']
const GROUP_TITLE_KEY: Record<GroupKey, string> = {
  buyer: 'po.detail.buyerReceipts',
  vendor: 'po.detail.vendorReceipt',
  materials: 'po.detail.materialsReceived',
  delivery: 'po.detail.deliveryPhotos',
  other: 'po.photoViewer.otherFiles',
}

export interface ViewerPhoto {
  key: string
  group: GroupKey
  /** Short name under the thumbnail and in the header. */
  title: string
  filename: string
  mimeType: string
  url: string | null
  when: string | null
}

interface PoPhotosData {
  purchaseOrder: {
    id: string
    po_number: string
    receipts: {
      id: string
      status: string
      receipt_date: string | null
      photos: {
        id: string
        fileId: string
        label: string | null
        category: string
        originalFilename: string
        downloadUrl: string | null
        createdAt: string
      }[]
    }[]
  } | null
}

interface RequisitionPhotosData {
  requisition: {
    id: string
    requisition_number: string
    lines: {
      id: string
      line_number: number
      description: string | null
      product_name: string | null
      purchases: { id: string; vendor_name: string | null; qty: number | string }[]
    }[]
  } | null
}

interface AttachmentsData {
  entityAttachments: {
    id: string
    file: { id: string; originalFilename: string; mimeType: string }
    label: string | null
    createdAt: string
    sourceEntityType: string | null
  }[]
}

const isPdf = (mime: string, filename: string) =>
  mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
const isImage = (mime: string, filename: string) =>
  mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/i.test(filename)

/** How long a signed picture link is trusted: after this the window asks for fresh ones when it is brought back to the front. */
const REFRESH_AFTER_MS = 10 * 60 * 1000

/** The pictures of a receipt: the vendor's own receipt, and the photos of the goods (an old receipt has only the latter). */
export function receiptPhotoGroup(category: string): GroupKey {
  return category === 'po_receipt_document' ? 'vendor' : 'materials'
}

/** The group of a file attached to the order itself: a buyer's proof of purchase, or a photo uploaded against the PO. */
export function attachmentGroup(sourceEntityType: string | null): GroupKey {
  if (sourceEntityType === 'po_line_purchase') return 'buyer'
  if (sourceEntityType === 'purchase_order') return 'delivery'
  return 'other'
}

interface PoPhotoViewerProps {
  /** The purchase order whose pictures are shown. Leave out when a requisition is given instead. */
  poId?: string
  /**
   * A requisition in its organizer review: no purchase order exists yet, so the pictures are the receipts the buyers attached to
   * each purchase, grouped as buyer receipts.
   */
  requisitionId?: string
  /** The window this viewer is drawn into (keys, focus and resize are listened for there). The route's own window by default. */
  win?: Window
  /** Remember where the person put the window (a pop-up window only: a floating picture-in-picture window is placed by the browser). */
  saveGeometry?: boolean
}

export function PoPhotoViewer({
  poId,
  requisitionId,
  win = window,
  saveGeometry = false,
}: PoPhotoViewerProps) {
  const id = poId ?? ''
  const reqId = requisitionId ?? ''
  const forRequisition = reqId !== ''
  const { t } = useTranslation()
  const { theme } = useTheme()
  const rtl = useIsRtl()
  const client = useApolloClient()

  const photosQuery = useQuery<PoPhotosData>(PO_PHOTOS_QUERY, {
    variables: { id },
    skip: !id || forRequisition,
    fetchPolicy: 'network-only',
  })
  const attachmentsQuery = useQuery<AttachmentsData>(ENTITY_ATTACHMENTS_QUERY, {
    variables: { entityType: 'purchase_order', entityId: id },
    skip: !id || forRequisition,
    fetchPolicy: 'network-only',
  })
  const requisitionQuery = useQuery<RequisitionPhotosData>(REQUISITION_PHOTOS_QUERY, {
    variables: { id: reqId },
    skip: !forRequisition,
    fetchPolicy: 'network-only',
  })

  // Signed links of the attached files, fetched one by one (a link is short-lived; see REFRESH_AFTER_MS)
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({})
  const [loadedAt, setLoadedAt] = useState(() => Date.now())
  // A requisition has no attachments of its own: its receipts hang on each purchase, read one by one (a few per order)
  const [purchaseAttachments, setPurchaseAttachments] = useState<
    AttachmentsData['entityAttachments']
  >([])
  const requisition = requisitionQuery.data?.requisition
  useEffect(() => {
    if (!requisition) return
    let cancelled = false
    const jobs = requisition.lines.flatMap((line) =>
      line.purchases.map(async (p) => {
        const label = `#${line.line_number} ${line.description ?? line.product_name ?? ''}`.trim()
        try {
          const res = await client.query<AttachmentsData>({
            query: ENTITY_ATTACHMENTS_QUERY,
            variables: { entityType: 'po_line_purchase', entityId: p.id },
            fetchPolicy: 'network-only',
          })
          return res.data.entityAttachments.map((a) => ({
            ...a,
            label: a.label ?? (p.vendor_name ? `${label} · ${p.vendor_name}` : label),
            sourceEntityType: 'po_line_purchase',
          }))
        } catch {
          return []
        }
      }),
    )
    void Promise.all(jobs).then((lists) => {
      if (!cancelled) setPurchaseAttachments(lists.flat())
    })
    return () => {
      cancelled = true
    }
  }, [requisition, client, loadedAt])
  const attachments = forRequisition
    ? purchaseAttachments
    : attachmentsQuery.data?.entityAttachments

  useEffect(() => {
    if (!attachments) return
    let cancelled = false
    void Promise.all(
      attachments.map(async (a) => {
        try {
          const res = await client.query<{ fileDownloadUrl: { downloadUrl: string } }>({
            query: FILE_DOWNLOAD_URL_QUERY,
            variables: { fileId: a.file.id },
            fetchPolicy: 'network-only',
          })
          return [a.file.id, res.data.fileDownloadUrl.downloadUrl] as const
        } catch {
          return null
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      setAttachmentUrls(
        Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)),
      )
    })
    return () => {
      cancelled = true
    }
  }, [attachments, client, loadedAt])

  const po = photosQuery.data?.purchaseOrder
  const docNumber = forRequisition ? requisition?.requisition_number : po?.po_number
  const mainQuery = forRequisition ? requisitionQuery : photosQuery
  const photos = useMemo<ViewerPhoto[]>(() => {
    const list: ViewerPhoto[] = []
    for (const a of attachments ?? []) {
      list.push({
        key: `att-${a.id}`,
        group: attachmentGroup(a.sourceEntityType),
        title: a.label ?? a.file.originalFilename,
        filename: a.file.originalFilename,
        mimeType: a.file.mimeType,
        url: attachmentUrls[a.file.id] ?? null,
        when: a.createdAt,
      })
    }
    for (const r of po?.receipts ?? []) {
      // a cancelled receipt's pictures are not evidence of anything
      if (r.status === 'cancelled') continue
      for (const p of r.photos) {
        list.push({
          key: `rcp-${r.id}-${p.id}`,
          group: receiptPhotoGroup(p.category),
          title: p.label ?? p.originalFilename,
          filename: p.originalFilename,
          mimeType: isPdf('', p.originalFilename) ? 'application/pdf' : 'image/*',
          url: p.downloadUrl,
          when: p.createdAt,
        })
      }
    }
    return GROUP_ORDER.flatMap((g) => list.filter((p) => p.group === g))
  }, [attachments, attachmentUrls, po])

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedIndex = Math.max(
    0,
    photos.findIndex((p) => p.key === selectedKey),
  )
  const selected = photos.length > 0 ? photos[selectedIndex] : null

  // view of the chosen picture
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const resetView = useCallback(() => {
    setScale(1)
    setRotation(0)
    setOffset({ x: 0, y: 0 })
  }, [])
  const choose = useCallback(
    (key: string) => {
      setSelectedKey(key)
      resetView()
    },
    [resetView],
  )
  const step = useCallback(
    (delta: number) => {
      if (photos.length === 0) return
      const next = (selectedIndex + delta + photos.length) % photos.length
      choose(photos[next].key)
    },
    [photos, selectedIndex, choose],
  )

  // the window's name in the tab / title bar
  useEffect(() => {
    if (docNumber) win.document.title = `${docNumber} · ${t('po.photoViewer.title')}`
  }, [docNumber, t, win])

  // Remember where the person put this window (second screen, size) for the next time it is opened
  useEffect(() => {
    if (!saveGeometry) return
    let last = ''
    const save = () => {
      const g = windowGeometry(win)
      const text = JSON.stringify(g)
      if (text === last) return
      last = text
      saveViewerGeometry(g)
    }
    const timer = win.setInterval(save, 1500)
    win.addEventListener('resize', save)
    win.addEventListener('beforeunload', save)
    return () => {
      win.clearInterval(timer)
      win.removeEventListener('resize', save)
      win.removeEventListener('beforeunload', save)
    }
  }, [win, saveGeometry])

  const reload = useCallback(() => {
    setLoadedAt(Date.now())
    if (forRequisition) {
      void requisitionQuery.refetch()
    } else {
      void photosQuery.refetch()
      void attachmentsQuery.refetch()
    }
  }, [forRequisition, requisitionQuery, photosQuery, attachmentsQuery])

  // A window left on a second screen for an hour holds expired links: bring them back when it is clicked into again
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - loadedAt > REFRESH_AFTER_MS) reload()
    }
    win.addEventListener('focus', onFocus)
    return () => {
      win.removeEventListener('focus', onFocus)
    }
  }, [loadedAt, reload, win])

  // keyboard: arrows choose, + and - zoom, 0 fits, R rotates
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'ArrowRight':
          step(rtl ? -1 : 1)
          break
        case 'ArrowLeft':
          step(rtl ? 1 : -1)
          break
        case '+':
        case '=':
          setScale((s) => stepScale(s, 'in'))
          break
        case '-':
          setScale((s) => stepScale(s, 'out'))
          break
        case '0':
          resetView()
          break
        case 'r':
        case 'R':
          setRotation((r) => (r + 90) % 360)
          break
        default:
          return
      }
      e.preventDefault()
    }
    win.addEventListener('keydown', onKey)
    return () => {
      win.removeEventListener('keydown', onKey)
    }
  }, [step, rtl, resetView, win])

  // the picture area: its size (so a rotated picture still fits), wheel zoom, and drag to move
  // the element itself is state, not a ref: the canvas is only drawn once the data is in, and the effect below must run then
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const el = canvasEl
    if (!el) return
    const measure = () => {
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    // the observer of the window the element is in (a picture-in-picture window is another document)
    const Observer = (win as Window & typeof globalThis).ResizeObserver as
      | typeof ResizeObserver
      | undefined
    const observer = Observer ? new Observer(measure) : null
    observer?.observe(el)
    // a non-passive wheel listener, so the page does not scroll while the picture zooms
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale((s) => stepScale(s, e.deltaY < 0 ? 'in' : 'out'))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer?.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [canvasEl, win])

  const turned = rotation % 180 !== 0
  const imageBox = turned
    ? { maxWidth: canvasSize.h || undefined, maxHeight: canvasSize.w || undefined }
    : { maxWidth: canvasSize.w || undefined, maxHeight: canvasSize.h || undefined }

  const header = (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        padding: '10px 14px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgSurface,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>
          {docNumber ? `${docNumber} · ` : ''}
          {t('po.photoViewer.title')}
        </div>
        {selected && (
          <div
            style={{
              fontSize: '12px',
              color: theme.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {t(GROUP_TITLE_KEY[selected.group])} · {selected.title}
            {selected.when ? ` · ${selected.when.slice(0, 10)}` : ''}
          </div>
        )}
      </div>
      {photos.length > 0 && (
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textSecondary }}>
          {t('po.photoViewer.counter', { n: selectedIndex + 1, total: photos.length })}
        </span>
      )}
      <ActionButton size="sm" variant="outline" onClick={reload}>
        {t('po.photoViewer.refresh')}
      </ActionButton>
    </header>
  )

  if (mainQuery.loading && !docNumber) {
    return (
      <div style={{ minHeight: '100vh', background: theme.bgCanvas, color: theme.textPrimary }}>
        {header}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }} role="status">
          <Spinner />
          <span style={{ marginInlineStart: '10px', color: theme.textSecondary }}>
            {t('po.photoViewer.loading')}
          </span>
        </div>
      </div>
    )
  }

  if (mainQuery.error && !docNumber) {
    return (
      <div style={{ minHeight: '100vh', background: theme.bgCanvas, color: theme.textPrimary }}>
        {header}
        <div role="alert" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ color: theme.danger, fontWeight: 600, marginBottom: '12px' }}>
            {t('po.photoViewer.loadFailed')}
          </div>
          <ActionButton variant="outline" onClick={reload}>
            {t('po.photoViewer.retry')}
          </ActionButton>
        </div>
      </div>
    )
  }

  const toolButton = (label: string, onClick: () => void, children: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        minWidth: '36px',
        height: '34px',
        padding: '0 10px',
        borderRadius: '8px',
        border: `1px solid ${theme.borderField}`,
        background: theme.bgSurface,
        color: theme.textPrimary,
        fontSize: '15px',
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: theme.bgCanvas,
        color: theme.textPrimary,
      }}
    >
      {header}
      {photos.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: theme.textSecondary }}>
          {t('po.photoViewer.empty')}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap' }}>
          {/* the thumbnails, by group */}
          <nav
            aria-label={t('po.photoViewer.title')}
            style={{
              width: '184px',
              flex: '0 0 auto',
              maxHeight: '100%',
              overflowY: 'auto',
              padding: '10px',
              borderInlineEnd: `1px solid ${theme.border}`,
              background: theme.bgSurface,
            }}
          >
            {GROUP_ORDER.map((g) => {
              const inGroup = photos.filter((p) => p.group === g)
              if (inGroup.length === 0) return null
              return (
                <section key={g} style={{ marginBottom: '14px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: theme.textSecondary,
                      marginBottom: '6px',
                    }}
                  >
                    {t(GROUP_TITLE_KEY[g])} ({inGroup.length})
                  </div>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}
                  >
                    {inGroup.map((p) => {
                      const active = p.key === selected?.key
                      return (
                        <button
                          key={p.key}
                          type="button"
                          aria-pressed={active}
                          aria-label={p.title}
                          title={p.title}
                          onClick={() => {
                            choose(p.key)
                          }}
                          style={{
                            padding: 0,
                            height: '64px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: theme.bgCanvas,
                            border: `2px solid ${active ? theme.accentSolid : theme.border}`,
                            color: theme.textSecondary,
                            fontSize: '11px',
                          }}
                        >
                          {p.url && isImage(p.mimeType, p.filename) ? (
                            <img
                              src={p.url}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : (
                            <span>{isPdf(p.mimeType, p.filename) ? 'PDF' : '…'}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </nav>

          {/* the big picture */}
          <main
            style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                padding: '8px 12px',
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              {toolButton(
                t('po.photoViewer.previous'),
                () => {
                  step(-1)
                },
                // ‹ and › are mirrored by the browser in a right-to-left page (playbook #104)
                '‹',
              )}
              {toolButton(
                t('po.photoViewer.next'),
                () => {
                  step(1)
                },
                '›',
              )}
              <span style={{ width: '8px' }} />
              {toolButton(
                t('po.photoViewer.zoomOut'),
                () => {
                  setScale((s) => stepScale(s, 'out'))
                },
                '−',
              )}
              <span
                aria-live="polite"
                style={{
                  minWidth: '48px',
                  textAlign: 'center',
                  fontSize: '13px',
                  fontVariantNumeric: 'tabular-nums',
                  color: theme.textSecondary,
                }}
              >
                {Math.round(scale * 100)}%
              </span>
              {toolButton(
                t('po.photoViewer.zoomIn'),
                () => {
                  setScale((s) => stepScale(s, 'in'))
                },
                '+',
              )}
              {toolButton(t('po.photoViewer.fit'), resetView, '⤢')}
              {toolButton(
                t('po.photoViewer.rotate'),
                () => {
                  setRotation((r) => (r + 90) % 360)
                },
                '↻',
              )}
              <span style={{ flex: 1 }} />
              {selected?.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '13px', color: theme.accentSolid, fontWeight: 600 }}
                >
                  {t('po.photoViewer.download')}
                </a>
              )}
            </div>
            <div
              ref={setCanvasEl}
              data-testid="photo-canvas"
              onPointerDown={(e) => {
                if (e.button !== 0) return
                drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
                setDragging(true)
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (!d) return
                setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
              }}
              onPointerUp={() => {
                drag.current = null
                setDragging(false)
              }}
              onPointerCancel={() => {
                drag.current = null
                setDragging(false)
              }}
              onDoubleClick={() => {
                if (scale === 1) setScale(2)
                else resetView()
              }}
              style={{
                flex: 1,
                minHeight: 0,
                position: 'relative',
                overflow: 'hidden',
                background: theme.bgCanvas,
                cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in',
                touchAction: 'none',
                userSelect: 'none',
              }}
            >
              {selected?.url ? (
                isPdf(selected.mimeType, selected.filename) ? (
                  <iframe
                    src={selected.url}
                    title={selected.title}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                    }}
                  />
                ) : isImage(selected.mimeType, selected.filename) ? (
                  <img
                    src={selected.url}
                    alt={selected.title}
                    draggable={false}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      ...imageBox,
                      objectFit: 'contain',
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${clampScale(scale)})`,
                      transition: dragging ? 'none' : 'transform 0.12s ease',
                    }}
                  />
                ) : (
                  <div style={{ padding: '32px', textAlign: 'center', color: theme.textSecondary }}>
                    {t('po.photoViewer.noPreview')}
                  </div>
                )
              ) : (
                <div style={{ padding: '32px', textAlign: 'center', color: theme.textSecondary }}>
                  <Spinner />
                </div>
              )}
            </div>
            <div style={{ padding: '6px 12px', fontSize: '12px', color: theme.textSecondary }}>
              {t('po.photoViewer.keysHint')}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
