// The Requisitions section of a project's Procurement tab: every requisition of the project drawn like the Purchase Orders section
// beside it. The component only draws what the page gives it; what the page asks for and who sees the tab is pinned in
// pages/projects/detail/__tests__/projectDetailRequisitionsWiring.test.ts.
import { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { ProjectRequisitionsList } from '../ProjectRequisitionsList'
import type { ProjectRequisitionRow } from '../ProjectRequisitionsList'
import { getRequisitionStatusLabel } from '../../../lib/requisition-constants'

const rows: ProjectRequisitionRow[] = [
  {
    id: 'r-2',
    requisition_number: 'REQ-2026-0102',
    status: 'sourcing',
    purpose: 'project',
    organizerName: 'Olivia Organizer',
    created_at: '2026-11-20T09:30:00.000Z',
  },
  {
    id: 'r-1',
    requisition_number: 'REQ-2026-0101',
    status: 'draft',
    purpose: 'direct_supply',
    organizerName: null,
    created_at: '2026-11-02T09:30:00.000Z',
  },
]

const onNew = vi.fn()
const onOpen = vi.fn<[string], unknown>()
const onFilterChange = vi.fn<[string[]], unknown>()
type ListProps = React.ComponentProps<typeof ProjectRequisitionsList>
// The page keeps the ticked statuses; this stands in for it (and reports every change it is told about).
function Stateful({
  initial,
  ...props
}: Omit<ListProps, 'selectedStatuses' | 'onSelectedStatusesChange'> & { initial: string[] }) {
  const [selected, setSelected] = useState(initial)
  return (
    <ProjectRequisitionsList
      {...props}
      selectedStatuses={selected}
      onSelectedStatusesChange={(next) => {
        onFilterChange(next)
        setSelected(next)
      }}
    />
  )
}
function show(
  over: Partial<Omit<ListProps, 'selectedStatuses' | 'onSelectedStatusesChange'>> & {
    initial?: string[]
  } = {},
) {
  return render(
    <ThemeProvider>
      <Stateful
        requisitions={rows}
        canCreate
        onNew={onNew}
        onOpen={onOpen}
        isPhone={false}
        initial={[]}
        {...over}
      />
    </ThemeProvider>,
  )
}
const rowEls = () => screen.getAllByTestId('project-requisition-row')

afterEach(async () => {
  onNew.mockClear()
  onOpen.mockClear()
  onFilterChange.mockClear()
  if (i18n.language !== 'en') {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  }
})

describe('what it shows', () => {
  it('has a count, and one row per requisition in the order it was given (newest first)', () => {
    show()
    expect(screen.getByText('2 requisitions')).toBeInTheDocument()
    expect(rowEls()).toHaveLength(2)
    expect(within(rowEls()[0]).getByText('REQ-2026-0102')).toBeInTheDocument()
    expect(within(rowEls()[1]).getByText('REQ-2026-0101')).toBeInTheDocument()
  })

  it('says "1 requisition" for one', () => {
    show({ requisitions: [rows[0]] })
    expect(screen.getByText('1 requisition')).toBeInTheDocument()
  })

  it('a desktop row names the number, purpose, organizer, date and status', () => {
    show()
    const first = within(rowEls()[0])
    expect(first.getByText('REQ-2026-0102')).toBeInTheDocument()
    expect(first.getByText('Project Supply')).toBeInTheDocument()
    expect(first.getByText('Olivia Organizer')).toBeInTheDocument()
    expect(first.getByText('20 Nov 2026')).toBeInTheDocument()
    expect(first.getByText(getRequisitionStatusLabel('sourcing'))).toBeInTheDocument()
    const second = within(rowEls()[1])
    expect(second.getByText('Direct Supply')).toBeInTheDocument()
    expect(second.getByText(getRequisitionStatusLabel('draft'))).toBeInTheDocument()
  })

  it('a missing organizer, number or date is a dash, never "null" or "Invalid Date"', () => {
    show({
      requisitions: [
        { id: 'x', status: 'draft', purpose: null, organizerName: null, created_at: null },
      ],
    })
    const text = rowEls()[0].textContent
    expect(text).not.toMatch(/null|undefined|Invalid/)
    // the number, the purpose, the organizer and the date: four dashes, none of them left empty
    expect(within(rowEls()[0]).getAllByText('—')).toHaveLength(4)
  })

  it('has column headings on a desktop', () => {
    show()
    for (const h of ['Requisition #', 'Purpose', 'Organizer', 'Created', 'Status'])
      expect(screen.getByText(h)).toBeInTheDocument()
  })

  it('an empty project says so and shows no rows, no table headings', () => {
    show({ requisitions: [] })
    expect(screen.getByText('No requisitions for this project.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('project-requisition-row')).toHaveLength(0)
    expect(screen.queryByText('Requisition #')).toBeNull()
    expect(screen.getByText('0 requisitions')).toBeInTheDocument()
  })
})

describe('opening a requisition', () => {
  it('a click opens that requisition', () => {
    show()
    fireEvent.click(rowEls()[1])
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('r-1')
  })

  it('a row is a link a keyboard can reach: Enter and Space open it, other keys do not', () => {
    show()
    const row = rowEls()[0]
    expect(row).toHaveAttribute('role', 'link')
    expect(row).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(row, { key: 'a' })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onOpen).toHaveBeenLastCalledWith('r-2')
  })
})

describe('the New Requisition button', () => {
  it('is shown to someone who may create one, and starts a requisition', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: '+ New Requisition' }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('is not shown to someone who may not, even on an empty list', () => {
    const { unmount } = show({ canCreate: false })
    expect(screen.queryByRole('button', { name: /New Requisition/ })).toBeNull()
    unmount()
    show({ canCreate: false, requisitions: [] })
    expect(screen.queryByRole('button', { name: /New Requisition/ })).toBeNull()
  })
})

describe('on a phone', () => {
  it('each requisition is a card with its number, purpose, organizer, date and status, and no table headings', () => {
    show({ isPhone: true })
    expect(screen.queryByText('Requisition #')).toBeNull()
    expect(rowEls()).toHaveLength(2)
    const first = within(rowEls()[0])
    expect(first.getByText('REQ-2026-0102')).toBeInTheDocument()
    expect(first.getByText('Project Supply · Olivia Organizer')).toBeInTheDocument()
    expect(first.getByText('20 Nov 2026')).toBeInTheDocument()
    expect(first.getByText(getRequisitionStatusLabel('sourcing'))).toBeInTheDocument()
    // no organizer: the purpose alone, no dangling separator
    expect(within(rowEls()[1]).getByText('Direct Supply')).toBeInTheDocument()
  })

  it('a card opens the requisition by click and by keyboard', () => {
    show({ isPhone: true })
    fireEvent.click(rowEls()[0])
    fireEvent.keyDown(rowEls()[1], { key: 'Enter' })
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['r-2', 'r-1'])
  })
})

// The status filter: one chip per status that occurs (rejected included), ticking shows only those, ticking none shows everything.
describe('the status filter', () => {
  const row = (id: string, number: string, status: string): ProjectRequisitionRow => ({
    id,
    requisition_number: number,
    status,
    purpose: 'project',
    organizerName: 'Olivia Organizer',
    created_at: '2026-11-20T09:30:00.000Z',
  })
  const mixed = [
    row('a', 'REQ-A', 'rejected'),
    row('b', 'REQ-B', 'sourcing'),
    row('c', 'REQ-C', 'rejected'),
    row('d', 'REQ-D', 'draft'),
    row('e', 'REQ-E', 'completed'),
  ]
  const numbersShown = () =>
    screen
      .queryAllByTestId('project-requisition-row')
      .map((r) => r.textContent.match(/REQ-[A-Z]/)?.[0])
  const chip = (name: RegExp) => screen.getByRole('button', { name })
  const chipNames = () =>
    within(screen.getByRole('group', { name: 'Filter by status' }))
      .getAllByRole('button')
      .map((b) => b.textContent.trim())

  it('has an All chip with the total and one chip per status that occurs, with its count, in workflow order and rejected after the live ones', () => {
    show({ requisitions: mixed })
    expect(chipNames()).toEqual(['All 5', 'Draft 1', 'Sourcing 1', 'Completed 1', 'Rejected 2'])
    expect(chip(/^All 5$/)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(/^Rejected 2$/)).toHaveAttribute('aria-pressed', 'false')
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-B', 'REQ-C', 'REQ-D', 'REQ-E'])
  })

  it('ticking Rejected shows only the rejected ones, says how many of how many, and tells the page', () => {
    show({ requisitions: mixed })
    fireEvent.click(chip(/^Rejected 2$/))
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-C'])
    expect(chip(/^Rejected 2$/)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(/^All 5$/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('showing-of')).toHaveTextContent('Showing 2 of 5')
    expect(onFilterChange).toHaveBeenLastCalledWith(['rejected'])
  })

  it('several statuses can be ticked, and unticking one takes its rows away again', () => {
    show({ requisitions: mixed })
    fireEvent.click(chip(/^Rejected 2$/))
    fireEvent.click(chip(/^Draft 1$/))
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-C', 'REQ-D'])
    expect(onFilterChange).toHaveBeenLastCalledWith(['rejected', 'draft'])
    fireEvent.click(chip(/^Rejected 2$/))
    expect(numbersShown()).toEqual(['REQ-D'])
    expect(onFilterChange).toHaveBeenLastCalledWith(['draft'])
  })

  it('unticking the last one, or pressing All, shows everything again and drops the "Showing" text', () => {
    show({ requisitions: mixed })
    fireEvent.click(chip(/^Draft 1$/))
    fireEvent.click(chip(/^Draft 1$/))
    expect(numbersShown()).toHaveLength(5)
    expect(screen.queryByTestId('showing-of')).toBeNull()
    fireEvent.click(chip(/^Sourcing 1$/))
    fireEvent.click(chip(/^Completed 1$/))
    expect(numbersShown()).toEqual(['REQ-B', 'REQ-E'])
    fireEvent.click(chip(/^All 5$/))
    expect(numbersShown()).toHaveLength(5)
    expect(onFilterChange).toHaveBeenLastCalledWith([])
    expect(chip(/^All 5$/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('a filter remembered from an earlier visit is used as it is', () => {
    show({ requisitions: mixed, initial: ['rejected'] })
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-C'])
    expect(chip(/^Rejected 2$/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('a remembered status that no requisition carries any more is dropped, so an old filter can never hide every row', () => {
    show({ requisitions: mixed, initial: ['cancelled'] })
    expect(numbersShown()).toHaveLength(5)
    expect(chip(/^All 5$/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('showing-of')).toBeNull()
  })

  it('and a stale status beside a real one still filters by the real one', () => {
    show({ requisitions: mixed, initial: ['cancelled', 'rejected'] })
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-C'])
    expect(screen.getByTestId('showing-of')).toHaveTextContent('Showing 2 of 5')
  })

  it('with one status only there is nothing to choose, so no chips are drawn', () => {
    show({ requisitions: [row('a', 'REQ-A', 'rejected'), row('c', 'REQ-C', 'rejected')] })
    expect(screen.queryByRole('group', { name: 'Filter by status' })).toBeNull()
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-C'])
  })

  it('an empty project draws no chips', () => {
    show({ requisitions: [] })
    expect(screen.queryByRole('group', { name: 'Filter by status' })).toBeNull()
  })

  it('the count in the header is still of all the requisitions, whatever is ticked', () => {
    show({ requisitions: mixed })
    fireEvent.click(chip(/^Rejected 2$/))
    expect(screen.getByText(/5 requisitions/)).toBeInTheDocument()
  })

  it('works the same on a phone: the chips are there and the cards are the ticked ones', () => {
    show({ requisitions: mixed, isPhone: true })
    fireEvent.click(chip(/^Rejected 2$/))
    expect(numbersShown()).toEqual(['REQ-A', 'REQ-C'])
  })

  it('in Arabic the group and the All chip are translated and the chip names are the Arabic status names', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    show({ requisitions: mixed })
    const group = screen.getByRole('group', { name: 'تصفية حسب الحالة' })
    const names = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent.trim())
    expect(names[0]).toBe('الكل 5')
    expect(names).toContain(`${getRequisitionStatusLabel('rejected')} 2`)
    expect(document.body.textContent).not.toMatch(/proj\.detail\./)
  })
})

describe('the arrow at the end of a desktop row', () => {
  const arrow = () => rowEls()[0].querySelector('svg path')?.getAttribute('d')

  it('points toward the end of the line in English and is mirrored in Arabic (an SVG is not mirrored by the browser)', async () => {
    const english = show()
    expect(arrow()).toBe('M9 18l6-6-6-6')
    english.unmount()
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    show()
    expect(arrow()).toBe('M15 18l-6-6 6-6')
  })
})

describe('in Arabic', () => {
  it('the count has its own plural forms, the headings are translated and no key is shown raw', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    const { unmount } = show({ requisitions: [] })
    expect(screen.getByText('لا طلبات شراء')).toBeInTheDocument()
    expect(screen.getByText('لا توجد طلبات شراء لهذا المشروع.')).toBeInTheDocument()
    unmount()
    const again = show({ requisitions: [rows[0]] })
    expect(screen.getByText('طلب شراء واحد')).toBeInTheDocument()
    again.unmount()
    show()
    expect(screen.getByText('طلبا شراء')).toBeInTheDocument()
    expect(screen.getByText('رقم طلب الشراء')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/proj\.detail\.|req\.list\./)
  })
})

describe('its strings exist in both languages', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../ProjectRequisitionsList.tsx'), 'utf8')
  type Locale = Record<string, Record<string, Record<string, string> | undefined> | undefined>
  const load = (f: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales', f), 'utf8'),
    ) as Locale
  const lookup = (json: Locale, key: string) => {
    const [a, b, c] = key.split('.') as [string, string, string]
    const group = json[a]?.[b]
    if (!group) return undefined
    if (c in group) return group[c]
    // a plural key is stored as key_one, key_other, ...
    return Object.keys(group).find((k) => k.startsWith(`${c}_`)) ? 'plural' : undefined
  }

  it('resolves every key the component uses, in English and in Arabic', () => {
    const keys = [...new Set([...src.matchAll(/t\('([\w.]+)'/g)].map((m) => m[1]))]
    expect(keys.length).toBeGreaterThan(5)
    const en = load('en.json')
    const ar = load('ar.json')
    for (const k of keys) {
      expect(lookup(en, k), `en ${k}`).toBeTruthy()
      expect(lookup(ar, k), `ar ${k}`).toBeTruthy()
    }
  })

  it('the Arabic count has all six plural forms', () => {
    const ar = load('ar.json').proj?.detail
    if (!ar) throw new Error('ar.json has no proj.detail')
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other'])
      expect(ar[`requisitionCount_${form}`], form).toBeTruthy()
  })
})
