// The Requisitions list on a desktop: every applied filter is a named chip that can be taken off, the empty state has a way out,
// the priority tag sits beside the number, and ticking rows opens the selection bar with the select-all box in its "some" state.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'

// the element a test is about, or a clear failure (a cast would hide a null, and the lint rules forbid `!`)
const must = <T,>(x: T | null | undefined): T => {
  if (x == null) throw new Error('expected the element to exist')
  return x
}

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const req = (over: Record<string, unknown>) => ({
  id: 'req-x',
  requisition_number: 'REQ-2026-001',
  status: 'draft',
  priority: 'low',
  purpose: 'stock',
  delivery_destination: 'inventory',
  project_id: null,
  projectName: null,
  branch_id: 'branch-1',
  branch_name: 'Main Branch',
  organizer_id: 'user-1',
  organizerName: 'Jane Doe',
  notes: null,
  created_at: '2026-01-15T10:00:00.000Z',
  updated_at: '2026-01-15T10:00:00.000Z',
  ...over,
})
const ROWS = [
  req({ id: 'req-1', requisition_number: 'REQ-2026-001' }),
  req({
    id: 'req-2',
    requisition_number: 'REQ-2026-002',
    status: 'sourcing',
    priority: 'emergency',
    purpose: 'project',
    project_id: 'proj-1',
    projectName: 'Tower A',
    organizer_id: 'user-2',
    organizerName: 'John Smith',
  }),
  req({
    id: 'req-3',
    requisition_number: 'REQ-2026-003',
    status: 'sourcing',
    purpose: 'stock',
    organizer_id: 'user-2',
    organizerName: 'John Smith',
  }),
]

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  // one result object, handed back every time
  const result = {
    data: { requisitions: ROWS, myRequisitionApprovalQueue: [] },
    loading: false,
    refetch: vi.fn(),
  }
  mockUseQuery.mockReturnValue(result)
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

async function mount() {
  const Page = (await import('../RequisitionsPage')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions']}>
      <ThemeProvider>
        <Page />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const NUMBERS = ROWS.map((r) => r.requisition_number)
const shown = () => NUMBERS.filter((n) => screen.queryByText(n))
const chipList = () => screen.queryByRole('list', { name: 'Applied filters' })
const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } })

describe('Requisitions list: applied filters', () => {
  it('has no chips while nothing is filtered, and shows every requisition', async () => {
    await mount()
    expect(chipList()).toBeNull()
    expect(shown()).toEqual(NUMBERS)
  })

  it('names a chosen status as a chip and narrows the list; taking the chip off brings the rows back', async () => {
    await mount()
    pick('Status', 'sourcing')
    const chips = within(must(chipList()))
    expect(chips.getAllByRole('listitem')[0]).toHaveTextContent('StatusSourcing')
    expect(shown()).toEqual(['REQ-2026-002', 'REQ-2026-003'])
    fireEvent.click(chips.getByRole('button', { name: 'Remove filter: Status Sourcing' }))
    expect(chipList()).toBeNull()
    expect(shown()).toEqual(NUMBERS)
  })

  it('has one chip for each filter, and "Clear all" takes every one off at once', async () => {
    await mount()
    pick('Status', 'sourcing')
    pick('Purpose', 'project')
    const chips = within(must(chipList()))
    // two chips and the "Clear all" item
    expect(chips.getAllByRole('listitem')).toHaveLength(3)
    expect(shown()).toEqual(['REQ-2026-002'])
    fireEvent.click(chips.getByRole('button', { name: 'Clear all' }))
    expect(chipList()).toBeNull()
    expect(shown()).toEqual(NUMBERS)
  })

  it('removing one chip leaves the other filter on', async () => {
    await mount()
    pick('Status', 'sourcing')
    pick('Purpose', 'project')
    fireEvent.click(
      within(must(chipList())).getByRole('button', {
        name: 'Remove filter: Status Sourcing',
      }),
    )
    expect(within(must(chipList())).getAllByRole('listitem')).toHaveLength(2)
    expect(shown()).toEqual(['REQ-2026-002'])
  })

  it('shows an empty state with a way out when the filters match nothing, and the way out works', async () => {
    await mount()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'no such one' } })
    expect(screen.getByText('No requisitions match these filters.')).toBeInTheDocument()
    expect(shown()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(screen.queryByText('No requisitions match these filters.')).toBeNull()
    expect(shown()).toEqual(NUMBERS)
  })

  it('tags an emergency requisition beside its number, and a normal one carries no tag', async () => {
    await mount()
    const urgent = must(screen.getByText('REQ-2026-002').parentElement)
    expect(within(urgent).getByText('Emergency')).toBeInTheDocument()
    const plain = must(screen.getByText('REQ-2026-001').parentElement)
    expect(within(plain).queryByText('Emergency')).toBeNull()
  })

  it('keeps the saved presets inside the More Filters panel instead of floating them over its edge, where the panel would cut them off', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
    const panel = screen.getByRole('dialog', { name: 'More Filters' })
    const nameBox = within(panel).getByPlaceholderText(i18n.t('ui.presets.nameThisPreset'))
    const list = must(nameBox.parentElement?.parentElement?.parentElement)
    expect(list.style.position).not.toBe('absolute')
    expect(list).toHaveStyle({ width: '100%' })
  })
})

describe('Requisitions list: selecting rows', () => {
  const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })

  it('has no selection bar until a row is ticked, then names the count', async () => {
    await mount()
    expect(screen.queryByRole('region', { name: /selected/ })).toBeNull()
    fireEvent.click(box('Select REQ-2026-001'))
    expect(screen.getByRole('region', { name: '1 selected' })).toBeInTheDocument()
  })

  it('puts the select-all box in its "some" state while part of the list is ticked, and ticks it when all are', async () => {
    await mount()
    expect(box('Select all').indeterminate).toBe(false)
    fireEvent.click(box('Select REQ-2026-001'))
    expect(box('Select all').indeterminate).toBe(true)
    expect(box('Select all')).not.toBeChecked()
    fireEvent.click(box('Select all'))
    expect(box('Select all')).toBeChecked()
    expect(box('Select all').indeterminate).toBe(false)
    expect(screen.getByRole('region', { name: '3 selected' })).toBeInTheDocument()
  })

  it('clears the selection from the bar', async () => {
    await mount()
    fireEvent.click(box('Select REQ-2026-001'))
    fireEvent.click(
      within(screen.getByRole('region', { name: '1 selected' })).getByRole('button', {
        name: 'Clear selection',
      }),
    )
    expect(screen.queryByRole('region', { name: /selected/ })).toBeNull()
    expect(box('Select REQ-2026-001')).not.toBeChecked()
  })
})
