// A token refresh answers with the company the SESSION was last active in, and all tabs of one login share it. When
// another tab switched company, this tab's refresh silently became that company while its screens kept the old data
// (playbook #114: a Yakam requisition filed on a Factory project). These tests cover the shared helper and both real
// refresh paths (REST through axios, GraphQL through Apollo) end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloClient, InMemoryCache, gql } from '@apollo/client'
import { MockLink } from '@apollo/client/testing'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import fs from 'node:fs'
import path from 'node:path'
import i18n from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import { useCompanyStore } from '../../store/companyStore'
import { useToastStore } from '../../store/toastStore'
import { applyRefreshedToken, setCompanyChangeHandler } from '../refreshedSession'
import { api } from '../axios'
import { apolloClient } from '../apollo'

const FACTORY = { id: 'co-factory', name: 'Nishtimani Factory' }
const YAKAM = { id: 'co-yakam', name: 'Nishtimani Yakam' }

function tokenFor(companyId: string, role = 'user'): string {
  const payload = {
    sub: 'u1',
    sessionId: 's1',
    role,
    companyId,
    module: 'all',
    type: 'access',
    exp: 9999999999,
    iat: 1,
  }
  return `h.${btoa(JSON.stringify(payload))}.s`
}

const loadPermissions = vi.fn()

function startIn(company: { id: string; name: string }) {
  loadPermissions.mockClear()
  useAuthStore.setState({
    user: { companyId: company.id, role: 'user', permissions: {} } as never,
    accessToken: 'old-token',
    refreshToken: 'refresh-token',
    isAuthenticated: true,
    loadPermissionsForCompany: loadPermissions,
  })
  useCompanyStore.setState({ activeCompany: company, companies: [FACTORY, YAKAM] })
}

const toasts = () => useToastStore.getState().toasts
function firstToast() {
  const toast = toasts().at(0)
  if (!toast) throw new Error('no notice was shown')
  return toast
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  startIn(FACTORY)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  void i18n.changeLanguage('en')
})

describe('applyRefreshedToken', () => {
  it('keeps the same company quietly: new token stored, nothing reset, no notice', () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    applyRefreshedToken(tokenFor(FACTORY.id, 'company_admin'))
    expect(useAuthStore.getState().accessToken).toBe(tokenFor(FACTORY.id, 'company_admin'))
    expect(useAuthStore.getState().user?.role).toBe('company_admin')
    expect(reset).not.toHaveBeenCalled()
    expect(toasts()).toHaveLength(0)
    expect(useCompanyStore.getState().activeCompany?.id).toBe(FACTORY.id)
    expect(loadPermissions).not.toHaveBeenCalled()
  })

  it("moves to another company: resets cached data once, moves the badge, loads that company's permissions, and says so", () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    applyRefreshedToken(tokenFor(YAKAM.id))
    expect(useAuthStore.getState().user?.companyId).toBe(YAKAM.id)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(useCompanyStore.getState().activeCompany?.id).toBe(YAKAM.id)
    expect(loadPermissions).toHaveBeenCalledWith(YAKAM.id)
    expect(toasts()).toHaveLength(1)
    expect(firstToast().variant).toBe('warning')
    expect(firstToast().message).toContain('Nishtimani Yakam')
    expect(firstToast().message).not.toMatch(/shell\.|\{\{/)
  })

  it('says it in Arabic too, with the company name and no raw key', async () => {
    await i18n.changeLanguage('ar')
    setCompanyChangeHandler(vi.fn())
    applyRefreshedToken(tokenFor(YAKAM.id))
    const message = firstToast().message
    expect(message).toContain('Nishtimani Yakam')
    expect(message).toMatch(/[؀-ۿ]/)
    expect(message).not.toMatch(/shell\.|\{\{/)
  })

  it('a second refresh into the company already shown does not repeat the reset or the notice', () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    applyRefreshedToken(tokenFor(YAKAM.id))
    applyRefreshedToken(tokenFor(YAKAM.id))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(toasts()).toHaveLength(1)
  })

  it('does nothing about a company when the browser had none yet (first sign-in state)', () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    useAuthStore.setState({ user: null })
    applyRefreshedToken(tokenFor(YAKAM.id))
    expect(reset).not.toHaveBeenCalled()
    expect(toasts()).toHaveLength(0)
  })

  it('still resets the data when the new company is not in the switcher list, without moving the badge to nothing', () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    applyRefreshedToken(tokenFor('co-unknown'))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(useCompanyStore.getState().activeCompany?.id).toBe(FACTORY.id)
    expect(useAuthStore.getState().user?.companyId).toBe('co-unknown')
  })

  it('stores the token and changes nothing else for a token it cannot read', () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    applyRefreshedToken('not-a-jwt')
    expect(useAuthStore.getState().accessToken).toBe('not-a-jwt')
    expect(useAuthStore.getState().user?.companyId).toBe(FACTORY.id)
    expect(reset).not.toHaveBeenCalled()
  })
})

