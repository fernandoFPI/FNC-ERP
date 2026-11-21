// The "Double-check the store price" notice (playbook #111), on its own: what it lists, who gets the button, and that it never lets two
// confirmations run at once.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { StaleCostNotice } from '../StaleCostNotice'

const items = [
  { productId: 'p1', name: 'Pipe 2in', sku: 'PIPE-2', days: 47 },
  { productId: 'p2', name: 'Cable 3x2.5', sku: null, days: 91 },
]
const show = (props: Partial<React.ComponentProps<typeof StaleCostNotice>> = {}) => {
  const onConfirm = vi.fn()
  render(
    <MemoryRouter>
      <ThemeProvider>
        <StaleCostNotice items={items} canConfirm onConfirm={onConfirm} {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  )
  return onConfirm
}
const region = () => screen.getByRole('region', { name: 'Double-check the store price' })

describe('StaleCostNotice', () => {
  it('draws nothing when there is nothing to check', () => {
    show({ items: [] })
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('is a named region that says why: the items are drawn from stock and the cost is over 30 days old', () => {
    show()
    expect(region().textContent).toMatch(/drawn from stock/)
    expect(region().textContent).toMatch(/more than 30 days/)
  })

  it('names each item with its SKU (when it has one) and age, and links to the item', () => {
    show()
    const r = within(region())
    expect(r.getByText('Pipe 2in')).toBeInTheDocument()
    expect(r.getByText('PIPE-2')).toBeInTheDocument()
    expect(r.getByText('Cost unchanged for 47 days')).toBeInTheDocument()
    expect(r.getByText('Cost unchanged for 91 days')).toBeInTheDocument()
    expect(
      r.getAllByRole('link', { name: 'Open item' }).map((a) => a.getAttribute('href')),
    ).toEqual(['/inventory/products/p1', '/inventory/products/p2'])
  })

  it('gives a button per item to someone who may confirm, named for the item, and sends that item', () => {
    const onConfirm = show()
    fireEvent.click(within(region()).getByRole('button', { name: 'Price confirmed: Cable 3x2.5' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('p2')
    expect(region().textContent).toMatch(/press Price confirmed/)
  })

  it('gives no button, and no instruction to press one, to someone who may not confirm', () => {
    show({ canConfirm: false })
    expect(within(region()).queryByRole('button')).toBeNull()
    expect(region().textContent).not.toMatch(/press Price confirmed/)
    expect(within(region()).getAllByRole('link', { name: 'Open item' })).toHaveLength(2)
  })

  it('holds every button while one item is being confirmed, and marks only that one busy', () => {
    const onConfirm = show({ confirmingProductId: 'p1' })
    const buttons = within(region()).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    for (const b of buttons) expect(b).toBeDisabled()
    const second = buttons.at(1)
    if (!second) throw new Error('the second button is missing')
    fireEvent.click(second)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
