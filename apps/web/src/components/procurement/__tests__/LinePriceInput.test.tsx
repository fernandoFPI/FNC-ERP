// The price box that sits in a Lines table row.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { LinePriceInput } from '../LinePriceInput'

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}
afterEach(() => {
  setWidth(1024)
})

const show = (props: Partial<React.ComponentProps<typeof LinePriceInput>> = {}) => {
  const onChange = vi.fn()
  render(
    <ThemeProvider>
      <LinePriceInput
        value="12"
        onChange={onChange}
        ariaLabel="Market price: Cement bags"
        {...props}
      />
    </ThemeProvider>,
  )
  return { onChange, box: screen.getByLabelText<HTMLInputElement>('Market price: Cement bags') }
}

describe('LinePriceInput', () => {
  it('is a number box that names the line it belongs to, since no label sits beside it', () => {
    const { box } = show()
    expect(box).toHaveAttribute('type', 'number')
    expect(box).toHaveAttribute('placeholder', '0.00')
    expect(box.value).toBe('12')
  })

  it('hands the typed text up as a string, so an empty box stays empty rather than becoming 0', () => {
    const { onChange, box } = show()
    fireEvent.change(box, { target: { value: '150' } })
    expect(onChange).toHaveBeenCalledWith('150')
    fireEvent.change(box, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('draws the box red and marks it invalid when asked', () => {
    const { box } = show({ invalid: true })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveStyle({ border: `1px solid ${themes['light-flat'].dangerBorder}` })
  })

  it('is not marked invalid by default', () => {
    const { box } = show()
    expect(box).not.toHaveAttribute('aria-invalid')
    expect(box).toHaveStyle({ border: `1px solid ${themes['light-flat'].borderInput}` })
  })

  it('takes the accent colour while focused and goes back afterwards', () => {
    const { box } = show()
    fireEvent.focus(box)
    expect(box.style.borderColor).not.toBe('')
    const focused = box.style.borderColor
    fireEvent.blur(box)
    expect(box.style.borderColor).not.toBe(focused)
  })

  it('is narrow on a desktop and full width and tall enough to tap on a phone', () => {
    const desktop = show({ width: '110px' })
    expect(desktop.box).toHaveStyle({ width: '110px' })
    document.body.innerHTML = ''
    setWidth(390)
    const phone = show()
    expect(phone.box).toHaveStyle({ width: '100%', minHeight: '44px', fontSize: '16px' })
  })
})
