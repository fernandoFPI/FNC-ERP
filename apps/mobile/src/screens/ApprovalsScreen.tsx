import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { Q } from '@nozbe/watermelondb'
import withObservables from '@nozbe/with-observables'
import { database } from '../db/database'
import type { PendingApproval } from '../db/models'
import { syncEngine } from '../sync/SyncEngine'

// ── Approval card ─────────────────────────────────────────────
interface ApprovalCardProps {
  approval: PendingApproval
  onAction: (approval: PendingApproval, action: 'approve' | 'reject', notes: string) => void
  isProcessing: boolean
}

function ApprovalCard({ approval, onAction, isProcessing }: ApprovalCardProps) {
  const [notes, setNotes] = useState('')
  const [expanded, setExpanded] = useState(false)

  const typeColor: Record<string, string> = {
    purchase_order: '#1e40af',
    overtime_request: '#92400e',
    leave_request: '#065f46',
  }
  const typeLabel: Record<string, string> = {
    purchase_order: 'Purchase Order',
    overtime_request: 'Overtime',
    leave_request: 'Leave Request',
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor[approval.approvalType] + '20' }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor[approval.approvalType] }]}>
            {typeLabel[approval.approvalType] ?? approval.approvalType}
          </Text>
        </View>
        {approval.amount != null && (
          <Text style={styles.amount}>
            {approval.amount.toLocaleString()} {approval.currency}
          </Text>
        )}
      </View>

      <Text style={styles.title}>{approval.title}</Text>
      {approval.subtitle && <Text style={styles.subtitle}>{approval.subtitle}</Text>}

      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.expandBtn}>
        <Text style={styles.expandBtnText}>{expanded ? '▲ Less' : '▼ Details'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.detailsBox}>
          <TextInput
            style={styles.notesInput}
            placeholder="Review notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholderTextColor="#9ca3af"
          />
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn, isProcessing && styles.disabled]}
          onPress={() => onAction(approval, 'reject', notes)}
          disabled={isProcessing}
        >
          <Text style={styles.rejectBtnText}>✗ Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.approveBtn, isProcessing && styles.disabled]}
          onPress={() => onAction(approval, 'approve', notes)}
          disabled={isProcessing}
        >
          <Text style={styles.approveBtnText}>✓ Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────
function ApprovalsScreenBase({ approvals }: { approvals: PendingApproval[] }) {
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleAction = useCallback(
    async (approval: PendingApproval, action: 'approve' | 'reject', notes: string) => {
      setProcessingId(approval.id)
      try {
        const actionType = `${action}_${approval.approvalType.replace('_request', '')}` as
          | 'approve_overtime'
          | 'reject_overtime'
          | 'approve_leave'
          | 'reject_leave'

        const payload: Record<string, unknown> = { review_notes: notes }

        if (approval.approvalType === 'overtime_request') {
          payload['overtime_request_id'] = approval.serverId
        } else if (approval.approvalType === 'leave_request') {
          payload['leave_request_id'] = approval.serverId
        } else {
          Alert.alert('Not supported', 'PO approvals require connectivity.')
          return
        }

        await syncEngine.queueAction(actionType, payload)

        // Optimistic update — mark as actioned locally
        await database.write(async () => {
          await approval.update((r) => {
            r.status = action === 'approve' ? 'approved' : 'rejected'
          })
        })

        // Trigger sync if online
        void syncEngine.syncAll()

        Alert.alert('Queued', `${action === 'approve' ? 'Approval' : 'Rejection'} queued. Will sync when connected.`)
      } finally {
        setProcessingId(null)
      }
    },
    [],
  )

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await syncEngine.syncAll()
    setIsRefreshing(false)
  }, [])

  const pendingApprovals = approvals.filter((a) => a.status === 'pending')

  return (
    <View style={styles.container}>
      <FlatList
        data={pendingApprovals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ApprovalCard
            approval={item}
            onAction={(a, action, notes) => void handleAction(a, action, notes)}
            isProcessing={processingId === item.id}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No pending approvals</Text>
            <Text style={styles.emptySubtitle}>Pull to refresh</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

// React to WatermelonDB observable changes
const enhance = withObservables([], () => ({
  approvals: database
    .get<PendingApproval>('pending_approvals')
    .query(Q.where('status', 'pending'))
    .observe(),
}))

export const ApprovalsScreen = enhance(ApprovalsScreenBase)

const BLUE = '#1a3c5e'
const GREEN = '#065f46'
const RED = '#dc2626'

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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '700', color: BLUE },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  expandBtn: { paddingVertical: 6 },
  expandBtnText: { fontSize: 12, color: '#9ca3af' },
  detailsBox: { marginVertical: 8 },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#111827',
    minHeight: 60,
  },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  rejectBtn: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  rejectBtnText: { color: RED, fontWeight: '700', fontSize: 14 },
  approveBtn: { backgroundColor: GREEN },
  approveBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.5 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySubtitle: { fontSize: 13, color: '#9ca3af', marginTop: 6 },
})
