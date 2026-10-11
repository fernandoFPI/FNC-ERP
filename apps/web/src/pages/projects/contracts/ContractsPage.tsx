import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
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
import type { ProjectContractsQuery, ProjectContractsQueryVariables } from '../../../graphql/generated'

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
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading } = useQuery<ProjectContractsQuery, ProjectContractsQueryVariables>(PROJECT_CONTRACTS_QUERY, { fetchPolicy: 'cache-and-network' })
  const contracts: Contract[] = data?.projectContracts ?? []

  const columns: Column<Contract>[] = [
    {
      key: 'contractNumber',
      header: t('proj.contracts.number'),
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
      header: t('proj.contracts.project'),
      render: (c) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
          {[c.projectCode, c.projectName].filter(Boolean).join(' — ')}
        </span>
      ),
    },
    {
      key: 'contractName',
      header: t('proj.contracts.name'),
      render: (c) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {c.contractName}
        </span>
      ),
    },
    {
      key: 'clientName',
      header: t('proj.contracts.client'),
      render: (c) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{c.clientName}</span>
      ),
    },
    {
      key: 'contractValue',
      header: t('proj.contracts.value'),
      render: (c) => <AmountDisplay amount={c.contractValue} currency={c.currencyCode} />,
    },
    {
      key: 'totalInvoiced',
      header: t('proj.contracts.invoiced'),
      render: (c) => <AmountDisplay amount={c.totalInvoiced} currency={c.currencyCode} />,
    },
    {
      key: 'outstanding',
      header: t('proj.contracts.outstanding'),
      render: (c) => <AmountDisplay amount={c.outstanding} currency={c.currencyCode} />,
    },
    {
      key: 'status',
      header: t('proj.contracts.status'),
      render: (c) => (
        <Badge variant={c.status === 'active' ? 'success' : 'neutral'}>{enumLabel(c.status)}</Badge>
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
          {t('proj.contracts.view')}
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title={t('proj.contracts.projectContracts')}
        subtitle={`${contracts.length} contracts`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/projects/contracts/new')
            }}
          >
            {t('proj.contracts.newContract')}
          </Button>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={contracts} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
