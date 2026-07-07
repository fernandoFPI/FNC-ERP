import { ApolloClient, InMemoryCache, createHttpLink, from, fromPromise } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { useAuthStore } from '../store/authStore'
import { useCompanyStore } from '../store/companyStore'
import { decodeJWT } from './jwt'

const httpLink = createHttpLink({
  uri: `${import.meta.env.VITE_API_URL}/api/v1/graphql`,
})

const authLink = setContext((_, { headers }: { headers?: Record<string, string> }) => {
  const token = useAuthStore.getState().accessToken
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  }
})

let isRefreshing = false
let pendingRequests: Array<() => void> = []

function resolvePendingRequests() {
  pendingRequests.forEach(cb => cb())
  pendingRequests = []
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/v1/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }
    )
    if (!response.ok) return null
    const data = await response.json()
    const newToken = data.data?.accessToken
    if (newToken) {
      useAuthStore.getState().setAccessToken(newToken)
      // The refreshed token's companyId is authoritative — keep the UI's
      // company switcher and permissions in sync with it, in case the
      // server resolved a different company than what's locally cached.
      const decoded = decodeJWT(newToken)
      if (decoded) {
        useAuthStore.getState().setUser({ companyId: decoded.companyId, role: decoded.role })
        const { activeCompany, companies } = useCompanyStore.getState()
        if (decoded.companyId !== activeCompany?.id) {
          const matched = companies.find((c) => c.id === decoded.companyId)
          if (matched) useCompanyStore.setState({ activeCompany: matched })
        }
      }
      return newToken
    }
    return null
  } catch {
    return null
  }
}

const errorLink = onError(({ networkError, operation, forward }) => {
  if (networkError && 'statusCode' in networkError && networkError.statusCode === 401) {
    if (isRefreshing) {
      return fromPromise(
        new Promise<void>(resolve => { pendingRequests.push(resolve) })
      ).flatMap(() => forward(operation))
    }
    isRefreshing = true
    return fromPromise(
      refreshAccessToken().then(newToken => {
        if (newToken) {
          resolvePendingRequests()
          return newToken
        }
        pendingRequests = []
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return null
      }).finally(() => { isRefreshing = false })
    ).flatMap(newToken => {
      if (!newToken) return forward(operation)
      operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
        headers: { ...headers, authorization: `Bearer ${newToken}` }
      }))
      return forward(operation)
    })
  }
})

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      ProjectInvoice: {
        fields: {
          payments: { merge: false },
          lines:    { merge: false },
        },
      },
      ProjectContract: {
        fields: {
          milestones: { merge: false },
          invoices:   { merge: false },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: { errorPolicy: 'all' },
    query: { errorPolicy: 'all' },
  },
})
