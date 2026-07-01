import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { INTERCO_TRANSACTIONS_QUERY, INTERCO_STOCK_TRANSFERS_QUERY, INTERCO_PRICING_SETTINGS_QUERY, INTERCO_PRICING_HISTORY_QUERY } from '../../../graphql/interco'
import IntercoTransactionsPage from '../transactions/IntercoTransactionsPage'
import IntercoStockTransfersPage from '../stock-transfers/IntercoStockTransfersPage'
import TransferPricingPage from '../pricing/TransferPricingPage'

const txnsMock = {
  request: { query: INTERCO_TRANSACTIONS_QUERY, variables: { fromCompanyId: undefined, toCompanyId: undefined, status: undefined, transactionType: undefined, fromDate: undefined, toDate: undefined, page: 1, limit: 20 } },
  result: { data: { intercoTransactions: { items: [], total: 0, page: 1, limit: 20 } } },
}

const stockMock = {
  request: { query: INTERCO_STOCK_TRANSFERS_QUERY, variables: { fromCompanyId: undefined, toCompanyId: undefined, status: undefined, fromDate: undefined, toDate: undefined, page: 1, limit: 20 } },
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
        <ThemeProvider>
          {component}
        </ThemeProvider>
      </MemoryRouter>
    </MockedProvider>
  )
}

describe('IntercoTransactionsPage', () => {
  it('renders page title', () => {
    wrap(<IntercoTransactionsPage />, [txnsMock])
    expect(screen.getByText(/Inter-?company.*Transaction|Transaction.*Inter-?company/i)).toBeInTheDocument()
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

describe('TransferPricingPage', () => {
  it('renders page title', () => {
    wrap(<TransferPricingPage />, [pricingMock, historyMock])
    expect(screen.getByText('Transfer Pricing Settings')).toBeInTheDocument()
  })
})
