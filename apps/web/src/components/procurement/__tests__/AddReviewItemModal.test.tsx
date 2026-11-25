// The dialog that adds an item in the organizer review (migration 330, playbook #116): what it asks for, what it refuses before
// anything is sent, the order of the upload and the call, and what it does when either fails. The server checks everything again
// (vendor, receipt, product, stage, who); these tests pin the form's own part.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { AddReviewItemModal } from '../AddReviewItemModal'

type Fn = Mock<unknown[], unknown>
const mutationFns: Record<string, Fn> = {}
// A mutation mock that answers with `value`, rejects, or never answers until released: typed, so the calls can be read back.
const answers = (value: unknown): Fn => vi.fn<unknown[], unknown>().mockResolvedValue(value)
const refuses = (e: Error): Fn => vi.fn<unknown[], unknown>().mockRejectedValue(e)
// The first call of a mutation, as the page made it.
const callArg = (op: string): { variables: Record<string, unknown> } => {
  const fn = mutationFns[op] as Fn | undefined
  const call = fn?.mock.calls.at(0)
  if (!call) throw new Error(`${op} was not called`)
  return call[0] as { variables: Record<string, unknown> }
}
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
    useMutation: (doc: unknown) => {
      const name = operationName(doc)
      mutationFns[name] ??= vi.fn<unknown[], unknown>()
      return [mutationFns[name], { loading: false }]
    },
  }
})

const addToast = vi.fn()
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}))

const products = [
  { id: 'prod-1', sku: 'WSH-1', name: 'Steel washer', name_ar: null, uom: 'box' },
  { id: 'prod-2', sku: 'BLT-1', name: 'Hex bolt', name_ar: 'برغي', uom: null },
]
const vendors = [
  { id: 'v-1', name: 'Dar Steel', is_active: true },
  { id: 'v-2', name: 'Closed Supplier', is_active: false },
  { id: 'v-3', name: 'Al Noor', is_active: true },
]

const onClose = vi.fn()
const onAdded = vi.fn()
function show(over: Partial<React.ComponentProps<typeof AddReviewItemModal>> = {}) {
  return render(
    <ThemeProvider>
      <AddReviewItemModal
        open
        requisitionId="req-1"
        defaultCurrency="USD"
        onClose={onClose}
        onAdded={onAdded}
        {...over}
      />
    </ThemeProvider>,
  )
}

