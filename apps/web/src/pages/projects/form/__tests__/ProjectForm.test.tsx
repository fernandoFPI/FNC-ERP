// The new-RFQ / edit-project form after Budget Amount was replaced by withholding tax (WHT).
//
//   * Budget Amount is gone (nothing sends budgetAmount any more; an edit keeps the budget the project has).
//   * A Withholding Tax block carries the three settings an invoice has (applies, scenario, rate), and shows
//     the estimate, Bid Price x rate, while the Bid Price is typed.
//   * The one Currency selector labels the Bid Price as well, so the tax carries the right currency.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import ProjectForm from '../ProjectForm'

// What the form hands to a mutation. Typed, so the tests read the call without casts.
interface MutationCall {
  variables: { id?: string; input: Record<string, unknown> }
}
const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  createRFQ: vi.fn<[MutationCall], Promise<unknown>>(),
  updateProject: vi.fn<[MutationCall], Promise<unknown>>(),
  get: vi.fn(),
}))
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mocks.useQuery(...args),
    useMutation: (doc: { definitions: { name?: { value: string } }[] }) => [
      doc.definitions[0]?.name?.value === 'CreateRFQ' ? mocks.createRFQ : mocks.updateProject,
      { loading: false },
    ],
  }
})
vi.mock('../../../../lib/axios', () => ({ api: { get: mocks.get } }))

const PROJECT = {
  id: 'p-1',
  code: 'PRJ-2026-0007',
  name: 'Tagline Rope',
  status: 'ongoing',
  lifecyclePhase: 'scope_review',
  projectType: 'construction',
  contractName: null,
  projectLocation: null,
  clientName: 'TAQA',
  clientContact: null,
  projectValue: 1000,
  budgetAmount: 5000,
  budgetCurrency: 'USD',
  projectValueCurrency: 'IQD', // the legacy label the old form left behind
  plannedStartDate: null,
  plannedEndDate: null,
  description: null,
  receivingDate: '2026-11-01',
  submissionDate: '2026-11-20',
  submissionTime: null,
  siteVisitDate: null,
  siteVisitTime: null,
  questionDate: null,
  questionTime: null,
  rfqEstimatedCost: null,
  managerId: null,
  whtApplies: false,
  whtScenario: null,
  whtRate: 0,
  whtAmount: null,
}

function renderForm(path = '/projects/new') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/new" element={<ProjectForm />} />
          <Route path="/projects/:id/edit" element={<ProjectForm />} />
          <Route path="/projects/:id" element={<div>project detail page</div>} />
          <Route path="/projects" element={<div>projects list page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

/** The text input under a field's label (the form's labels are not tied to their inputs). */
function inputOf(label: string): HTMLInputElement {
  const el = screen.getByText(label).closest('div')?.querySelector('input')
  if (!el) throw new Error(`no input under "${label}"`)
  return el
}
const type = (label: string, value: string) => {
  fireEvent.change(inputOf(label), { target: { value } })
}
const tickWht = () => {
  fireEvent.click(screen.getByLabelText('Apply WHT to this project'))
}
const estimate = () => screen.getByTestId('estimated-wht').textContent

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText('Enter project name'), {
    target: { value: 'Pipe Supply' },
  })
  type('Receiving Date *', '2026-11-10')
  type('Submission Deadline *', '2026-11-30')
}
async function submitNew() {
  fireEvent.click(screen.getByRole('button', { name: 'Create RFQ' }))
  await waitFor(() => {
    expect(mocks.createRFQ).toHaveBeenCalledTimes(1)
  })
  const call = mocks.createRFQ.mock.calls.at(0)
  if (!call) throw new Error('createRFQ was not called')
  return call[0].variables.input
}

// The form re-reads its fields in an effect that depends on the query's `data`, so the mock must hand back the SAME
// object on every render: a fresh one each time loops the component until the worker runs out of memory.
function answerProject(over: Record<string, unknown> = {}) {
  const result = { data: { project: { ...PROJECT, ...over } }, loading: false }
  const skipped = { data: undefined, loading: false }
  mocks.useQuery.mockImplementation((_doc: unknown, opts?: { skip?: boolean }) =>
    opts?.skip ? skipped : result,
  )
}

beforeEach(() => {
  mocks.useQuery.mockReset()
  answerProject()
  mocks.createRFQ.mockReset().mockResolvedValue({ data: { createRFQ: { id: 'new-1' } } })
  mocks.updateProject.mockReset().mockResolvedValue({ data: {} })
  mocks.get.mockReset().mockResolvedValue({ data: [] })
})

describe('Financials: Budget Amount is gone', () => {
  it('shows Bid Price and Internal Cost Estimate, and no Budget Amount', () => {
    renderForm()
    expect(screen.getByText('Bid Price (Project Value)')).toBeInTheDocument()
    expect(screen.getByText('Internal Cost Estimate')).toBeInTheDocument()
    expect(screen.queryByText(/budget amount/i)).not.toBeInTheDocument()
  })

  it('keeps the Currency selector, which now labels the Bid Price too', () => {
    renderForm()
    expect(screen.getByText('Currency')).toBeInTheDocument()
  })
})