describe('the Apollo client empties its cache when the company changes (and only then)', () => {
  const QUERY = gql`
    query P {
      projects {
        id
      }
    }
  `
  // The tests above replace the handler apollo.ts registers, so load fresh copies of the modules: this is the
  // handler apollo.ts really installs, not a copy of it.
  async function freshApp() {
    vi.resetModules()
    const [refreshed, apollo, auth, company] = await Promise.all([
      import('../refreshedSession'),
      import('../apollo'),
      import('../../store/authStore'),
      import('../../store/companyStore'),
    ])
    auth.useAuthStore.setState({
      user: { companyId: FACTORY.id, role: 'user', permissions: {} } as never,
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      isAuthenticated: true,
      loadPermissionsForCompany: vi.fn(),
    })
    company.useCompanyStore.setState({ activeCompany: FACTORY, companies: [FACTORY, YAKAM] })
    apollo.apolloClient.cache.writeQuery({
      query: QUERY,
      data: { projects: [{ __typename: 'Project', id: 'factory-project' }] },
    })
    return { apply: refreshed.applyRefreshedToken, client: apollo.apolloClient }
  }

  it('wipes cached data on a company change', async () => {
    const { apply, client } = await freshApp()
    expect(client.cache.readQuery({ query: QUERY })).not.toBeNull()
    apply(tokenFor(YAKAM.id))
    expect(client.cache.readQuery({ query: QUERY })).toBeNull()
  })

  it('keeps cached data when the company is the same', async () => {
    const { apply, client } = await freshApp()
    apply(tokenFor(FACTORY.id))
    expect(client.cache.readQuery({ query: QUERY })).not.toBeNull()
  })

  it('a screen that is open refetches after cache.reset() (so it shows the new company, not the old)', async () => {
    const link = new MockLink([
      {
        request: { query: QUERY },
        result: { data: { projects: [{ __typename: 'Project', id: 'factory-project' }] } },
      },
      {
        request: { query: QUERY },
        result: { data: { projects: [{ __typename: 'Project', id: 'yakam-project' }] } },
      },
    ])
    const client = new ApolloClient({ link, cache: new InMemoryCache() })
    const seen: string[] = []
    const sub = client.watchQuery({ query: QUERY }).subscribe((r) => {
      const data = r.data as { projects?: { id: string }[] } | undefined
      if (data?.projects?.[0]) seen.push(data.projects[0].id)
    })
    await vi.waitFor(() => {
      expect(seen).toEqual(['factory-project'])
    })
    await client.cache.reset()
    await vi.waitFor(() => {
      expect(seen.at(-1)).toBe('yakam-project')
    })
    sub.unsubscribe()
  })
})

describe('the real refresh paths use it', () => {
  it('REST: a 401 refreshes into another company, retries the call, and resets the data and the badge', async () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    const newToken = tokenFor(YAKAM.id)
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { accessToken: newToken } } })
    let calls = 0
    const original = api.defaults.adapter
    api.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/me/companies')
        return Promise.resolve({ data: [], status: 200, statusText: 'OK', headers: {}, config })
      calls++
      if (calls === 1) {
        return Promise.reject(
          new AxiosError('unauthorized', '401', config, null, {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: {},
          }),
        )
      }
      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })
    }
    try {
      const res = await api.get('/anything')
      expect(res.data).toEqual({ ok: true })
    } finally {
      api.defaults.adapter = original
    }
    expect(calls).toBe(2)
    expect(useAuthStore.getState().user?.companyId).toBe(YAKAM.id)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(useCompanyStore.getState().activeCompany?.id).toBe(YAKAM.id)
    expect(toasts()).toHaveLength(1)
  })

  it('GraphQL: a 401 refreshes into another company, retries the query, and resets the data and the badge', async () => {
    const reset = vi.fn()
    setCompanyChangeHandler(reset)
    const newToken = tokenFor(YAKAM.id)
    let graphqlCalls = 0
    const fetchStub = vi.fn((url: string) => {
      if (url.includes('/auth/refresh'))
        return Promise.resolve(
          new Response(JSON.stringify({ data: { accessToken: newToken } }), { status: 200 }),
        )
      graphqlCalls++
      if (graphqlCalls === 1) return Promise.resolve(new Response('{}', { status: 401 }))
      return Promise.resolve(
        new Response(JSON.stringify({ data: { gqlRefreshProbe: 'ok' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchStub)
    const result = await apolloClient.query({
      query: gql`
        query Probe {
          gqlRefreshProbe
        }
      `,
      fetchPolicy: 'network-only',
    })
    expect((result.data as { gqlRefreshProbe: string }).gqlRefreshProbe).toBe('ok')
    expect(graphqlCalls).toBe(2)
    expect(useAuthStore.getState().user?.companyId).toBe(YAKAM.id)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(useCompanyStore.getState().activeCompany?.id).toBe(YAKAM.id)
    expect(loadPermissions).toHaveBeenCalledWith(YAKAM.id)
  })
})

describe('both refresh paths are wired to the one function (source pins)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8')

  it('axios.ts and apollo.ts hand the refreshed token to applyRefreshedToken and no longer decode it themselves', () => {
    for (const file of ['axios.ts', 'apollo.ts']) {
      const src = read(file)
      expect(
        src.includes('applyRefreshedToken(')
          ? 'wired'
          : `${file} does not call applyRefreshedToken`,
      ).toBe('wired')
      expect(src.includes('decodeJWT') ? `${file} still decodes the token itself` : 'ok').toBe('ok')
    }
  })

  it('apollo.ts registers a handler that resets the cache (cache.reset, never clearStore, which would cancel the retried query)', () => {
    const src = read('apollo.ts')
    const block = /setCompanyChangeHandler\(\(\) => \{([\s\S]*?)\n\}\)/.exec(src)
    if (!block) throw new Error('apollo.ts registers no company-change handler')
    const body = block.at(1) ?? ''
    expect(body.includes('cache.reset()') ? 'ok' : 'handler does not reset the cache').toBe('ok')
    expect(body.includes('clearStore') ? 'handler uses clearStore' : 'ok').toBe('ok')
  })
})