const receipt = (name = 'receipt.jpg', type = 'image/jpeg') => new File(['x'], name, { type })
const fileInput = () => {
  const el = document.querySelector('input[type="file"]')
  if (!(el instanceof HTMLInputElement)) throw new Error('no file input')
  return el
}
const attach = (f: File) => {
  fireEvent.change(fileInput(), { target: { files: [f] } })
}
const choose = (opening: string | RegExp, option: string) => {
  fireEvent.click(screen.getByText(opening))
  fireEvent.mouseDown(screen.getByText(option))
}
// The shared Input does not tie its label to the box, so the box is the input next to the label's text.
const box = (label: string): HTMLInputElement => {
  let el: HTMLElement | null = screen.getByText(label)
  for (let i = 0; i < 4 && el; i++) {
    const input = el.querySelector('input')
    if (input) return input
    el = el.parentElement
  }
  throw new Error(`no box for ${label}`)
}
const typeInto = (label: string, value: string) => {
  fireEvent.change(box(label), { target: { value } })
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
// The price box is the one with the aria-label, the currency pill the native select beside it.
const priceBox = () => screen.getByLabelText('Unit price paid')

// Fill the whole form the way a person would; each test then breaks one thing.
function fillAll(over: { name?: string; price?: string; qty?: string } = {}) {
  typeInto('Item name', over.name ?? 'Forgotten bolts')
  typeInto('Quantity', over.qty ?? '4')
  choose('Select vendor...', 'Dar Steel')
  fireEvent.change(priceBox(), { target: { value: over.price ?? '7.25' } })
  attach(receipt())
}

let fetchMock: Mock<unknown[], unknown>
type FetchCall = [string, { method: string; headers: Record<string, string> }]
const fetchCall = (): FetchCall => {
  const call = fetchMock.mock.calls.at(0)
  if (!call) throw new Error('fetch was not called')
  return call as FetchCall
}
beforeEach(() => {
  for (const k of Object.keys(mutationFns)) Reflect.deleteProperty(mutationFns, k)
  for (const k of Object.keys(queryData)) Reflect.deleteProperty(queryData, k)
  for (const k of Object.keys(queryOptions)) Reflect.deleteProperty(queryOptions, k)
  queryData.Products = { products }
  queryData.Vendors = { vendors }
  addToast.mockClear()
  onClose.mockClear()
  onAdded.mockClear()
  // upload-url call, then the file POST, then the line
  mutationFns.RequestUploadUrl = answers({ data: { requestUploadUrl: { fileId: 'file-1' } } })
  mutationFns.AddReviewLine = answers({
    data: { addReviewLine: { id: 'req-1', status: 'organizer_review' } },
  })
  fetchMock = vi
    .fn<unknown[], unknown>()
    .mockResolvedValue({ ok: true, statusText: 'OK', json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  vi.unstubAllGlobals()
  if (i18n.language !== 'en') await i18n.changeLanguage('en')
})

describe('what it shows', () => {
  it('says what adding an item skips and who signs it off', () => {
    show()
    expect(screen.getByText('Add an item that was bought')).toBeInTheDocument()
    expect(screen.getByText(/skips the inventory check and the pricing steps/)).toBeInTheDocument()
    expect(screen.getByText(/a PO Admin approves it/)).toBeInTheDocument()
  })

  it('draws nothing when closed, and does not load the catalog or the vendors until it is opened', () => {
    const { container } = show({ open: false })
    expect(container.textContent).toBe('')
    expect(screen.queryByText('Add an item that was bought')).toBeNull()
    expect(queryOptions.Products?.skip).toBe(true)
    expect(queryOptions.Vendors?.skip).toBe(true)
  })

  it("loads both once it is open, the products including the central warehouse's", () => {
    show()
    expect(queryOptions.Products?.skip).toBe(false)
    expect(queryOptions.Vendors?.skip).toBe(false)
  })

  it('starts the price in the currency it was given, and still offers a currency that is not in the usual list', () => {
    show({ defaultCurrency: 'SAR' })
    const pill = screen.getByLabelText('Currency of the price')
    expect(pill).toHaveValue('SAR')
    expect(Array.from(pill.querySelectorAll('option')).map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['SAR', 'IQD', 'USD']),
    )
  })

  it('offers only active vendors', () => {
    show()
    fireEvent.click(screen.getByText('Select vendor...'))
    expect(screen.getByText('Dar Steel')).toBeInTheDocument()
    expect(screen.getByText('Al Noor')).toBeInTheDocument()
    expect(screen.queryByText('Closed Supplier')).toBeNull()
  })
})

describe('what it refuses before anything is sent', () => {
  const nothingSent = () => {
    expect(mutationFns.RequestUploadUrl).not.toHaveBeenCalled()
    expect(mutationFns.AddReviewLine).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  }

  it('an item with no name and no product', () => {
    show()
    typeInto('Quantity', '4')
    choose('Select vendor...', 'Dar Steel')
    fireEvent.change(priceBox(), { target: { value: '7' } })
    attach(receipt())
    save()
    expect(addToast).toHaveBeenCalledWith({
      message: 'Name the item: pick a product or type a name',
      type: 'error',
    })
    nothingSent()
  })

  it('a quantity that is not above zero', () => {
    show()
    fillAll({ qty: '0' })
    save()
    expect(addToast).toHaveBeenCalledWith({
      message: 'Quantity must be greater than 0',
      type: 'error',
    })
    nothingSent()
  })

  it('no vendor', () => {
    show()
    typeInto('Item name', 'Bolts')
    fireEvent.change(priceBox(), { target: { value: '7' } })
    attach(receipt())
    save()
    expect(addToast).toHaveBeenCalledWith({ message: 'Select a vendor', type: 'error' })
    nothingSent()
  })

  it('a price that is not above zero', () => {
    show()
    fillAll({ price: '0' })
    save()
    expect(addToast).toHaveBeenCalledWith({
      message: 'The price must be greater than 0',
      type: 'error',
    })
    nothingSent()
  })

  it('no receipt', () => {
    show()
    typeInto('Item name', 'Bolts')
    choose('Select vendor...', 'Dar Steel')
    fireEvent.change(priceBox(), { target: { value: '7' } })
    save()
    expect(addToast).toHaveBeenCalledWith({ message: 'Attach the receipt', type: 'error' })
    nothingSent()
  })
})

describe('adding the item', () => {
  it('uploads the receipt first, then adds the line with exactly what was typed and the file it just uploaded', async () => {
    show()
    fillAll()
    typeInto('Unit', 'box')
    save()
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled()
    })
    expect(mutationFns.RequestUploadUrl).toHaveBeenCalledWith({
      variables: {
        filename: 'receipt.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        category: 'attachment',
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchCall()
    expect(url).toMatch(/\/api\/v1\/files\/file-1\/content$/)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('image/jpeg')
    expect(mutationFns.AddReviewLine).toHaveBeenCalledWith({
      variables: {
        input: {
          requisitionId: 'req-1',
          productId: undefined,
          description: 'Forgotten bolts',
          qty: 4,
          uom: 'box',
          vendorId: 'v-1',
          actualUnitPrice: 7.25,
          currencyCode: 'USD',
          receiptFileId: 'file-1',
        },
      },
    })
    // upload before the call
    expect(fetchMock.mock.invocationCallOrder.at(0)).toBeLessThan(
      mutationFns.AddReviewLine.mock.invocationCallOrder.at(0) ?? 0,
    )
  })

  it('tells the organizer, reads the requisition again and closes', async () => {
    show()
    fillAll()
    save()
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(addToast).toHaveBeenCalledWith({
      message: 'Item added. A PO Admin has to approve it.',
      type: 'success',
    })
    expect(onAdded).toHaveBeenCalledTimes(1)
  })

  it('sends the currency that was picked in the price box', async () => {
    show()
    fillAll()
    fireEvent.change(screen.getByLabelText('Currency of the price'), { target: { value: 'IQD' } })
    save()
    await waitFor(() => {
      expect(mutationFns.AddReviewLine).toHaveBeenCalled()
    })
    const input = callArg('AddReviewLine').variables.input as { currencyCode: string }
    expect(input.currencyCode).toBe('IQD')
  })

  it('a catalog product names the line, brings its unit, and is sent as the product (no typed name)', async () => {
    show()
    choose('Custom item (type a name)', 'Steel washer')
    expect(box('Unit')).toHaveValue('box')
    choose('Select vendor...', 'Al Noor')
    typeInto('Quantity', '2')
    fireEvent.change(priceBox(), { target: { value: '1.5' } })
    attach(receipt('r.pdf', 'application/pdf'))
    save()
    await waitFor(() => {
      expect(mutationFns.AddReviewLine).toHaveBeenCalled()
    })
    const input = callArg('AddReviewLine').variables.input as Record<string, unknown>
    expect(input.productId).toBe('prod-1')
    expect(input.description).toBeUndefined()
    expect(input.uom).toBe('box')
    expect(input.vendorId).toBe('v-3')
    expect(fetchCall()[1].headers['Content-Type']).toBe('application/pdf')
  })

  it('keeps a unit the person already typed when a product is picked after it', () => {
    show()
    typeInto('Unit', 'roll')
    choose('Custom item (type a name)', 'Steel washer')
    expect(box('Unit')).toHaveValue('roll')
  })

  it('asks the server for a receipt type it can read when the browser reports none', async () => {
    show()
    fillAll()
    attach(new File(['x'], 'scan.tiff', { type: '' }))
    save()
    await waitFor(() => {
      expect(mutationFns.RequestUploadUrl).toHaveBeenCalled()
    })
    expect(callArg('RequestUploadUrl').variables.mimeType).toBe('application/octet-stream')
  })

  it('one receipt: a second file replaces the first', async () => {
    show()
    fillAll()
    attach(receipt('second.png', 'image/png'))
    save()
    await waitFor(() => {
      expect(mutationFns.RequestUploadUrl).toHaveBeenCalled()
    })
    expect(callArg('RequestUploadUrl').variables.filename).toBe('second.png')
    expect(mutationFns.RequestUploadUrl).toHaveBeenCalledTimes(1)
  })

  it('a receipt can be taken off again', () => {
    show()
    attach(receipt())
    expect(screen.getByText('receipt.jpg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove receipt.jpg' }))
    expect(screen.queryByText('receipt.jpg')).toBeNull()
  })
})

describe('when something goes wrong', () => {
  it('a receipt that cannot be uploaded: says why, adds nothing, and keeps the dialog and what was typed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Payload Too Large',
      json: () => Promise.resolve({ error: { message: 'The file is too large' } }),
    })
    show()
    fillAll()
    save()
    await waitFor(() => {
      expect(addToast).toHaveBeenCalled()
    })
    expect(addToast).toHaveBeenCalledWith({
      message: 'The receipt could not be uploaded: The file is too large',
      type: 'error',
    })
    expect(mutationFns.AddReviewLine).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(box('Item name')).toHaveValue('Forgotten bolts')
    expect(screen.getByText('receipt.jpg')).toBeInTheDocument()
  })

  it('no upload address: says so and adds nothing', async () => {
    mutationFns.RequestUploadUrl = answers({ data: undefined })
    show()
    fillAll()
    save()
    await waitFor(() => {
      expect(addToast).toHaveBeenCalled()
    })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mutationFns.AddReviewLine).not.toHaveBeenCalled()
  })

  it("the server's refusal is shown as it is, and the dialog stays open with everything typed", async () => {
    mutationFns.AddReviewLine = refuses(new Error('Vendor not found'))
    show()
    fillAll()
    save()
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({ message: 'Vendor not found', type: 'error' })
    })
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(box('Item name')).toHaveValue('Forgotten bolts')
  })

  it('cannot be closed while it is saving', async () => {
    let release: () => void = () => undefined
    mutationFns.AddReviewLine = vi.fn<unknown[], unknown>().mockReturnValue(
      new Promise((resolve) => {
        release = () => {
          resolve({ data: {} })
        }
      }),
    )
    show()
    fillAll()
    save()
    await waitFor(() => {
      expect(mutationFns.AddReviewLine).toHaveBeenCalled()
    })
    // Cancel is disabled while saving, and the other ways out (Escape, the close cross, the dark area) all go through the
    // dialog's own close, which must refuse too: a closed dialog would lose the form while the receipt is still going up.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(box('Item name')).toHaveValue('Forgotten bolts')
    await act(async () => {
      release()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })
})

