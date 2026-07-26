import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { MY_PAYSLIPS_QUERY } from '../../../graphql/payroll'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { PayslipViewer } from '../../../components/ui/PayslipViewer'
import { Modal } from '../../../components/ui/Modal'
import { useAuthStore } from '../../../store/authStore'

interface PayslipLine {
  id: string
  employee_name?: string
  gross_salary?: string
  net_salary?: string
  currency_code?: string
}

export default function PayslipsPage() {
  const { theme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, loading } = useQuery(MY_PAYSLIPS_QUERY, { fetchPolicy: 'cache-and-network' })
  const lines: PayslipLine[] = data?.myPayslips ?? []

  const columns: Column<PayslipLine>[] = [
    {
      key: 'employee_name',
      header: 'Name',
      render: (l) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.employee_name ?? '—'}</span>
      ),
    },
    {
      key: 'gross_salary',
      header: 'Gross',
      render: (l) =>
        l.gross_salary ? (
          <AmountDisplay amount={parseFloat(l.gross_salary)} currency={l.currency_code ?? 'IQD'} />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'net_salary',
      header: 'Net',
      render: (l) =>
        l.net_salary ? (
          <AmountDisplay
            amount={parseFloat(l.net_salary)}
            currency={l.currency_code ?? 'IQD'}
            colored
          />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'id',
      header: '',
      render: (l) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedId(l.id)
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title="My Payslips" subtitle={user?.email ?? ''} />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={lines} loading={loading} rowKey="id" />
      </Card>

      <Modal
        open={!!selectedId}
        onClose={() => {
          setSelectedId(null)
        }}
        title="Payslip"
        size="lg"
      >
        {selectedId && <PayslipViewer payrollLineId={selectedId} employeeId="" />}
      </Modal>
    </div>
  )
}
