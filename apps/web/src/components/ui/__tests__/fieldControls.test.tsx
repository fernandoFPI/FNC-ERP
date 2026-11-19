// The "field" look for text, number, date, select and text-area boxes. The new-requisition form showed a Priority box and
// a date box in the browser's own grey chrome (a black arrow, a thin pale edge, a different height) between searchable
// pickers drawn in the newer style. Each control now takes an opt-in `field` prop with the same box (40px, 10px corners,
// the readable `borderField` edge), and the plain controls the other ~90 screens use are untouched.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import i18n from '../../../i18n'
import { Input } from '../Input'
import { Select } from '../Select'
import { Textarea } from '../Textarea'
import { fieldControlStyle, fieldTextareaStyle } from '../fieldStyles'

const t = themes['light-flat']
const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>
// The picker's box is the nearest ancestor of its text that carries a height.
const pickerBox = (text: string) => {
  let n: HTMLElement | null = screen.getByText(text)
  while (n && !n.style.minHeight) n = n.parentElement
  if (!n) throw new Error('no picker box')
  return n
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('Input field', () => {
  it('is 40px with 10px corners and the readable edge', () => {
    render(wrap(<Input field aria-label="x" label="Name" />))
    const box = screen.getByRole('textbox')
    expect(box).toHaveStyle({ minHeight: '40px', height: '40px', borderRadius: '10px' })
    expect(box).toHaveStyle({ borderColor: t.borderField })
  })

  it('leaves the plain input exactly as it was', () => {
    render(wrap(<Input label="Name" />))
    const box = screen.getByRole('textbox')
    expect(box).toHaveStyle({ minHeight: '36px', height: '36px', borderRadius: '8px' })
    expect(box).toHaveStyle({ borderColor: t.borderInput })
  })

  it('turns the edge to the accent on focus and back to the field edge on blur', () => {
    render(wrap(<Input field label="Name" />))
    const box = screen.getByRole('textbox')
    fireEvent.focus(box)
    expect(box).toHaveStyle({ borderColor: t.accent })
    fireEvent.blur(box)
    expect(box).toHaveStyle({ borderColor: t.borderField })
  })

  it('draws an error in the danger colour and returns to it on blur', () => {
    render(wrap(<Input field label="Name" error="Required" />))
    const box = screen.getByRole('textbox')
    expect(box).toHaveStyle({ borderColor: t.dangerBorder })
    fireEvent.focus(box)
    fireEvent.blur(box)
    expect(box).toHaveStyle({ borderColor: t.dangerBorder })
  })

  it('keeps room for a prefix and a suffix', () => {
    render(wrap(<Input field prefix="$" suffix="USD" />))
    const box = screen.getByRole('textbox')
    expect(box).toHaveStyle({ paddingInlineStart: '32px', paddingInlineEnd: '36px' })
  })

  it('lets the caller override a single value', () => {
    render(wrap(<Input field style={{ width: '120px' }} />))
    expect(screen.getByRole('textbox')).toHaveStyle({ width: '120px' })
  })

  it('draws a date box the same way', () => {
    const { container } = render(wrap(<Input field type="date" label="Expected" />))
    const box = container.querySelector('input[type="date"]')
    expect(box).toHaveStyle({ height: '40px', borderRadius: '10px' })
    expect(box).toHaveStyle({ borderColor: t.borderField })
  })

  it('asks the browser for a dark calendar in the dark theme', () => {
    expect(fieldControlStyle(themes.black, { dark: true }).colorScheme).toBe('dark')
    expect(fieldControlStyle(t).colorScheme).toBe('light')
  })

  it('keeps a disabled box faded and not-allowed', () => {
    render(wrap(<Input field disabled />))
    expect(screen.getByRole('textbox')).toHaveStyle({ opacity: '0.5', cursor: 'not-allowed' })
  })
})

describe('Select field', () => {
  const nativeOptions = (
    <>
      <option value="low">Low</option>
      <option value="high">High</option>
    </>
  )

  it('is a native box with the same height, corners and edge', () => {
    render(
      wrap(
        <Select field value="low" label="Priority">
          {nativeOptions}
        </Select>,
      ),
    )
    const box = screen.getByRole('combobox')
    expect(box).toHaveStyle({ height: '40px', borderRadius: '10px' })
    expect(box).toHaveStyle({ borderColor: t.borderField })
  })

  it('hides the browser arrow and draws the searchable select chevron instead', () => {
    render(
      wrap(
        <Select field value="low">
          {nativeOptions}
        </Select>,
      ),
    )
    const box = screen.getByRole('combobox')
    expect(box.style.appearance).toBe('none')
    expect(box.style.backgroundImage).toContain('data:image/svg+xml')
    expect(decodeURIComponent(box.style.backgroundImage)).toContain('M2 4l4 4 4-4')
    expect(box).toHaveStyle({ paddingInlineEnd: '36px' })
  })

  it('puts the chevron on the right in English and on the left in Arabic', () => {
    // jsdom does not keep a three-value background-position, so the position is read from the style itself
    expect(fieldControlStyle(t, { select: true, rtl: false }).backgroundPosition).toBe(
      'right 12px center',
    )
    expect(fieldControlStyle(t, { select: true, rtl: true }).backgroundPosition).toBe(
      'left 12px center',
    )
    expect(fieldControlStyle(t, { select: false }).backgroundPosition).toBeUndefined()
  })

  it('leaves the plain native select exactly as it was', () => {
    render(wrap(<Select value="low">{nativeOptions}</Select>))
    const box = screen.getByRole('combobox')
    expect(box).toHaveStyle({ height: '36px', borderRadius: '8px' })
    expect(box.style.appearance).not.toBe('none')
    expect(box.style.backgroundImage).toBe('')
  })

  it('turns the edge to the accent on focus and back on blur', () => {
    render(
      wrap(
        <Select field value="low">
          {nativeOptions}
        </Select>,
      ),
    )
    const box = screen.getByRole('combobox')
    fireEvent.focus(box)
    expect(box).toHaveStyle({ borderColor: t.accent })
    fireEvent.blur(box)
    expect(box).toHaveStyle({ borderColor: t.borderField })
  })

  it('shows an empty choice as a hint colour, a chosen one as text', () => {
    const { rerender } = render(
      wrap(
        <Select field value="" placeholder="Pick one">
          {nativeOptions}
        </Select>,
      ),
    )
    expect(screen.getByRole('combobox')).toHaveStyle({ color: t.textMuted })
    rerender(
      wrap(
        <Select field value="low" placeholder="Pick one">
          {nativeOptions}
        </Select>,
      ),
    )
    expect(screen.getByRole('combobox')).toHaveStyle({ color: t.textPrimary })
  })

  it('passes field on to the searchable picker when given a list of options', () => {
    render(
      wrap(
        <Select field value="" placeholder="Pick one" options={[{ value: 'a', label: 'Alpha' }]} />,
      ),
    )
    expect(pickerBox('Pick one')).toHaveStyle({ minHeight: '40px', borderRadius: '10px' })
  })

  it('draws the plain searchable picker at 36px as before', () => {
    render(
      wrap(<Select value="" placeholder="Pick one" options={[{ value: 'a', label: 'Alpha' }]} />),
    )
    expect(pickerBox('Pick one')).toHaveStyle({ minHeight: '36px', borderRadius: '6px' })
  })
})

describe('Textarea field', () => {
  it('has the field edge, 10px corners and room for three lines', () => {
    render(wrap(<Textarea field label="Notes" />))
    const box = screen.getByRole('textbox')
    expect(box).toHaveStyle({ borderRadius: '10px', minHeight: '88px' })
    expect(box).toHaveStyle({ borderColor: t.borderField })
    expect(box.style.resize).toBe('vertical')
  })

  it('leaves the plain text area exactly as it was', () => {
    render(wrap(<Textarea label="Notes" />))
    const box = screen.getByRole('textbox')
    expect(box).toHaveStyle({ borderRadius: '8px' })
    expect(box).toHaveStyle({ borderColor: t.borderInput })
  })

  it('turns the edge to the accent on focus and back to the field edge on blur', () => {
    render(wrap(<Textarea field label="Notes" />))
    const box = screen.getByRole('textbox')
    fireEvent.focus(box)
    expect(box).toHaveStyle({ borderColor: t.accent })
    fireEvent.blur(box)
    expect(box).toHaveStyle({ borderColor: t.borderField })
  })
})

describe('the shared style', () => {
  it('has a dense size for a box inside a grid of lines', () => {
    const s = fieldControlStyle(t, { size: 'sm' })
    expect(s.height).toBe('36px')
    expect(s.borderRadius).toBe('8px')
    expect(s.border).toContain(t.borderField)
  })

  it('has a taller box for a text area and does not fix its height', () => {
    const s = fieldTextareaStyle(t)
    expect(s.height).toBe('auto')
    expect(s.minHeight).toBe('88px')
  })

  it('uses the dark theme tokens in the dark theme', () => {
    const s = fieldControlStyle(themes.black, { error: false })
    expect(s.border).toContain(themes.black.borderField)
    expect(s.background).toBe(themes.black.bgSurface)
  })
})
