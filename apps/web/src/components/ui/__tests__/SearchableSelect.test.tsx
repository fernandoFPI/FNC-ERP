// How wide the popup list of a picker is. Found on Store Out: the Project filter's list was the
// default 260px, so the code chip left no room for the project name ("AW-PRJ-2026-0078  Power Generatio…").
// jsdom has no layout, so the field's box is stubbed and the popup's inline width is read back.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { SearchableSelect } from '../SearchableSelect'
import { Select } from '../Select'

const options = [
  {
    value: 'p1',
    label: 'Purchase of 1 Additional Equipped Storage Containers (FFSD)',
    sublabel: 'AW-PRJ-2026-0075',
  },
  { value: 'p2', label: 'Power Generation', sublabel: 'AW-PRJ-2026-0078' },
]

const originalWidth = window.innerWidth
const originalHeight = window.innerHeight

// The field as the Store Out page lays it out: about 236px wide, a little way in from the left edge.
function stubFieldBox(box: { width: number; left: number }) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...box,
    top: 318,
    bottom: 354,
    right: box.left + box.width,
    height: 36,
    x: box.left,
    y: 318,
    toJSON: () => ({}),
  })
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
}

// The popup is the one fixed-position element the picker portals into <body>.
function openAndGetPopup(): HTMLElement {
  fireEvent.click(screen.getByText('All Projects'))
  const popup = document.body.querySelector<HTMLElement>('div[style*="position: fixed"]')
  if (!popup) throw new Error('The picker did not open')
  return popup
}

beforeEach(() => {
  setWindowWidth(1400)
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  stubFieldBox({ width: 236, left: 216 })
})

afterEach(() => {
  vi.restoreAllMocks()
  setWindowWidth(originalWidth)
  Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true })
})

const renderPicker = (props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) =>
  render(
    <ThemeProvider>
      <SearchableSelect
        value=""
        onChange={vi.fn()}
        options={options}
        placeholder="All Projects"
        {...props}
      />
    </ThemeProvider>,
  )

describe('SearchableSelect popup width', () => {
  it('is 260px by default, so every picker that does not ask for more is unchanged', () => {
    renderPicker()
    expect(openAndGetPopup().style.width).toBe('260px')
  })

  it('can be made wider than its field for entries with long names', () => {
    renderPicker({ minDropdownWidth: 560 })
    expect(openAndGetPopup().style.width).toBe('560px')
  })

  it('is never narrower than the field itself', () => {
    stubFieldBox({ width: 700, left: 216 })
    renderPicker({ minDropdownWidth: 560 })
    expect(openAndGetPopup().style.width).toBe('700px')
  })

  it('is cut down to the window, so a wide list cannot be pushed off a phone screen', () => {
    setWindowWidth(390)
    stubFieldBox({ width: 340, left: 20 })
    renderPicker({ minDropdownWidth: 560 })
    const popup = openAndGetPopup()
    expect(popup.style.width).toBe('374px') // 390 less an 8px margin on each side
    expect(popup.style.left).toBe('8px')
  })

  it('keeps a wide list inside the right edge when the field sits near it', () => {
    stubFieldBox({ width: 236, left: 1300 })
    renderPicker({ minDropdownWidth: 560 })
    const popup = openAndGetPopup()
    expect(popup.style.width).toBe('560px')
    expect(parseFloat(popup.style.left) + 560).toBeLessThanOrEqual(1400 - 8)
  })

  it('shows the whole project code and name in the list', () => {
    renderPicker({ minDropdownWidth: 560 })
    openAndGetPopup()
    expect(
      screen.getByText('Purchase of 1 Additional Equipped Storage Containers (FFSD)'),
    ).toBeInTheDocument()
    expect(screen.getByText('AW-PRJ-2026-0075')).toBeInTheDocument()
  })
})

describe('Select passes the popup width through', () => {
  const renderSelect = (minDropdownWidth?: number) =>
    render(
      <ThemeProvider>
        <Select
          value=""
          options={options.map(({ value, label }) => ({ value, label }))}
          placeholder="All Projects"
          onChange={vi.fn()}
          {...(minDropdownWidth != null ? { minDropdownWidth } : {})}
        />
      </ThemeProvider>,
    )

  it('uses the requested width', () => {
    renderSelect(560)
    expect(openAndGetPopup().style.width).toBe('560px')
  })

  it('keeps the 260px default when none is given', () => {
    renderSelect()
    expect(openAndGetPopup().style.width).toBe('260px')
  })
})
