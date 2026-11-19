// "Before you create it": the card beside the New Requisition form lists what the request still needs, and pressing
// Create names the first thing missing. Both come from ONE list in the form, so these tests pin that they agree: for
// every kind of request, the toast Create shows is the message of the first item the card still lists as to do, and a
// request with nothing left to do is created.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { useToastStore } from '../../../../store/toastStore'
import { useTourStore } from '../../../../store/tourStore'
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

const apiPost = vi.fn()
const apiGet = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: {
    post: (...a: unknown[]): unknown => apiPost(...a),
    get: (...a: unknown[]): unknown => apiGet(...a),
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const createRequisition = vi.fn()
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options)

let FormLazy: React.ComponentType = () => null
function mount(path = '/procurement/requisitions/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <FormLazy />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

let branches: { id: string; name: string; isActive: boolean }[] = []
const emptyResult = { data: undefined, loading: false }
const projectsResult = {
  data: { projects: { data: [{ id: 'proj-1', code: 'PRJ-001', name: 'Erbil Tower' }] } },
  loading: false,
}
const mosResult = {
  data: { manufacturingOrders: [{ id: 'mo-1', mo_number: 'MO-1', product_name: 'Frame' }] },
  loading: false,
}

beforeEach(async () => {
  vi.clearAllMocks()
  branches = []
  useToastStore.setState({ toasts: [] })
  mockUseQuery.mockImplementation(
    (doc: { definitions?: { kind?: string; name?: { value?: string } }[] }) => {
      const op = doc.definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (op === 'Projects') return projectsResult
      if (op === 'ManufacturingOrders') return mosResult
      if (op === 'CompanyBranches') return { data: { companyBranches: branches }, loading: false }
      return emptyResult
    },
  )
  createRequisition.mockResolvedValue({ data: { createRequisition: { id: 'req-new' } } })
  mockUseMutation.mockReturnValue([createRequisition, { loading: false }])
  apiPost.mockResolvedValue({ data: { id: 'adv-1' } })
  apiGet.mockResolvedValue({ data: [] })
  FormLazy = (await import('../RequisitionForm')).default
})

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

const card = () => {
  const el = document.querySelector<HTMLElement>('[data-tour="req-checklist"]')
  if (!el) throw new Error('the "Before you create it" card is not on the page')
  return el
}
// An item's text is its label, then " — done" / " — still to do" for a screen reader: keep the label.
const labelsOf = (selector: string) =>
  [...card().querySelectorAll(selector)].map((li) => li.textContent.replace(/\s—.*$/, ''))
const openItems = () => labelsOf('li[data-done="false"]')
const doneItems = () => labelsOf('li[data-done="true"]')
const choose = (name: string) => {
  fireEvent.click(screen.getByRole('radio', { name }))
}
const create = () => {
  fireEvent.click(screen.getByRole('button', { name: /create requisition/i }))
}
const toasts = () => useToastStore.getState().toasts.map((x) => x.message)
const typeLine = (description: string) => {
  fireEvent.change(screen.getAllByPlaceholderText('Description')[0], {
    target: { value: description },
  })
}

describe('the "Before you create it" card', () => {
  it('is on the page for every purpose, titled and starting with what is missing', () => {
    mount()
    expect(within(card()).getByText(t('req.form.beforeYouCreate'))).toBeInTheDocument()
    expect(openItems()).toEqual([t('req.form.checkLines')])
    expect(
      within(card()).getByText(t('req.form.checklistProgress', { done: 0, total: 1 })),
    ).toBeInTheDocument()
  })

  it('General stock: one thing to do, then ready', () => {
    mount()
    typeLine('Cement')
    expect(openItems()).toEqual([])
    expect(doneItems()).toEqual([t('req.form.checkLines')])
    expect(within(card()).getByText(t('req.form.checklistReady'))).toBeInTheDocument()
  })

  it('Project supply asks for a project, a destination and a line, in that order', () => {
    mount()
    choose(t('req.form.projectSupply'))
    expect(openItems()).toEqual([
      t('req.form.checkProject'),
      t('req.form.checkDestination'),
      t('req.form.checkLines'),
    ])
    expect(
      within(card()).getByText(t('req.form.checklistProgress', { done: 0, total: 3 })),
    ).toBeInTheDocument()
  })

  it('ticks the project and the destination off as they are chosen', () => {
    mount('/procurement/requisitions/new?projectId=proj-1')
    expect(doneItems()).toEqual([t('req.form.checkProject')])
    const destination = [...document.querySelectorAll('select')].find((s) =>
      s.querySelector('option[value="inventory"]'),
    )
    if (!destination) throw new Error('no destination box')
    fireEvent.change(destination, { target: { value: 'inventory' } })
    expect(doneItems()).toEqual([t('req.form.checkProject'), t('req.form.checkDestination')])
    expect(openItems()).toEqual([t('req.form.checkLines')])
  })

  it('Manufacturing asks for the order; Direct supply for a project and a price on every line', () => {
    mount()
    choose(t('req.form.manufacturingBom'))
    expect(openItems()).toEqual([t('req.form.checkMo'), t('req.form.checkLines')])
    choose(t('req.form.directSupply'))
    expect(openItems()).toEqual([
      t('req.form.checkProject'),
      t('req.form.checkLines'),
      t('req.form.checkDirectPrice'),
    ])
  })

  it('a direct supply line with a name but no price still has the price to do', () => {
    mount('/procurement/requisitions/new?projectId=proj-1')
    choose(t('req.form.directSupply'))
    typeLine('Pipe')
    expect(openItems()).toEqual([t('req.form.checkDirectPrice')])
    const numbers = [...document.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    fireEvent.change(numbers[1], { target: { value: '5' } }) // the price (the quantity is the first box)
    expect(openItems()).toEqual([])
  })

  it('asks for a branch only when the company has branches', () => {
    branches = [{ id: 'b1', name: 'Erbil', isActive: true }]
    mount()
    expect(openItems()).toEqual([t('req.form.checkBranch'), t('req.form.checkLines')])
  })

  it('Expense wants one line with a category and an amount; Advance wants an amount', () => {
    mount()
    choose(t('req.form.expense'))
    expect(openItems()).toEqual([t('req.form.checkExpenseLines')])
    choose(t('req.form.advance'))
    expect(openItems()).toEqual([t('req.form.checkAdvanceAmount')])
    const amount = document.querySelector<HTMLInputElement>('input[type="number"]')
    if (!amount) throw new Error('no amount box')
    fireEvent.change(amount, { target: { value: '5000' } })
    expect(openItems()).toEqual([])
  })

  it('the walkthrough asks for none of the things it has no real choice for', () => {
    useTourStore.getState().activate('requisition', 'Create a Requisition', 9)
    try {
      mount()
      choose(t('req.form.projectSupply'))
      expect(openItems()).toEqual([t('req.form.checkLines')])
    } finally {
      useTourStore.getState().deactivate()
    }
  })
})

describe('the bar above the bottom navigation on a phone', () => {
  const nextLine = (item: string) =>
    `${t('req.form.checklistProgress', { done: 0, total: 1 })} · ${t('req.form.checklistNext', { item })}`

  it('says how many things are done and names the next one', () => {
    setWidth(390)
    mount()
    expect(screen.getByText(nextLine(t('req.form.checkLines')))).toBeInTheDocument()
  })

  it('names the first thing that is still missing, in the order the card lists them', () => {
    setWidth(390)
    mount()
    choose(t('req.form.projectSupply'))
    expect(
      screen.getByText(
        `${t('req.form.checklistProgress', { done: 0, total: 3 })} · ${t('req.form.checklistNext', { item: t('req.form.checkProject') })}`,
      ),
    ).toBeInTheDocument()
  })

  it('says nothing once everything is done', () => {
    setWidth(390)
    mount()
    typeLine('Cement')
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument()
  })

  it('is not on a desktop, where the card beside the form says it', () => {
    mount()
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument()
  })
})

// For each kind of request: the toast Create gives is the message of the first item the card lists as to do.
describe('Create names the first thing the card still lists', () => {
  const cases: {
    name: string
    setup: () => void
    firstOpen: string
    message: string
  }[] = [
    {
      name: 'no line on a general stock request',
      setup: () => undefined,
      firstOpen: 'req.form.checkLines',
      message: 'req.form.addAtLeastOneLine',
    },
    {
      name: 'no project on a project supply request',
      setup: () => {
        choose(t('req.form.projectSupply'))
        typeLine('Rebar')
      },
      firstOpen: 'req.form.checkProject',
      message: 'req.form.pleaseSelectAProject',
    },
    {
      name: 'no manufacturing order',
      setup: () => {
        choose(t('req.form.manufacturingBom'))
        typeLine('Rebar')
      },
      firstOpen: 'req.form.checkMo',
      message: 'req.form.pleaseSelectAManufacturingOrder',
    },
    {
      name: 'no project on a direct supply request',
      setup: () => {
        choose(t('req.form.directSupply'))
        typeLine('Pipe')
      },
      firstOpen: 'req.form.checkProject',
      message: 'req.form.pleaseSelectAProject',
    },
    {
      name: 'no expense line',
      setup: () => {
        choose(t('req.form.expense'))
      },
      firstOpen: 'req.form.checkExpenseLines',
      message: 'req.form.addAtLeastOneLineWith',
    },
    {
      name: 'no advance amount',
      setup: () => {
        choose(t('req.form.advance'))
      },
      firstOpen: 'req.form.checkAdvanceAmount',
      message: 'req.form.enterTheAdvanceAmount',
    },
  ]

  it.each(cases)('$name', ({ setup, firstOpen, message }) => {
    mount()
    setup()
    expect(openItems()[0]).toBe(t(firstOpen))
    create()
    expect(toasts()).toEqual([t(message)])
    expect(createRequisition).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('names the destination once the project is there', () => {
    mount('/procurement/requisitions/new?projectId=proj-1')
    typeLine('Rebar')
    expect(openItems()).toEqual([t('req.form.checkDestination')])
    create()
    expect(toasts()).toEqual([t('req.form.pleaseSelectADeliveryDestination')])
  })

  it('names the branch first when there are branches and nothing is chosen', () => {
    branches = [{ id: 'b1', name: 'Erbil', isActive: true }]
    mount()
    typeLine('Cement')
    expect(openItems()[0]).toBe(t('req.form.checkBranch'))
    create()
    expect(toasts()).toEqual([t('req.form.pleaseSelectABranch')])
  })

  it('names the price when a direct supply line has none', () => {
    mount('/procurement/requisitions/new?projectId=proj-1')
    choose(t('req.form.directSupply'))
    typeLine('Pipe')
    create()
    expect(toasts()).toEqual([t('req.form.directSupplyEveryLineNeedsAPrice')])
    expect(createRequisition).not.toHaveBeenCalled()
  })

  it('creates the request once the card has nothing left to list', async () => {
    mount()
    typeLine('Cement')
    expect(openItems()).toEqual([])
    create()
    await waitFor(() => {
      expect(createRequisition).toHaveBeenCalledTimes(1)
    })
    expect(toasts()).not.toContain(t('req.form.addAtLeastOneLine'))
  })

  it('sends an advance once its amount is in', async () => {
    mount()
    choose(t('req.form.advance'))
    const amount = document.querySelector<HTMLInputElement>('input[type="number"]')
    if (!amount) throw new Error('no amount box')
    fireEvent.change(amount, { target: { value: '5000' } })
    create()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    expect((apiPost.mock.calls as unknown[][])[0][0]).toBe('/finance/advances/request-self')
    expect(createRequisition).not.toHaveBeenCalled()
  })
})
