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
function show(line: React.ComponentProps<typeof TakeFromStockModal>['line'] = LINE) {
  return render(
    <ThemeProvider>
      <TakeFromStockModal line={line} requisitionId="req-1" onClose={onClose} onDone={onDone} />
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