describe('the withholding tax block', () => {
  it('starts off: a hint, and no scenario or rate to fill in', () => {
    renderForm()
    expect(screen.getByLabelText('Apply WHT to this project')).not.toBeChecked()
    expect(screen.getByText(/No withholding tax on this project/)).toBeInTheDocument()
    expect(screen.queryByText('WHT scenario')).not.toBeInTheDocument()
    expect(screen.queryByText('WHT rate (%)')).not.toBeInTheDocument()
  })

  it('ticking it shows the scenario (client withholds), a 3% rate like the invoice wizard, and no estimate yet', () => {
    renderForm()
    tickWht()
    expect(screen.getByText('WHT scenario')).toBeInTheDocument()
    expect(screen.getByText('Client withholds & pays tax authority')).toBeInTheDocument()
    expect(inputOf('WHT rate (%)').value).toBe('3')
    expect(estimate()).toBe('—')
    expect(screen.getByText('Enter the Bid Price to see the amount')).toBeInTheDocument()
  })

  it('the estimate follows the Bid Price, the rate and the currency as they are typed', () => {
    renderForm()
    tickWht()
    type('Bid Price (Project Value)', '200000')
    expect(estimate()).toMatch(/^6,?000(\.00)? IQD$/)
    expect(screen.getByText('Bid Price × rate')).toBeInTheDocument()

    type('WHT rate (%)', '5')
    expect(estimate()).toMatch(/^10,?000(\.00)? IQD$/)

    fireEvent.click(screen.getAllByText('IQD')[0])
    fireEvent.mouseDown(screen.getByText('USD'))
    expect(estimate()).toMatch(/ USD$/)
  })
})

describe('creating an RFQ', () => {
  it('sends the WHT settings, the currency on the Bid Price, and no Budget Amount', async () => {
    renderForm()
    fillRequired()
    type('Bid Price (Project Value)', '200000')
    tickWht()
    type('WHT rate (%)', '3.25')
    fireEvent.click(screen.getAllByText('IQD')[0])
    fireEvent.mouseDown(screen.getByText('USD'))
    const input = await submitNew()
    expect(input).toMatchObject({
      name: 'Pipe Supply',
      projectValue: 200000,
      budgetCurrency: 'USD',
      projectValueCurrency: 'USD',
      whtApplies: true,
      whtScenario: 'client_withholds',
      whtRate: 0.0325,
    })
    expect('budgetAmount' in input).toBe(false)
    await waitFor(() => {
      expect(screen.getByText('project detail page')).toBeInTheDocument()
    })
  })

  it('sends the other scenario when it is chosen', async () => {
    renderForm()
    fillRequired()
    tickWht()
    fireEvent.click(screen.getByText('Client withholds & pays tax authority'))
    fireEvent.mouseDown(screen.getByText('Client pays full — FNC remits annually'))
    const input = await submitNew()
    expect(input).toMatchObject({ whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.03 })
  })

  it('with WHT off it sends off, no scenario and a zero rate', async () => {
    renderForm()
    fillRequired()
    tickWht()
    type('WHT rate (%)', '7')
    tickWht() // changed their mind
    const input = await submitNew()
    expect(input).toMatchObject({
      whtApplies: false,
      whtScenario: null,
      whtRate: 0,
      projectValueCurrency: 'IQD',
    })
  })

  it('refuses a rate the server would refuse, says so, and sends nothing', () => {
    renderForm()
    fillRequired()
    tickWht()
    for (const bad of ['150', '3.456', '-1', '']) {
      type('WHT rate (%)', bad)
      fireEvent.click(screen.getByRole('button', { name: 'Create RFQ' }))
      expect(screen.getByText('0 to 100, up to 2 decimals'), `"${bad}"`).toBeInTheDocument()
      expect(mocks.createRFQ).not.toHaveBeenCalled()
    }
  })

  it('a bad rate does not matter while WHT is off', async () => {
    renderForm()
    fillRequired()
    tickWht()
    type('WHT rate (%)', '999')
    tickWht()
    await submitNew()
  })
})

describe('editing a project', () => {
  const editWith = (over: Record<string, unknown>) => {
    answerProject(over)
    renderForm('/projects/p-1/edit')
  }
  const submitEdit = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => {
      expect(mocks.updateProject).toHaveBeenCalledTimes(1)
    })
    const call = mocks.updateProject.mock.calls.at(0)
    if (!call) throw new Error('updateProject was not called')
    return call[0].variables
  }

  it('opens with the project’s WHT settings and the estimate they come to', async () => {
    editWith({ whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.0325, whtAmount: 32.5 })
    await waitFor(() => {
      expect(screen.getByLabelText('Apply WHT to this project')).toBeChecked()
    })
    expect(inputOf('WHT rate (%)').value).toBe('3.25')
    expect(screen.getByText('Client pays full — FNC remits annually')).toBeInTheDocument()
    expect(estimate()).toMatch(/^32\.5(0)? USD$/)
  })

  it('a project with WHT off opens unticked, and ticking it starts at 3%', async () => {
    editWith({})
    await waitFor(() => {
      expect(screen.getByDisplayValue('Tagline Rope')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Apply WHT to this project')).not.toBeChecked()
    tickWht()
    expect(inputOf('WHT rate (%)').value).toBe('3')
  })

  it('saving sends the settings and the currency, never a Budget Amount (so the stored budget is kept)', async () => {
    editWith({ whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.0325 })
    await waitFor(() => {
      expect(screen.getByLabelText('Apply WHT to this project')).toBeChecked()
    })
    type('WHT rate (%)', '4')
    const v = await submitEdit()
    expect(v.id).toBe('p-1')
    expect(v.input).toMatchObject({
      whtApplies: true,
      whtScenario: 'fnc_pays',
      whtRate: 0.04,
      budgetCurrency: 'USD',
      projectValueCurrency: 'USD',
    })
    expect('budgetAmount' in v.input).toBe(false)
    await waitFor(() => {
      expect(screen.getByText('project detail page')).toBeInTheDocument()
    })
  })

  it('unticking WHT and saving turns it off', async () => {
    editWith({ whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.03 })
    await waitFor(() => {
      expect(screen.getByLabelText('Apply WHT to this project')).toBeChecked()
    })
    tickWht()
    const v = await submitEdit()
    expect(v.input).toMatchObject({ whtApplies: false, whtScenario: null, whtRate: 0 })
  })
})
