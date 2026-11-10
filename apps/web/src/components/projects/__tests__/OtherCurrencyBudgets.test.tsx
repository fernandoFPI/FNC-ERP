// "Other Currency Budgets": costs booked in a currency other than the project's main one. It moved from a strip
// under the page header (every tab) to the top of the Cost Control tab. Same rules as before: administrators only,
// and only while there is a cost in another currency (or the add form is open).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { OtherCurrencyBudgets, type OtherCurrencyBudgetsProps } from '../OtherCurrencyBudgets'

const IQD_COSTS = {
  currencyCode: 'IQD',
  budgetAmount: null,
  actualCosts: 976491.17,
  budgetRemaining: null,
}

function setup(over: Partial<OtherCurrencyBudgetsProps> = {}) {
  const props: OtherCurrencyBudgetsProps = {
    isAdmin: true,
    summaries: [IQD_COSTS],
    budgets: [],
    showForm: false,
    currency: '',
    amount: '',
    saving: false,
    onOpenForm: vi.fn(),
    onCancelForm: vi.fn(),
    onCurrencyChange: vi.fn(),
    onAmountChange: vi.fn(),
    onSave: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  }
  const utils = render(
    <ThemeProvider>
      <OtherCurrencyBudgets {...props} />
    </ThemeProvider>,
  )
  return { ...utils, props }
}

describe('OtherCurrencyBudgets: when it shows', () => {
  it('shows a card for a currency that has costs but no budget, with what was spent', () => {
    setup()
    expect(screen.getByText('Other Currency Budgets')).toBeInTheDocument()
    expect(screen.getByText('IQD')).toBeInTheDocument()
    expect(screen.getByText('No budget set')).toBeInTheDocument()
    expect(screen.getByText('Actual Cost: 976,491.17 IQD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add Currency Budget' })).toBeInTheDocument()
  })

  it('is not shown to someone who is not an administrator, whatever the costs are', () => {
    const { container } = setup({ isAdmin: false })
    expect(container).toBeEmptyDOMElement()
    const open = setup({ isAdmin: false, showForm: true })
    expect(open.container).toBeEmptyDOMElement()
  })

  it('shows nothing when there is no cost in another currency and the form is closed', () => {
    const { container } = setup({ summaries: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('still shows the card, with the form, when the form is open and there is nothing else to show', () => {
    setup({ summaries: [], showForm: true })
    expect(screen.getByText('Other Currency Budgets')).toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
  })

  it('shows a budget, and what is left of it, in the currency it is in', () => {
    setup({
      summaries: [
        {
          currencyCode: 'IQD',
          budgetAmount: 2000000,
          actualCosts: 976491.17,
          budgetRemaining: 1023508.83,
        },
      ],
      budgets: [{ id: 'b-1', currencyCode: 'IQD', isPrimary: false }],
    })
    expect(screen.getByText('Budget: 2,000,000.00 IQD')).toBeInTheDocument()
    expect(screen.getByText('1,023,508.83 IQD')).toBeInTheDocument()
    expect(screen.queryByText('No budget set')).not.toBeInTheDocument()
  })

  it('keeps one card per currency', () => {
    setup({ summaries: [IQD_COSTS, { currencyCode: 'EUR', actualCosts: 12.5 }] })
    expect(screen.getByText('IQD')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.getByText('Actual Cost: 12.50 EUR')).toBeInTheDocument()
  })
})

describe('OtherCurrencyBudgets: adding and removing a budget', () => {
  it('opens the form from the button, and hides the button while the form is open', () => {
    const { props, rerender } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Add Currency Budget' }))
    expect(props.onOpenForm).toHaveBeenCalledTimes(1)

    rerender(
      <ThemeProvider>
        <OtherCurrencyBudgets {...props} showForm />
      </ThemeProvider>,
    )
    expect(screen.queryByRole('button', { name: '+ Add Currency Budget' })).not.toBeInTheDocument()
  })

  it('turns what is typed in the currency box into at most three capital letters', () => {
    const { props } = setup({ showForm: true })
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'iqdx' } })
    expect(props.onCurrencyChange).toHaveBeenCalledWith('IQD')
  })

  it('passes the amount as typed', () => {
    const { props } = setup({ showForm: true })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1500000' } })
    expect(props.onAmountChange).toHaveBeenCalledWith('1500000')
  })

  it.each([
    ['no currency yet', '', '100'],
    ['a currency of two letters', 'IQ', '100'],
    ['no amount yet', 'IQD', ''],
  ])('cannot save with %s', (_name, currency, amount) => {
    const { props } = setup({ showForm: true, currency, amount })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('cannot be saved twice while it is saving', () => {
    setup({ showForm: true, currency: 'IQD', amount: '100', saving: true })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves a three-letter currency with an amount', () => {
    const { props } = setup({ showForm: true, currency: 'IQD', amount: '100' })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('cancels the form', () => {
    const { props } = setup({ showForm: true, currency: 'IQ', amount: '5' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancelForm).toHaveBeenCalledTimes(1)
  })

  it("removes the extra budget of that card, and only for a budget that is not the project's main one", () => {
    const { props } = setup({
      summaries: [
        { currencyCode: 'IQD', budgetAmount: 100, actualCosts: 1 },
        { currencyCode: 'EUR', budgetAmount: 50, actualCosts: 1 },
        { currencyCode: 'GBP', actualCosts: 2 },
      ],
      budgets: [
        { id: 'b-iqd', currencyCode: 'IQD', isPrimary: false },
        { id: 'b-eur', currencyCode: 'EUR', isPrimary: true },
      ],
    })
    // IQD can be removed; EUR is flagged primary and GBP has no budget row at all.
    const remove = screen.getAllByRole('button', { name: 'Remove' })
    expect(remove).toHaveLength(1)
    fireEvent.click(remove[0])
    expect(props.onRemove).toHaveBeenCalledWith('b-iqd')
  })
})
