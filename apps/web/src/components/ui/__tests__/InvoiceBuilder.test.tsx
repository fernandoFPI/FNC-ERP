import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InvoiceBuilder, type InvoiceBuilderResult } from '../InvoiceBuilder'
import { ThemeProvider } from '../../../theme/ThemeContext'
import type { InvoiceHeaderValues } from '../../projects/InvoiceHeaderFields'

const DEFAULTS: InvoiceHeaderValues = {
  clientContractNo: 'PO 4500140630',
  billToAddress: 'Acme Oil Ltd\nAttention: Mr Ahmed',
  deliverToAddress: 'Acme Oil Ltd\nBasra',
  deliveryDate: '2026-10-29',
  periodOfPerformance: '01/10/2026 – 31/10/2026',
}

function setup(headerDefaults?: InvoiceHeaderValues) {
  const onConfirm = vi.fn<[InvoiceBuilderResult], Promise<void>>().mockResolvedValue(undefined)
  const props = {
    open: true,
    projectId: 'p1',
    projectName: 'Cool shack',
    currency: 'USD',
    onConfirm,
    onClose: vi.fn(),
  }
  const ui = (d?: InvoiceHeaderValues) => (
    <ThemeProvider>
      <InvoiceBuilder {...props} headerDefaults={d} />
    </ThemeProvider>
  )
  const view = render(ui(headerDefaults))
  return {
    onConfirm,
    view,
    rerenderWith: (d?: InvoiceHeaderValues) => {
      view.rerender(ui(d))
    },
  }
}

/** Billing method (fixed) -> one line -> the Preview step, where the header fields live. */
function goToPreview() {
  fireEvent.click(screen.getByText('Next →'))
  fireEvent.click(screen.getByText('+ Add Line'))
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Works' } })
  fireEvent.click(screen.getByText('Next →'))
}

function confirm() {
  fireEvent.click(screen.getByText('Proceed →'))
  fireEvent.click(screen.getByText('Create Invoice'))
}

describe('InvoiceBuilder: invoice header block', () => {
  it('shows the five header fields on the preview step, prefilled from the project', () => {
    setup(DEFAULTS)
    goToPreview()
    expect(screen.getByText('Invoice header (printed at the top)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PO 4500140630')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-10-29')).toBeInTheDocument()
    expect(screen.getByDisplayValue('01/10/2026 – 31/10/2026')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Attention: Mr Ahmed/)).toBeInTheDocument()
    // display values are whitespace-normalised, so the line break reads as a space here
    expect(screen.getByDisplayValue('Acme Oil Ltd Basra')).toBeInTheDocument()
    expect(screen.getByText('Contract No.')).toBeInTheDocument()
    expect(screen.getByText("The client's contract, PO or RFQ number")).toBeInTheDocument()
    expect(screen.getByText('Bill To')).toBeInTheDocument()
    expect(screen.getByText('Deliver To')).toBeInTheDocument()
    expect(screen.getByText('Date of Delivery')).toBeInTheDocument()
    expect(screen.getByText('Period of Performance')).toBeInTheDocument()
  })

  it('sends header: null when nobody touched it, so the server fills it from the project', async () => {
    const { onConfirm } = setup(DEFAULTS)
    goToPreview()
    confirm()
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    expect(onConfirm.mock.calls[0][0].header).toBeNull()
  })

  it('sends every field, with the typed value in place, once a field has been changed', async () => {
    const { onConfirm } = setup(DEFAULTS)
    goToPreview()
    fireEvent.change(screen.getByDisplayValue('PO 4500140630'), { target: { value: '4300065926' } })
    confirm()
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    expect(onConfirm.mock.calls[0][0].header).toEqual({
      ...DEFAULTS,
      clientContractNo: '4300065926',
    })
  })

  it('lets every field be cleared on purpose', async () => {
    const { onConfirm } = setup(DEFAULTS)
    goToPreview()
    fireEvent.change(screen.getByDisplayValue(/Attention: Mr Ahmed/), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('2026-10-29'), { target: { value: '' } })
    confirm()
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    expect(onConfirm.mock.calls[0][0].header).toMatchObject({
      billToAddress: '',
      deliveryDate: '',
    })
  })

  it("fills the fields when the project's values arrive after the wizard opened, but never over typing", () => {
    const { rerenderWith } = setup(undefined)
    goToPreview()
    expect(screen.queryByDisplayValue('PO 4500140630')).toBeNull()
    rerenderWith(DEFAULTS)
    expect(screen.getByDisplayValue('PO 4500140630')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('PO 4500140630'), { target: { value: 'MINE' } })
    rerenderWith({ ...DEFAULTS, clientContractNo: 'FROM-SERVER-AGAIN' })
    expect(screen.getByDisplayValue('MINE')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('FROM-SERVER-AGAIN')).toBeNull()
  })
})
