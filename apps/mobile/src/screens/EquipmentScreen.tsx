import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import withObservables from '@nozbe/with-observables'
import { database } from '../db/database'
import type { EquipmentAsset } from '../db/models'
import { syncEngine } from '../sync/SyncEngine'

const MAINTENANCE_COLOR: Record<string, string> = {
  ok:             '#065f46',
  due_soon:       '#92400e',
  overdue:        '#dc2626',
  in_maintenance: '#6b7280',
}

const STATUS_COLOR: Record<string, string> = {
  available:   '#065f46',
  rented:      '#1e40af',
  maintenance: '#6b7280',
  disposed:    '#dc2626',
}

function AssetCard({ asset }: { asset: EquipmentAsset }) {
  const router = useRouter()
  const mColor = MAINTENANCE_COLOR[asset.maintenanceStatus] ?? '#6b7280'
  const sColor = STATUS_COLOR[asset.status] ?? '#6b7280'

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: sColor + '1a' }]}>
          <Text style={[styles.badgeText, { color: sColor }]}>{asset.status}</Text>
        </View>
        <Text style={styles.assetNumber}>{asset.assetNumber}</Text>
      </View>

      <Text style={styles.assetName}>{asset.name}</Text>
      {asset.category ? <Text style={styles.category}>{asset.category}</Text> : null}

      {asset.projectName ? (
        <View style={styles.locationRow}>
          <Text style={styles.locationLabel}>Site</Text>
          <Text style={styles.locationValue}>{asset.projectName}</Text>
        </View>
      ) : null}

      {asset.currentLocation ? (
        <View style={styles.locationRow}>
          <Text style={styles.locationLabel}>Location</Text>
          <Text style={styles.locationValue}>{asset.currentLocation}</Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {asset.totalHoursOperated != null ? `${asset.totalHoursOperated.toFixed(1)} h` : '—'}
          </Text>
          <Text style={styles.statLabel}>Hours</Text>
        </View>
        <View style={[styles.stat, styles.statMiddle]}>
          <Text style={[styles.statValue, { color: mColor }]}>
            {asset.maintenanceStatus.replace('_', ' ')}
          </Text>
          <Text style={styles.statLabel}>Maintenance</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {asset.nextMaintenanceDueHours != null
              ? `${asset.nextMaintenanceDueHours.toFixed(0)} h`
              : asset.nextMaintenanceDueDate ?? '—'}
          </Text>
          <Text style={styles.statLabel}>Next due</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() =>
            router.push({ pathname: '/usage-log', params: { assetId: asset.serverId, assetName: asset.name } })
          }
        >
          <Text style={styles.actionBtnText}>Log Usage</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={() =>
            router.push({
              pathname: '/condition-report',
              params: {
                assetId: asset.serverId,
                assetName: asset.name,
                projectId: asset.projectId ?? '',
              },
            })
          }
        >
          <Text style={styles.actionBtnTextSecondary}>Report Condition</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function EquipmentScreenBase({ assets }: { assets: EquipmentAsset[] }) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await syncEngine.syncAll()
    setIsRefreshing(false)
  }, [])

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={assets}
      keyExtractor={(a) => a.id}
      renderItem={({ item }) => <AssetCard asset={item} />}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No equipment assigned</Text>
          <Text style={styles.emptySub}>Pull to refresh</Text>
        </View>
      }
    />
  )
}

const enhance = withObservables([], () => ({
  assets: database.get<EquipmentAsset>('equipment_assets').query().observe(),
}))

export const EquipmentScreen = enhance(EquipmentScreenBase)

const BLUE = '#1a3c5e'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  list: { padding: 12 },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  assetNumber: { fontSize: 12, color: '#6b7280', fontFamily: 'monospace' },
  assetName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  category: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  locationRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  locationLabel: { fontSize: 12, color: '#9ca3af', width: 60 },
  locationValue: { fontSize: 12, color: '#374151', flex: 1 },
  statsRow: { flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statMiddle: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f3f4f6' },
  statValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, backgroundColor: BLUE, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  actionBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  actionBtnSecondary: { backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db' },
  actionBtnTextSecondary: { color: BLUE, fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySub: { fontSize: 13, color: '#9ca3af', marginTop: 6 },
})
