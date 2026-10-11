import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { AUDIT_LOG_QUERY } from '../../../graphql/admin'

interface AuditItem {
  id: string
  createdAt: string
  userEmail: string
  companyName: string
  action: string
  tableName: string
  recordId: string
  ipAddress: string
  oldValues: string | null
  newValues: string | null
}

interface AuditData {
  auditLog: {
    items: AuditItem[]
    total: number
    page: number
    limit: number
  }
}

function actionVariant(
  action: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    create: 'success',
    update: 'info',
    delete: 'danger',
    login: 'accent',
    logout: 'neutral',
  }
  return m[action.toLowerCase()] ?? 'neutral'
}

export default function AuditLogPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const [fromDate, setFromDate] = useState(sevenDaysAgo)
  const [toDate, setToDate] = useState(today)
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page] = useState(1)

  const { data, loading, refetch } = useQuery<AuditData>(AUDIT_LOG_QUERY, {
    variables: {
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      action: actionFilter || undefined,
      tableName: tableFilter || undefined,
      page,
      limit: 100,
    },
  })

  const items = (data?.auditLog.items ?? []).filter(
    (r) =>
      !search ||
      r.userEmail.toLowerCase().includes(search.toLowerCase()) ||
      r.tableName.toLowerCase().includes(search.toLowerCase()) ||
      r.recordId.includes(search),
  )

  const columns: Column<AuditItem>[] = [
    {
      key: 'userEmail',
      header: t('admin.audit.user'),
      mobilePrimary: true,
      render: (item) => (
        <span style={{ color: theme.textSecondary, fontSize: '12px' }}>{item.userEmail}</span>
      ),
    },
    {
      key: 'createdAt',
      header: t('admin.audit.time'),
      mobileSecondary: true,
      render: (item) => (
        <span style={{ color: theme.textMuted, fontSize: '11px', whiteSpace: 'nowrap' }}>
          {new Date(item.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'action',
      header: t('admin.audit.action'),
      mobilePriority: 1,
      render: (item) => (
        <Badge variant={actionVariant(item.action)} size="sm">
          {item.action}
        </Badge>
      ),
    },
    {
      key: 'tableName',
      header: t('admin.audit.table'),
      mobilePriority: 2,
      render: (item) => (
        <span
          style={{
            color: theme.textSecondary,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
          }}
        >
          {item.tableName}
        </span>
      ),
    },
    {
      key: 'recordId',
      header: t('admin.audit.recordId'),
      mobilePriority: 3,
      render: (item) => (
        <span
          style={{
            color: theme.textMuted,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
          }}
        >
          {item.recordId}
        </span>
      ),
    },
    {
      key: 'companyName',
      header: t('admin.audit.company'),
      mobilePriority: 4,
      render: (item) => <span style={{ color: theme.textSecondary }}>{item.companyName}</span>,
    },
    {
      key: 'ipAddress',
      header: 'IP',
      mobilePriority: 5,
      render: (item) => (
        <span
          style={{
            color: theme.textMuted,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
          }}
        >
          {item.ipAddress === '::1' || item.ipAddress === '127.0.0.1'
            ? 'localhost'
            : (item.ipAddress ?? '—')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileAction: true,
      render: (item) =>
        (item.oldValues ?? item.newValues) && (
          <button
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: theme.accent,
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
            onClick={(e) => {
              e.stopPropagation()
              setExpandedId(expandedId === item.id ? null : item.id)
            }}
          >
            {expandedId === item.id ? t('admin.audit.hide') : t('admin.audit.diff')}
          </button>
        ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('admin.audit.auditLog')}
        subtitle={`${data?.auditLog.total ?? 0} records`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('admin.audit.refresh')}
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '12px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: t('admin.audit.searchEmailTableOrRecordId'),
          }}
          filters={[
            {
              key: 'action',
              label: t('admin.audit.action'),
              value: actionFilter,
              onChange: setActionFilter,
              options: [
                { value: 'create', label: t('admin.audit.create') },
                { value: 'update', label: t('admin.audit.update') },
                { value: 'delete', label: t('admin.audit.delete') },
                { value: 'login', label: t('admin.audit.login') },
                { value: 'logout', label: t('admin.audit.logout') },
                { value: 'AUTO_STORE_PRICING', label: t('admin.audit.storePricingAutoFill') },
                { value: 'CATALOG_NEW_PRODUCT_FROM_PO', label: t('admin.audit.catalogNewProduct') },
                { value: 'CATALOG_LINK_EXISTING_PRODUCT_FROM_PO', label: t('admin.audit.catalogLinkedExisting') },
              ],
            },
          ]}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onRefresh={() => {
            void refetch()
          }}
          resultCount={items.length}
          onExport={() => undefined}
        />
      </Card>

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : items.length ? (
          <Table
            columns={columns}
            data={items}
            rowKey="id"
            renderExpanded={(item) =>
              expandedId === item.id ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {item.oldValues && (
                    <div>
                      <p
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.danger,
                          marginBottom: '4px',
                        }}
                      >
                        {t('admin.audit.before')}
                      </p>
                      <pre
                        style={{
                          fontSize: '11px',
                          color: theme.textSecondary,
                          background: theme.bgSurface,
                          padding: '8px',
                          borderRadius: '6px',
                          overflow: 'auto',
                          maxHeight: '150px',
                          margin: 0,
                        }}
                      >
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(item.oldValues), null, 2)
                          } catch {
                            return item.oldValues
                          }
                        })()}
                      </pre>
                    </div>
                  )}
                  {item.newValues && (
                    <div>
                      <p
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: theme.success,
                          marginBottom: '4px',
                        }}
                      >
                        {t('admin.audit.after')}
                      </p>
                      <pre
                        style={{
                          fontSize: '11px',
                          color: theme.textSecondary,
                          background: theme.bgSurface,
                          padding: '8px',
                          borderRadius: '6px',
                          overflow: 'auto',
                          maxHeight: '150px',
                          margin: 0,
                        }}
                      >
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(item.newValues), null, 2)
                          } catch {
                            return item.newValues
                          }
                        })()}
                      </pre>
                    </div>
                  )}
                </div>
              ) : null
            }
          />
        ) : (
          <EmptyState title={t('admin.audit.noAuditRecords')} message={t('admin.audit.adjustFiltersToSearchTheAudit')} />
        )}
      </Card>
    </div>
  )
}
