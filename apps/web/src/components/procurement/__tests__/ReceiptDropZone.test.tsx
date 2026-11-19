// Where a buyer attaches the receipt: files dropped or picked, listed as chips with their own remove.
// The list itself lives with the page; these tests only check what the zone asks the page to do.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { themes } from '../../../theme/tokens'
import { ReceiptDropZone } from '../ReceiptDropZone'

const theme = themes['light-flat']
const photo = (name = 'receipt.jpg') => new File(['x'], name, { type: 'image/jpeg' })
const pdf = (name = 'receipt.pdf') => new File(['x'], name, { type: 'application/pdf' })
const sheet = (name = 'notes.xlsx') =>
  new File(['x'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

const show = (props: Partial<React.ComponentProps<typeof ReceiptDropZone>> = {}) => {
  const handlers = { onAdd: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }
  const { container } = render(
    <ThemeProvider>
      <ReceiptDropZone
        files={[]}
        {...handlers}
        browseLabel="Attach receipt photo(s) *"
        addMoreLabel="📎 2 files — add more"
        hint="Photos or a PDF of the receipt: drop them here or browse"
        clearLabel="Clear"
        removeLabel={(name) => `Remove ${name}`}
        {...props}
      />
    </ThemeProvider>,
  )
  const zone = screen.getByTestId('receipt-drop-zone')
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!fileInput) throw new Error('Expected a file input')
  return { ...handlers, container, zone, fileInput, props }
}
afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReceiptDropZone', () => {
  it('with nothing attached: the hint and the browse button, no chips and no Clear', () => {
    show()
    expect(
      screen.getByText('Photos or a PDF of the receipt: drop them here or browse'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach receipt photo(s) *' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('with files: each is a chip with its name, the button says add more, and Clear appears', () => {
    show({ files: [photo('a.jpg'), pdf('b.pdf')] })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('a.jpg')).toBeInTheDocument()
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📎 2 files — add more' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Attach receipt photo(s) *' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('the browse button opens the file picker', () => {
    const { fileInput } = show()
    const open = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Attach receipt photo(s) *' }))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('the picker accepts photos and PDFs, several at once', () => {
    const { fileInput } = show()
    expect(fileInput).toHaveAttribute('accept', 'image/*,application/pdf')
    expect(fileInput.multiple).toBe(true)
  })

  it('files picked are passed to the page, and the picker is emptied so the same file can be picked again', () => {
    const { fileInput, onAdd } = show()
    const a = photo('a.jpg')
    const b = pdf('b.pdf')
    fireEvent.change(fileInput, { target: { files: [a, b] } })
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith([a, b])
    expect(fileInput.value).toBe('')
  })

  it('empties the picker after a pick, by writing an empty value to it', () => {
    // jsdom's file input always reads back '', so watch the write itself
    const { fileInput } = show()
    const write = vi.fn()
    Object.defineProperty(fileInput, 'value', { configurable: true, get: () => '', set: write })
    fireEvent.change(fileInput, { target: { files: [photo('a.jpg')] } })
    expect(write).toHaveBeenCalledWith('')
  })

  it('cancelling the picker (no files) adds nothing', () => {
    const { fileInput, onAdd } = show()
    fireEvent.change(fileInput, { target: { files: [] } })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('the × on a chip removes that file, named for a screen reader', () => {
    const { onRemove } = show({ files: [photo('a.jpg'), pdf('b.pdf')] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove b.pdf' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it('two files with the same name are removed by position, not by name', () => {
    const { onRemove } = show({ files: [photo('same.jpg'), photo('same.jpg')] })
    const removes = screen.getAllByRole('button', { name: 'Remove same.jpg' })
    expect(removes).toHaveLength(2)
    fireEvent.click(removes[1])
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it('Clear asks the page to drop every file', () => {
    const { onClear } = show({ files: [photo()] })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('a photo and a PDF dropped on the zone are added; a spreadsheet dropped with them is ignored', () => {
    const { zone, onAdd } = show()
    const p = photo()
    const d = pdf()
    fireEvent.drop(zone, { dataTransfer: { files: [p, sheet(), d] } })
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith([p, d])
  })

  it('a drop of only things that are not receipts adds nothing', () => {
    const { zone, onAdd } = show()
    fireEvent.drop(zone, { dataTransfer: { files: [sheet()] } })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('lights up while a file is dragged over it and goes back when it leaves or drops', () => {
    const { zone } = show()
    expect(zone).toHaveStyle({ border: `1.5px dashed ${theme.borderField}` })
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveStyle({ border: `1.5px dashed ${theme.accent}` })
    fireEvent.dragLeave(zone)
    expect(zone).toHaveStyle({ border: `1.5px dashed ${theme.borderField}` })
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
    fireEvent.drop(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveStyle({ border: `1.5px dashed ${theme.borderField}` })
  })

  it('when disabled: drops are ignored, nothing lights up, and every button is off', () => {
    const { zone, onAdd } = show({ disabled: true, files: [photo('a.jpg')] })
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveStyle({ border: `1.5px dashed ${theme.borderField}` })
    fireEvent.drop(zone, { dataTransfer: { files: [photo()] } })
    expect(onAdd).not.toHaveBeenCalled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })

  it('the zone is a dashed box, so it reads as a place to drop', () => {
    const { zone } = show()
    expect(zone.style.border).toContain('dashed')
  })
})
