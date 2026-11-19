// Saved filter presets (used by about a dozen list pages). The button, the list, saving a new one, and the opt-in `inline` mode the
// Purchase Orders and Requisitions lists use inside their "More Filters" panel, where a floating list would be cut off by the panel.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import i18n from '../../../i18n'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { FilterPresets } from '../FilterPresets'

// the element a test is about, or a clear failure (a cast would hide a null, and the lint rules forbid `!`)
const must = <T,>(x: T | null | undefined): T => {
  if (x == null) throw new Error('expected the element to exist')
  return x
}

const light = themes['light-flat']
const preset = (id: string, name: string) => ({
  id,
  name,
  filters: { status: 'closed' },
  savedAt: '2026-11-01',
})

const show = (props: Partial<React.ComponentProps<typeof FilterPresets>> = {}) => {
  const onApply = vi.fn()
  const onSave = vi.fn()
  const onDelete = vi.fn()
  render(
    <ThemeProvider>
      <div>
        <span>outside</span>
        <FilterPresets
          presets={[preset('a', 'Mine, payment pending'), preset('b', 'Closed this month')]}
          onApply={onApply}
          onSave={onSave}
          onDelete={onDelete}
          {...props}
        />
      </div>
    </ThemeProvider>,
  )
  return { onApply, onSave, onDelete }
}
const trigger = () =>
  screen.getByRole('button', { name: new RegExp(i18n.t('ui.presets.presetsBtn')) })
const nameBox = () => screen.getByPlaceholderText(i18n.t('ui.presets.nameThisPreset'))
const saveButton = () => screen.getByRole('button', { name: i18n.t('ui.presets.save') })
// the open list is the element that holds the name box and the save button
const popup = () => must(nameBox().parentElement?.parentElement?.parentElement)

describe('FilterPresets', () => {
  it('starts closed, says so, and shows how many presets there are', () => {
    show()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'true')
    expect(trigger()).toHaveTextContent('2')
    expect(screen.queryByPlaceholderText(i18n.t('ui.presets.nameThisPreset'))).toBeNull()
  })

  it('shows no count when there are none, and says there is nothing saved once opened', () => {
    show({ presets: [] })
    expect(trigger()).toHaveTextContent(new RegExp(`^${i18n.t('ui.presets.presetsBtn')}$`))
    fireEvent.click(trigger())
    expect(screen.getByText(i18n.t('ui.presets.noSavedPresets'))).toBeInTheDocument()
  })

  it('opens on a press, says it is open, and closes on a second press', () => {
    show()
    fireEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Mine, payment pending' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Closed this month' })).toBeInTheDocument()
    fireEvent.click(trigger())
    expect(screen.queryByRole('button', { name: 'Mine, payment pending' })).toBeNull()
  })

  it('closes when the page outside is pressed, but not when the list is', () => {
    show()
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Closed this month' }))
    expect(screen.getByRole('button', { name: 'Closed this month' })).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('button', { name: 'Closed this month' })).toBeNull()
  })

  it('applies a preset and closes', () => {
    const { onApply, onDelete } = show()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: 'Closed this month' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b', name: 'Closed this month' }),
    )
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Closed this month' })).toBeNull()
  })

  it('deletes a preset with its own button, and does not apply it', () => {
    const { onApply, onDelete } = show()
    fireEvent.click(trigger())
    const row = must(screen.getByRole('button', { name: 'Mine, payment pending' }).parentElement)
    fireEvent.click(within(row).getByTitle(i18n.t('ui.presets.deletePreset')))
    expect(onDelete).toHaveBeenCalledWith('a')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cannot save until a name is typed, and a name of spaces does not count', () => {
    const { onSave } = show()
    fireEvent.click(trigger())
    expect(saveButton()).toBeDisabled()
    fireEvent.change(nameBox(), { target: { value: '   ' } })
    expect(saveButton()).toBeDisabled()
    fireEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the name without the spaces round it, and clears the box', () => {
    const { onSave } = show()
    fireEvent.click(trigger())
    fireEvent.change(nameBox(), { target: { value: '  Late deliveries  ' } })
    expect(saveButton()).toBeEnabled()
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledWith('Late deliveries')
    expect(nameBox()).toHaveValue('')
  })

  it('saves on Enter and closes on Escape from the name box', () => {
    const { onSave } = show()
    fireEvent.click(trigger())
    fireEvent.change(nameBox(), { target: { value: 'Mine' } })
    fireEvent.keyDown(nameBox(), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledWith('Mine')
    fireEvent.keyDown(nameBox(), { key: 'Escape' })
    expect(screen.queryByPlaceholderText(i18n.t('ui.presets.nameThisPreset'))).toBeNull()
  })

  it('shows the Save button in the solid accent once there is a name, and flat before', () => {
    show()
    fireEvent.click(trigger())
    expect(saveButton()).toHaveStyle({ background: light.border, color: light.textSecondary })
    fireEvent.change(nameBox(), { target: { value: 'Mine' } })
    expect(saveButton()).toHaveStyle({
      background: light.accentSolid,
      color: light.accentSolidText,
    })
  })

  it('leaves the keyboard ring of the name box to the browser, not switched off', () => {
    show()
    fireEvent.click(trigger())
    expect(nameBox().style.outline).not.toBe('none')
  })

  it('reads its section heading in the readable grey, not the pale one', () => {
    show()
    fireEvent.click(trigger())
    expect(screen.getByText(i18n.t('ui.presets.saveCurrentFilters'))).toHaveStyle({
      color: light.textSecondary,
    })
  })

  describe('where the list opens', () => {
    it('floats under the button by default, as it always has', () => {
      show()
      fireEvent.click(trigger())
      expect(popup()).toHaveStyle({ position: 'absolute', width: '264px' })
    })

    it('in inline mode stays in the flow of its panel, full width and with no shadow floating over anything', () => {
      show({ inline: true })
      fireEvent.click(trigger())
      expect(popup().style.position).not.toBe('absolute')
      expect(popup()).toHaveStyle({ width: '100%', boxShadow: 'none' })
    })

    it('in inline mode does everything the floating one does', () => {
      const { onApply, onSave } = show({ inline: true })
      fireEvent.click(trigger())
      fireEvent.change(nameBox(), { target: { value: 'Mine' } })
      fireEvent.click(saveButton())
      expect(onSave).toHaveBeenCalledWith('Mine')
      fireEvent.click(screen.getByRole('button', { name: 'Closed this month' }))
      expect(onApply).toHaveBeenCalledTimes(1)
    })
  })
})
