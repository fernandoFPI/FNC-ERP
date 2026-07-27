import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  createHttpLink,
  from,
  fromPromise,
  split,
} from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { createClient } from 'graphql-ws'
import { useAuthStore } from '../store/authStore'
import { useCompanyStore } from '../store/companyStore'
import { useToastStore } from '../store/toastStore'
import { useTourStore } from '../store/tourStore'
import { decodeJWT } from './jwt'

const httpLink = createHttpLink({
  uri: `${import.meta.env.VITE_API_URL}/api/v1/graphql`,
})

// Subscriptions get their own WebSocket connection (graphql-ws protocol) —
// separate from the ad hoc notification socket in hooks/useWebSocket.ts.
// The token is re-read fresh on every (re)connect via `connectionParams`
// being a function, so a token refresh doesn't leave subscriptions stuck
// authenticated as the old one.
const wsLink = new GraphQLWsLink(
  createClient({
    url: `${(import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/^http/, 'ws')}/api/v1/graphql-ws`,
    connectionParams: () => {
      const token = useAuthStore.getState().accessToken
      return { authorization: token ? `Bearer ${token}` : '' }
    },
  }),
)

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query)
    return def.kind === 'OperationDefinition' && def.operation === 'subscription'
  },
  wsLink,
  httpLink,
)

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
let pendingRequests: (() => void)[] = []

function resolvePendingRequests() {
  pendingRequests.forEach((cb) => {
    cb()
  })
  pendingRequests = []
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
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
        new Promise<void>((resolve) => {
          pendingRequests.push(resolve)
        }),
      ).flatMap(() => forward(operation))
    }
    isRefreshing = true
    return fromPromise(
      refreshAccessToken()
        .then((newToken) => {
          if (newToken) {
            resolvePendingRequests()
            return newToken
          }
          pendingRequests = []
          useAuthStore.getState().clearAuth()
          window.location.href = '/login'
          return null
        })
        .finally(() => {
          isRefreshing = false
        }),
    ).flatMap((newToken) => {
      if (!newToken) return forward(operation)
      operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
        headers: { ...headers, authorization: `Bearer ${newToken}` },
      }))
      return forward(operation)
    })
  }
})

// Intercepts all mutations while an interactive tour is active — nothing is saved to the DB.
const tourLink = new ApolloLink((operation, forward) => {
  if (!useTourStore.getState().isActive) return forward(operation)
  const def = getMainDefinition(operation.query)
  if (def.kind !== 'OperationDefinition' || def.operation !== 'mutation') return forward(operation)
  return fromPromise(
    new Promise<{ data: Record<string, unknown> }>((resolve) => {
      setTimeout(() => {
        useToastStore.getState().addToast({
          message: '🎓 Tour mode — form submitted (not saved to database)',
          type: 'info',
        })
        // Proxy so any field access (e.g. res.data.createEmployee.id) returns ''
        // rather than throwing, preventing component navigation errors in tour mode.
        const mock = new Proxy({} as Record<string, Record<string, string>>, {
          get: (_t, key) => ({ id: '', __typename: String(key) }),
        })
        resolve({ data: mock })
      }, 400)
    }),
  )
})

export const apolloClient = new ApolloClient({
  link: from([tourLink, errorLink, authLink, splitLink]),
  cache: new InMemoryCache({
    typePolicies: {
      ProjectInvoice: {
        fields: {
          payments: { merge: false },
          lines: { merge: false },
        },
      },
      ProjectContract: {
        fields: {
          milestones: { merge: false },
          invoices: { merge: false },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: { errorPolicy: 'all' },
    query: { errorPolicy: 'all' },
  },
})
