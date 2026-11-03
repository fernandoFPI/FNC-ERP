import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { useAuthStore } from '../../../store/authStore'
import type { AccessLevel } from '../../../hooks/usePermission'
import {
  INTERCO_TRANSACTIONS_QUERY,
  INTERCO_STOCK_TRANSFERS_QUERY,
  INTERCO_PRICING_SETTINGS_QUERY,
  INTERCO_PRICING_HISTORY_QUERY,
} from '../../../graphql/interco'
import IntercoTransactionsPage from '../transactions/IntercoTransactionsPage'
import IntercoStockTransfersPage from '../stock-transfers/IntercoStockTransfersPage'
import TransferPricingPage from '../pricing/TransferPricingPage'

const txnsMock = {
  request: {
    query: INTERCO_TRANSACTIONS_QUERY,
    variables: {
      fromCompanyId: undefined,
      toCompanyId: undefined,
      status: undefined,
      transactionType: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      limit: 20,
    },
  },
  result: { data: { intercoTransactions: { items: [], total: 0, page: 1, limit: 20 } } },
}

const stockMock = {
  request: {
    query: INTERCO_STOCK_TRANSFERS_QUERY,
    variables: {
      fromCompanyId: undefined,
      toCompanyId: undefined,
      status: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      limit: 20,
    },
  },
  result: { data: { intercoStockTransfers: { items: [], total: 0, page: 1, limit: 20 } } },
}

const pricingMock = {
  request: { query: INTERCO_PRICING_SETTINGS_QUERY, variables: { companyId: '' } },
  result: { data: { companyIntercoPricingSettings: null } },
}

const historyMock = {
  request: { query: INTERCO_PRICING_HISTORY_QUERY, variables: { companyId: '' } },
  result: { data: { intercoPricingConfigHistory: [] } },
}

function wrap(component: React.ReactNode, mocks: unknown[] = []) {
  return render(
    <MockedProvider mocks={mocks as never} addTypename={false}>
      <MemoryRouter>
        <ThemeProvider>{component}</ThemeProvider>
      </MemoryRouter>
    </MockedProvider>,
  )
}

describe('IntercoTransactionsPage', () => {
  it('renders page title', () => {
    wrap(<IntercoTransactionsPage />, [txnsMock])
    expect(
      screen.getByText(/Inter-?company.*Transaction|Transaction.*Inter-?company/i),
    ).toBeInTheDocument()
  })

  it('shows New Transaction button', () => {
    wrap(<IntercoTransactionsPage />, [txnsMock])
    expect(screen.getByRole('button', { name: /new.*transaction|create|add/i })).toBeInTheDocument()
  })

  it('shows skeleton loading initially', () => {
    const { container } = wrap(<IntercoTransactionsPage />, [txnsMock])
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })
})

describe('IntercoStockTransfersPage', () => {
  it('renders page title', () => {
    wrap(<IntercoStockTransfersPage />, [stockMock])
    expect(screen.getByText(/Stock Transfer/i)).toBeInTheDocument()
  })

  it('shows skeleton loading initially', () => {
    const { container } = wrap(<IntercoStockTransfersPage />, [stockMock])
    expect(container.querySelector('.skeleton')).toBeInTheDocument()
  })
})

// The server asks for 'interco.stock_transfers.edit' to create a transfer, so the button follows it.
describe('IntercoStockTransfersPage - New Transfer button', () => {
  const signIn = (role: string, permissions: Record<string, AccessLevel>) => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'u1@test.com',
        mfaEnabled: false,
        role,
        permissions,
        profileCompleted: true,
      },
    })
  }

  afterEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false })
  })

  it('is hidden from a user who may only view transfers', () => {
    signIn('user', { 'interco.stock_transfers.view': 'view' })
    wrap(<IntercoStockTransfersPage />, [stockMock])
    expect(screen.queryByRole('button', { name: /new transfer/i })).not.toBeInTheDocument()
  })

  it('is shown to a user with edit permission', () => {
    signIn('user', { 'interco.stock_transfers.edit': 'edit' })
    wrap(<IntercoStockTransfersPage />, [stockMock])
    expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
  })

  it('is shown to a system admin', () => {
    signIn('system_admin', {})
    wrap(<IntercoStockTransfersPage />, [stockMock])
    expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
  })
})

describe('TransferPricingPage', () => {
  it('renders page title', () => {
    wrap(<TransferPricingPage />, [pricingMock, historyMock])
    expect(screen.getByText('Transfer Pricing Settings')).toBeInTheDocument()
  })
})
