// The names record pages register for the breadcrumb: stored by id, replaced when a page registers a new one, capped so a long session
// cannot grow it for ever, and emptied when another person signs in or the same person switches company.
import { describe, it, expect, beforeEach } from 'vitest'
import { useBreadcrumbStore } from '../breadcrumbStore'
import { useAuthStore } from '../authStore'

const user = (over: Record<string, unknown> = {}) =>
  ({ id: 'u1', email: 'a@b.c', role: 'user', companyId: 'c1', ...over }) as never

beforeEach(() => {
  useAuthStore.setState({ user: user() })
  useBreadcrumbStore.setState({ titles: {} })
})

describe('breadcrumbStore', () => {
  it('keeps a name by the record id', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'REQ-2026-0075')
    expect(useBreadcrumbStore.getState().titles['id-1']).toBe('REQ-2026-0075')
  })

  it('replaces the name when a page registers a new one for the same id (a renamed record)', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'Old name')
    useBreadcrumbStore.getState().setTitle('id-1', 'New name')
    expect(useBreadcrumbStore.getState().titles['id-1']).toBe('New name')
  })

  it('does not change the state (so nothing re-renders) when the same name is registered again', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'Same')
    const before = useBreadcrumbStore.getState().titles
    useBreadcrumbStore.getState().setTitle('id-1', 'Same')
    expect(useBreadcrumbStore.getState().titles).toBe(before)
  })

  it('keeps the newest 300 names and drops the oldest', () => {
    for (let i = 0; i < 305; i++) useBreadcrumbStore.getState().setTitle(`id-${i}`, `Name ${i}`)
    const titles = useBreadcrumbStore.getState().titles
    expect(Object.keys(titles)).toHaveLength(300)
    expect(titles['id-0']).toBeUndefined()
    expect(titles['id-4']).toBeUndefined()
    expect(titles['id-5']).toBe('Name 5')
    expect(titles['id-304']).toBe('Name 304')
  })

  it('is emptied by clear()', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'X')
    useBreadcrumbStore.getState().clear()
    expect(useBreadcrumbStore.getState().titles).toEqual({})
  })

  it('is emptied when another person signs in', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'X')
    useAuthStore.setState({ user: user({ id: 'u2' }) })
    expect(useBreadcrumbStore.getState().titles).toEqual({})
  })

  it('is emptied when the same person switches company', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'X')
    useAuthStore.setState({ user: user({ companyId: 'c2' }) })
    expect(useBreadcrumbStore.getState().titles).toEqual({})
  })

  it('is emptied on sign-out', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'X')
    useAuthStore.setState({ user: null })
    expect(useBreadcrumbStore.getState().titles).toEqual({})
  })

  it('keeps the names when something else about the user changes (a new profile picture, a new token)', () => {
    useBreadcrumbStore.getState().setTitle('id-1', 'X')
    useAuthStore.setState({ user: user({ firstName: 'Nadia', profilePicture: 'https://x.test/n.png' }) })
    expect(useBreadcrumbStore.getState().titles['id-1']).toBe('X')
  })
})
