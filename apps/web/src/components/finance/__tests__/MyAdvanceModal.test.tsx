// The popup a person gets for their OWN advance request, and how a rejected one is corrected and sent again, the same
// road a rejected expense claim takes (POST /finance/advances/:id/revise; the server decides who may, `can_revise`).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { MyAdvanceModal, type MyAdvance } from '../MyAdvanceModal'
import type * as ApolloClientModule from '@apollo/client'

const apiPost = vi.fn()
vi.mock('../../../lib/axios', () => ({
  api: { post: (...a: unknown[]): unknown => apiPost(...a), get: vi.fn() },
}))

// One stable result object: a component whose render depends on a fresh object each call would loop.
const projectsResult = {
  data: {
    projects: {
      data: [
        { id: 'p1', code: 'PRJ-1', name: 'Tower' },
        { id: 'p2', code: 'PRJ-2', name: 'Bridge' },
      ],
    },
  },
  loading: false,
}
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: () => projectsResult }
})

const base: MyAdvance = {
  id: 'adv-1',
  advance_number: 'ADV-0007',
  purpose: 'Site fuel',
  project_id: 'p1',
  project_code: 'PRJ-1',
  project_name: 'Tower',
  amount: '900000.0000',
  currency_code: 'IQD',
  status: 'rejected',
  rejection_reason: 'Amount is too high',
  can_revise: true,
}

function mount(advance: MyAdvance | null = base, statusLabel = 'Rejected') {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const ui = (a: MyAdvance | null) => (
    <ThemeProvider>
      <MyAdvanceModal
        advance={a}
        statusLabel={statusLabel}
        statusVariant="danger"
        onClose={onClose}
        onChanged={onChanged}
      />
    </ThemeProvider>
  )
  const view = render(ui(advance))
  return {
    onClose,
    onChanged,
    rerenderWith: (a: MyAdvance | null) => {
      view.rerender(ui(a))
    },
  }
}

const toasts = () => useToastStore.getState().toasts.map((t) => `${t.variant}: ${t.message}`)
const openEditor = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Edit & resubmit' }))
}
const send = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
}

beforeEach(() => {
  apiPost.mockReset().mockResolvedValue({ data: {} })
  useToastStore.setState({ toasts: [] })
})

