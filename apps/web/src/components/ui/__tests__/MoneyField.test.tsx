// An amount and its currency as one control: the amount box with the currency pill inside it.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { MoneyField } from '../MoneyField'

const theme = themes['light-flat']

const show = (props: Partial<React.ComponentProps<typeof MoneyField>> = {}) => {
  const onChange = vi.fn()
  const onCurrencyChange = vi.fn()
  const { container } = render(
    <ThemeProvider>
      <MoneyField
        value="100"
        onChange={onChange}
        ariaLabel="Actual price"
        currency="IQD"
        onCurrencyChange={onCurrencyChange}
        currencies={['IQD', 'USD', 'EUR']}
        currencyAriaLabel="Currency"
        {...props}
      />
    </ThemeProvider>,
  )
  return {
    onChange,
    onCurrencyChange,
    container,
    amount: screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Actual price' }),
    pill: screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency' }),
    frame: container.firstElementChild as HTMLElement,
  }
}
const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

describe('MoneyField', () => {
  it('shows the amount and the currency, each named for a screen reader', () => {
    const { amount, pill } = show()
    expect(amount.value).toBe('100')
    expect(pill.value).toBe('IQD')
  })

  it('lists every currency it is given, and nothing else', () => {
    const { pill } = show()
    expect(Array.from(pill.options).map((o) => o.value)).toEqual(['IQD', 'USD', 'EUR'])
  })

  it('passes a typed amount on as typed', () => {
    const { amount, onChange } = show()
    fireEvent.change(amount, { target: { value: '12.5' } })
    expect(onChange).toHaveBeenCalledWith('12.5')
  })

  it('passes a chosen currency on', () => {
    const { pill, onCurrencyChange } = show()
    fireEvent.change(pill, { target: { value: 'USD' } })
    expect(onCurrencyChange).toHaveBeenCalledWith('USD')
  })

  it('draws the amount and the pill inside one frame', () => {
    const { frame, amount, pill } = show()
    expect(frame.contains(amount)).toBe(true)
    expect(frame.contains(pill)).toBe(true)
  })

  it('has the readable field border at rest and the accent border while typing', () => {
    const { frame, amount } = show()
    expect(frame).toHaveStyle({ border: `1px solid ${theme.borderField}` })
    fireEvent.focus(amount)
    expect(frame).toHaveStyle({ border: `1px solid ${theme.accent}` })
    fireEvent.blur(amount)
    expect(frame).toHaveStyle({ border: `1px solid ${theme.borderField}` })
  })

  it('turns red and is marked invalid for a screen reader when the amount is wrong', () => {
    const { frame, amount } = show({ invalid: true })
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(frame).toHaveStyle({ border: `1px solid ${theme.danger}` })
  })

  it('is not marked invalid otherwise', () => {
    const { amount } = show()
    expect(amount).not.toHaveAttribute('aria-invalid')
  })

  it('when disabled, neither part can be changed', () => {
    const { amount, pill } = show({ disabled: true })
    expect(amount).toBeDisabled()
    expect(pill).toBeDisabled()
  })

  it('is 40 px high on a desktop and 44 px on a phone, with 16 px text there so the page does not zoom', () => {
    setWidth(1440)
    const desktop = show()
    expect(desktop.frame).toHaveStyle({ height: '40px' })
    expect(desktop.amount).toHaveStyle({ fontSize: '14px' })
    desktop.container.remove()
    setWidth(375)
    const phone = show()
    expect(phone.frame).toHaveStyle({ height: '44px' })
    expect(phone.amount).toHaveStyle({ fontSize: '16px' })
  })
})
