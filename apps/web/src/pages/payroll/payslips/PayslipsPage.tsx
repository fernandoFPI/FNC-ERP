import { useTranslation } from 'react-i18next'
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
import type { MyPayslipsQuery, MyPayslipsQueryVariables } from '../../../graphql/generated'

interface PayslipLine {
  id: string
  employee_name?: string | null
  gross_salary?: string
  net_salary?: string
  currency_code?: string | null
}

export default function PayslipsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, loading } = useQuery<MyPayslipsQuery, MyPayslipsQueryVariables>(MY_PAYSLIPS_QUERY, { fetchPolicy: 'cache-and-network' })
  const lines: PayslipLine[] = (data?.myPayslips ?? []).filter((x): x is NonNullable<typeof x> => x !== null)

  const columns: Column<PayslipLine>[] = [
    {
      key: 'employee_name',
      header: t('payroll.payslips.name'),
      render: (l) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.employee_name ?? '—'}</span>
      ),
    },
    {
      key: 'gross_salary',
      header: t('payroll.payslips.gross'),
      render: (l) =>
        l.gross_salary ? (
          <AmountDisplay amount={parseFloat(l.gross_salary)} currency={l.currency_code ?? t('payroll.payslips.iqd')} />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'net_salary',
      header: t('payroll.payslips.net'),
      render: (l) =>
        l.net_salary ? (
          <AmountDisplay
            amount={parseFloat(l.net_salary)}
            currency={l.currency_code ?? t('payroll.payslips.iqd')}
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
          {t('payroll.payslips.view')}
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title={t('payroll.payslips.myPayslips')} subtitle={user?.email ?? ''} />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={lines} loading={loading} rowKey="id" />
      </Card>

      <Modal
        open={!!selectedId}
        onClose={() => {
          setSelectedId(null)
        }}
        title={t('payroll.payslips.payslip')}
        size="lg"
      >
        {selectedId && <PayslipViewer payrollLineId={selectedId} employeeId="" />}
      </Modal>
    </div>
  )
}
