// Purpose: Direct Supply on the New Requisition form. It is always tied to a project, always delivered straight to the
// jobsite, and has no pricing step after it, so the Est. Unit Price typed here is the price the approver sees. Because
// nothing sets a line's currency later, every line names its own here.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    gql: actual.gql,
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const createRequisition = vi.fn()
const t = (key: string) => i18n.t(key)

let RequisitionFormLazy: React.ComponentType = () => null
function mount(path = '/procurement/requisitions/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <RequisitionFormLazy />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const projectsResult = {
  data: { projects: { data: [{ id: 'proj-1', code: 'PRJ-001', name: 'Erbil Tower' }] } },
  loading: false,
}
const emptyResult = { data: undefined, loading: false }

beforeEach(async () => {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
  mockUseQuery.mockImplementation(
    (doc: { definitions?: { kind?: string; name?: { value?: string } }[] }) => {
      const op = doc.definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      return op === 'Projects' ? projectsResult : emptyResult
    },
  )
  createRequisition.mockResolvedValue({ data: { createRequisition: { id: 'req-new' } } })
  mockUseMutation.mockReturnValue([createRequisition, { loading: false }])
  RequisitionFormLazy = (await import('../RequisitionForm')).default
})

const selects = (c: HTMLElement) => [...c.querySelectorAll('select')]
// The purpose is a group of cards (one radio each), not a select.
const purposeCard = (name: string) => screen.getByRole('radio', { name })
const choosePurpose = (name: string) => {
  fireEvent.click(purposeCard(name))
}
// The selects that offer currencies: the line currency boxes (the Currency box of an expense or an advance is not drawn here).
const currencySelects = (c: HTMLElement) =>
  selects(c).filter((s) => s.querySelector('option[value="USD"]'))
const destinationSelect = (c: HTMLElement) => {
  const el = selects(c).find(
    (s) => s.querySelector('option[value="jobsite"]') && !s.querySelector('option[value="USD"]'),
  )
  if (!el) throw new Error('no delivery destination box on the form')
  return el
}
const numberInputs = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="number"]'),
]
const toasts = () => useToastStore.getState().toasts.map((x) => x.message)
const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: /create requisition/i }))
}

// A direct supply for the project that ?projectId= selects, with one line typed in.
function chooseDirectSupply(opts: { project?: boolean } = {}) {
  const view = mount(
    opts.project === false ? undefined : '/procurement/requisitions/new?projectId=proj-1',
  )
  choosePurpose(t('req.form.directSupply'))
  return view
}
function typeLine(
  c: HTMLElement,
  index: number,
  fields: { description?: string; qty?: string; price?: string },
) {
  if (fields.description !== undefined)
    fireEvent.change(screen.getAllByPlaceholderText('Description')[index], {
      target: { value: fields.description },
    })
  const numbers = numberInputs(c)
  // each line has its quantity, then its price
  if (fields.qty !== undefined)
    fireEvent.change(numbers[index * 2], { target: { value: fields.qty } })
  if (fields.price !== undefined)
    fireEvent.change(numbers[index * 2 + 1], { target: { value: fields.price } })
}

interface Sent {
  purpose: string
  project_id?: string
  delivery_destination?: string
  lines: {
    description: string
    qty: number
    unit_price: number
    requested_currency_code?: string
  }[]
}
const sentInput = (): Sent =>
  ((createRequisition.mock.calls as unknown[][])[0][0] as { variables: { input: Sent } }).variables
    .input

