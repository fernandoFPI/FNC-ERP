// The project stage drawer (Add / Edit stage) was its own panel: tiny uppercase labels in the pale grey, native boxes
// on the canvas colour, hand-made grey buttons, and no dialog behaviour at all (no role, Esc did nothing, Tab walked
// out, focus did not come back). It is now the shared Drawer with the field-look boxes and the new buttons; what it
// saves has not changed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import { StageEditDrawer } from '../StageEditDrawer'

const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
  }
})

const mockPost = vi.fn()
vi.mock('../../../lib/axios', () => ({
  api: { post: (...args: unknown[]): unknown => mockPost(...args) },
}))

const addToast = vi.fn()
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (select: (s: { addToast: typeof addToast }) => unknown) => select({ addToast }),
}))

const light = themes['light-flat']
const updateStage = vi.fn()
const onClose = vi.fn()
const onSaved = vi.fn()

const stage = {
  id: 'st-1',
  name: 'Foundations',
  sequence: 1,
  status: 'active',
  completionPct: 40,
  plannedStartDate: '2026-11-01',
  plannedEndDate: '2026-12-01',
  actualStartDate: '2026-11-02',
  notes: 'Pour the slab',
  assignedTo: 'emp-1',
  assignedToName: 'Dana Aziz',
}
const team = [
  { id: 'tm-1', employeeId: 'emp-1', name: 'Dana Aziz', role: 'Engineer' },
  { id: 'tm-2', employeeId: 'emp-2', name: 'Omar Ali' },
]

