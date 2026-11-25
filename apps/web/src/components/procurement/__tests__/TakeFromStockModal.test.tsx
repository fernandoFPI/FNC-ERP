// The dialog that covers part of a line from stock in the organizer review (migration 332, playbook #117): where from and how many,
// what it refuses before anything is sent, what it sends, and what it does when the server answers. The server checks everything
// again (the quantity, the shelf, who, the stage); these tests pin the form's own part.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { TakeFromStockModal } from '../TakeFromStockModal'

type Fn = Mock<unknown[], unknown>
type Opts = { onCompleted?: () => void; onError?: (e: Error) => void } | undefined
const mutationFns: Record<string, Fn> = {}
const mutationOptions: Record<string, Opts> = {}
const queryData: Record<string, unknown> = {}
const queryOptions: Record<string, { skip?: boolean } | undefined> = {}
const operationName = (doc: unknown) =>
  (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find(
    (d) => d.kind === 'OperationDefinition',
  )?.name?.value ?? 'unknown'
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (doc: unknown, options?: { skip?: boolean }) => {
      const name = operationName(doc)
      queryOptions[name] = options
      return { data: options?.skip ? undefined : queryData[name], loading: false }
    },
    useMutation: (doc: unknown, options?: Opts) => {
      const name = operationName(doc)
      mutationFns[name] ??= vi.fn<unknown[], unknown>().mockResolvedValue({})
      mutationOptions[name] = options
      return [mutationFns[name], { loading: false }]
    },
  }
})

const addToast = vi.fn()
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}))

const own = [
  { id: 'loc-a', name: 'Main warehouse', type: 'warehouse' },
  { id: 'loc-v', name: 'Virtual Consumption', type: 'virtual_out' },
  { id: 'loc-in', name: 'Virtual Receipts', type: 'virtual_in' },
  { id: 'loc-b', name: 'Site store', type: 'site' },
]
const central = [{ id: 'loc-c', name: 'Factory store', type: 'warehouse' }]

const onClose = vi.fn()
const onDone = vi.fn()
const LINE = { id: 'line-1', name: 'Hex bolt', shortfall: 4 }
function show(
  line: React.ComponentProps<typeof TakeFromStockModal>['line'] = LINE,
  mode?: 'take' | 'replace',
) {
  return render(
    <ThemeProvider>
      <TakeFromStockModal
        line={line}
        mode={mode}
        requisitionId="req-1"
        onClose={onClose}
        onDone={onDone}
      />
    </ThemeProvider>,
  )
}
const choose = (opening: string | RegExp, option: string) => {
  fireEvent.click(screen.getByText(opening))
  fireEvent.mouseDown(screen.getByText(option))
}
const qtyBox = (): HTMLInputElement => {
  let el: HTMLElement | null = screen.getByText('Quantity from stock')
  for (let i = 0; i < 4 && el; i++) {
    const input = el.querySelector('input')
    if (input) return input
    el = el.parentElement
  }
  throw new Error('no quantity box')
}
const confirmButton = () => screen.getByRole('button', { name: 'Take from stock' })
const sentVariables = (): Record<string, unknown> => {
  const fn = mutationFns.TakeReviewLineFromStock as Fn | undefined
  const call = fn?.mock.calls.at(-1)
  if (!call) throw new Error('nothing was sent')
  return (call[0] as { variables: Record<string, unknown> }).variables
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  for (const k of Object.keys(mutationFns)) Reflect.deleteProperty(mutationFns, k)
  for (const k of Object.keys(mutationOptions)) Reflect.deleteProperty(mutationOptions, k)
  for (const k of Object.keys(queryData)) Reflect.deleteProperty(queryData, k)
  for (const k of Object.keys(queryOptions)) Reflect.deleteProperty(queryOptions, k)
  queryData.StockLocations = { stockLocations: own }
  queryData.CentralWarehouseLocations = { centralWarehouseLocations: central }
  addToast.mockClear()
  onClose.mockClear()
  onDone.mockClear()
})

describe('what it shows', () => {
  it('names the item and how much is left to cover, and starts on that quantity', () => {
    show()
    expect(screen.getByText('Take Hex bolt from stock')).toBeInTheDocument()
    expect(screen.getByText(/4 of this item was not bought/)).toBeInTheDocument()
    expect(qtyBox().value).toBe('4')
  })

  it("offers real places only: this company's and the central warehouse's, never a virtual location", () => {
    show()
    fireEvent.click(screen.getByText('Choose a location'))
    expect(screen.getByText('Main warehouse')).toBeInTheDocument()
    expect(screen.getByText('Site store')).toBeInTheDocument()
    expect(screen.getByText('Factory store (Central warehouse)')).toBeInTheDocument()
    expect(screen.queryByText('Virtual Consumption')).toBeNull()
    expect(screen.queryByText('Virtual Receipts')).toBeNull()
  })

  it('asks for the lists only while it is open', () => {
    show(null)
    expect(queryOptions.StockLocations?.skip).toBe(true)
    expect(queryOptions.CentralWarehouseLocations?.skip).toBe(true)
    show()
    expect(queryOptions.StockLocations?.skip).toBe(false)
    expect(queryOptions.CentralWarehouseLocations?.skip).toBe(false)
  })

  it('a line that already draws from a shelf starts on that shelf', () => {
    show({ ...LINE, location: 'loc-a' })
    expect(screen.queryByText('Choose a location')).toBeNull()
    fireEvent.click(confirmButton())
    expect(sentVariables().sourceLocationId).toBe('loc-a')
  })
})

