import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { syncEngine } from '../sync/SyncEngine'

type Condition = 'good' | 'fair' | 'poor' | 'critical'
type CheckStatus = 'ok' | 'issue' | 'na'

interface CheckItem {
  item: string
  status: CheckStatus
}

const DEFAULT_CHECKLIST: CheckItem[] = [
  { item: 'Engine / motor', status: 'ok' },
  { item: 'Hydraulics / fluids', status: 'ok' },
  { item: 'Tyres / tracks', status: 'ok' },
  { item: 'Lights & signals', status: 'ok' },
  { item: 'Safety guards', status: 'ok' },
  { item: 'Controls / instruments', status: 'ok' },
  { item: 'Structural frame', status: 'ok' },
  { item: 'Attachments', status: 'ok' },
]

const CONDITION_COLOR: Record<Condition, string> = {
  good: '#065f46',
  fair: '#92400e',
  poor: '#d97706',
  critical: '#dc2626',
}

function CheckRow({
  item,
  onToggle,
}: {
  item: CheckItem
  onToggle: (status: CheckStatus) => void
}) {
  const cycle: CheckStatus[] = ['ok', 'issue', 'na']
  const next = cycle[(cycle.indexOf(item.status) + 1) % cycle.length]!
  const color = item.status === 'ok' ? '#065f46' : item.status === 'issue' ? '#dc2626' : '#9ca3af'
  const label = item.status === 'ok' ? '✓ OK' : item.status === 'issue' ? '✗ Issue' : '— N/A'

  return (
    <View style={checkStyles.row}>
      <Text style={checkStyles.itemName} numberOfLines={1}>
        {item.item}
      </Text>
      <TouchableOpacity
        style={[checkStyles.statusBtn, { borderColor: color }]}
        onPress={() => {
          onToggle(next)
        }}
      >
        <Text style={[checkStyles.statusText, { color }]}>{label}</Text>
      </TouchableOpacity>
    </View>
  )
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemName: { fontSize: 14, color: '#374151', flex: 1 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '600' },
})

export function ConditionReportScreen() {
  const { assetId, assetName, projectId } = useLocalSearchParams<{
    assetId: string
    assetName: string
    projectId: string
  }>()
  const router = useRouter()

  const [condition, setCondition] = useState<Condition>('good')
  const [checklist, setChecklist] = useState<CheckItem[]>(DEFAULT_CHECKLIST)
  const [issues, setIssues] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function toggleCheckItem(index: number, status: CheckStatus) {
    setChecklist((prev) => prev.map((item, i) => (i === index ? { ...item, status } : item)))
  }

  async function handleSubmit() {
    const hasIssues = checklist.some((c) => c.status === 'issue')
    if ((condition === 'poor' || condition === 'critical') && !issues.trim()) {
      Alert.alert(
        'Issues required',
        'Please describe the issues found for poor/critical condition.',
      )
      return
    }

    setIsSubmitting(true)
    try {
      let gpsLat: number | null = null
      let gpsLng: number | null = null
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null)
        if (pos) {
          gpsLat = pos.coords.latitude
          gpsLng = pos.coords.longitude
        }
      }

      await syncEngine.queueAction('submit_condition_report', {
        asset_id: assetId,
        project_id: projectId || null,
        overall_condition: condition,
        checklist,
        issues_found: issues.trim() || null,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        photo_file_ids: [],
        reported_via: 'mobile',
      })

      Alert.alert(
        'Report submitted',
        `Condition report for ${assetName ?? assetId} queued. Will sync when connected.`,
        [
          {
            text: 'OK',
            onPress: () => {
              router.back()
            },
          },
        ],
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const conditionOptions: Condition[] = ['good', 'fair', 'poor', 'critical']

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.assetBanner}>
          <Text style={styles.assetBannerLabel}>Equipment</Text>
          <Text style={styles.assetBannerName} numberOfLines={1}>
            {assetName ?? assetId}
          </Text>
        </View>

        {/* Overall condition */}
        <Text style={styles.sectionTitle}>Overall Condition</Text>
        <View style={styles.conditionRow}>
          {conditionOptions.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.conditionBtn,
                condition === c && {
                  backgroundColor: CONDITION_COLOR[c],
                  borderColor: CONDITION_COLOR[c],
                },
              ]}
              onPress={() => {
                setCondition(c)
              }}
            >
              <Text
                style={[styles.conditionBtnText, condition === c && styles.conditionBtnTextActive]}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Checklist */}
        <Text style={styles.sectionTitle}>Inspection Checklist</Text>
        <View style={styles.checklistCard}>
          {checklist.map((item, i) => (
            <CheckRow
              key={item.item}
              item={item}
              onToggle={(status) => {
                toggleCheckItem(i, status)
              }}
            />
          ))}
        </View>

        {/* Issues */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Issues Found
            {(condition === 'poor' || condition === 'critical') && (
              <Text style={styles.required}> *</Text>
            )}
          </Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={issues}
            onChangeText={setIssues}
            placeholder="Describe any defects, damage, or abnormal operation..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: CONDITION_COLOR[condition] },
            isSubmitting && styles.disabled,
          ]}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Report</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  content: { padding: 16, paddingBottom: 32 },
  assetBanner: { backgroundColor: '#1a3c5e', borderRadius: 10, padding: 14, marginBottom: 20 },
  assetBannerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  assetBannerName: { fontSize: 16, fontWeight: '700', color: 'white' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  conditionRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  conditionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  conditionBtnText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  conditionBtnTextActive: { color: 'white' },
  checklistCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#dc2626' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: 'white',
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: 'white' },
  submitBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
})
