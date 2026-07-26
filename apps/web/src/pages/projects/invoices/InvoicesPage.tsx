import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PROJECT_INVOICES_QUERY } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

interface ProjectInvoice {
  id: string
  invoiceNumber: string
  billingMethod: string
  grossTotal: number
  netPayable: number
  status: string
  invoiceDate: string
  dueDate: string
}

export default function InvoicesPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading } = useQuery(PROJECT_INVOICES_QUERY, { fetchPolicy: 'cache-and-network' })
  const invoices: ProjectInvoice[] = data?.projectInvoices ?? []

  const columns: Column<ProjectInvoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (inv) => (
        <button
          onClick={() => {
            navigate(`/projects/invoices/${inv.id}`)
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.accent,
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
        >
          {inv.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'billingMethod',
      header: 'Method',
      render: (inv) => <Badge variant="neutral">{inv.billingMethod}</Badge>,
    },
    {
      key: 'invoiceDate',
      header: 'Date',
      render: (inv) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{inv.invoiceDate}</span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (inv) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{inv.dueDate}</span>
      ),
    },
    {
      key: 'grossTotal',
      header: 'Gross',
      render: (inv) => <AmountDisplay amount={inv.grossTotal} currency="IQD" />,
    },
    {
      key: 'netPayable',
      header: 'Net Payable',
      render: (inv) => <AmountDisplay amount={inv.netPayable} currency="IQD" />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (inv) => (
        <Badge
          variant={
            inv.status === 'paid' ? 'success' : inv.status === 'draft' ? 'neutral' : 'warning'
          }
        >
          {inv.status}
        </Badge>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader title="Project Invoices" subtitle={`${invoices.length} invoices`} />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={invoices} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
