// Purpose: Advance on the New Requisition form. An advance is a request for MONEY, filed the way an Expense is: no branch,
// priority, receiver or delivery date, no lines, and it goes to the finance self-service endpoint
// (POST /finance/advances/request-self) instead of creating a requisition. The manager then approves it and the cashbox
// handler pays it out.
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

const apiPost = vi.fn()
const apiGet = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: {
    post: (...a: unknown[]): unknown => apiPost(...a),
    get: (...a: unknown[]): unknown => apiGet(...a),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const createRequisition = vi.fn()
const t = (key: string) => i18n.t(key)

function mount() {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/new']}>
      <ThemeProvider>
        <RequisitionFormLazy />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
let RequisitionFormLazy: React.ComponentType = () => null

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
  apiPost.mockResolvedValue({ data: { id: 'adv-1' } })
  apiGet.mockResolvedValue({ data: [] })
  RequisitionFormLazy = (await import('../RequisitionForm')).default
})

const purposeSelect = (c: HTMLElement) => c.querySelectorAll('select')[0]
const currencySelect = (c: HTMLElement) => c.querySelectorAll('select')[1]
function amountInput(c: HTMLElement): HTMLInputElement {
  const el = c.querySelector<HTMLInputElement>('input[type="number"]')
  if (!el) throw new Error('no amount box on the form')
  return el
}
function reasonBox(c: HTMLElement): HTMLTextAreaElement {
  const el = c.querySelector<HTMLTextAreaElement>('textarea')
  if (!el) throw new Error('no reason box on the form')
  return el
}
const toasts = () => useToastStore.getState().toasts.map((x) => `${x.variant}: ${x.message}`)
const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: /create requisition/i }))
}

function chooseAdvance() {
  const view = mount()
  fireEvent.change(purposeSelect(view.container), { target: { value: 'advance' } })
  return view
}

describe('RequisitionForm: purpose Advance', () => {
  it('offers Advance as a purpose', () => {
    const { container } = mount()
    const options = [...purposeSelect(container).querySelectorAll('option')].map((o) =>
      o.getAttribute('value'),
    )
    expect(options).toEqual(['stock', 'project', 'manufacturing', 'expense', 'advance'])
  })

  it('asks for an amount, currency, project and the reason, and nothing about goods', () => {
    const { container } = chooseAdvance()
    expect(amountInput(container)).toBeInTheDocument()
    // the amount's label, and the summary tile beside the form that shows it
    expect(screen.getAllByText(t('req.form.advanceAmount'))).toHaveLength(2)
    expect(screen.getByText(t('req.form.projectOptional'))).toBeInTheDocument()
    expect(screen.getByText(t('req.form.advanceReason'))).toBeInTheDocument()
    expect(currencySelect(container)).toHaveValue('IQD')
    // none of the things a goods requisition asks for
    expect(screen.queryByText(t('req.form.priority'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.form.receivedBy'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.form.expectedDeliveryOptional'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.form.branch2'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.form.notes'))).not.toBeInTheDocument()
  })

  it('has no lines to fill in', () => {
    chooseAdvance()
    expect(screen.queryByText(t('req.form.lines'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.form.addEachItemYouNeedGl'))).not.toBeInTheDocument()
  })

  it('switching back to another purpose brings the lines and the usual fields back', () => {
    const { container } = chooseAdvance()
    fireEvent.change(purposeSelect(container), { target: { value: 'stock' } })
    expect(screen.getByText(t('req.form.lines'))).toBeInTheDocument()
    expect(screen.getAllByText(t('req.form.priority')).length).toBeGreaterThan(0) // the field and the summary tile
    expect(screen.queryByText(t('req.form.advanceAmount'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.form.advanceReason'))).not.toBeInTheDocument()
  })

  it('the summary shows the typed amount in the chosen currency and explains what happens next', () => {
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value: '250000' } })
    fireEvent.change(currencySelect(container), { target: { value: 'USD' } })
    expect(screen.getByText('250,000 USD')).toBeInTheDocument()
    expect(screen.getByText(t('req.form.advanceSubmitHint'))).toBeInTheDocument()
  })

  it('sends the request to the finance endpoint with the amount, currency, reason and project, and goes back to the list', async () => {
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value: '250000' } })
    fireEvent.change(currencySelect(container), { target: { value: 'USD' } })
    fireEvent.change(reasonBox(container), {
      target: { value: '  Site fuel for two weeks  ' },
    })
    submit()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions')
    })
    expect(apiPost).toHaveBeenCalledTimes(1)
    expect(apiPost).toHaveBeenCalledWith('/finance/advances/request-self', {
      amount: 250000,
      currency_code: 'USD',
      purpose: 'Site fuel for two weeks',
      project_id: undefined,
    })
    expect(toasts()).toContain(`success: ${t('req.form.advanceRequestSubmittedForApproval')}`)
  })

  it('a project chosen on the form goes with the request', async () => {
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value: '1000' } })
    // nothing chosen yet: the box shows its "select" entry; open it and pick the project
    fireEvent.click(screen.getByText(t('req.form.selectProject')))
    fireEvent.mouseDown(screen.getByText('PRJ-001 — Erbil Tower'))
    submit()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect((apiPost.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
      amount: 1000,
      project_id: 'proj-1',
    })
  })

  it('an empty reason is sent as none, not as an empty string', async () => {
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value: '1000' } })
    submit()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect((apiPost.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
      amount: 1000,
      currency_code: 'IQD',
      purpose: undefined,
    })
  })

  it('never creates a requisition for an advance', async () => {
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value: '1000' } })
    submit()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(createRequisition).not.toHaveBeenCalled()
  })

  it.each(['', '0'])('refuses an amount of "%s": says so and sends nothing', (value) => {
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value } })
    submit()
    expect(apiPost).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(toasts()).toContain(`danger: ${t('req.form.enterTheAdvanceAmount')}`)
  })

  it('a negative amount is stopped by the box itself (min 0) before anything is sent', () => {
    const { container } = chooseAdvance()
    expect(amountInput(container)).toHaveAttribute('min', '0')
    fireEvent.change(amountInput(container), { target: { value: '-100' } })
    submit()
    expect(apiPost).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("shows the server's reason when it refuses, and stays on the form with what was typed", async () => {
    apiPost.mockRejectedValue({
      response: { data: { error: { message: 'No default cash account configured for IQD' } } },
    })
    const { container } = chooseAdvance()
    fireEvent.change(amountInput(container), { target: { value: '5000' } })
    submit()
    await waitFor(() => {
      expect(toasts()).toContain('danger: No default cash account configured for IQD')
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(amountInput(container)).toHaveValue(5000)
  })

  // The options the form passed to its most recent Projects query.
  type QueryCall = [{ definitions?: { name?: { value?: string } }[] }, { skip?: boolean }]
  const lastProjectsOptions = (): { skip?: boolean } | undefined => {
    const calls = (mockUseQuery.mock.calls as QueryCall[]).filter(([doc]) =>
      doc.definitions?.some((d) => d.name?.value === 'Projects'),
    )
    return calls[calls.length - 1]?.[1]
  }

  it('loads the project list for an advance, so a project can be chosen', () => {
    chooseAdvance()
    expect(lastProjectsOptions()).toMatchObject({ skip: false })
  })

  it('does not load the project list for General Stock', () => {
    mount()
    expect(lastProjectsOptions()).toMatchObject({ skip: true })
  })
})
