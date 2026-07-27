import React, { useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native'
import withObservables from '@nozbe/with-observables'
import { database } from '../db/database'
import type { LeaveRequest } from '../db/models'
import { syncEngine } from '../sync/SyncEngine'

const STATUS_COLOR: Record<string, string> = {
  pending: '#92400e',
  approved: '#065f46',
  rejected: '#dc2626',
  cancelled: '#6b7280',
}

function LeaveCard({ leave }: { leave: LeaveRequest }) {
  const color = STATUS_COLOR[leave.status] ?? '#6b7280'

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: color + '1a' }]}>
          <Text style={[styles.badgeText, { color }]}>{leave.status}</Text>
        </View>
        <Text style={styles.leaveType}>{leave.leaveTypeName}</Text>
      </View>

      <Text style={styles.dates}>
        {leave.startDate} → {leave.endDate}
      </Text>
      <Text style={styles.days}>
        {leave.daysRequested} day{leave.daysRequested !== 1 ? 's' : ''}
      </Text>

      {leave.reason ? (
        <Text style={styles.reason} numberOfLines={2}>
          {leave.reason}
        </Text>
      ) : null}

      {leave.reviewNotes ? (
        <View style={styles.reviewBox}>
          <Text style={styles.reviewLabel}>Review notes</Text>
          <Text style={styles.reviewNotes}>{leave.reviewNotes}</Text>
        </View>
      ) : null}
    </View>
  )
}

function LeaveScreenBase({ leaves }: { leaves: LeaveRequest[] }) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await syncEngine.syncAll()
    setIsRefreshing(false)
  }, [])

  const pending = leaves.filter((l) => l.status === 'pending')
  const history = leaves.filter((l) => l.status !== 'pending')

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={leaves}
      keyExtractor={(l) => l.id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        pending.length > 0 ? (
          <Text style={styles.sectionTitle}>Pending ({pending.length})</Text>
        ) : null
      }
      renderItem={({ item, index }) => (
        <>
          {item.status !== 'pending' && index === pending.length ? (
            <Text style={styles.sectionTitle}>History</Text>
          ) : null}
          <LeaveCard leave={item} />
        </>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No leave requests</Text>
          <Text style={styles.emptySub}>Pull to refresh</Text>
        </View>
      }
    />
  )
}

const enhance = withObservables([], () => ({
  leaves: database.get<LeaveRequest>('leave_requests').query().observe(),
}))

export const LeaveScreen = enhance(LeaveScreenBase)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  list: { padding: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  leaveType: { fontSize: 13, color: '#374151', fontWeight: '600' },
  dates: { fontSize: 15, fontWeight: '700', color: '#111827' },
  days: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  reason: { fontSize: 13, color: '#4b5563', marginTop: 8, fontStyle: 'italic' },
  reviewBox: {
    marginTop: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#d1d5db',
  },
  reviewLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 2, fontWeight: '600' },
  reviewNotes: { fontSize: 13, color: '#374151' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySub: { fontSize: 13, color: '#9ca3af', marginTop: 6 },
})