describe('what it refuses before sending', () => {
  it('no place chosen', () => {
    show()
    fireEvent.click(confirmButton())
    expect(addToast).toHaveBeenCalledWith({
      message: 'Choose where to take it from',
      type: 'error',
    })
    expect(mutationFns.TakeReviewLineFromStock).not.toHaveBeenCalled()
  })

  it('a quantity of zero, an empty box or a letter', () => {
    show()
    choose('Choose a location', 'Main warehouse')
    for (const bad of ['0', '-2']) {
      fireEvent.change(qtyBox(), { target: { value: bad } })
      fireEvent.click(confirmButton())
    }
    expect(addToast).toHaveBeenCalledWith({
      message: 'The quantity must be above zero',
      type: 'error',
    })
    expect(mutationFns.TakeReviewLineFromStock).not.toHaveBeenCalled()
  })

  it('more than is left to cover, saying how much is', () => {
    show()
    choose('Choose a location', 'Main warehouse')
    fireEvent.change(qtyBox(), { target: { value: '5' } })
    fireEvent.click(confirmButton())
    expect(addToast).toHaveBeenCalledWith({ message: 'Only 4 is left to cover', type: 'error' })
    expect(mutationFns.TakeReviewLineFromStock).not.toHaveBeenCalled()
  })
})

describe('what it sends', () => {
  it('the line, the place and the quantity, as numbers', () => {
    show()
    choose('Choose a location', 'Factory store (Central warehouse)')
    fireEvent.change(qtyBox(), { target: { value: '3' } })
    fireEvent.click(confirmButton())
    expect(sentVariables()).toEqual({
      requisitionId: 'req-1',
      lineId: 'line-1',
      sourceLocationId: 'loc-c',
      qty: 3,
    })
  })

  it('the whole shortfall when the quantity is left alone', () => {
    show()
    choose('Choose a location', 'Site store')
    fireEvent.click(confirmButton())
    expect(sentVariables().qty).toBe(4)
  })
})

