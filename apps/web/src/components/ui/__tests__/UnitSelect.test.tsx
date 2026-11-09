// UnitSelect: pick a unit of measure from the list, or choose "Other..." and type one (up to 20 characters). A value
// that is not in the list (typed earlier, or from an older record) stays as a choice, so opening an old line never
// loses or changes it.
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { UnitSelect } from '../UnitSelect'

// The component is controlled; this holds the value the way a form would.
function Harness({ initial = '', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <ThemeProvider>
      <UnitSelect
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange?.(v)
        }}
      />
    </ThemeProvider>
  )
}

const box = () => screen.getByLabelText('Unit of measure')

describe('UnitSelect', () => {
  it('offers a dash, the eleven units in order, and Other', () => {
    render(<Harness />)
    const options = [...box().querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toEqual([
      '—',
      'Ea',
      'M',
      'Lot',
      'Roll',
      'Set',
      'Box',
      'Kg',
      'L',
      'Pack',
      'Pair',
      'Day',
      'Other…',
    ])
  })

  it('shows the current unit', () => {
    render(<Harness initial="Box" />)
    expect((box() as HTMLSelectElement).value).toBe('Box')
  })

  it('reports the unit that was picked', () => {
    const onChange = vi.fn()
    render(<Harness initial="Ea" onChange={onChange} />)
    fireEvent.change(box(), { target: { value: 'Roll' } })
    expect(onChange).toHaveBeenCalledWith('Roll')
    expect((box() as HTMLSelectElement).value).toBe('Roll')
  })

  it('can be set to no unit', () => {
    const onChange = vi.fn()
    render(<Harness initial="Ea" onChange={onChange} />)
    fireEvent.change(box(), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('keeps a unit that is not in the list as a choice, selected, and does not change it', () => {
    const onChange = vi.fn()
    render(<Harness initial="Pcs" onChange={onChange} />)
    expect((box() as HTMLSelectElement).value).toBe('Pcs')
    expect([...box().querySelectorAll('option')].map((o) => o.textContent)).toContain('Pcs')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Other... turns into a text box, limited to 20 characters, where a unit can be typed', () => {
    const onChange = vi.fn()
    render(<Harness initial="Ea" onChange={onChange} />)
    fireEvent.change(box(), { target: { value: '__other__' } })
    expect(onChange).not.toHaveBeenCalled() // choosing Other never becomes a unit called "__other__"
    const input = box() as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.maxLength).toBe(20)
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Man-Day' } })
    expect(onChange).toHaveBeenLastCalledWith('Man-Day')
    expect((box() as HTMLInputElement).value).toBe('Man-Day')
  })

  it('goes back to the list from the text box, keeping what was typed as a choice', () => {
    render(<Harness initial="Ea" />)
    fireEvent.change(box(), { target: { value: '__other__' } })
    fireEvent.change(box(), { target: { value: 'Shift' } })
    fireEvent.click(screen.getByLabelText('Choose from the list'))
    expect(box().tagName).toBe('SELECT')
    expect((box() as HTMLSelectElement).value).toBe('Shift')
  })

  it('leaves the text box on its own when it is emptied and left, so nothing is stuck empty', () => {
    render(<Harness initial="Ea" />)
    fireEvent.change(box(), { target: { value: '__other__' } })
    fireEvent.change(box(), { target: { value: '' } })
    fireEvent.blur(box())
    expect(box().tagName).toBe('SELECT')
  })

  it('can be disabled', () => {
    render(
      <ThemeProvider>
        <UnitSelect value="Ea" onChange={vi.fn()} disabled />
      </ThemeProvider>,
    )
    expect(box()).toBeDisabled()
  })
})
