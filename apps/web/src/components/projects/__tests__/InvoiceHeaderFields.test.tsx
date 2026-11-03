import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  InvoiceHeaderFields,
  changedInvoiceHeader,
  toInvoiceHeaderValues,
  EMPTY_INVOICE_HEADER,
  type InvoiceHeaderValues,
} from '../InvoiceHeaderFields'
import { ThemeProvider } from '../../../theme/ThemeContext'

const VALUES: InvoiceHeaderValues = {
  clientContractNo: '4300065926',
  billToAddress: 'ACME Ltd\nBaghdad',
  deliverToAddress: 'ACME Site\nBasra',
  deliveryDate: '2026-07-30',
  periodOfPerformance: 'n/a',
}

describe('toInvoiceHeaderValues', () => {
  it('turns the API nulls into empty text, and an ISO timestamp into a plain date', () => {
    expect(toInvoiceHeaderValues(null)).toEqual(EMPTY_INVOICE_HEADER)
    expect(toInvoiceHeaderValues(undefined)).toEqual(EMPTY_INVOICE_HEADER)
    expect(
      toInvoiceHeaderValues({
        clientContractNo: null,
        billToAddress: 'X',
        deliverToAddress: undefined,
        deliveryDate: '2026-07-30T00:00:00.000Z',
        periodOfPerformance: null,
      }),
    ).toEqual({
      clientContractNo: '',
      billToAddress: 'X',
      deliverToAddress: '',
      deliveryDate: '2026-07-30',
      periodOfPerformance: '',
    })
  })
})

describe('changedInvoiceHeader', () => {
  it('returns only the fields that differ', () => {
    expect(changedInvoiceHeader(VALUES, { ...VALUES, billToAddress: 'New' })).toEqual({
      billToAddress: 'New',
    })
  })

  it('returns nothing when nothing changed, so a line edit never stores derived header values', () => {
    expect(changedInvoiceHeader(VALUES, { ...VALUES })).toEqual({})
  })

  it('keeps a field that was cleared on purpose', () => {
    expect(
      changedInvoiceHeader(VALUES, { ...VALUES, deliveryDate: '', deliverToAddress: '' }),
    ).toEqual({
      deliveryDate: '',
      deliverToAddress: '',
    })
  })
})

describe('InvoiceHeaderFields', () => {
  function setup(values = VALUES) {
    const onChange = vi.fn()
    render(
      <ThemeProvider>
        <InvoiceHeaderFields values={values} onChange={onChange} />
      </ThemeProvider>,
    )
    return onChange
  }

  it('shows the five fields with their labels', () => {
    setup()
    for (const label of [
      'Contract No.',
      'Date of Delivery',
      'Bill To',
      'Deliver To',
      'Period of Performance',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByDisplayValue('4300065926')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-07-30')).toBeInTheDocument()
  })

  it('reports one field at a time, as a patch', () => {
    const onChange = setup()
    fireEvent.change(screen.getByDisplayValue('4300065926'), { target: { value: '4300065927' } })
    expect(onChange).toHaveBeenLastCalledWith({ clientContractNo: '4300065927' })
    fireEvent.change(screen.getByDisplayValue('2026-07-30'), { target: { value: '2026-08-01' } })
    expect(onChange).toHaveBeenLastCalledWith({ deliveryDate: '2026-08-01' })
    fireEvent.change(screen.getByDisplayValue('n/a'), { target: { value: '1 - 5 Oct' } })
    expect(onChange).toHaveBeenLastCalledWith({ periodOfPerformance: '1 - 5 Oct' })
  })

  it('keeps the line breaks of an address', () => {
    const onChange = setup()
    const bill = screen.getByDisplayValue('ACME Ltd Baghdad')
    fireEvent.change(bill, { target: { value: 'Line one\nLine two' } })
    expect(onChange).toHaveBeenLastCalledWith({ billToAddress: 'Line one\nLine two' })
  })
})
