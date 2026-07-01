import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native'
import * as Location from 'expo-location'
import NetInfo from '@react-native-community/netinfo'
import { Q } from '@nozbe/watermelondb'
import { database } from '../db/database'
import type { AttendanceLog, WorkLocation } from '../db/models'
import { syncEngine, haversineMeters } from '../sync/SyncEngine'

type PunchType = 'in' | 'out'

interface PunchRecord {
  id: string
  punchType: string
  punchedAt: number
  isValid: boolean
  rejectionReason: string | null
  isOfflineSubmission: boolean
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

export function AttendanceScreen() {
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [workLocation, setWorkLocation] = useState<WorkLocation | null>(null)
  const [todayPunches, setTodayPunches] = useState<PunchRecord[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [distanceFromZone, setDistanceFromZone] = useState<number | null>(null)

  useEffect(() => {
    void loadData()
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected)
    })
    return unsub
  }, [])

  const loadData = useCallback(async () => {
    await Promise.all([loadWorkLocation(), loadTodayPunches()])
  }, [])

  async function loadWorkLocation() {
    const locations = (await database
      .get<WorkLocation>('work_locations')
      .query()
      .fetch()) as WorkLocation[]
    if (locations[0]) setWorkLocation(locations[0])
  }

  async function loadTodayPunches() {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const punches = (await database
      .get<AttendanceLog>('attendance_logs')
      .query(Q.where('punched_at', Q.gte(startOfDay.getTime())))
      .fetch()) as AttendanceLog[]

    setTodayPunches(
      punches
        .sort((a, b) => a.punchedAt - b.punchedAt)
        .map((p) => ({
          id: p.id,
          punchType: p.punchType,
          punchedAt: p.punchedAt,
          isValid: p.isValid,
          rejectionReason: p.rejectionReason,
          isOfflineSubmission: p.isOfflineSubmission,
        })),
    )
  }

  async function captureLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location permission is required for attendance.')
      return null
    }

    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5_000,
      })

      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 100,
      }
      setLocation(loc)

      if (workLocation?.geoLat != null && workLocation?.geoLng != null) {
        const dist = haversineMeters(loc.lat, loc.lng, workLocation.geoLat, workLocation.geoLng)
        setDistanceFromZone(Math.round(dist))
      }

      return loc
    } catch {
      Alert.alert('Location error', 'Could not get GPS location. Try again.')
      return null
    }
  }

  const lastPunch = todayPunches[todayPunches.length - 1]
  const isClockedIn = lastPunch?.punchType === 'in'
  const nextAction: PunchType = isClockedIn ? 'out' : 'in'

  async function handlePunch() {
    setIsSubmitting(true)
    try {
      const loc = await captureLocation()

      // Store as offline queue item — SyncEngine will submit when online
      // This ensures punch always works regardless of connectivity
      await syncEngine.queueAction(nextAction === 'in' ? 'punch_in' : 'punch_out', {
        punch_type: nextAction,
        gps_lat: loc?.lat ?? null,
        gps_lng: loc?.lng ?? null,
        gps_accuracy_meters: loc?.accuracy ?? null,
        work_location_id: workLocation?.serverId ?? null,
      })

      // Add optimistic local record for immediate UI feedback
      await database.write(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await database.get('attendance_logs').create((r: any) => {
          r['server_id'] = `pending_${Date.now()}`
          r['punch_type'] = nextAction
          r['gps_lat'] = loc?.lat ?? null
          r['gps_lng'] = loc?.lng ?? null
          r['is_valid'] = true
          r['punched_at'] = Date.now()
          r['work_location_id'] = workLocation?.serverId ?? null
          r['is_offline_submission'] = true
        })
      })

      await loadTodayPunches()

      // If online, trigger sync immediately
      if (isOnline) void syncEngine.syncAll()

    } finally {
      setIsSubmitting(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    if (isOnline) await syncEngine.syncAll()
    await loadData()
    setIsRefreshing(false)
  }, [isOnline])

  const isInZone =
    workLocation?.geoRadiusMeters != null &&
    distanceFromZone != null &&
    distanceFromZone <= workLocation.geoRadiusMeters

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Connectivity banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            ● Offline — punches will sync when connected
          </Text>
        </View>
      )}

      {/* Work zone status */}
      {workLocation && (
        <View style={styles.zoneCard}>
          <Text style={styles.zoneName}>{workLocation.name}</Text>
          {distanceFromZone != null && (
            <Text style={[styles.zoneDistance, isInZone ? styles.inZone : styles.outZone]}>
              {isInZone
                ? `✓ In zone (${distanceFromZone}m away)`
                : `⚠ Outside zone (${distanceFromZone}m — min ${workLocation.geoRadiusMeters ?? 0}m required)`}
            </Text>
          )}
          {distanceFromZone == null && (
            <Text style={styles.zoneHint}>Tap Punch to check your location</Text>
          )}
        </View>
      )}

      {/* Punch button */}
      <TouchableOpacity
        style={[
          styles.punchButton,
          nextAction === 'in' ? styles.punchIn : styles.punchOut,
          isSubmitting && styles.disabled,
        ]}
        onPress={() => void handlePunch()}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="white" size="large" />
        ) : (
          <>
            <Text style={styles.punchButtonLabel}>
              {nextAction === 'in' ? '→ Punch In' : '← Punch Out'}
            </Text>
            <Text style={styles.punchButtonSub}>
              {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Today's punches */}
      <Text style={styles.sectionTitle}>Today's Attendance</Text>

      {todayPunches.length === 0 ? (
        <Text style={styles.emptyText}>No punches recorded today</Text>
      ) : (
        todayPunches.map((punch) => (
          <View key={punch.id} style={styles.punchRow}>
            <View style={[styles.punchDot, punch.punchType === 'in' ? styles.dotIn : styles.dotOut]} />
            <View style={styles.punchInfo}>
              <Text style={styles.punchTime}>{formatTime(punch.punchedAt)}</Text>
              <Text style={styles.punchLabel}>
                {punch.punchType === 'in' ? 'Punched In' : 'Punched Out'}
                {punch.isOfflineSubmission ? ' (offline)' : ''}
              </Text>
              {!punch.isValid && punch.rejectionReason && (
                <Text style={styles.rejectionReason}>{punch.rejectionReason}</Text>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const BLUE = '#1a3c5e'
const GREEN = '#065f46'
const RED = '#dc2626'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  offlineBanner: {
    backgroundColor: '#92400e',
    padding: 10,
    alignItems: 'center',
  },
  offlineBannerText: { color: 'white', fontSize: 13, fontWeight: '600' },
  zoneCard: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  zoneName: { fontSize: 15, fontWeight: '700', color: BLUE, marginBottom: 4 },
  zoneDistance: { fontSize: 13 },
  inZone: { color: GREEN },
  outZone: { color: RED },
  zoneHint: { fontSize: 12, color: '#9ca3af' },
  punchButton: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  punchIn: { backgroundColor: GREEN },
  punchOut: { backgroundColor: RED },
  disabled: { opacity: 0.6 },
  punchButtonLabel: { color: 'white', fontSize: 22, fontWeight: '700' },
  punchButtonSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6b7280', marginHorizontal: 16, marginBottom: 8 },
  emptyText: { color: '#9ca3af', textAlign: 'center', marginTop: 24, fontSize: 14 },
  punchRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  punchDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  dotIn: { backgroundColor: GREEN },
  dotOut: { backgroundColor: RED },
  punchInfo: { flex: 1 },
  punchTime: { fontSize: 16, fontWeight: '600', color: '#111827' },
  punchLabel: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  rejectionReason: { fontSize: 12, color: RED, marginTop: 2 },
})
