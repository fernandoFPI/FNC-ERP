// The "Inventory cost" cell on PO and requisition lines: the product's own Cost, for reference.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { InventoryCost } from '../InventoryCost'

const show = (cost: string | number | null | undefined, currency: string | null | undefined) =>
  render(
    <ThemeProvider>
      <InventoryCost cost={cost} currency={currency} />
    </ThemeProvider>,
  )

afterEach(async () => {
  if (i18n.language !== 'en') {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

describe('InventoryCost', () => {
  it('shows the cost with its currency', () => {
    show('12.5', 'USD')
    expect(screen.getByText('12.5 USD')).toBeInTheDocument()
    expect(screen.queryByText('currency not set')).toBeNull()
  })

  it('trims the trailing zeros the database adds and groups the thousands', () => {
    show('1250000.0000', 'IQD')
    expect(screen.getByText('1,250,000 IQD')).toBeInTheDocument()
  })

  it('accepts a number as well as the string the API sends', () => {
    show(800, 'IQD')
    expect(screen.getByText('800 IQD')).toBeInTheDocument()
  })

  it('shows a cost saved without a currency and says so, instead of guessing one', () => {
    show('800.0000', null)
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.getByText('currency not set')).toBeInTheDocument()
  })

  it.each([
    ['no cost at all', null],
    ['no value yet', undefined],
    ['an empty string', ''],
    ['zero, which means "never recorded"', '0'],
    ['a negative number', '-5'],
    ['something that is not a number', 'n/a'],
  ])('shows a dash for %s, and no currency note', (_label, cost) => {
    show(cost, 'USD')
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('currency not set')).toBeNull()
    expect(screen.queryByText(/USD/)).toBeNull()
  })

  it('explains in a tooltip that it is a reference, not the store price or part of a total', () => {
    show('12.5', 'USD')
    expect(screen.getByTitle(/not the store price/)).toBeInTheDocument()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    show('800', null)
    expect(screen.getByText('العملة غير محددة')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/po\.detail\./)
  })
})
