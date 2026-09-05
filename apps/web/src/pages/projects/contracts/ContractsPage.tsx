import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PROJECT_CONTRACTS_QUERY } from '../../../graphql/projects'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

interface Contract {
  id: string
  projectId: string
  projectCode: string
  projectName: string
  contractNumber: string
  contractName: string
  clientName: string
  contractValue: number
  currencyCode: string
  status: string
  totalInvoiced: number
  outstanding: number
}

export default function ContractsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading } = useQuery(PROJECT_CONTRACTS_QUERY, { fetchPolicy: 'cache-and-network' })
  const contracts: Contract[] = data?.projectContracts ?? []

  const columns: Column<Contract>[] = [
    {
      key: 'contractNumber',
      header: 'Number',
      render: (c) => (
        <button
          onClick={() => {
            navigate(`/projects/contracts/${c.id}`)
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
          {c.contractNumber}
        </button>
      ),
    },
    {
      key: 'projectCode',
      header: 'Project',
      render: (c) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          {[c.projectCode, c.projectName].filter(Boolean).join(' — ')}
        </span>
      ),
    },
    {
      key: 'contractName',
      header: 'Name',
      render: (c) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {c.contractName}
        </span>
      ),
    },
    {
      key: 'clientName',
      header: 'Client',
      render: (c) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{c.clientName}</span>
      ),
    },
    {
      key: 'contractValue',
      header: 'Value',
      render: (c) => <AmountDisplay amount={c.contractValue} currency={c.currencyCode} />,
    },
    {
      key: 'totalInvoiced',
      header: 'Invoiced',
      render: (c) => <AmountDisplay amount={c.totalInvoiced} currency={c.currencyCode} />,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      render: (c) => <AmountDisplay amount={c.outstanding} currency={c.currencyCode} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge variant={c.status === 'active' ? 'success' : 'neutral'}>{c.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigate(`/projects/contracts/${c.id}`)
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title="Project Contracts"
        subtitle={`${contracts.length} contracts`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/projects/contracts/new')
            }}
          >
            New Contract
          </Button>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={contracts} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
