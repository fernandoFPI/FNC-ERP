import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { RequirementsChecklist, type Requirement } from '../RequirementsChecklist'

function mount(items: Requirement[]) {
  return render(
    <ThemeProvider>
      <RequirementsChecklist
        data-tour="req-checklist"
        title="Before you create it"
        items={items}
        progressLabel="1 of 3 done"
        readyLabel="Ready to create"
        doneText="done"
        todoText="still to do"
      />
    </ThemeProvider>,
  )
}

const THREE: Requirement[] = [
  { id: 'a', label: 'Choose a project', done: true },
  { id: 'b', label: 'Choose a destination', done: false },
  { id: 'c', label: 'Add at least one line', done: false },
]

describe('RequirementsChecklist', () => {
  it('lists every item, in order, under its title', () => {
    mount(THREE)
    expect(screen.getByText('Before you create it')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Choose a project — done',
      'Choose a destination — still to do',
      'Add at least one line — still to do',
    ])
  })

  it('marks each item done or not, for the eye and for a screen reader', () => {
    mount(THREE)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-done'))).toEqual(['true', 'false', 'false'])
    // the tick is only a drawing: the state is also in words
    expect(within(items[0]).getByText(/done/)).toBeInTheDocument()
    expect(within(items[1]).getByText(/still to do/)).toBeInTheDocument()
  })

  it('draws a tick on done items only', () => {
    const { container } = mount(THREE)
    expect(container.querySelectorAll('li svg')).toHaveLength(1)
    expect(container.querySelector('li[data-done="true"] svg')).not.toBeNull()
  })

  it('shows the progress while something is left', () => {
    mount(THREE)
    const badge = screen.getByText('1 of 3 done')
    expect(badge).toHaveAttribute('data-ready', 'false')
    expect(screen.queryByText('Ready to create')).not.toBeInTheDocument()
  })

  it('says it is ready when every item is done', () => {
    mount(THREE.map((i) => ({ ...i, done: true })))
    const badge = screen.getByText('Ready to create')
    expect(badge).toHaveAttribute('data-ready', 'true')
    expect(screen.queryByText('1 of 3 done')).not.toBeInTheDocument()
  })

  it('announces a change in progress politely', () => {
    mount(THREE)
    expect(screen.getByText('1 of 3 done')).toHaveAttribute('aria-live', 'polite')
  })

  it('passes data-tour to the card', () => {
    const { container } = mount(THREE)
    expect(container.querySelector('[data-tour="req-checklist"]')).not.toBeNull()
  })

  it('is a list a screen reader can count', () => {
    mount(THREE)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
