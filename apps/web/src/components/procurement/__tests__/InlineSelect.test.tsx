// The drop-down that sits inside a Lines table cell (the stock location an item is taken from).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { InlineSelect } from '../InlineSelect'

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

const show = (props: Partial<React.ComponentProps<typeof InlineSelect>> = {}) => {
  const onChange = vi.fn()
  render(
    <ThemeProvider>
      <InlineSelect
        value=""
        onChange={onChange}
        ariaLabel="Source location: Cement bags"
        options={[
          { value: 'a', label: 'Main Warehouse' },
          { value: 'b', label: 'Site Store' },
        ]}
        {...props}
      />
    </ThemeProvider>,
  )
  return {
    onChange,
    select: screen.getByLabelText<HTMLSelectElement>('Source location: Cement bags'),
  }
}

describe('InlineSelect', () => {
  it('names the line it belongs to, since no label sits beside it', () => {
    const { select } = show()
    expect(select.tagName).toBe('SELECT')
  })

  it('lists every choice in the page, so a screen reader and the phone picker can reach them', () => {
    show()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Main Warehouse',
      'Site Store',
    ])
  })

  it('starts with an empty "nothing chosen" choice when it is given a placeholder', () => {
    show({ placeholder: 'Source location' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Source location',
      'Main Warehouse',
      'Site Store',
    ])
    expect(screen.getByRole('option', { name: 'Source location' })).toHaveValue('')
  })

  it('has no empty choice without a placeholder', () => {
    show()
    expect(screen.queryByRole('option', { name: '' })).not.toBeInTheDocument()
  })

  it('hands up the chosen value, and an empty one when the empty choice is picked again', () => {
    const { onChange, select } = show({ placeholder: 'Source location', value: 'a' })
    fireEvent.change(select, { target: { value: 'b' } })
    expect(onChange).toHaveBeenLastCalledWith('b')
    fireEvent.change(select, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('is large enough to tap, with text that stops the browser zooming in, on a phone', () => {
    setWidth(390)
    const { select } = show()
    expect(select).toHaveStyle({ minHeight: '44px', fontSize: '16px' })
  })
})
