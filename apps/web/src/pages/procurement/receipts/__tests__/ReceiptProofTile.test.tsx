// One piece of proof of delivery on the jobsite path of the Record Goods Receipt page: a titled card with a status chip,
// what has been added as thumbnails, and the two ways to add more over a drop zone. It replaces a grid of fixed-size
// buttons with hard-coded colours (a blue drag highlight, a red upload error, an emoji for a PDF).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import { themes } from '../../../../theme/tokens'
import { ReceiptProofTile, type PendingPhoto, type ProofStatus } from '../ReceiptProofTile'

const photo = (over: Partial<PendingPhoto> = {}): PendingPhoto => ({
  id: 'p1',
  file: new File(['x'], 'site.jpg', { type: 'image/jpeg' }),
  previewUrl: 'blob:site',
  label: '',
  kind: 'materials',
  uploading: false,
  ...over,
})

function mount(
  props: {
    status?: ProofStatus
    photos?: PendingPhoto[]
    dragOver?: boolean
  } = {},
) {
  const handlers = {
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onTakePhoto: vi.fn(),
    onAddFile: vi.fn(),
    onRemove: vi.fn(),
  }
  const view = render(
    <ThemeProvider>
      <ReceiptProofTile
        title="Materials Delivered (required)"
        hint="Photo of the goods"
        status={props.status ?? 'missing'}
        statusLabel="Status text"
        photos={props.photos ?? []}
        dragOver={props.dragOver ?? false}
        data-tour="anchor"
        {...handlers}
      />
    </ThemeProvider>,
  )
  const section = view.container.querySelector('section')
  if (!section) throw new Error('no tile')
  return { ...handlers, section, ...view }
}

describe('ReceiptProofTile', () => {
  it('shows the title, the hint and the status, and carries the walkthrough anchor on the title', () => {
    const { section } = mount()
    expect(within(section).getByText('Materials Delivered (required)')).toHaveAttribute('data-tour', 'anchor')
    expect(within(section).getByText('Photo of the goods')).toBeInTheDocument()
    expect(within(section).getByText('Status text')).toBeInTheDocument()
    expect(section).toHaveAttribute('data-proof', 'missing')
  })

  it.each([
    ['missing', 'warning'],
    ['skipped', 'warning'],
    ['onFile', 'success'],
    ['added', 'success'],
  ] as const)('a %s tile has the %s chip', (status, tone) => {
    mount({ status })
    const chip = screen.getByText('Status text')
    expect(chip).toHaveStyle({ color: themes['light-flat'][tone], background: themes['light-flat'][`${tone}Bg`] })
  })

  it('draws the chip from the dark theme in the dark theme', () => {
    localStorage.setItem('fnc-theme', 'black')
    mount({ status: 'added' })
    expect(screen.getByText('Status text')).toHaveStyle({ color: themes.black.success })
    localStorage.clear()
  })

  it('takes a photo or adds a file on the buttons', () => {
    const { onTakePhoto, onAddFile } = mount()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('receipt.form.takePhoto') }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('receipt.form.addPhotoPdf') }))
    expect(onTakePhoto).toHaveBeenCalledTimes(1)
    expect(onAddFile).toHaveBeenCalledTimes(1)
  })

  it('shows a photo as a picture and can remove it, by name', () => {
    const { onRemove } = mount({ photos: [photo()] })
    expect(screen.getByRole('img', { name: 'site.jpg' })).toHaveAttribute('src', 'blob:site')
    fireEvent.click(screen.getByRole('button', { name: i18n.t('receipt.form.removePhoto', { name: 'site.jpg' }) }))
    expect(onRemove).toHaveBeenCalledWith('p1')
  })

  it('shows a PDF as a named file, not as a picture', () => {
    mount({ photos: [photo({ file: new File(['x'], 'invoice.pdf', { type: 'application/pdf' }) })] })
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says a photo is uploading', () => {
    mount({ photos: [photo({ uploading: true })] })
    expect(screen.getByText(i18n.t('receipt.form.uploading'))).toBeInTheDocument()
  })

  it('says why an upload failed, as an alert, in the theme danger colour', () => {
    mount({ photos: [photo({ error: 'Too large' })] })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Too large')
    expect(alert).toHaveStyle({ background: themes['light-flat'].danger })
  })

  it('draws no thumbnails when nothing was added', () => {
    mount()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('highlights the drop zone while a file is dragged over it, with the accent', () => {
    const { container, rerender } = mount()
    const zone = () => container.querySelector('div[style*="dashed"]') as HTMLElement
    expect(zone()).toHaveStyle({ border: `1.5px dashed ${themes['light-flat'].borderField}` })
    rerender(
      <ThemeProvider>
        <ReceiptProofTile
          title="t"
          hint="h"
          status="missing"
          statusLabel="s"
          photos={[]}
          dragOver
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
          onTakePhoto={vi.fn()}
          onAddFile={vi.fn()}
          onRemove={vi.fn()}
        />
      </ThemeProvider>,
    )
    expect(zone()).toHaveStyle({
      border: `1.5px dashed ${themes['light-flat'].accent}`,
      background: themes['light-flat'].accentBg,
    })
  })

  it('reports a drag over, a drag leaving and a drop on the zone', () => {
    const { container, onDragOver, onDragLeave, onDrop } = mount()
    const zone = container.querySelector('div[style*="dashed"]') as HTMLElement
    fireEvent.dragOver(zone)
    fireEvent.dragLeave(zone)
    fireEvent.drop(zone)
    expect(onDragOver).toHaveBeenCalledTimes(1)
    expect(onDragLeave).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})
