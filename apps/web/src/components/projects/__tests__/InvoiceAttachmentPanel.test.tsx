import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as LoaderModule from '../../../lib/loadPrintAttachment'
import { SET_INVOICE_PRINT_ATTACHMENT } from '../../../graphql/projects'

const apiPost = vi.fn()
vi.mock('../../../lib/axios', () => ({
  api: { post: (...a: unknown[]): unknown => apiPost(...a) },
}))

const setMutation = vi.fn()
const removeMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useMutation: (doc: unknown) => [
      (...a: unknown[]): unknown =>
        doc === SET_INVOICE_PRINT_ATTACHMENT ? setMutation(...a) : removeMutation(...a),
      { loading: false },
    ],
  }
})

const addToast = vi.fn()
vi.mock('../../../store/toastStore', () => ({
  useToastStore: (sel: (s: { addToast: typeof addToast }) => unknown) => sel({ addToast }),
}))

const pagesFromBytes = vi.fn()
vi.mock('../../../lib/loadPrintAttachment', async (importOriginal) => {
  const actual = await importOriginal<typeof LoaderModule>()
  return { ...actual, pagesFromBytes: (...a: unknown[]): unknown => pagesFromBytes(...a) }
})

import { PrintAttachmentError } from '../../../lib/loadPrintAttachment'
import {
  cachedAttachmentPages,
  forgetAttachmentPages,
  rememberAttachmentPages,
} from '../../../lib/invoicePrintAttachment'
import type { AttachmentPagesState } from '../../../hooks/usePrintAttachmentPages'
import { InvoiceAttachmentPanel, type InvoicePrintAttachmentInfo } from '../InvoiceAttachmentPanel'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(`proj.invDetail.${k}`, o)

const ATT: InvoicePrintAttachmentInfo = {
  id: 'da-1',
  fileId: 'file-old',
  filename: 'client-po-approval.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 340 * 1024,
}

const onChanged = vi.fn()
const onRetry = vi.fn()

