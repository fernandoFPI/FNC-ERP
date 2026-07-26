import React, { useEffect, useState } from 'react'
import { api } from '../../lib/axios'
import { Timeline } from './Timeline'
import type { TimelineEvent } from './Timeline'

interface AuditEntry {
  id: string
  action: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  user_email: string
  created_at: string
}

interface ActivityLogProps {
  recordId: string
  tableName: string
}

export function ActivityLog({ recordId, tableName }: ActivityLogProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!recordId || !tableName) return
    setLoading(true)
    api
      .get<AuditEntry[]>('/admin/audit', { params: { table_name: tableName, record_id: recordId } })
      .then((r) => {
        const entries = (r.data as unknown as AuditEntry[]) ?? []
        setEvents(
          entries.map((e) => ({
            id: e.id,
            title: e.action
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/^\w/, (c) => c.toUpperCase()),
            description: e.new_values
              ? Object.entries(e.new_values)
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${String(v ?? '')}`)
                  .join(' · ')
              : undefined,
            user: e.user_email,
            timestamp: e.created_at,
            variant:
              e.action.includes('CANCEL') || e.action.includes('REJECT')
                ? 'danger'
                : e.action.includes('APPROV') ||
                    e.action.includes('POST') ||
                    e.action.includes('COMPLET')
                  ? 'success'
                  : 'default',
          })),
        )
      })
      .catch(() => {
        setEvents([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [recordId, tableName])

  return <Timeline events={events} loading={loading} />
}
