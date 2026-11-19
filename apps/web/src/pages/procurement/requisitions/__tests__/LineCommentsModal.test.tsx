// The comments dialog of a requisition line. It was a hand-rolled overlay (no Escape, no focus trap, no dialog role)
// with fixed light-theme flag colours and a physical `border-left`; it is the shared Modal now, with theme colours.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import { themes } from '../../../../theme/tokens'
import { ADD_PO_LINE_COMMENT } from '../../../../graphql/procurement'

const addFn = vi.fn()
const resolveFn = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useMutation: (doc: unknown) => [
      doc === ADD_PO_LINE_COMMENT ? addFn : resolveFn,
      { loading: false },
    ],
  }
})
const toast = vi.fn()
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (select: (s: { addToast: typeof toast }) => unknown) =>
    select({ addToast: toast }),
}))

import { LineCommentsModal, type LineComment } from '../LineCommentsModal'

const comments: LineComment[] = [
  {
    id: 'c1',
    comment: 'Price looks high',
    created_by_name: 'Sara',
    created_at: '2026-11-10T09:30:00.000Z',
    flag: 'warning',
    resolved: false,
  },
  {
    id: 'c2',
    comment: 'Checked with vendor',
    created_by_name: 'Omar',
    created_at: '2026-11-11T09:30:00.000Z',
    flag: 'dispute',
    resolved: true,
    resolved_at: '2026-11-12T09:30:00.000Z',
  },
  {
    id: 'c3',
    comment: 'Just a note',
    created_by_name: 'Lina',
    created_at: '2026-11-13T09:30:00.000Z',
    flag: null,
    resolved: false,
  },
]

function mount(list: LineComment[] = comments) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(
    <ThemeProvider>
      <LineCommentsModal
        poId="req-1"
        lineId="l1"
        description="PVC pipe 1.5"
        comments={list}
        onClose={onClose}
        onChanged={onChanged}
      />
    </ThemeProvider>,
  )
  return { onClose, onChanged }
}
const dialog = () => screen.getByRole('dialog')
const addButton = () => within(dialog()).getByRole('button', { name: i18n.t('po.detail.add') })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  addFn.mockResolvedValue({})
  resolveFn.mockResolvedValue({})
})
afterEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('LineCommentsModal: the dialog', () => {
  it('is a named, modal dialog with the item in its description', () => {
    mount()
    expect(dialog()).toHaveAccessibleName(i18n.t('po.detail.comments'))
    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(dialog()).toHaveAccessibleDescription(
      i18n.t('po.detail.itemDescriptionLabel', { text: 'PVC pipe 1.5' }),
    )
  })

  it('closes on Escape', () => {
    const { onClose } = mount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes from its Close button', () => {
    const { onClose } = mount()
    // the Modal's own cross is also named "Close": take the one in the form, which says the word
    const buttons = within(dialog()).getAllByRole('button', { name: i18n.t('po.detail.close') })
    fireEvent.click(buttons[buttons.length - 1])
    expect(onClose).toHaveBeenCalled()
  })

  it('says there is nothing yet, in the readable grey, when there are no comments', () => {
    mount([])
    expect(screen.getByText(i18n.t('po.detail.noCommentsYet'))).toHaveStyle({
      color: themes['light-flat'].textSecondary,
    })
  })

  it('lists every comment with who wrote it', () => {
    mount()
    for (const text of ['Price looks high', 'Checked with vendor', 'Just a note']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByText(/Sara/)).toBeInTheDocument()
  })
})

