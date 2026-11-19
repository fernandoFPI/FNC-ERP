// A number box with a minus and a plus: typing still works, the buttons step and stop at the limits.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { QuantityStepper } from '../QuantityStepper'

function Harness({
  initial,
  onChange,
  ...rest
}: {
  initial: string
  onChange?: (v: string) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <ThemeProvider>
      <QuantityStepper
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange?.(v)
        }}
        ariaLabel="Qty"
        decreaseLabel="Decrease quantity"
        increaseLabel="Increase quantity"
        {...rest}
      />
    </ThemeProvider>
  )
}
const input = () => screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Qty' })
const minus = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Decrease quantity' })
const plus = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Increase quantity' })
const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

describe('QuantityStepper', () => {
  it('shows the value in a number box named by the label, with the two buttons named too', () => {
    render(<Harness initial="10" />)
    expect(input().value).toBe('10')
    expect(minus()).toBeInTheDocument()
    expect(plus()).toBeInTheDocument()
  })

  it('plus adds one and minus takes one off', () => {
    render(<Harness initial="10" />)
    fireEvent.click(plus())
    expect(input().value).toBe('11')
    fireEvent.click(minus())
    fireEvent.click(minus())
    expect(input().value).toBe('9')
  })

  it('steps by the step it is given, without float noise (1.1 + 0.1 is 1.2)', () => {
    render(<Harness initial="1.1" step={0.1} />)
    fireEvent.click(plus())
    expect(input().value).toBe('1.2')
  })

  it('stops at the minimum: a half-unit minus lands on 0, and minus is then off', () => {
    render(<Harness initial="0.5" />)
    fireEvent.click(minus())
    expect(input().value).toBe('0')
    expect(minus()).toBeDisabled()
  })

  it('stops at the maximum: a half-unit plus lands on the limit, and plus is then off', () => {
    render(<Harness initial="9.5" max={10} />)
    expect(plus()).not.toBeDisabled()
    fireEvent.click(plus())
    expect(input().value).toBe('10')
    expect(plus()).toBeDisabled()
  })

  it('has no upper limit unless it is given one', () => {
    render(<Harness initial="1000000" />)
    expect(plus()).not.toBeDisabled()
  })

  it('an empty box counts as zero: plus gives one step, minus is off', () => {
    render(<Harness initial="" />)
    expect(minus()).toBeDisabled()
    fireEvent.click(plus())
    expect(input().value).toBe('1')
  })

  it('typing works and is passed on as typed', () => {
    const onChange = vi.fn()
    render(<Harness initial="10" onChange={onChange} />)
    fireEvent.change(input(), { target: { value: '7.5' } })
    expect(onChange).toHaveBeenLastCalledWith('7.5')
    expect(input().value).toBe('7.5')
  })

  it('a minimum other than zero is respected', () => {
    render(<Harness initial="2" min={2} />)
    expect(minus()).toBeDisabled()
  })

  it('when disabled, nothing can be changed', () => {
    render(<Harness initial="5" disabled />)
    expect(input()).toBeDisabled()
    expect(minus()).toBeDisabled()
    expect(plus()).toBeDisabled()
  })

  it('hands the max and min to the browser as hints on the number box', () => {
    render(<Harness initial="3" max={8} min={1} />)
    expect(input()).toHaveAttribute('max', '8')
    expect(input()).toHaveAttribute('min', '1')
  })

  it('is 40 px high on a desktop and 44 px on a phone, where the text is 16 px so the page does not zoom', () => {
    setWidth(1440)
    const { container, unmount } = render(<Harness initial="1" />)
    // ThemeProvider adds no wrapper, so the first element is the stepper's own frame
    expect(container.firstElementChild).toHaveStyle({ height: '40px' })
    expect(input()).toHaveStyle({ fontSize: '15px' })
    unmount()
    setWidth(375)
    const phone = render(<Harness initial="1" />)
    expect(phone.container.firstElementChild).toHaveStyle({ height: '44px' })
    expect(input()).toHaveStyle({ fontSize: '16px' })
  })
})
