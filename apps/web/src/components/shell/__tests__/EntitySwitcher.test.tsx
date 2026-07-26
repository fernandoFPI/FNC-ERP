import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EntitySwitcher } from '../EntitySwitcher'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { useCompanyStore } from '../../../store/companyStore'

const companies = [
  { id: '1', name: 'Nishtimani Yakam', currencyCode: 'IQD' },
  { id: '2', name: 'Nishtimani Factory', currencyCode: 'IQD' },
  { id: '3', name: 'Al Watanyia', currencyCode: 'USD' },
]

beforeEach(() => {
  useCompanyStore.setState({ activeCompany: companies[0] ?? null, companies })
})

function wrap() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <EntitySwitcher />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('EntitySwitcher', () => {
  it('shows active company name', () => {
    wrap()
    expect(screen.getByText('Nishtimani Yakam')).toBeInTheDocument()
  })

  it('opens dropdown on click', () => {
    wrap()
    fireEvent.click(screen.getByText('Nishtimani Yakam').closest('button')!)
    expect(screen.getByText('Nishtimani Factory')).toBeInTheDocument()
  })

  it('shows all companies from companyStore', () => {
    wrap()
    fireEvent.click(screen.getByText('Nishtimani Yakam').closest('button')!)
    expect(screen.getByText('Al Watanyia')).toBeInTheDocument()
  })

  it('closes dropdown when clicking outside', async () => {
    wrap()
    fireEvent.click(screen.getByText('Nishtimani Yakam').closest('button')!)
    expect(screen.getByText('Nishtimani Factory')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(screen.queryByText('Nishtimani Factory')).not.toBeInTheDocument()
    })
  })
})
