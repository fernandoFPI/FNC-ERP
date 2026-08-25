import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNotificationStore } from '../store/notificationStore'
import { isTokenExpired } from '../lib/jwt'
import type { AppNotification } from '../store/notificationStore'

interface WSEvent {
  type: string
  payload?: unknown
}

let backoffMs = 1000
const MAX_BACKOFF = 30_000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks whether the current effect instance has been cleaned up.
  // Prevents React Strict Mode's double-invoke from triggering a reconnect
  // loop when the cleanup closes a still-connecting socket.
  const cancelledRef = useRef(false)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null)

  const token = useAuthStore((s) => s.accessToken)
  const addNotification = useNotificationStore((s) => s.addNotification)

  const connect = useCallback(() => {
    if (!token) return
    if (isTokenExpired(token)) return

    // VITE_API_URL is deliberately empty in production (apps/web/.env.production)
    // so axios can use relative same-origin paths — but WebSocket, unlike fetch,
    // rejects relative URLs outright ("Failed to construct 'WebSocket'"), so an
    // empty/unset env var must fall back to the page's own origin instead of a
    // literal string that only makes sense in local dev.
    const envApiUrl = import.meta.env.VITE_API_URL
    const base = envApiUrl
      ? envApiUrl.replace(/^http/, 'ws')
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    // new WebSocket() throws synchronously on a malformed URL — unlike the
    // event handlers below, nothing catches that on its own, so a bad URL
    // here would otherwise crash the whole app instead of just leaving
    // realtime notifications disconnected.
    let ws: WebSocket
    try {
      ws = new WebSocket(`${base}/api/v1/ws?token=${token}`)
    } catch {
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      if (cancelledRef.current) {
        ws.close()
        return
      }
      setIsConnected(true)
      backoffMs = 1000
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSEvent & Partial<AppNotification>

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }

        setLastEvent({ type: msg.type, payload: msg.payload })

        if (msg.type === 'notification' && msg.id) {
          addNotification({
            id: msg.id,
            type: msg.type,
            title: msg.title ?? '',
            body: msg.body,
            isRead: false,
            createdAt: msg.createdAt ?? new Date().toISOString(),
            data: msg.data,
          })
        }
      } catch {
        /* ignore malformed */
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Don't reconnect if this effect instance was cleaned up (e.g. Strict Mode teardown)
      if (token && !cancelledRef.current) {
        reconnectTimer.current = setTimeout(() => {
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF)
          connect()
        }, backoffMs)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [token, addNotification])

  useEffect(() => {
    if (!token) {
      wsRef.current?.close()
      wsRef.current = null
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      backoffMs = 1000
      return
    }

    cancelledRef.current = false
    connect()

    return () => {
      cancelledRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      // Only close OPEN sockets — closing a CONNECTING socket produces the
      // "WebSocket closed before connection established" console noise in dev.
      const ws = wsRef.current
      wsRef.current = null
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [token, connect])

  return { isConnected, lastEvent }
}
