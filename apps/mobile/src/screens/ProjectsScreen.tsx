import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
} from 'react-native'
import withObservables from '@nozbe/with-observables'
import { useRouter } from 'expo-router'
import { database } from '../db/database'
import type { Project } from '../db/models'
import { syncEngine } from '../sync/SyncEngine'

const STATUS_COLOR: Record<string, string> = {
  active: '#065f46',
  on_hold: '#92400e',
  submitted: '#1e40af',
  completed: '#6b7280',
}

interface StageRowProps {
  name: string
  pct: number
}

function StageRow({ name, pct }: StageRowProps) {
  return (
    <View style={styles.stageRow}>
      <Text style={styles.stageName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.stageBarBg}>
        <View style={[styles.stageBarFill, { width: `${Math.min(pct, 100)}%` }]} />
      </View>
      <Text style={styles.stagePct}>{pct}%</Text>
    </View>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const stages = project.stages
  const color = STATUS_COLOR[project.status] ?? '#6b7280'

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: color + '1a' }]}>
          <Text style={[styles.badgeText, { color }]}>{project.status.replace('_', ' ')}</Text>
        </View>
        <Text style={styles.code}>{project.code}</Text>
      </View>

      <Text style={styles.projectName}>{project.name}</Text>
      {project.clientName ? <Text style={styles.client}>{project.clientName}</Text> : null}

      <View style={styles.budgetRow}>
        <Text style={styles.budgetLabel}>Budget</Text>
        <Text style={styles.budgetValue}>
          {project.budgetCurrency} {project.budgetAmount.toLocaleString()}
        </Text>
      </View>

      {stages.length > 0 && (
        <>
          <TouchableOpacity
            onPress={() => {
              setExpanded((e) => !e)
            }}
            style={styles.stagesToggle}
          >
            <Text style={styles.stagesToggleText}>
              {expanded ? '▲' : '▼'} {stages.length} Stage{stages.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>

          {expanded && (
            <View style={styles.stagesList}>
              {stages.map((s) => (
                <StageRow key={s.id} name={s.name} pct={s.completion_pct} />
              ))}
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={styles.issueBtn}
        onPress={() => {
          router.push({
            pathname: '/material-issue',
            params: { projectId: project.serverId, projectName: project.name },
          })
        }}
      >
        <Text style={styles.issueBtnText}>+ Material Issue</Text>
      </TouchableOpacity>
    </View>
  )
}

function ProjectsScreenBase({ projects }: { projects: Project[] }) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await syncEngine.syncAll()
    setIsRefreshing(false)
  }, [])

  return (
    <FlatList
      style={styles.container}
      data={projects}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProjectCard project={item} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No projects assigned</Text>
          <Text style={styles.emptySub}>Pull to refresh</Text>
        </View>
      }
    />
  )
}

const enhance = withObservables([], () => ({
  projects: database.get<Project>('projects').query().observe(),
}))

export const ProjectsScreen = enhance(ProjectsScreenBase)

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
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  code: { fontSize: 12, color: '#6b7280', fontFamily: 'monospace' },
  projectName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  client: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  budgetLabel: { fontSize: 12, color: '#9ca3af' },
  budgetValue: { fontSize: 13, fontWeight: '600', color: BLUE },
  stagesToggle: { marginTop: 12, paddingVertical: 4 },
  stagesToggleText: { fontSize: 12, color: '#6b7280' },
  stagesList: { marginTop: 8, gap: 6 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageName: { fontSize: 12, color: '#374151', flex: 1 },
  stageBarBg: {
    flex: 2,
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  stageBarFill: { height: '100%', backgroundColor: BLUE, borderRadius: 3 },
  stagePct: { fontSize: 11, color: '#6b7280', width: 32, textAlign: 'right' },
  issueBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  issueBtnText: { fontSize: 13, color: BLUE, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySub: { fontSize: 13, color: '#9ca3af', marginTop: 6 },
})
