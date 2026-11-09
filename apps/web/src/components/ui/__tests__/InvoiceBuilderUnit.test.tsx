// Unit of measure in the create-invoice wizard (migration 318): a Unit column right after Qty, every new line starts as
// Ea, the person can pick another unit or type one, and the unit goes out with every line, including the lines the
// wizard makes itself (a percentage of the contract, a milestone).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceBuilder, type InvoiceBuilderResult } from '../InvoiceBuilder'
import { ThemeProvider } from '../../../theme/ThemeContext'

function setup(
  extra: {
    contractAmount?: number
    milestones?: { id: string; name: string; amount: number; status: string }[]
  } = {},
) {
  const onConfirm = vi.fn<[InvoiceBuilderResult], Promise<void>>().mockResolvedValue(undefined)
  render(
    <ThemeProvider>
      <InvoiceBuilder
        open
        projectId="p1"
        projectName="Cool shack"
        currency="USD"
        onConfirm={onConfirm}
        onClose={vi.fn()}
        {...extra}
      />
    </ThemeProvider>,
  )
  return onConfirm
}

const next = () => fireEvent.click(screen.getByText('Next →'))

/** Billing method (fixed) -> the line editor with one new line, described. */
function openFixedLine() {
  next()
  fireEvent.click(screen.getByText('+ Add Line'))
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Chairs' } })
}

async function confirm(onConfirm: ReturnType<typeof setup>): Promise<InvoiceBuilderResult> {
  fireEvent.click(screen.getByText('Proceed →'))
  fireEvent.click(screen.getByText('Create Invoice'))
  await vi.waitFor(() => {
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
  return onConfirm.mock.calls[0][0]
}

const unitBox = () => screen.getByLabelText('Unit of measure')

describe('InvoiceBuilder: unit of measure', () => {
  it('has a Unit column right after Qty', () => {
    setup()
    openFixedLine()
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
    const i = headers.indexOf('Qty')
    expect(i).toBeGreaterThan(-1)
    expect(headers[i + 1]).toBe('Unit')
    expect(headers[i + 2]).toBe('Unit Price')
  })

  it('starts a new line as Ea', () => {
    setup()
    openFixedLine()
    expect((unitBox() as HTMLSelectElement).value).toBe('Ea')
  })

  it('sends Ea when the unit was never touched', async () => {
    const onConfirm = setup()
    openFixedLine()
    next()
    expect((await confirm(onConfirm)).lines[0]).toMatchObject({ description: 'Chairs', unit: 'Ea' })
  })

  it('sends the unit that was picked from the list', async () => {
    const onConfirm = setup()
    openFixedLine()
    fireEvent.change(unitBox(), { target: { value: 'Box' } })
    next()
    expect((await confirm(onConfirm)).lines[0].unit).toBe('Box')
  })

  it('sends a unit that was typed under Other', async () => {
    const onConfirm = setup()
    openFixedLine()
    fireEvent.change(unitBox(), { target: { value: '__other__' } })
    fireEvent.change(unitBox(), { target: { value: 'Man-Day' } })
    next()
    expect((await confirm(onConfirm)).lines[0].unit).toBe('Man-Day')
  })

  it('gives each line its own unit', async () => {
    const onConfirm = setup()
    next()
    fireEvent.click(screen.getByText('+ Add Line'))
    fireEvent.click(screen.getByText('+ Add Line'))
    const [a, b] = screen.getAllByPlaceholderText('Description')
    fireEvent.change(a, { target: { value: 'Cable' } })
    fireEvent.change(b, { target: { value: 'Fitting works' } })
    const [u1, u2] = screen.getAllByLabelText('Unit of measure')
    fireEvent.change(u1, { target: { value: 'M' } })
    fireEvent.change(u2, { target: { value: 'Lot' } })
    next()
    const result = await confirm(onConfirm)
    expect(result.lines.map((l) => [l.description, l.unit])).toEqual([
      ['Cable', 'M'],
      ['Fitting works', 'Lot'],
    ])
  })

  it('gives the line a percentage-of-contract invoice makes the default unit', async () => {
    const onConfirm = setup({ contractAmount: 10000 })
    fireEvent.click(screen.getByText('Percentage of Contract'))
    next()
    next()
    const result = await confirm(onConfirm)
    expect(result.billing_method).toBe('percentage')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].unit).toBe('Ea')
  })

  it('gives the lines a milestone invoice makes the default unit', async () => {
    const onConfirm = setup({
      milestones: [{ id: 'm1', name: 'Design', amount: 500, status: 'completed' }],
    })
    fireEvent.click(screen.getByText('Milestone'))
    next()
    fireEvent.click(screen.getByRole('checkbox'))
    next()
    const result = await confirm(onConfirm)
    expect(result.billing_method).toBe('milestone')
    expect(result.lines.map((l) => l.unit)).toEqual(['Ea'])
  })
})
