import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { Q } from '@nozbe/watermelondb'
import { database } from '../db/database'
import type { OfflineQueueItem } from '../db/models'
import { syncEngine } from '../sync/SyncEngine'

export function SyncStatusBar() {
  const [isOnline, setIsOnline] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected)
    })

    const sub = database
      .get<OfflineQueueItem>('offline_queue')
      .query(Q.where('status', Q.oneOf(['pending', 'failed', 'submitting'])))
      .observe()
      .subscribe((items) => {
        setQueueCount(items.length)
      })

    const timer = setInterval(() => {
      setIsSyncing(syncEngine.syncing)
    }, 500)

    return () => {
      unsubNet()
      sub.unsubscribe()
      clearInterval(timer)
    }
  }, [])

  if (isOnline && queueCount === 0 && !isSyncing) return null

  const label = !isOnline
    ? `● Offline${queueCount > 0 ? ` — ${queueCount} action${queueCount !== 1 ? 's' : ''} queued` : ''}`
    : isSyncing
      ? '↻ Syncing...'
      : `↑ ${queueCount} action${queueCount !== 1 ? 's' : ''} pending sync`

  return (
    <View style={[styles.bar, !isOnline ? styles.offline : styles.pending]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  offline: { backgroundColor: '#92400e' },
  pending: { backgroundColor: '#1e40af' },
  text: { color: 'white', fontSize: 12, fontWeight: '600' },
})
