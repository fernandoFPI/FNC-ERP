import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConsolidatedFinancialTable } from '../ConsolidatedFinancialTable'
import { ThemeProvider } from '../../../theme/ThemeContext'

const companies = [
  { id: 'yakam', name: 'Nishtimani Yakam' },
  { id: 'factory', name: 'Nishtimani Factory' },
]

const rows = [
  { accountType: 'Revenue', accountCode: '4000', accountName: 'Sales Revenue', companies: { yakam: 500000, factory: 300000 }, consolidated: 800000, eliminated: 0 },
  { accountType: 'Revenue', accountCode: '4100', accountName: 'Service Revenue', companies: { yakam: 100000, factory: 50000 }, consolidated: 150000, eliminated: 0 },
  { accountType: 'Expense', accountCode: '5000', accountName: 'Cost of Sales', companies: { yakam: 300000, factory: 200000 }, consolidated: 500000, eliminated: 0 },
]

function wrap(props: React.ComponentProps<typeof ConsolidatedFinancialTable>) {
  return render(
    <ThemeProvider>
      <ConsolidatedFinancialTable {...props} />
    </ThemeProvider>
  )
}

describe('ConsolidatedFinancialTable', () => {
  it('renders company column headers', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.getByText('Nishtimani Yakam')).toBeInTheDocument()
    expect(screen.getByText('Nishtimani Factory')).toBeInTheDocument()
  })

  it('renders Consolidated column', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.getByText(/Consolidated/)).toBeInTheDocument()
  })

  it('renders account names', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
    expect(screen.getByText('Service Revenue')).toBeInTheDocument()
    expect(screen.getByText('Cost of Sales')).toBeInTheDocument()
  })

  it('renders account codes', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.getByText('4000')).toBeInTheDocument()
  })

  it('groups by account type', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('Expense')).toBeInTheDocument()
  })

  it('shows Eliminations column when showEliminations=true', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: true })
    expect(screen.getByText('Eliminations')).toBeInTheDocument()
  })

  it('hides Eliminations column when showEliminations=false', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.queryByText('Eliminations')).not.toBeInTheDocument()
  })

  it('renders loading state when loading=true', () => {
    wrap({ data: [], companies, currency: 'IQD', showEliminations: false, loading: true })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('has export CSV button', () => {
    wrap({ data: rows, companies, currency: 'IQD', showEliminations: false })
    expect(screen.getByRole('button', { name: /csv/i })).toBeInTheDocument()
  })
})
