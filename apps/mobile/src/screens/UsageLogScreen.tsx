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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { syncEngine } from '../sync/SyncEngine'

export function UsageLogScreen() {
  const { assetId, assetName } = useLocalSearchParams<{ assetId: string; assetName: string }>()
  const router = useRouter()

  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [hoursOperated, setHoursOperated] = useState('')
  const [fuelLiters, setFuelLiters] = useState('')
  const [engineHours, setEngineHours] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit() {
    const hours = parseFloat(hoursOperated)
    if (isNaN(hours) || hours < 0 || hours > 24) {
      Alert.alert('Invalid hours', 'Hours operated must be between 0 and 24.')
      return
    }

    setIsSubmitting(true)
    try {
      await syncEngine.queueAction('submit_usage_log', {
        asset_id: assetId,
        log_date: logDate,
        hours_operated: hours,
        fuel_consumed_liters: fuelLiters ? parseFloat(fuelLiters) : null,
        engine_hours: engineHours ? parseFloat(engineHours) : null,
        notes: notes.trim() || null,
        recorded_via: 'mobile',
      })

      Alert.alert(
        'Queued',
        `Usage log for ${assetName ?? assetId} queued. Will sync when connected.`,
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } finally {
      setIsSubmitting(false)
    }
  }

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

        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={logDate}
            onChangeText={setLogDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Hours Operated <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={hoursOperated}
            onChangeText={setHoursOperated}
            placeholder="0.0"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Hours the equipment was running today (max 24)</Text>
        </View>

        <View style={styles.row}>
          <View style={[styles.field, styles.halfField]}>
            <Text style={styles.label}>Fuel (L)</Text>
            <TextInput
              style={styles.input}
              value={fuelLiters}
              onChangeText={setFuelLiters}
              placeholder="0.0"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.field, styles.halfField]}>
            <Text style={styles.label}>Engine Hours</Text>
            <TextInput
              style={styles.input}
              value={engineHours}
              onChangeText={setEngineHours}
              placeholder="Meter reading"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any issues or observations..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, (isSubmitting || !hoursOperated) && styles.disabled]}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting || !hoursOperated}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Usage Log</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const BLUE = '#1a3c5e'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  content: { padding: 16, paddingBottom: 32 },
  assetBanner: { backgroundColor: BLUE, borderRadius: 10, padding: 14, marginBottom: 20 },
  assetBannerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  assetBannerName: { fontSize: 16, fontWeight: '700', color: 'white' },
  field: { marginBottom: 16 },
  halfField: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#dc2626' },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: 'white',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: 'white' },
  submitBtn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
})
