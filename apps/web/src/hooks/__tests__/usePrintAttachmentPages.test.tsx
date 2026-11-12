import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type * as LoaderModule from '../../lib/loadPrintAttachment'

const loadPages = vi.fn()
vi.mock('../../lib/loadPrintAttachment', async (importOriginal) => {
  const actual = await importOriginal<typeof LoaderModule>()
  return { ...actual, loadPrintAttachmentPages: (...a: unknown[]): unknown => loadPages(...a) }
})

import { PrintAttachmentError } from '../../lib/loadPrintAttachment'
import { forgetAttachmentPages, rememberAttachmentPages } from '../../lib/invoicePrintAttachment'
import { usePrintAttachmentPages } from '../usePrintAttachmentPages'

type Att = { fileId: string; mimeType: string } | null
const PDF: Att = { fileId: 'file-a', mimeType: 'application/pdf' }
const PNG: Att = { fileId: 'file-b', mimeType: 'image/png' }

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  loadPages.mockReset()
  for (const id of ['file-a', 'file-b', 'file-c']) forgetAttachmentPages(id)
})

describe('usePrintAttachmentPages', () => {
  it('no attachment: "none", and nothing is downloaded', () => {
    const { result } = renderHook(() => usePrintAttachmentPages(null, true))
    expect(result.current.state).toEqual({ status: 'none' })
    expect(loadPages).not.toHaveBeenCalled()
  })

  it('an attachment while the PDF tab is closed: waits ("loading"), downloads nothing', () => {
    const { result } = renderHook(() => usePrintAttachmentPages(PDF, false))
    expect(result.current.state).toEqual({ status: 'loading' })
    expect(loadPages).not.toHaveBeenCalled()
  })

  it('loads when the tab opens: loading, then the pages', async () => {
    const d = deferred<string[]>()
    loadPages.mockReturnValue(d.promise)
    const { result, rerender } = renderHook(({ on }) => usePrintAttachmentPages(PDF, on), {
      initialProps: { on: false },
    })
    rerender({ on: true })
    expect(result.current.state).toEqual({ status: 'loading' })
    expect(loadPages).toHaveBeenCalledWith({ fileId: 'file-a', mime: 'application/pdf' })
    await act(async () => {
      d.resolve(['p1', 'p2'])
      await d.promise
    })
    expect(result.current.state).toEqual({ status: 'ready', pages: ['p1', 'p2'] })
  })

  it('pages already built this session are ready at once, with no download', () => {
    rememberAttachmentPages('file-a', ['cached'])
    const { result } = renderHook(() => usePrintAttachmentPages(PDF, true))
    expect(result.current.state).toEqual({ status: 'ready', pages: ['cached'] })
    expect(loadPages).not.toHaveBeenCalled()
  })

  it("a replaced attachment is never shown with the old file's pages, not even for one render", async () => {
    loadPages.mockResolvedValueOnce(['old-1'])
    const seen: string[] = []
    const { result, rerender } = renderHook(
      ({ att }) => {
        const r = usePrintAttachmentPages(att, true)
        seen.push(
          `${att.fileId}:${r.state.status}:${r.state.status === 'ready' ? r.state.pages[0] : ''}`,
        )
        return r
      },
      { initialProps: { att: PDF } },
    )
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })
    const d = deferred<string[]>()
    loadPages.mockReturnValueOnce(d.promise)
    rerender({ att: PNG })
    expect(result.current.state).toEqual({ status: 'loading' })
    expect(seen.filter((s) => s.startsWith('file-b:ready:old-1'))).toEqual([])
    await act(async () => {
      d.resolve(['new-1'])
      await d.promise
    })
    expect(result.current.state).toEqual({ status: 'ready', pages: ['new-1'] })
  })

  it('removing the attachment goes back to "none"', async () => {
    loadPages.mockResolvedValue(['p'])
    const { result, rerender } = renderHook(({ att }) => usePrintAttachmentPages(att, true), {
      initialProps: { att: PDF as Att },
    })
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready')
    })
    rerender({ att: null })
    expect(result.current.state).toEqual({ status: 'none' })
  })

  it('a refusal comes back with its reason and numbers', async () => {
    loadPages.mockRejectedValue(
      new PrintAttachmentError('tooLong', { pageCount: 12, maxPages: 10 }),
    )
    const { result } = renderHook(() => usePrintAttachmentPages(PDF, true))
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    expect(result.current.state).toEqual({
      status: 'failed',
      reason: 'tooLong',
      detail: { pageCount: 12, maxPages: 10 },
    })
  })

  it('an error nobody classified counts as a failed download', async () => {
    loadPages.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => usePrintAttachmentPages(PDF, true))
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        reason: 'download',
        detail: undefined,
      })
    })
  })

  it('a type the page does not know is "unreadable", without asking the server', async () => {
    const { result } = renderHook(() =>
      usePrintAttachmentPages({ fileId: 'file-c', mimeType: 'application/zip' }, true),
    )
    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'failed', reason: 'unreadable' })
    })
    expect(loadPages).not.toHaveBeenCalled()
  })

  it('retry tries again, showing "loading" meanwhile, and can succeed', async () => {
    loadPages.mockRejectedValueOnce(new PrintAttachmentError('download'))
    const { result } = renderHook(() => usePrintAttachmentPages(PDF, true))
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed')
    })
    const d = deferred<string[]>()
    loadPages.mockReturnValueOnce(d.promise)
    act(() => {
      result.current.retry()
    })
    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => {
      d.resolve(['again'])
      await d.promise
    })
    expect(result.current.state).toEqual({ status: 'ready', pages: ['again'] })
    expect(loadPages).toHaveBeenCalledTimes(2)
  })

  it('an answer that arrives after the file changed is thrown away', async () => {
    const slow = deferred<string[]>()
    loadPages.mockReturnValueOnce(slow.promise)
    const { result, rerender } = renderHook(({ att }) => usePrintAttachmentPages(att, true), {
      initialProps: { att: PDF as Att },
    })
    loadPages.mockResolvedValueOnce(['fresh'])
    rerender({ att: PNG })
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', pages: ['fresh'] })
    })
    await act(async () => {
      slow.resolve(['stale'])
      await slow.promise
    })
    expect(result.current.state).toEqual({ status: 'ready', pages: ['fresh'] })
  })
})