describe('RequisitionForm: purpose Direct Supply', () => {
  it('is offered as a purpose, between Project Supply and Manufacturing', () => {
    mount()
    const options = screen
      .getAllByRole('radio')
      .map((o) => [o.getAttribute('value'), o.getAttribute('aria-labelledby') && document.getElementById(o.getAttribute('aria-labelledby') ?? '')?.textContent])
    expect(options).toContainEqual(['direct_supply', 'Direct Supply'])
    const values = options.map((o) => o[0])
    expect(values.indexOf('direct_supply')).toBe(values.indexOf('project') + 1)
  })

  it('asks for a project and shows the jobsite as a fixed destination, not a choice', () => {
    const { container } = chooseDirectSupply()
    expect(screen.getByText(/project \*/i)).toBeInTheDocument()
    expect(screen.getByText('PRJ-001 — Erbil Tower')).toBeInTheDocument()
    const destination = destinationSelect(container)
    expect(destination).toBeDisabled()
    expect(destination).toHaveValue('jobsite')
    expect([...destination.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual(
      ['jobsite'],
    )
    expect(screen.getByText(t('req.form.directSupplyAlwaysDelivered'))).toBeInTheDocument()
    // Project Supply's "Delivery Destination *" is a required choice; this one is not.
    expect(screen.queryByText(/delivery destination \*/i)).not.toBeInTheDocument()
  })

  it('gives every line a currency box, starting on IQD, and no other purpose has one', () => {
    const { container } = chooseDirectSupply()
    const boxes = currencySelects(container)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toHaveValue('IQD')
    expect([...boxes[0].querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      'IQD',
      'USD',
      'EUR',
      'TRY',
      'AED',
    ])
    choosePurpose(t('req.form.projectSupply'))
    expect(currencySelects(container)).toHaveLength(0)
    choosePurpose(t('req.form.generalStock'))
    expect(currencySelects(container)).toHaveLength(0)
  })

  it('starts a new line on the currency of the one before it', () => {
    const { container } = chooseDirectSupply()
    fireEvent.change(currencySelects(container)[0], { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    expect(currencySelects(container).map((s) => s.value)).toEqual(['USD', 'USD'])
  })

  it('totals each currency on its own and never adds one to another', () => {
    const { container } = chooseDirectSupply()
    typeLine(container, 0, { description: 'Pipe', qty: '10', price: '12.5' })
    fireEvent.change(currencySelects(container)[0], { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    typeLine(container, 1, { description: 'Valve', qty: '2', price: '10' })
    fireEvent.change(currencySelects(container)[1], { target: { value: 'IQD' } })
    expect(screen.getByText('125 USD · 20 IQD')).toBeInTheDocument()
    expect(screen.queryByText('145')).not.toBeInTheDocument()
  })

  it('says it goes straight to approval', () => {
    chooseDirectSupply()
    expect(screen.getByText(t('req.form.directSupplySubmitHint'))).toBeInTheDocument()
  })

  it('does not create one with no project', () => {
    const { container } = chooseDirectSupply({ project: false })
    typeLine(container, 0, { description: 'Pipe', qty: '1', price: '5' })
    submit()
    expect(createRequisition).not.toHaveBeenCalled()
    expect(toasts()).toContain(t('req.form.pleaseSelectAProject'))
  })

  it('does not create one while a line has no price, and says why', () => {
    const { container } = chooseDirectSupply()
    typeLine(container, 0, { description: 'Pipe', qty: '1', price: '0' })
    submit()
    expect(createRequisition).not.toHaveBeenCalled()
    expect(toasts()).toContain(t('req.form.directSupplyEveryLineNeedsAPrice'))
  })

  it('does not create one while a line has no quantity', () => {
    const { container } = chooseDirectSupply()
    typeLine(container, 0, { description: 'Pipe', qty: '0', price: '5' })
    submit()
    expect(createRequisition).not.toHaveBeenCalled()
    expect(toasts()).toContain(t('req.form.directSupplyEveryLineNeedsAPrice'))
  })

  it("sends the project, the typed price and each line's own currency, and no destination", async () => {
    const { container } = chooseDirectSupply()
    typeLine(container, 0, { description: 'Pipe', qty: '10', price: '12.5' })
    fireEvent.change(currencySelects(container)[0], { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    typeLine(container, 1, { description: 'Valve', qty: '2', price: '10' })
    fireEvent.change(currencySelects(container)[1], { target: { value: 'IQD' } })
    submit()
    await waitFor(() => {
      expect(createRequisition).toHaveBeenCalledTimes(1)
    })
    const input = sentInput()
    expect(input.purpose).toBe('direct_supply')
    expect(input.project_id).toBe('proj-1')
    expect(input.delivery_destination).toBeUndefined()
    expect(input.lines).toMatchObject([
      { description: 'Pipe', qty: 10, unit_price: 12.5, requested_currency_code: 'USD' },
      { description: 'Valve', qty: 2, unit_price: 10, requested_currency_code: 'IQD' },
    ])
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-new')
    })
  })

  it('does not send a line currency for any other purpose', async () => {
    const { container } = mount('/procurement/requisitions/new?projectId=proj-1')
    expect(purposeCard(t('req.form.projectSupply'))).toBeChecked()
    typeLine(container, 0, { description: 'Pipe', qty: '1', price: '5' })
    fireEvent.change(destinationSelectFor(container), { target: { value: 'jobsite' } })
    submit()
    await waitFor(() => {
      expect(createRequisition).toHaveBeenCalledTimes(1)
    })
    expect(sentInput().purpose).toBe('project')
    expect(sentInput().lines[0].requested_currency_code).toBeUndefined()
    expect(sentInput().delivery_destination).toBe('jobsite')
  })
})

// Project Supply's own destination box (a choice, with the empty "select" entry).
function destinationSelectFor(c: HTMLElement): HTMLSelectElement {
  const el = selects(c).find((s) => s.querySelector('option[value="inventory"]'))
  if (!el) throw new Error('no delivery destination box on the form')
  return el
}