beforeEach(() => {
  vi.clearAllMocks()
  document.body.style.overflow = ''
  updateStage.mockResolvedValue({})
  mockPost.mockResolvedValue({})
  mockUseMutation.mockReturnValue([updateStage, { loading: false }])
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(async () => {
  document.body.style.overflow = ''
  await i18n.changeLanguage('en')
})

function show(props: Partial<React.ComponentProps<typeof StageEditDrawer>> = {}) {
  return render(
    <ThemeProvider>
      <button>opener</button>
      <StageEditDrawer
        projectId="p-1"
        stage={null}
        open
        onClose={onClose}
        onSaved={onSaved}
        teamMembers={team}
        isAdmin
        {...props}
      />
    </ThemeProvider>,
  )
}
const textbox = (label: string) => {
  const el = screen.getByText(label).closest('div')?.querySelector('input, textarea')
  if (!el) throw new Error(`no box for ${label}`)
  return el as HTMLInputElement | HTMLTextAreaElement
}

describe('StageEditDrawer as a dialog', () => {
  it('is a modal dialog named Add Stage, or Edit Stage for an existing one', () => {
    const { unmount } = show()
    expect(screen.getByRole('dialog', { name: 'Add Stage' })).toHaveAttribute('aria-modal', 'true')
    unmount()
    show({ stage })
    expect(screen.getByRole('dialog', { name: 'Edit Stage' })).toBeInTheDocument()
  })

  it('draws nothing while closed', () => {
    show({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape and locks the page while open', () => {
    show()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has a close button a screen reader calls Close, and Cancel closes too', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores a click on the dark area once something was typed', () => {
    show()
    fireEvent.input(textbox('Stage Name'), { target: { value: 'x' } })
    const backdrop = document.querySelector<HTMLElement>('[data-overlay-backdrop]')
    if (!backdrop) throw new Error('no backdrop')
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('StageEditDrawer boxes', () => {
  it('draws the name, the dates and the notes in the field look', () => {
    const { container } = show({ stage })
    for (const box of container.ownerDocument.querySelectorAll<HTMLInputElement>(
      'input[type="date"], input:not([type])',
    )) {
      expect(box).toHaveStyle({ height: '40px', borderRadius: '10px' })
      expect(box).toHaveStyle({ borderColor: light.borderField })
    }
    expect(document.querySelector('textarea')).toHaveStyle({ borderRadius: '10px' })
  })

  it('labels every box in the readable grey, not the old 11px uppercase pale one', () => {
    show({ stage })
    const label = screen.getByText('Stage Name')
    expect(label).toHaveStyle({ color: light.textSecondary, fontSize: '12px' })
    expect(label.style.textTransform).toBe('')
  })

  it('shows status and completion only for an existing stage', () => {
    const { unmount } = show()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText('Actual Start')).not.toBeInTheDocument()
    unmount()
    show({ stage })
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('40')
    expect(screen.getByText('Actual Start')).toBeInTheDocument()
  })

  it('ties the completion label to its slider', () => {
    show({ stage })
    expect(screen.getByLabelText(/Completion:/)).toBe(screen.getByRole('slider'))
  })

  it('lets an administrator pick the responsible member, and shows the name to anyone else', () => {
    const { unmount } = show({ stage, isAdmin: true })
    expect(screen.getByText('Dana Aziz (Engineer)')).toBeInTheDocument()
    unmount()
    show({ stage, isAdmin: false })
    const box = screen.getByDisplayValue('Dana Aziz')
    expect(box).toHaveAttribute('readonly')
    expect(box).toHaveStyle({ height: '40px' })
  })

  it('tells an administrator with no team yet where to add one', () => {
    show({ teamMembers: [] })
    expect(screen.getByText('Add team members on the Team tab first.')).toBeInTheDocument()
  })
})

describe('StageEditDrawer saving (unchanged)', () => {
  it('creates a stage through the REST route with only what a new stage has', async () => {
    show()
    fireEvent.change(textbox('Stage Name'), { target: { value: 'Roofing' } })
    fireEvent.change(textbox('Planned Start'), { target: { value: '2026-12-05' } })
    fireEvent.change(textbox('Notes'), { target: { value: 'After the walls' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/projects/p-1/stages', {
        name: 'Roofing',
        planned_start_date: '2026-12-05',
        planned_end_date: null,
        notes: 'After the walls',
        assigned_to: null,
      })
    })
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
    expect(updateStage).not.toHaveBeenCalled()
  })

  it('marks Save busy while it saves, so a second click cannot send it twice', async () => {
    let finish: () => void = () => undefined
    mockPost.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    show()
    fireEvent.change(textbox('Stage Name'), { target: { value: 'Roofing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    const saving = await screen.findByRole('button', { name: /Saving/ })
    expect(saving).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(saving)
    expect(mockPost).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1)
    })
  })

  it('does nothing while the name is empty', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    expect(mockPost).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('updates an existing stage through the mutation with the values on the form', async () => {
    show({ stage })
    fireEvent.change(textbox('Stage Name'), { target: { value: 'Foundations B' } })
    fireEvent.change(screen.getByRole('slider'), { target: { value: '55' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    await waitFor(() => {
      expect(updateStage).toHaveBeenCalledTimes(1)
    })
    expect((updateStage.mock.calls[0] as unknown[])[0]).toEqual({
      variables: {
        projectId: 'p-1',
        stageId: 'st-1',
        input: {
          name: 'Foundations B',
          status: 'active',
          completionPct: 55,
          plannedStartDate: '2026-11-01',
          plannedEndDate: '2026-12-01',
          actualStartDate: '2026-11-02',
          actualEndDate: null,
          notes: 'Pour the slab',
          assignedTo: 'emp-1',
        },
      },
    })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('tells the person why when the server refuses, and stays open without reporting a save', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { error: { message: 'Stage name already used' } } },
    })
    show()
    fireEvent.change(textbox('Stage Name'), { target: { value: 'Roofing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'Stage name already used' })
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // the button is usable again so the person can fix it and retry
    expect(screen.getByRole('button', { name: 'Save Stage' })).not.toBeDisabled()
  })

  it('shows the message of a refused mutation', async () => {
    updateStage.mockRejectedValueOnce(new Error('Not allowed to edit this stage'))
    show({ stage })
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Not allowed to edit this stage',
      })
    })
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows a plain sentence, not the status code, when the server gave none', async () => {
    // an axios error with no server sentence: its own message is only "Request failed with status code 500"
    mockPost.mockRejectedValueOnce({
      response: { data: {} },
      message: 'Request failed with status code 500',
    })
    show()
    fireEvent.change(textbox('Stage Name'), { target: { value: 'Roofing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Stage' }))
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'Could not save the stage.' })
    })
  })
})
