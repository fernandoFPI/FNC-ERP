import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Q } from '@nozbe/watermelondb'
import { database } from '../db/database'
import type { Product } from '../db/models'
import { syncEngine } from '../sync/SyncEngine'

interface IssueLine {
  key: string
  product: Product
  qty: string
}

function ProductPicker({
  onSelect,
}: {
  onSelect: (product: Product) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])

  useEffect(() => {
    void (async () => {
      const q = search.trim()
      const items = (await database
        .get<Product>('products')
        .query(
          q
            ? Q.or(
                Q.where('name', Q.like(`%${Q.sanitizeLikeString(q)}%`)),
                Q.where('sku', Q.like(`%${Q.sanitizeLikeString(q)}%`)),
              )
            : Q.where('name', Q.notEq('')),
        )
        .fetch()) as Product[]
      setResults(items.slice(0, 20))
    })()
  }, [search])

  return (
    <View style={styles.picker}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search product name or SKU..."
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#9ca3af"
        autoFocus
      />
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        style={styles.pickerList}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.pickerRow} onPress={() => onSelect(item)}>
            <Text style={styles.pickerName}>{item.name}</Text>
            <Text style={styles.pickerMeta}>
              {item.sku} · {item.uom}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.pickerEmpty}>No products found</Text>
        }
      />
    </View>
  )
}

export function MaterialIssueScreen() {
  const { projectId, projectName } = useLocalSearchParams<{
    projectId: string
    projectName: string
  }>()
  const router = useRouter()

  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<IssueLine[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addProduct = useCallback((product: Product) => {
    setShowPicker(false)
    setLines((prev) => {
      if (prev.some((l) => l.product.id === product.id)) return prev
      return [...prev, { key: `${product.id}_${Date.now()}`, product, qty: '1' }]
    })
  }, [])

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }, [])

  const updateQty = useCallback((key: string, qty: string) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty } : l)))
  }, [])

  async function handleSubmit() {
    if (lines.length === 0) {
      Alert.alert('No lines', 'Add at least one product line.')
      return
    }

    const invalidLine = lines.find(
      (l) => isNaN(parseFloat(l.qty)) || parseFloat(l.qty) <= 0,
    )
    if (invalidLine) {
      Alert.alert('Invalid quantity', `Check quantity for: ${invalidLine.product.name}`)
      return
    }

    setIsSubmitting(true)
    try {
      await syncEngine.queueAction('create_material_issue', {
        project_id: projectId,
        issue_date: issueDate,
        notes: notes.trim() || null,
        lines: lines.map((l) => ({
          product_id: l.product.serverId,
          from_location_id: null,
          qty_issued: parseFloat(l.qty),
          uom: l.product.uom,
        })),
      })

      Alert.alert(
        'Queued',
        'Material issue queued. It will be submitted when connected.',
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (showPicker) {
    return (
      <View style={styles.container}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerHeaderTitle}>Select Product</Text>
          <TouchableOpacity onPress={() => setShowPicker(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ProductPicker onSelect={addProduct} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.projectBanner}>
          <Text style={styles.projectBannerLabel}>Project</Text>
          <Text style={styles.projectBannerName} numberOfLines={1}>
            {projectName ?? projectId}
          </Text>
        </View>

        {/* Date */}
        <View style={styles.field}>
          <Text style={styles.label}>Issue Date</Text>
          <TextInput
            style={styles.input}
            value={issueDate}
            onChangeText={setIssueDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Reason for issue, site reference..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Lines */}
        <Text style={styles.sectionTitle}>
          Products ({lines.length})
        </Text>

        {lines.map((line) => (
          <View key={line.key} style={styles.lineCard}>
            <View style={styles.lineTop}>
              <Text style={styles.lineName} numberOfLines={1}>
                {line.product.name}
              </Text>
              <TouchableOpacity onPress={() => removeLine(line.key)}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.lineMeta}>
              {line.product.sku} · {line.product.uom}
            </Text>
            <View style={styles.lineQtyRow}>
              <Text style={styles.qtyLabel}>Qty</Text>
              <TextInput
                style={styles.qtyInput}
                value={line.qty}
                onChangeText={(v) => updateQty(line.key, v)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={styles.uomText}>{line.product.uom}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.addLineBtn}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.addLineBtnText}>+ Add Product</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, (isSubmitting || lines.length === 0) && styles.disabled]}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting || lines.length === 0}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitBtnText}>Queue Material Issue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const BLUE = '#1a3c5e'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  projectBanner: {
    backgroundColor: BLUE,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  projectBannerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  projectBannerName: { fontSize: 16, fontWeight: '700', color: 'white' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  lineCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  lineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  lineName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  removeText: { color: '#dc2626', fontSize: 16, paddingLeft: 8 },
  lineMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2, marginBottom: 8 },
  lineQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyLabel: { fontSize: 13, color: '#6b7280' },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    width: 80,
    textAlign: 'center',
  },
  uomText: { fontSize: 13, color: '#6b7280' },
  addLineBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addLineBtnText: { fontSize: 14, color: BLUE, fontWeight: '600' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: 'white',
  },
  submitBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  // Product picker styles
  picker: { flex: 1 },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: 'white',
  },
  pickerHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cancelText: { fontSize: 14, color: '#dc2626' },
  searchInput: {
    margin: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: 'white',
  },
  pickerList: { flex: 1 },
  pickerRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: 'white',
  },
  pickerName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  pickerMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  pickerEmpty: { textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 14 },
})