function setup(
  over: Partial<{
    attachment: InvoicePrintAttachmentInfo | null
    pages: AttachmentPagesState
    canEdit: boolean
  }> = {},
) {
  return render(
    <ThemeProvider>
      <InvoiceAttachmentPanel
        invoiceId="inv-1"
        attachment={over.attachment === undefined ? null : over.attachment}
        pages={over.pages ?? { status: 'none' }}
        onRetry={onRetry}
        canEdit={over.canEdit ?? true}
        onChanged={onChanged}
      />
    </ThemeProvider>,
  )
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>(t('printAttachmentFile'))
function pick(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } })
}
const pdfFile = (name = 'po.pdf', size = 5000) => {
  const f = new File([new Uint8Array(size > 100 ? 100 : size)], name, { type: 'application/pdf' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const alertText = () => screen.getByRole('alert').textContent

beforeEach(() => {
  apiPost.mockReset()
  setMutation.mockReset().mockResolvedValue({ data: {} })
  removeMutation.mockReset().mockResolvedValue({ data: { removeInvoicePrintAttachment: true } })
  pagesFromBytes.mockReset().mockResolvedValue(['page-1', 'page-2'])
  addToast.mockReset()
  onChanged.mockReset()
  onRetry.mockReset()
  forgetAttachmentPages('file-new')
  forgetAttachmentPages('file-old')
  apiPost.mockImplementation((url: string) =>
    url === '/files/upload-url'
      ? Promise.resolve({ data: { fileId: 'file-new' } })
      : Promise.resolve({ data: {} }),
  )
})

describe('what the panel shows', () => {
  it('nothing attached: says so, with the hint and an Add button for someone who can edit', () => {
    setup()
    expect(screen.getByText(t('printAttachmentTitle'))).toBeInTheDocument()
    expect(screen.getByText(t('printAttachmentNone'))).toBeInTheDocument()
    expect(screen.getByText(t('printAttachmentHint'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('printAttachmentAdd') })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('printAttachmentRemove') })).toBeNull()
  })

  it('someone who cannot edit sees what is attached but no buttons and no instructions', () => {
    setup({ attachment: ATT, pages: { status: 'ready', pages: ['a'] }, canEdit: false })
    expect(screen.getByText('client-po-approval.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(t('printAttachmentHint'))).toBeNull()
  })

  it('an attachment: its name, its size, Replace and Remove (not Add)', () => {
    setup({ attachment: ATT, pages: { status: 'ready', pages: ['a', 'b', 'c'] } })
    expect(screen.getByText('client-po-approval.pdf')).toBeInTheDocument()
    expect(screen.getByText('340 KB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('printAttachmentReplace') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('printAttachmentRemove') })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('printAttachmentAdd') })).toBeNull()
    expect(screen.getByTestId('invoice-attachment-status')).toHaveTextContent(
      t('printAttachmentSheets', { sheets: 3 }),
    )
  })

  it('while the pages are being made it says so', () => {
    setup({ attachment: ATT, pages: { status: 'loading' } })
    expect(screen.getByTestId('invoice-attachment-status')).toHaveTextContent(
      t('printAttachmentPreparing'),
    )
  })

  it('the file input only offers JPG, PNG and PDF', () => {
    setup()
    const accept = fileInput().accept
    for (const want of ['.jpg', '.jpeg', '.png', '.pdf']) expect(accept).toContain(want)
    expect(accept).not.toContain('.gif')
  })
})

describe('why an attachment cannot be used (the status line)', () => {
  it('a PDF that is too long says how long it is and the limit; no retry (trying again cannot help)', () => {
    setup({
      attachment: ATT,
      pages: { status: 'failed', reason: 'tooLong', detail: { pageCount: 12, maxPages: 10 } },
    })
    expect(screen.getByTestId('invoice-attachment-status')).toHaveTextContent(
      t('printAttachmentTooLong', { pageCount: 12, maxPages: 10 }),
    )
    expect(screen.queryByRole('button', { name: t('printAttachmentRetry') })).toBeNull()
  })

  it('a file that cannot be read says so, with no retry', () => {
    setup({ attachment: ATT, pages: { status: 'failed', reason: 'unreadable' } })
    expect(screen.getByTestId('invoice-attachment-status')).toHaveTextContent(
      t('printAttachmentUnreadable'),
    )
    expect(screen.queryByRole('button', { name: t('printAttachmentRetry') })).toBeNull()
  })

  it('a download that failed offers Try again, and it asks the page to retry', () => {
    setup({ attachment: ATT, pages: { status: 'failed', reason: 'download' } })
    expect(screen.getByTestId('invoice-attachment-status')).toHaveTextContent(
      t('printAttachmentLoadFailed'),
    )
    fireEvent.click(screen.getByRole('button', { name: t('printAttachmentRetry') }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('choosing a file that cannot be used (nothing is uploaded)', () => {
  const neverUploads = () => {
    expect(apiPost).not.toHaveBeenCalled()
    expect(setMutation).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  }

  it('a GIF', async () => {
    setup()
    pick(new File(['x'], 'photo.gif', { type: 'image/gif' }))
    await waitFor(() => {
      expect(alertText()).toBe(t('printAttachmentBadType'))
    })
    neverUploads()
  })

  it('over 10 MB', async () => {
    setup()
    pick(pdfFile('big.pdf', 10 * 1024 * 1024 + 1))
    await waitFor(() => {
      expect(alertText()).toBe(t('printAttachmentTooBig'))
    })
    neverUploads()
    expect(pagesFromBytes).not.toHaveBeenCalled()
  })

  it('an empty file', async () => {
    setup()
    pick(pdfFile('empty.pdf', 0))
    await waitFor(() => {
      expect(alertText()).toBe(t('printAttachmentEmpty'))
    })
    neverUploads()
  })

  it('a PDF over the page limit, naming both numbers', async () => {
    pagesFromBytes.mockRejectedValue(
      new PrintAttachmentError('tooLong', { pageCount: 14, maxPages: 10 }),
    )
    setup()
    pick(pdfFile())
    await waitFor(() => {
      expect(alertText()).toBe(t('printAttachmentTooLong', { pageCount: 14, maxPages: 10 }))
    })
    neverUploads()
  })

  it('a file that is damaged or not what it says', async () => {
    pagesFromBytes.mockRejectedValue(new PrintAttachmentError('unreadable'))
    setup()
    pick(pdfFile())
    await waitFor(() => {
      expect(alertText()).toBe(t('printAttachmentUnreadable'))
    })
    neverUploads()
  })

  it('a refusal goes away when a good file is chosen next', async () => {
    setup()
    pick(new File(['x'], 'photo.gif', { type: 'image/gif' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    pick(pdfFile())
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('adding a file', () => {
  it('opens it, uploads it as an attachment-category file with its real type, attaches it, and says so', async () => {
    setup()
    pick(pdfFile('client-po-approval.pdf', 54_321))
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1)
    })
    expect(apiPost).toHaveBeenNthCalledWith(1, '/files/upload-url', {
      filename: 'client-po-approval.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 54_321,
      category: 'attachment',
    })
    const [url, body, config] = apiPost.mock.calls[1] as [
      string,
      File,
      { headers: Record<string, string> },
    ]
    expect(url).toBe('/files/file-new/content')
    expect(body).toBeInstanceOf(File)
    expect(config.headers['Content-Type']).toBe('application/pdf')
    expect(setMutation).toHaveBeenCalledWith({
      variables: { invoiceId: 'inv-1', fileId: 'file-new' },
    })
    expect(addToast).toHaveBeenCalledWith({ type: 'success', message: t('printAttachmentSaved') })
  })

  it('the file is checked BEFORE it is uploaded (the order matters: a bad PDF must never reach the server)', async () => {
    const order: string[] = []
    pagesFromBytes.mockImplementation(() => {
      order.push('check')
      return Promise.resolve(['p'])
    })
    apiPost.mockImplementation((url: string) => {
      order.push(url)
      return Promise.resolve({ data: { fileId: 'file-new' } })
    })
    setMutation.mockImplementation(() => {
      order.push('attach')
      return Promise.resolve({ data: {} })
    })
    setup()
    pick(pdfFile())
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(order).toEqual(['check', '/files/upload-url', '/files/file-new/content', 'attach'])
  })

  it('keeps the pages it just made under the new file id, so the preview does not download them again', async () => {
    setup()
    pick(pdfFile())
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(cachedAttachmentPages('file-new')).toEqual(['page-1', 'page-2'])
  })

  it('a picture whose type the browser left empty is uploaded by its extension', async () => {
    setup()
    pick(new File([new Uint8Array([1])], 'scan.JPG', { type: '' }))
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      '/files/upload-url',
      expect.objectContaining({ mimeType: 'image/jpeg', filename: 'scan.JPG' }),
    )
    // the bytes are sent with that same type: an empty Content-Type is not read as a body at all (playbook #50)
    expect(apiPost).toHaveBeenNthCalledWith(2, '/files/file-new/content', expect.any(File), {
      headers: { 'Content-Type': 'image/jpeg' },
    })
  })

  it('Replace is the same flow', async () => {
    setup({ attachment: ATT, pages: { status: 'ready', pages: ['a'] } })
    pick(pdfFile('new.pdf'))
    await waitFor(() => {
      expect(setMutation).toHaveBeenCalledWith({
        variables: { invoiceId: 'inv-1', fileId: 'file-new' },
      })
    })
  })

  it("the server refusing it is shown with the server's own reason, and nothing is reported as saved", async () => {
    setMutation.mockRejectedValue(new Error("Requires 'edit' access to 'projects.invoices.edit'"))
    setup()
    pick(pdfFile())
    await waitFor(() => {
      expect(alertText()).toBe(
        `${t('printAttachmentSaveFailed')}: Requires 'edit' access to 'projects.invoices.edit'`,
      )
    })
    expect(onChanged).not.toHaveBeenCalled()
    expect(addToast).not.toHaveBeenCalled()
  })

  it('an upload the server refuses (axios error) shows that message, e.g. a file type it blocks', async () => {
    const err = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: { message: 'File extension .pdf does not match content type image/jpeg' } },
      },
    })
    apiPost.mockImplementation((url: string) =>
      url === '/files/upload-url' ? Promise.reject(err) : Promise.resolve({ data: {} }),
    )
    setup()
    pick(pdfFile())
    await waitFor(() => {
      expect(alertText()).toContain('File extension .pdf does not match content type image/jpeg')
    })
    expect(setMutation).not.toHaveBeenCalled()
  })

  it('the buttons are held while it works', async () => {
    let finish: () => void = () => undefined
    apiPost.mockImplementation((url: string) =>
      url === '/files/upload-url'
        ? new Promise((res) => {
            finish = () => {
              res({ data: { fileId: 'file-new' } })
            }
          })
        : Promise.resolve({ data: {} }),
    )
    setup({ attachment: ATT, pages: { status: 'ready', pages: ['a'] } })
    pick(pdfFile())
    await waitFor(() => {
      expect(screen.getByTestId('invoice-attachment-status')).toHaveTextContent(
        t('printAttachmentUploading'),
      )
    })
    // (a button that is busy carries a spinner, so find the two by their text rather than their accessible name)
    const buttonOf = (text: string) => {
      const el = screen.getByText(text).closest('button')
      if (!el) throw new Error(`no button around "${text}"`)
      return el
    }
    expect(buttonOf(t('printAttachmentReplace'))).toBeDisabled()
    expect(buttonOf(t('printAttachmentRemove'))).toBeDisabled()
    finish()
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(screen.getByRole('button', { name: t('printAttachmentReplace') })).not.toBeDisabled()
  })
})

describe('removing', () => {
  const openConfirm = () => {
    setup({ attachment: ATT, pages: { status: 'ready', pages: ['a'] } })
    fireEvent.click(screen.getByRole('button', { name: t('printAttachmentRemove') }))
  }
  // The panel's own Remove button and the dialog's confirm share a name; the dialog is drawn after the panel.
  const confirmButton = () => {
    const buttons = within(document.body).getAllByRole('button', {
      name: t('printAttachmentRemove'),
    })
    expect(buttons).toHaveLength(2)
    return buttons[1]
  }

  it('asks first, and says what happens', () => {
    openConfirm()
    expect(screen.getByText(t('printAttachmentRemoveTitle'))).toBeInTheDocument()
    expect(screen.getByText(t('printAttachmentRemoveMessage'))).toBeInTheDocument()
    expect(removeMutation).not.toHaveBeenCalled()
  })

  it('confirming removes it, forgets its pages, says so and tells the page to read the invoice again', async () => {
    // the pages of the attached file are in the cache, as they are once the preview has been opened
    rememberAttachmentPages('file-old', ['x'])
    openConfirm()
    fireEvent.click(confirmButton())
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1)
    })
    expect(removeMutation).toHaveBeenCalledWith({ variables: { invoiceId: 'inv-1' } })
    expect(cachedAttachmentPages('file-old')).toBeUndefined()
    expect(addToast).toHaveBeenCalledWith({ type: 'success', message: t('printAttachmentRemoved') })
  })

  it('a failure is shown with its reason and nothing is reported as removed', async () => {
    removeMutation.mockRejectedValue(new Error('Invoice not found'))
    openConfirm()
    fireEvent.click(confirmButton())
    await waitFor(() => {
      expect(alertText()).toBe(`${t('printAttachmentRemoveFailed')}: Invoice not found`)
    })
    expect(onChanged).not.toHaveBeenCalled()
  })
})
