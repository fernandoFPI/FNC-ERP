// A product picker holds thousands of options. It used to draw every one of them: 6,909 products took about two seconds
// to open and every mouse move over the list re-drew all of them (about 270 ms each), which looked like glitching on a
// desktop and a phone. Now at most `maxVisible` (200) are drawn, search looks through ALL of them, and a line under the
// list says how many there are.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect'

// jsdom has no layout, so no scrollIntoView; the list calls it to keep the highlighted option in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const many = (n: number): SearchableSelectOption[] =>
  Array.from({ length: n }, (_, i) => ({
    value: `p${i}`,
    label: `Item ${String(i).padStart(4, '0')}`,
    sublabel: `SKU-${i}`,
  }))

function mount(
  options: SearchableSelectOption[],
  extra: { maxVisible?: number; onChange?: (v: string) => void } = {},
) {
  const onChange = extra.onChange ?? vi.fn()
  const view = render(
    <ThemeProvider>
      <SearchableSelect
        value=""
        onChange={onChange}
        options={options}
        placeholder="Pick one"
        maxVisible={extra.maxVisible}
      />
    </ThemeProvider>,
  )
  return { ...view, onChange }
}
const open = () => {
  fireEvent.click(screen.getByText('Pick one'))
}
const drawn = () => document.querySelectorAll('[data-idx]').length
const search = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: text } })
}
const note = () => screen.queryByTestId('select-truncated')

describe('SearchableSelect with a long list', () => {
  it('draws only the first 200 of a thousand options', () => {
    mount(many(1000))
    open()
    expect(drawn()).toBe(200)
  })

  it('says how many there are and that typing narrows the list', () => {
    mount(many(1000))
    open()
    expect(note()).toHaveTextContent('Showing the first 200 of 1,000. Type to narrow the list.')
  })

  it('draws every option and says nothing when the list is short enough', () => {
    mount(many(200))
    open()
    expect(drawn()).toBe(200)
    expect(note()).not.toBeInTheDocument()
  })

  it('draws a short list exactly as before', () => {
    mount(many(12))
    open()
    expect(drawn()).toBe(12)
    expect(note()).not.toBeInTheDocument()
  })

  it('searches ALL the options, including the ones that are not drawn', () => {
    mount(many(1000))
    open()
    search('Item 0950')
    expect(drawn()).toBe(1)
    expect(screen.getByText('Item 0950')).toBeInTheDocument()
  })

  it('searches the code as well as the name', () => {
    mount(many(1000))
    open()
    search('sku-777')
    expect(screen.getByText('Item 0777')).toBeInTheDocument()
  })

  it('says how many matched when a search still matches more than fit', () => {
    mount(many(1000))
    open()
    search('item 0') // 1000 items, every label starts "Item 0" for 0000 to 0999
    expect(drawn()).toBe(200)
    expect(note()).toHaveTextContent('Showing the first 200 of 1,000')
  })

  it('drops the note once the search narrows the list to what fits', () => {
    mount(many(1000))
    open()
    search('Item 09')
    expect(drawn()).toBe(100)
    expect(note()).not.toBeInTheDocument()
  })

  it('a beyond-the-cap option can be chosen once the search brings it up', () => {
    const { onChange } = mount(many(1000))
    open()
    search('Item 0999')
    fireEvent.mouseDown(screen.getByText('Item 0999'))
    expect(onChange).toHaveBeenCalledWith('p999')
  })

  it('the keyboard stops at the last option that is drawn', () => {
    const { onChange } = mount(many(1000))
    open()
    const box = screen.getByPlaceholderText(/search/i)
    for (let i = 0; i < 400; i++) fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    // 200 drawn: the last one the arrow can reach is the 200th, never a hidden one
    expect(onChange).toHaveBeenCalledWith('p199')
  })

  it('Enter chooses the highlighted option', () => {
    const { onChange } = mount(many(1000))
    open()
    const box = screen.getByPlaceholderText(/search/i)
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('p2')
  })

  it('the cap can be changed by the screen that needs another', () => {
    mount(many(1000), { maxVisible: 50 })
    open()
    expect(drawn()).toBe(50)
    expect(note()).toHaveTextContent('Showing the first 50 of 1,000')
  })

  it('keeps the note in view: it is under the list, not at the end of it', () => {
    mount(many(1000))
    open()
    const list = document.querySelector('[data-idx]')?.parentElement
    const noteEl = note()
    expect(list).toBeTruthy()
    // the note is a sibling of the scrolling list, never inside it
    expect(list?.contains(noteEl)).toBe(false)
    expect(list?.parentElement).toContainElement(noteEl)
  })

  it('says it in Arabic too, with the counts', async () => {
    await i18n.changeLanguage('ar')
    try {
      mount(many(1000))
      open()
      expect(note()?.textContent).toContain('1,000')
      expect(note()?.textContent).toMatch(/[؀-ۿ]/)
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
