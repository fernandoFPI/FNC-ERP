// The project's action buttons across the new Financing phase.
//
//   Execution  -> "End Execution" (asks first), which moves the project to Financing. It used to be "Close Project".
//   Financing  -> "Close Project", held back (with the reason) while an invoice is unpaid, and an error from the
//                 server shows up as a message instead of the button seeming to do nothing.
//   Closeout   -> nothing left to do.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { ProjectStatusBar } from '../ProjectStatusBar'

// One mock per mutation, keyed by the operation's name (the component calls useMutation 14 times).
const { mocks, mutation } = vi.hoisted(() => {
  const mocks = new Map<string, Mock>()
  const mutation = (name: string): Mock => {
    let m = mocks.get(name)
    if (!m) {
      m = vi.fn().mockResolvedValue({ data: {} })
      mocks.set(name, m)
    }
    return m
  }
  return { mocks, mutation }
})
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useMutation: (doc: { definitions: { name?: { value: string } }[] }) => [
      mutation(doc.definitions[0]?.name?.value ?? 'unknown'),
    ],
  }
})

const APPROVED_ACTIONS = ['complete', 'cancel_after_approval']

function renderBar(over: Partial<React.ComponentProps<typeof ProjectStatusBar>> = {}) {
  const onTransitioned = vi.fn()
  render(
    <ThemeProvider>
      <ProjectStatusBar
        projectId="p-1"
        status="approved"
        lifecyclePhase="execution"
        allowedActions={APPROVED_ACTIONS}
        onTransitioned={onTransitioned}
        {...over}
      />
    </ThemeProvider>,
  )
  return { onTransitioned }
}

const toasts = () => useToastStore.getState().toasts.map((t) => t.message)

beforeEach(() => {
  for (const m of mocks.values()) m.mockReset().mockResolvedValue({ data: {} })
  useToastStore.setState({ toasts: [] })
})

describe('Execution phase: End Execution', () => {
  it('offers End Execution, not Close Project', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'End Execution' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close Project' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Project' })).toBeInTheDocument()
  })

  it('asks before doing anything, and Cancel backs out without calling the server', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'End Execution' }))
    expect(screen.getByText(/move this project to Financing/i)).toBeInTheDocument()
    expect(mutation('AdvancePhase')).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/move this project to Financing/i)).not.toBeInTheDocument()
    expect(mutation('AdvancePhase')).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'End Execution' })).toBeInTheDocument()
  })

  it('Confirm moves the project to Financing and tells the page', async () => {
    const { onTransitioned } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'End Execution' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(onTransitioned).toHaveBeenCalledTimes(1)
    })
    expect(mutation('AdvancePhase')).toHaveBeenCalledWith({
      variables: { id: 'p-1', targetPhase: 'financing' },
    })
    expect(mutation('CompleteProject')).not.toHaveBeenCalled()
  })

  it('shows why the server refused, and closes the question', async () => {
    mutation('AdvancePhase').mockRejectedValue(
      new Error("Requires 'approve' access to 'projects.approve', or being this project's manager"),
    )
    const { onTransitioned } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'End Execution' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(toasts()).toEqual([
        "Requires 'approve' access to 'projects.approve', or being this project's manager",
      ])
    })
    expect(onTransitioned).not.toHaveBeenCalled()
    expect(screen.queryByText(/move this project to Financing/i)).not.toBeInTheDocument()
  })

  it('offers nothing when the project may not be completed (not approved)', () => {
    renderBar({ allowedActions: [] })
    expect(screen.queryByRole('button', { name: 'End Execution' })).not.toBeInTheDocument()
  })
})

describe('Financing phase: Close Project', () => {
  it('offers Close Project, not End Execution, and closes straight away when nothing blocks it', async () => {
    const { onTransitioned } = renderBar({ lifecyclePhase: 'financing' })
    expect(screen.queryByRole('button', { name: 'End Execution' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Project' }))
    await waitFor(() => {
      expect(onTransitioned).toHaveBeenCalledTimes(1)
    })
    expect(mutation('CompleteProject')).toHaveBeenCalledWith({ variables: { id: 'p-1' } })
  })

  it('holds the button back and says why while an invoice is unpaid', () => {
    renderBar({
      lifecyclePhase: 'financing',
      closeoutGate: 'Every invoice must be paid first (2 still open).',
    })
    const btn = screen.getByRole('button', { name: 'Close Project' })
    expect(btn).toBeDisabled()
    expect(
      screen.getByText(/Every invoice must be paid first \(2 still open\)/),
    ).toBeInTheDocument()
    fireEvent.click(btn)
    expect(mutation('CompleteProject')).not.toHaveBeenCalled()
  })

  it("shows the server's refusal when it says no anyway (the page's list was stale)", async () => {
    mutation('CompleteProject').mockRejectedValue(
      new Error(
        'Cannot close the project: 1 invoice is not fully paid yet (1 issued, unpaid). Close it once every invoice is paid.',
      ),
    )
    const { onTransitioned } = renderBar({ lifecyclePhase: 'financing' })
    fireEvent.click(screen.getByRole('button', { name: 'Close Project' }))
    await waitFor(() => {
      expect(toasts()).toHaveLength(1)
    })
    expect(toasts()[0]).toMatch(/1 invoice is not fully paid yet/)
    expect(onTransitioned).not.toHaveBeenCalled()
    // And the button is usable again.
    expect(screen.getByRole('button', { name: 'Close Project' })).toBeEnabled()
  })

  it('offers no Cancel Project in Financing', () => {
    renderBar({ lifecyclePhase: 'financing' })
    expect(screen.queryByRole('button', { name: 'Cancel Project' })).not.toBeInTheDocument()
  })
})

describe('Closeout phase', () => {
  it('has no action buttons left', () => {
    renderBar({ status: 'completed', lifecyclePhase: 'closeout', allowedActions: [] })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
