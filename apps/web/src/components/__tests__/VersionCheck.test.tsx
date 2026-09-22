import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { VersionCheck } from '../VersionCheck'

const addToast = vi.fn()
vi.mock('../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) => selector({ addToast }),
}))

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

function mockVersionResponses(versions: string[]) {
  let i = 0
  global.fetch = vi.fn().mockImplementation(() => {
    const v = versions[Math.min(i, versions.length - 1)]
    i += 1
    return Promise.resolve({ ok: true, text: () => Promise.resolve(v) })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  // import.meta.env.PROD must be true for VersionCheck to do anything —
  // vite sets this at build/test time; vitest's default test env runs with
  // PROD false, so we flip it for this suite only.
  vi.stubEnv('PROD', true)
  setHidden(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  document.removeEventListener('visibilitychange', () => {})
})

describe('VersionCheck', () => {
  it('does not reload immediately when a new version is detected on a visible (active) tab', async () => {
    mockVersionResponses(['abc123', 'def456'])
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true })

    render(<VersionCheck />)
    await vi.advanceTimersByTimeAsync(0) // first check: sets baseline
    await vi.advanceTimersByTimeAsync(60_000) // second check: detects new version

    expect(addToast).toHaveBeenCalledTimes(1)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('reloads once the tab becomes hidden after a new version was detected', async () => {
    mockVersionResponses(['abc123', 'def456'])
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true })

    render(<VersionCheck />)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reloadSpy).not.toHaveBeenCalled()

    // User switches tabs away — safe to reload now that nobody's watching.
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('reloads immediately if the tab is already hidden when the new version is detected', async () => {
    mockVersionResponses(['abc123', 'def456'])
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true })

    render(<VersionCheck />)
    await vi.advanceTimersByTimeAsync(0)
    setHidden(true)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it("the toast's Refresh now action reloads immediately regardless of visibility", async () => {
    mockVersionResponses(['abc123', 'def456'])
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true })

    render(<VersionCheck />)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)

    const toastArg = addToast.mock.calls[0]![0] as { actions: { label: string; onClick: () => void }[] }
    toastArg.actions[0]!.onClick()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
