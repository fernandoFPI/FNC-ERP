// The "Columns · 6 of 9" menu and the Comfortable | Compact toggle that sit above a table.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { ColumnsMenu, type ColumnsMenuItem } from '../ColumnsMenu'
import { DensityToggle } from '../DensityToggle'

const items: ColumnsMenuItem[] = [
  { key: 'qty', label: 'Qty', on: true },
  { key: 'initial', label: 'Initial Price', on: false },
  { key: 'total', label: 'Total', on: true, locked: true },
]

function renderMenu(over: Partial<React.ComponentProps<typeof ColumnsMenu>> = {}) {
  const onToggle = vi.fn()
  const onReset = vi.fn()
  render(
    <ThemeProvider>
      <div>
        <ColumnsMenu
          items={items}
          onToggle={onToggle}
          onReset={onReset}
          canReset={false}
          {...over}
        />
        <p>outside</p>
      </div>
    </ThemeProvider>,
  )
  return { onToggle, onReset }
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('ColumnsMenu', () => {
  it('says how many columns are showing out of how many there are', () => {
    renderMenu()
    expect(screen.getByRole('button', { name: 'Columns · 2 of 3' })).toBeInTheDocument()
  })

  it('opens a tick box per column, and a locked one that cannot be changed', () => {
    renderMenu()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    expect(screen.getByRole('checkbox', { name: 'Qty' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Initial Price' })).not.toBeChecked()
    const total = screen.getByRole('checkbox', { name: 'Total' })
    expect(total).toBeChecked()
    expect(total).toBeDisabled()
  })

  it('reports the column and the new state when one is ticked or cleared', () => {
    const { onToggle } = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    expect(onToggle).toHaveBeenLastCalledWith('initial', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Qty' }))
    expect(onToggle).toHaveBeenLastCalledWith('qty', false)
  })

  it('shows the small print, and "Reset to default" only when there is something to reset', () => {
    renderMenu({ note: 'Item and Total always stay visible' })
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    expect(screen.getByText('Item and Total always stay visible')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull()
  })

  it('resets when asked', () => {
    const { onReset } = renderMenu({ canReset: true })
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('tells assistive technology whether it is open', () => {
    renderMenu()
    const button = screen.getByRole('button', { name: /^Columns/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on Escape and on a click anywhere else, but not when clicking inside', () => {
    renderMenu()
    const button = screen.getByRole('button', { name: /^Columns/ })
    fireEvent.click(button)
    fireEvent.mouseDown(screen.getByRole('checkbox', { name: 'Qty' }))
    expect(screen.getByRole('checkbox', { name: 'Qty' })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(button)
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Qty' }), { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderMenu({ canReset: true })
    expect(screen.getByRole('button', { name: 'الأعمدة · 2 من 3' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^الأعمدة/ }))
    expect(screen.getByRole('button', { name: 'استعادة الافتراضي' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/ui\.tableView\./)
  })
})

describe('DensityToggle', () => {
  it('shows which spacing is on, and changes it', () => {
    const onChange = vi.fn()
    render(
      <ThemeProvider>
        <DensityToggle value="comfortable" onChange={onChange} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Comfortable' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(onChange).toHaveBeenCalledWith('compact')
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    render(
      <ThemeProvider>
        <DensityToggle value="compact" onChange={vi.fn()} />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'مضغوط' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'مريح' })).toBeInTheDocument()
  })
})