describe('MyAdvanceModal: reading it', () => {
  it('shows the number, status, amount, project and the reason it was asked for', () => {
    mount(
      { ...base, status: 'pending_approval', can_revise: false, rejection_reason: null },
      'Pending Approval',
    )
    expect(screen.getByText('ADV-0007')).toBeInTheDocument()
    expect(screen.getByText('Pending Approval')).toBeInTheDocument()
    expect(screen.getByText('PRJ-1 — Tower')).toBeInTheDocument()
    expect(screen.getByText('Site fuel')).toBeInTheDocument()
  })

  it('says there is no reason when none was given', () => {
    mount(
      { ...base, purpose: null, status: 'pending_approval', can_revise: false },
      'Pending Approval',
    )
    expect(screen.getByText('No reason given')).toBeInTheDocument()
  })

  it.each([
    ['pending_approval', /waiting for a manager to approve it/i],
    ['pending_issue', /approved\. waiting for the cashbox handler to pay it out/i],
    ['approved', /paid out\. you can settle it with your expenses/i],
  ])('tells the person where a %s request is', (status, hint) => {
    mount({ ...base, status, can_revise: false, rejection_reason: null })
    expect(screen.getByText(hint)).toBeInTheDocument()
  })

  it("a rejected request shows the manager's reason and how to continue, and offers Edit & resubmit", () => {
    mount()
    expect(screen.getByText('Amount is too high')).toBeInTheDocument()
    expect(screen.getByText(/change what the manager asked for/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit & resubmit' })).toBeInTheDocument()
  })

  it('shows the reason but no Edit button to someone who may not revise it', () => {
    mount({ ...base, can_revise: false })
    expect(screen.getByText('Amount is too high')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit & resubmit' })).not.toBeInTheDocument()
    expect(screen.queryByText(/change what the manager asked for/i)).not.toBeInTheDocument()
  })

  it('offers no Edit button for a request that is not rejected, even if can_revise were true', () => {
    // the popup must not invite an edit the server will refuse (revise accepts only a rejected request)
    mount(
      { ...base, status: 'pending_approval', can_revise: true, rejection_reason: null },
      'Pending Approval',
    )
    expect(screen.queryByRole('button', { name: 'Edit & resubmit' })).not.toBeInTheDocument()
  })

  it('renders nothing for no advance', () => {
    mount(null)
    expect(screen.queryByText('ADV-0007')).not.toBeInTheDocument()
  })
})

describe('MyAdvanceModal: editing and sending it again', () => {
  it('opens the form with the current amount, currency and reason filled in', () => {
    mount()
    openEditor()
    expect(screen.getByDisplayValue('900000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Site fuel')).toBeInTheDocument()
    expect(screen.getByDisplayValue('IQD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
    // the hint about where it is stops competing with the form
    expect(screen.queryByRole('button', { name: 'Edit & resubmit' })).not.toBeInTheDocument()
  })

  it('refuses to send it again unchanged, says what to change, and posts nothing', () => {
    mount()
    openEditor()
    send()
    expect(apiPost).not.toHaveBeenCalled()
    expect(toasts()).toContain(
      'danger: Change the amount, currency, reason or project before sending it again.',
    )
  })

  it('sends the corrected request to revise and tells the page', async () => {
    const { onChanged } = mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('900000'), { target: { value: '300000' } })
    fireEvent.change(screen.getByDisplayValue('Site fuel'), {
      target: { value: 'Site fuel, 2 weeks' },
    })
    send()
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1)
    })
    expect(apiPost).toHaveBeenCalledWith('/finance/advances/adv-1/revise', {
      amount: 300000,
      currency_code: 'IQD',
      purpose: 'Site fuel, 2 weeks',
      project_id: 'p1',
    })
    expect(toasts()).toContain('success: Advance request sent again')
  })

  it('a change of reason alone is enough', async () => {
    const { onChanged } = mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('Site fuel'), {
      target: { value: 'Generator diesel' },
    })
    send()
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith(
      '/finance/advances/adv-1/revise',
      expect.objectContaining({ amount: 900000, purpose: 'Generator diesel' }),
    )
  })

  it('a change of project alone is enough, and the newly chosen project is what is sent', async () => {
    const { onChanged } = mount()
    openEditor()
    // the project box shows the current project (the header shows it too: the box is the later one)
    const shown = screen.getAllByText('PRJ-1 — Tower')
    fireEvent.click(shown[shown.length - 1])
    fireEvent.mouseDown(screen.getByText('PRJ-2 — Bridge'))
    send()
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith(
      '/finance/advances/adv-1/revise',
      expect.objectContaining({ amount: 900000, project_id: 'p2' }),
    )
  })

  it('taking the project off sends none (null)', async () => {
    mount()
    openEditor()
    const shown = screen.getAllByText('PRJ-1 — Tower')
    fireEvent.click(shown[shown.length - 1])
    fireEvent.mouseDown(screen.getByText('No project'))
    send()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect((apiPost.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
      project_id: null,
    })
  })

  it('a change of currency alone is enough', async () => {
    const { onChanged } = mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('IQD'), { target: { value: 'USD' } })
    send()
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith(
      '/finance/advances/adv-1/revise',
      expect.objectContaining({ amount: 900000, currency_code: 'USD' }),
    )
  })

  it('a request with no project sends no project (null), not an empty string', async () => {
    mount({ ...base, project_id: null, project_code: null, project_name: null })
    openEditor()
    fireEvent.change(screen.getByDisplayValue('900000'), { target: { value: '800000' } })
    send()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect((apiPost.mock.calls[0] as [string, Record<string, unknown>])[1]).toMatchObject({
      project_id: null,
    })
  })

  it.each(['0', '', '-5'])('refuses an amount of "%s" before asking the server', (value) => {
    mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('900000'), { target: { value } })
    send()
    expect(apiPost).not.toHaveBeenCalled()
    expect(toasts()).toContain('danger: Enter the advance amount')
  })

  it('a refusal from the server keeps the form open with what was typed, and shows the reason', async () => {
    apiPost.mockRejectedValue({
      response: {
        data: {
          error: { message: 'Only the person who filed this advance, or an admin, can revise it' },
        },
      },
    })
    const { onChanged } = mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('900000'), { target: { value: '300000' } })
    send()
    await waitFor(() => {
      expect(toasts()).toContain(
        'danger: Only the person who filed this advance, or an admin, can revise it',
      )
    })
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('300000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeEnabled()
  })

  it('falls back to a plain message when the server gives none', async () => {
    apiPost.mockRejectedValue(new Error('Network Error'))
    mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('900000'), { target: { value: '1' } })
    send()
    await waitFor(() => {
      expect(toasts()).toContain('danger: Could not send the request again')
    })
  })

  it('Cancel leaves the form without sending and the request is shown as it was', () => {
    mount()
    openEditor()
    fireEvent.change(screen.getByDisplayValue('900000'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(apiPost).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit & resubmit' })).toBeInTheDocument()
    expect(screen.getByText('Site fuel')).toBeInTheDocument()
  })

  it('closing the popup ends the edit: the same request reopens in read mode', () => {
    const { rerenderWith } = mount()
    openEditor()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
    rerenderWith(null) // closed
    rerenderWith(base) // opened again
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit & resubmit' })).toBeInTheDocument()
  })

  it("opening a different request starts in read mode, not in the previous one's form", () => {
    const { rerenderWith } = mount()
    openEditor()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
    rerenderWith({ ...base, id: 'adv-2', advance_number: 'ADV-0008' })
    expect(screen.getByText('ADV-0008')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument()
  })
})