describe('closing and starting again', () => {
  it('Cancel closes, and the next time the form is empty again', () => {
    const { rerender } = show()
    typeInto('Item name', 'Something')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(
      <ThemeProvider>
        <AddReviewItemModal
          open
          requisitionId="req-1"
          defaultCurrency="USD"
          onClose={onClose}
          onAdded={onAdded}
        />
      </ThemeProvider>,
    )
    expect(box('Item name')).toHaveValue('')
  })

  it('an added item leaves the form empty for the next one', async () => {
    const { rerender } = show()
    fillAll()
    save()
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    rerender(
      <ThemeProvider>
        <AddReviewItemModal
          open
          requisitionId="req-1"
          defaultCurrency="USD"
          onClose={onClose}
          onAdded={onAdded}
        />
      </ThemeProvider>,
    )
    expect(box('Item name')).toHaveValue('')
    // a number box: an empty one has no value at all
    expect((priceBox() as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('receipt.jpg')).toBeNull()
  })
})

describe('in Arabic', () => {
  it('shows no raw key, and the add button reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    show()
    expect(document.body.textContent).not.toMatch(/req\.review\./)
    expect(screen.getByText('إضافة صنف تم شراؤه')).toBeInTheDocument()
  })
})

// The price after the vendor's discount (migration 336, playbook #124): optional, per unit, in the price's own currency; when it
// is filled it is the price that counts, so the line is added at that price with the quoted one kept as information.
describe('price after discount', () => {
  const discountBox = () => screen.getByLabelText('Price after discount (optional)')
  const input = () => callArg('AddReviewLine').variables.input as Record<string, unknown>

  it('is an optional box under the price, in the same currency, with a line saying what it is for', () => {
    show()
    expect(discountBox()).toHaveValue(null)
    expect(
      screen.getByText(/If the vendor gave a discount, enter the unit price after it/),
    ).toBeInTheDocument()
    const pill = screen.getByLabelText('Currency of the price after discount')
    expect(pill).toHaveValue('USD')
    expect(Array.from(pill.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['USD'])
  })

  it('an item added without a discount is sent exactly as before: no discount key', async () => {
    show()
    fillAll()
    save()
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled()
    })
    expect('discountedUnitPrice' in input()).toBe(false)
  })

  it('a typed price after discount is sent next to the quoted price', async () => {
    show()
    fillAll({ price: '7.25' })
    fireEvent.change(discountBox(), { target: { value: '6' } })
    save()
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled()
    })
    expect(input()).toMatchObject({ actualUnitPrice: 7.25, discountedUnitPrice: 6, qty: 4 })
  })

  it('a price after discount above the price is marked and refused before anything is sent', () => {
    show()
    fillAll({ price: '7.25' })
    fireEvent.change(discountBox(), { target: { value: '9' } })
    expect(discountBox()).toHaveAttribute('aria-invalid', 'true')
    save()
    expect(addToast).toHaveBeenCalledWith({
      message: 'The price after discount cannot be higher than the price the vendor quoted',
      type: 'error',
    })
    expect(mutationFns.RequestUploadUrl).not.toHaveBeenCalled()
    expect(mutationFns.AddReviewLine).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a price after discount of zero is refused before anything is sent', () => {
    show()
    fillAll()
    fireEvent.change(discountBox(), { target: { value: '0' } })
    save()
    expect(addToast).toHaveBeenCalledWith({
      message:
        'The price after discount must be greater than 0 — clear the box if there is no discount',
      type: 'error',
    })
    expect(mutationFns.AddReviewLine).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is emptied when the dialog is closed, so the next item starts without a discount', () => {
    show()
    fireEvent.change(discountBox(), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(discountBox()).toHaveValue(null)
  })
})