describe('what it does when the server answers', () => {
  it('on success: says so, empties the form, tells the page and closes', () => {
    show()
    choose('Choose a location', 'Main warehouse')
    fireEvent.click(confirmButton())
    act(() => {
      mutationOptions.TakeReviewLineFromStock?.onCompleted?.()
    })
    expect(addToast).toHaveBeenCalledWith({
      message: 'Taken from stock. A PO Admin has to approve it.',
      type: 'success',
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("on a refusal: shows the server's words, stays open and tells nobody", () => {
    show()
    choose('Choose a location', 'Main warehouse')
    fireEvent.click(confirmButton())
    act(() => {
      mutationOptions.TakeReviewLineFromStock?.onError?.(
        new Error('Insufficient available stock at the chosen location'),
      )
    })
    expect(addToast).toHaveBeenLastCalledWith({
      message: 'Insufficient available stock at the chosen location',
      type: 'error',
    })
    expect(onDone).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel closes without sending', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mutationFns.TakeReviewLineFromStock).not.toHaveBeenCalled()
  })
})

describe('Arabic', () => {
  it('shows the dialog in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    show()
    expect(document.body.textContent).not.toMatch(/req\.(review|bought)\./)
    expect(document.body.textContent).not.toMatch(/\{\{/)
    expect(screen.getByText('أخذ Hex bolt من المخزون')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})

describe('where the item is in stock', () => {
  const availability = (byLocation: unknown[]) => ({
    requisitionStockAvailability: [
      {
        lineId: 'other-line',
        byLocation: [
          { locationId: 'loc-b', locationName: 'Site store', companyName: 'Z', qtyAvailable: 99 },
        ],
      },
      { lineId: 'line-1', byLocation },
    ],
  })
  const store = (id: string, name: string, company: string, qtyAvailable: number) => ({
    locationId: id,
    locationName: name,
    companyName: company,
    qtyAvailable,
  })

  it('the stores that hold it are compared with the part chosen, not with the whole line', () => {
    queryData.RequisitionStockAvailability = availability([
      store('loc-a', 'Main warehouse', 'Acme', 5),
    ])
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    const box = () => {
      const input = screen.getByText('How many from stock?').parentElement?.querySelector('input')
      if (!input) throw new Error('the quantity box is missing')
      return input
    }
    expect(screen.getByRole('radio', { name: /Main warehouse/ }).textContent).toContain(
      '5 available, 10 needed',
    )
    fireEvent.change(box(), { target: { value: '4' } })
    expect(screen.getByRole('radio', { name: /Main warehouse/ }).textContent).toContain(
      '5 available',
    )
    expect(screen.getByRole('radio', { name: /Main warehouse/ }).textContent).not.toContain(
      'needed',
    )
  })

  it("lists the stores that hold THIS line's item, most available first, with the company and the quantity", () => {
    queryData.RequisitionStockAvailability = availability([
      store('loc-a', 'Main warehouse', 'Yakam', 3),
      store('loc-c', 'Factory store', 'Factory', 12),
    ])
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 4 })
    const group = screen.getByRole('radiogroup', { name: 'In stock at' })
    const rows = Array.from(group.querySelectorAll('[role="radio"]'))
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Factory store'),
      expect.stringContaining('Main warehouse'),
    ])
    expect(rows[0]?.textContent).toContain('Factory')
    expect(rows[0]?.textContent).toContain('12 available')
    // a line's own quantity is the yardstick, another line's store never appears
    expect(group.textContent).not.toContain('Site store')
  })

  it('says how much is missing in a store that holds less than is needed, and still lets it be chosen', () => {
    queryData.RequisitionStockAvailability = availability([
      store('loc-a', 'Main warehouse', 'Yakam', 3),
    ])
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 4 })
    const row = screen.getByRole('radio', { name: /Main warehouse/ })
    expect(row.textContent).toContain('3 available, 4 needed')
    fireEvent.click(row)
    expect(screen.getByRole('radio', { name: /Main warehouse/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('picking a store chooses it: the confirm sends that place', () => {
    queryData.RequisitionStockAvailability = availability([
      store('loc-a', 'Main warehouse', 'Yakam', 8),
      store('loc-c', 'Factory store', 'Factory', 12),
    ])
    show()
    fireEvent.click(screen.getByRole('radio', { name: /Factory store/ }))
    expect(screen.getByRole('radio', { name: /Factory store/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: /Main warehouse/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    fireEvent.click(confirmButton())
    expect(sentVariables().sourceLocationId).toBe('loc-c')
  })

  it('in Use stock instead the yardstick is the whole quantity to cover, not the typed one', () => {
    queryData.RequisitionStockAvailability = availability([
      store('loc-a', 'Main warehouse', 'Yakam', 5),
    ])
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    expect(screen.getByRole('radio', { name: /Main warehouse/ }).textContent).toContain(
      '5 available, 10 needed',
    )
  })

  it('the place list says which stores hold the item, and puts them first', () => {
    queryData.RequisitionStockAvailability = availability([
      store('loc-b', 'Site store', 'Yakam', 6),
    ])
    show()
    fireEvent.click(screen.getByText('Choose a location'))
    const options = screen.getAllByText(/Main warehouse|Site store|Factory store/)
    const texts = options.map((o) => o.textContent)
    // the radio row and the option both name Site store; the first option listed is the one that holds stock
    expect(texts.some((x) => x === 'Site store · 6 available')).toBe(true)
    const idxStock = texts.indexOf('Site store · 6 available')
    const idxOther = texts.indexOf('Main warehouse')
    expect(idxStock).toBeGreaterThanOrEqual(0)
    expect(idxStock).toBeLessThan(idxOther)
  })

  it('says so when no store holds the item, and shows no list', () => {
    queryData.RequisitionStockAvailability = availability([])
    show()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByText(/No store holds this item right now/)).toBeInTheDocument()
  })

  it('shows neither list nor warning before the answer arrives, and asks only while open', () => {
    show()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByText(/No store holds this item/)).toBeNull()
    show(null)
    expect(queryOptions.RequisitionStockAvailability?.skip).toBe(true)
  })

  it('in Arabic, with no raw key', async () => {
    await i18n.changeLanguage('ar')
    queryData.RequisitionStockAvailability = availability([
      store('loc-a', 'Main warehouse', 'Yakam', 3),
    ])
    show()
    expect(document.body.textContent).not.toMatch(/req\.(review|bought)\./)
    expect(document.body.textContent).not.toMatch(/\{\{/)
    await i18n.changeLanguage('en')
  })
})

describe('Use stock instead (mode replace)', () => {
  const replaceButton = () => screen.getByRole('button', { name: 'Use stock instead' })
  const sentReplace = (): Record<string, unknown> => {
    const fn = mutationFns.ReplaceReviewPurchasesWithStock as Fn | undefined
    const call = fn?.mock.calls.at(-1)
    if (!call) throw new Error('nothing was sent')
    return (call[0] as { variables: Record<string, unknown> }).variables
  }

  const replaceQtyBox = () => {
    const label = screen.getByText('How many from stock?')
    const input = label.parentElement?.querySelector('input')
    if (!input) throw new Error('the quantity box is missing')
    return input
  }

  it('says what it does, and starts the quantity on everything still to cover', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    expect(screen.getByText('Use stock instead of buying Hex bolt')).toBeInTheDocument()
    expect(screen.getByText(/Choose how many of the 10 to take from stock/)).toBeInTheDocument()
    expect(replaceQtyBox().value).toBe('10')
    expect(screen.getByTestId('replace-hint').textContent).toBe(
      'All 10 come from stock: every purchase of this item and its receipt is removed.',
    )
  })

  it('a smaller number says what stays bought, and the hint follows what is typed', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    fireEvent.change(replaceQtyBox(), { target: { value: '4' } })
    expect(screen.getByTestId('replace-hint').textContent).toBe(
      '4 come from stock. The purchases are reduced by that much, newest first, and the other 6 stays bought.',
    )
    fireEvent.change(replaceQtyBox(), { target: { value: '10' } })
    expect(screen.getByTestId('replace-hint').textContent).toMatch(/^All 10 come from stock/)
    fireEvent.change(replaceQtyBox(), { target: { value: '11' } })
    expect(screen.queryByTestId('replace-hint')).toBeNull() // more than there is: no sentence for it
  })

  it('sends a smaller quantity as qty, and nothing for the whole of it', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    choose('Choose a location', 'Main warehouse')
    fireEvent.change(replaceQtyBox(), { target: { value: '3.5' } })
    fireEvent.click(replaceButton())
    expect(sentReplace()).toEqual({
      requisitionId: 'req-1',
      lineId: 'line-1',
      sourceLocationId: 'loc-a',
      qty: 3.5,
    })
    fireEvent.change(replaceQtyBox(), { target: { value: '10' } })
    fireEvent.click(replaceButton())
    expect(sentReplace()).not.toHaveProperty('qty')
  })

  it('refuses zero and more than is left to cover, before anything is sent', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    choose('Choose a location', 'Main warehouse')
    fireEvent.change(replaceQtyBox(), { target: { value: '0' } })
    fireEvent.click(replaceButton())
    expect(addToast).toHaveBeenLastCalledWith({
      message: 'The quantity must be above zero',
      type: 'error',
    })
    fireEvent.change(replaceQtyBox(), { target: { value: '11' } })
    fireEvent.click(replaceButton())
    expect(addToast).toHaveBeenLastCalledWith({
      message: 'Only 10 is left to cover',
      type: 'error',
    })
    expect(mutationFns.ReplaceReviewPurchasesWithStock).not.toHaveBeenCalled()
  })

  it('needs a place, and sends the line and the place but no quantity', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    fireEvent.click(replaceButton())
    expect(addToast).toHaveBeenCalledWith({
      message: 'Choose where to take it from',
      type: 'error',
    })
    expect(mutationFns.ReplaceReviewPurchasesWithStock).not.toHaveBeenCalled()
    choose('Choose a location', 'Main warehouse')
    fireEvent.click(replaceButton())
    expect(sentReplace()).toEqual({
      requisitionId: 'req-1',
      lineId: 'line-1',
      sourceLocationId: 'loc-a',
    })
    expect(mutationFns.TakeReviewLineFromStock).not.toHaveBeenCalled()
  })

  it('a line that already draws from a shelf starts on that shelf', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 6, location: 'loc-b' }, 'replace')
    fireEvent.click(replaceButton())
    expect(sentReplace().sourceLocationId).toBe('loc-b')
  })

  it('on success it says the purchase was replaced, tells the page and closes; on a refusal it stays open', () => {
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    choose('Choose a location', 'Main warehouse')
    fireEvent.click(replaceButton())
    act(() => {
      mutationOptions.ReplaceReviewPurchasesWithStock?.onError?.(
        new Error('Insufficient available stock'),
      )
    })
    expect(addToast).toHaveBeenLastCalledWith({
      message: 'Insufficient available stock',
      type: 'error',
    })
    expect(onDone).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      mutationOptions.ReplaceReviewPurchasesWithStock?.onCompleted?.()
    })
    expect(addToast).toHaveBeenLastCalledWith({
      message: 'Purchase replaced by stock. A PO Admin has to approve it.',
      type: 'success',
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('in Arabic, with no raw key', async () => {
    await i18n.changeLanguage('ar')
    show({ id: 'line-1', name: 'Hex bolt', shortfall: 10 }, 'replace')
    expect(document.body.textContent).not.toMatch(/req\.(review|bought)\./)
    expect(document.body.textContent).not.toMatch(/\{\{/)
    await i18n.changeLanguage('en')
  })
})