describe('LineCommentsModal: flags', () => {
  it('draws each flag label in its theme colour (not a fixed hex)', () => {
    mount()
    const warning = screen.getAllByText(i18n.t('po.detail.warning'))[0]
    expect(warning).toHaveStyle({ color: themes['light-flat'].warning })
    expect(warning.style.color).not.toMatch(/245,\s*158,\s*11|#f59e0b/i)
  })

  it('takes the dark theme colours with the dark theme', () => {
    localStorage.setItem('fnc-theme', 'black')
    mount()
    expect(screen.getAllByText(i18n.t('po.detail.warning'))[0]).toHaveStyle({
      color: themes.black.warning,
    })
  })

  it('offers Resolve on an open flag only', () => {
    mount()
    expect(
      within(dialog()).getAllByRole('button', { name: i18n.t('po.detail.resolve') }),
    ).toHaveLength(1)
  })

  it('resolves the flag, then tells the page to reload the comments', async () => {
    const { onChanged } = mount()
    fireEvent.click(within(dialog()).getByRole('button', { name: i18n.t('po.detail.resolve') }))
    await waitFor(() => {
      expect(resolveFn).toHaveBeenCalledWith({ variables: { poId: 'req-1', commentId: 'c1' } })
    })
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(toast).toHaveBeenCalledWith({
      type: 'success',
      message: i18n.t('po.detail.flagResolved'),
    })
  })

  it('says so when resolving fails, and does not reload', async () => {
    resolveFn.mockRejectedValue(new Error('no'))
    const { onChanged } = mount()
    fireEvent.click(within(dialog()).getByRole('button', { name: i18n.t('po.detail.resolve') }))
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        type: 'error',
        message: i18n.t('po.detail.failedToResolveFlag'),
      })
    })
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('says which flag is chosen for a new comment, and only one at a time', () => {
    mount()
    const chip = (name: string) => within(dialog()).getByRole('button', { name, pressed: true })
    const warningChip = within(dialog())
      .getAllByRole('button', { name: i18n.t('po.detail.warning') })
      .find((b) => b.getAttribute('aria-pressed') !== null)
    if (!warningChip) throw new Error('no Warning chip')
    fireEvent.click(warningChip)
    expect(chip(i18n.t('po.detail.warning'))).toBe(warningChip)
    const info = within(dialog())
      .getAllByRole('button', { name: i18n.t('po.detail.info') })
      .find((b) => b.getAttribute('aria-pressed') !== null)
    if (!info) throw new Error('no Info chip')
    fireEvent.click(info)
    expect(warningChip).toHaveAttribute('aria-pressed', 'false')
    expect(info).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('LineCommentsModal: adding a comment', () => {
  const box = () => within(dialog()).getByPlaceholderText(i18n.t('po.detail.typeYourComment'))

  it('holds Add back until something is typed', () => {
    mount()
    expect(addButton()).toBeDisabled()
    fireEvent.change(box(), { target: { value: '   ' } })
    expect(addButton()).toBeDisabled()
    fireEvent.change(box(), { target: { value: 'Needs a second quote' } })
    expect(addButton()).toBeEnabled()
  })

  it('sends the trimmed text with no flag, reloads, and clears the box', async () => {
    const { onChanged } = mount()
    fireEvent.change(box(), { target: { value: '  Needs a second quote  ' } })
    fireEvent.click(addButton())
    await waitFor(() => {
      expect(addFn).toHaveBeenCalledWith({
        variables: {
          poId: 'req-1',
          lineId: 'l1',
          comment: 'Needs a second quote',
          flag: undefined,
        },
      })
    })
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
    expect(box()).toHaveValue('')
  })

  it('sends the chosen flag', async () => {
    mount()
    fireEvent.change(box(), { target: { value: 'Late again' } })
    const chip = within(dialog())
      .getAllByRole('button', { name: i18n.t('po.detail.dispute') })
      .find((b) => b.getAttribute('aria-pressed') !== null)
    if (!chip) throw new Error('no Dispute chip')
    fireEvent.click(chip)
    fireEvent.click(addButton())
    await waitFor(() => {
      expect(addFn).toHaveBeenCalledWith({
        variables: { poId: 'req-1', lineId: 'l1', comment: 'Late again', flag: 'dispute' },
      })
    })
  })

  it('adds on Ctrl+Enter', async () => {
    mount()
    fireEvent.change(box(), { target: { value: 'Quick one' } })
    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => {
      expect(addFn).toHaveBeenCalledTimes(1)
    })
  })

  it('says so when adding fails, keeps what was typed, and does not reload', async () => {
    addFn.mockRejectedValue(new Error('no'))
    const { onChanged } = mount()
    fireEvent.change(box(), { target: { value: 'Will fail' } })
    fireEvent.click(addButton())
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        type: 'error',
        message: i18n.t('po.detail.failedToAddComment'),
      })
    })
    expect(onChanged).not.toHaveBeenCalled()
    expect(box()).toHaveValue('Will fail')
  })

  it('draws the text box in the field look', () => {
    mount()
    expect(box()).toHaveStyle({ border: `1px solid ${themes['light-flat'].borderField}` })
  })
})
