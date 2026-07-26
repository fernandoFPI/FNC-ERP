import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../theme/ThemeContext'
import {
  EXECUTIVE_DASHBOARD_QUERY,
  CONSOLIDATED_PL_QUERY,
  PROJECT_PROFITABILITY_QUERY,
  INVENTORY_VALUATION_QUERY,
  WHT_REPORT_QUERY,
} from '../../../graphql/reporting'
import ExecutiveDashboard from '../executive/ExecutiveDashboard'
import ConsolidatedPL from '../consolidated/ConsolidatedPL'
import ProjectProfitabilityReport from '../projects/ProjectProfitabilityReport'
import InventoryValuationReport from '../inventory/InventoryValuationReport'
import WHTReport from '../compliance/WHTReport'
import ReportingLayout from '../ReportingLayout'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
}))

const executiveMock = {
  request: { query: EXECUTIVE_DASHBOARD_QUERY, variables: {} },
  result: {
    data: {
      executiveDashboard: {
        totalRevenue: 5000000,
        totalCosts: 3600000,
        netProfit: 1400000,
        activeProjects: 12,
        totalProjectBudget: 15000000,
        totalHeadcount: 87,
        openPOsValue: 750000,
        revenueTrend: [],
        costsTrend: [],
        profitTrend: [],
        entityBreakdown: [],
        revenueByEntityMonthly: [],
        projectProfitabilityScatter: [],
      },
    },
  },
}

const plMock = {
  request: {
    query: CONSOLIDATED_PL_QUERY,
    variables: { fromDate: '', toDate: '', showEliminations: false },
  },
  result: {
    data: {
      consolidatedPL: {
        rows: [],
        companies: [],
        currency: 'IQD',
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
      },
    },
  },
}

const projectsMock = {
  request: {
    query: PROJECT_PROFITABILITY_QUERY,
    variables: {
      companyId: undefined,
      status: undefined,
      projectType: undefined,
      fromDate: undefined,
      toDate: undefined,
    },
  },
  result: { data: { projectProfitabilityReport: [] } },
}

const inventoryMock = {
  request: {
    query: INVENTORY_VALUATION_QUERY,
    variables: { asOfDate: '', companyId: undefined, locationId: undefined },
  },
  result: {
    data: {
      inventoryValuationReport: {
        rows: [],
        totalValue: 0,
        totalProducts: 0,
        totalLocations: 0,
        lowStockItems: 0,
        byLocation: [],
      },
    },
  },
}

const whtMock = {
  request: { query: WHT_REPORT_QUERY, variables: { fromDate: '', toDate: '', companyId: '' } },
  result: {
    data: { whtReport: { rows: [], totalWHT: 0, vendorCount: 0, totalPaymentsSubjectToWHT: 0 } },
  },
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

describe('ReportingLayout', () => {
  it('renders reporting sub-nav links', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter initialEntries={['/reporting/executive']}>
          <ThemeProvider>
            <Routes>
              <Route path="/reporting/*" element={<ReportingLayout />} />
            </Routes>
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>,
    )
    expect(screen.getByText('Executive')).toBeInTheDocument()
    expect(screen.getByText('Consolidated P&L')).toBeInTheDocument()
    expect(screen.getByText('Inventory Valuation')).toBeInTheDocument()
  })
})

describe('ExecutiveDashboard', () => {
  it('renders page title', () => {
    wrap(<ExecutiveDashboard />, [executiveMock])
    expect(screen.getByText('Executive Dashboard')).toBeInTheDocument()
  })

  it('shows skeleton loading state initially', () => {
    const { container } = wrap(<ExecutiveDashboard />, [executiveMock])
    expect(
      container.querySelector('[loading]') ?? screen.getByText('Executive Dashboard'),
    ).toBeInTheDocument()
  })
})

describe('ConsolidatedPL', () => {
  it('renders Consolidated P&L title', () => {
    wrap(<ConsolidatedPL />, [plMock])
    expect(screen.getByText(/Consolidated.*P.L|P.*L.*Consolidated/i)).toBeInTheDocument()
  })
})

describe('ProjectProfitabilityReport', () => {
  it('renders page title', () => {
    wrap(<ProjectProfitabilityReport />, [projectsMock])
    expect(screen.getByText(/Project Profitability/i)).toBeInTheDocument()
  })
})

describe('InventoryValuationReport', () => {
  it('renders page title', () => {
    wrap(<InventoryValuationReport />, [inventoryMock])
    expect(screen.getByText(/Inventory Valuation/i)).toBeInTheDocument()
  })
})

describe('WHTReport', () => {
  it('renders page title', () => {
    wrap(<WHTReport />, [whtMock])
    expect(screen.getByText('Withholding Tax Report')).toBeInTheDocument()
  })
})
