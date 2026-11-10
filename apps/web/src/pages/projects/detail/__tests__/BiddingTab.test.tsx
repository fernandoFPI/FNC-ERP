// The Bidding tab has four file areas: Technical Bid, Commercial Bid, Cost Analysis and Clarifications Bid.
// Cost Analysis is new, and Clarifications stopped being the Technical Queries screen and became a plain file
// area like the other two (migration 321). Renders the real tab (simple bid mode, as all three companies run)
// with the upload API mocked, and checks which sub-tabs each viewer gets and where an upload goes.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider, useTheme } from '../../../../theme/ThemeContext'
import { BiddingTab } from '../ProjectDetail'

const post = vi.hoisted(() => vi.fn())
vi.mock('../../../../lib/axios', () => ({ api: { post, get: vi.fn() } }))

type Role = 'admin' | 'pm' | 'technical' | 'commercial' | 'both' | 'none'

const file = (id: string, bidType: string, title: string) => ({
  id,
  fileId: `f-${id}`,
  bidType,
  filename: `${title}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  title,
  description: null,
  createdAt: '2026-11-10T10:00:00Z',
  downloadUrl: `https://files.test/${id}`,
})

const ALL_FILES = [
  file('a1', 'technical', 'Method statement'),
  file('a2', 'commercial', 'Price schedule'),
  file('a3', 'cost_analysis', 'Rate analysis'),
  file('a4', 'clarifications', 'Clarification log'),
]

interface Over {
  isEditable?: boolean
  isAdmin?: boolean
  viewerRole?: Role
  packageFiles?: ReturnType<typeof file>[]
}

function Harness({
  over,
  spies,
}: {
  over: Over
  spies: { upload: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> }
}) {
  const { theme } = useTheme()
  const noop = vi.fn()
  return (
    <BiddingTab
      projectId="p-1"
      isEditable={over.isEditable ?? true}
      isAdmin={over.isAdmin ?? true}
      viewerRole={over.viewerRole ?? 'admin'}
      theme={theme}
      teamMembers={[]}
      simpleBidMode
      deliverables={[]}
      creatingDeliverable={false}
      onCreateDeliverable={noop}
      onUpdateDeliverable={noop}
      onDeleteDeliverable={noop}
      onUploadDeliverableFile={noop}
      onDeleteDeliverableFile={noop}
      packageFiles={over.packageFiles ?? ALL_FILES}
      onUploadPackageFile={spies.upload}
      onDeletePackageFile={spies.del}
      costItems={[]}
      savingCosts={false}
      onSaveCosts={noop}
      quotations={[]}
      onCreateQuotation={noop}
      onUpdateQuotation={noop}
      onDeleteQuotation={noop}
      summary={null}
      savingSummary={false}
      onUpdateSummary={noop}
      submittingBid={false}
      onSubmitBid={noop}
      approvingBid={false}
      onApproveBid={noop}
      rejectingBid={false}
      onRejectBid={noop}
      revisingBid={false}
      onReviseBid={noop}
    />
  )
}

function renderTab(over: Over = {}) {
  const spies = { upload: vi.fn(), del: vi.fn() }
  const utils = render(
    <MemoryRouter>
      <ThemeProvider>
        <Harness over={over} spies={spies} />
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { ...utils, spies }
}

const tabNames = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent.trim())
    .filter((t) =>
      ['Technical Bid', 'Commercial Bid', 'Cost Analysis', 'Clarifications Bid'].includes(t),
    )

const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

// jsdom's File has no arrayBuffer(), which the real upload code calls.
function makeFile(name: string, type = 'application/pdf'): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(1)) })
  return f
}

function dropFile(f: File) {
  const zone = screen.getByText('browse').closest('div')
  if (!zone) throw new Error('no drop zone')
  fireEvent.drop(zone, { dataTransfer: { files: [f] } })
}

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValueOnce({ data: { fileId: 'new-file-1' } }).mockResolvedValue({ data: {} })
})

describe('BiddingTab sub-tabs', () => {
  it('shows Technical, Commercial, Cost Analysis and Clarifications, in that order, to an administrator', () => {
    renderTab()
    expect(tabNames()).toEqual([
      'Technical Bid',
      'Commercial Bid',
      'Cost Analysis',
      'Clarifications Bid',
    ])
  })

  it.each(['pm', 'commercial', 'both'] as const)(
    'shows all four to a %s member who is not an administrator',
    (viewerRole) => {
      renderTab({ isAdmin: false, viewerRole })
      expect(tabNames()).toEqual([
        'Technical Bid',
        'Commercial Bid',
        'Cost Analysis',
        'Clarifications Bid',
      ])
    },
  )

  it('keeps Commercial and Cost Analysis from a technical-only member, who keeps Technical and Clarifications', () => {
    renderTab({ isAdmin: false, viewerRole: 'technical' })
    expect(tabNames()).toEqual(['Technical Bid', 'Clarifications Bid'])
  })

  it('opens on Technical Bid', () => {
    renderTab()
    expect(screen.getByText('Method statement')).toBeInTheDocument()
    expect(screen.queryByText('Rate analysis')).not.toBeInTheDocument()
  })
})

describe('the file areas', () => {
  it.each([
    [
      'Technical Bid',
      'Method statement',
      ['Price schedule', 'Rate analysis', 'Clarification log'],
      /Technical Bid Package/i,
    ],
    [
      'Commercial Bid',
      'Price schedule',
      ['Method statement', 'Rate analysis', 'Clarification log'],
      /Commercial Bid Package/i,
    ],
    [
      'Cost Analysis',
      'Rate analysis',
      ['Method statement', 'Price schedule', 'Clarification log'],
      /Cost Analysis Package/i,
    ],
    [
      'Clarifications Bid',
      'Clarification log',
      ['Method statement', 'Price schedule', 'Rate analysis'],
      /Clarifications Package/i,
    ],
  ] as const)('%s lists only its own files, under its own heading', (tab, own, others, heading) => {
    renderTab()
    open(tab)
    expect(screen.getByText(own)).toBeInTheDocument()
    for (const o of others) expect(screen.queryByText(o)).not.toBeInTheDocument()
    expect(screen.getByText(heading)).toBeInTheDocument()
  })

  it('says so, in its own words, when Cost Analysis and Clarifications have no file yet', () => {
    renderTab({ packageFiles: [] })
    open('Cost Analysis')
    expect(screen.getByText('No cost analysis bid package uploaded yet.')).toBeInTheDocument()
    open('Clarifications Bid')
    expect(screen.getByText('No clarifications bid package uploaded yet.')).toBeInTheDocument()
  })

  it('offers a download for a file', () => {
    renderTab()
    open('Cost Analysis')
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://files.test/a3',
    )
  })

  it('no longer shows the Technical Queries screen on Clarifications Bid', () => {
    // The old screen needed Apollo; this renders without a provider, and has none of its controls.
    renderTab()
    open('Clarifications Bid')
    expect(screen.queryByText(/Raise TQ/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Technical quer/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Under Review/i)).not.toBeInTheDocument()
  })
})

describe('uploading', () => {
  it.each([
    ['Technical Bid', 'technical'],
    ['Commercial Bid', 'commercial'],
    ['Cost Analysis', 'cost_analysis'],
    ['Clarifications Bid', 'clarifications'],
  ] as const)('a file dropped on %s is attached as %s', async (tab, bidType) => {
    const { spies } = renderTab({ packageFiles: [] })
    open(tab)

    dropFile(makeFile('report.pdf'))

    await waitFor(() => {
      expect(spies.upload).toHaveBeenCalledTimes(1)
    })
    expect(spies.upload).toHaveBeenCalledWith(bidType, 'new-file-1', 'report')
    expect(post).toHaveBeenCalledWith(
      '/files/upload-url',
      expect.objectContaining({ filename: 'report.pdf', category: 'attachment' }),
    )
  })

  it('takes any kind of file, not only a ZIP', async () => {
    const { spies } = renderTab({ packageFiles: [] })
    open('Cost Analysis')
    dropFile(makeFile('rates.xlsx', ''))

    await waitFor(() => {
      expect(spies.upload).toHaveBeenCalledWith('cost_analysis', 'new-file-1', 'rates')
    })
    // A type the PC did not report is sent as a generic one, so the server accepts it (playbook #50).
    expect(post).toHaveBeenCalledWith(
      '/files/upload-url',
      expect.objectContaining({ mimeType: 'application/octet-stream' }),
    )
  })

  it('attaches nothing when the upload itself fails', async () => {
    post.mockReset()
    post.mockRejectedValue(new Error('boom'))
    const { spies } = renderTab({ packageFiles: [] })
    open('Clarifications Bid')

    dropFile(makeFile('report.pdf'))

    await waitFor(() => {
      expect(post).toHaveBeenCalled()
    })
    await new Promise((r) => setTimeout(r, 20)) // let the rejected upload settle
    expect(spies.upload).not.toHaveBeenCalled()
  })
})

describe('who can change files', () => {
  it('a file can be deleted by someone who can edit, and the right one is removed', () => {
    const { spies } = renderTab()
    open('Cost Analysis')
    fireEvent.click(screen.getByTitle('Delete'))
    expect(spies.del).toHaveBeenCalledWith('a3')
    open('Clarifications Bid')
    fireEvent.click(screen.getByTitle('Delete'))
    expect(spies.del).toHaveBeenLastCalledWith('a4')
  })

  it.each(['Technical Bid', 'Commercial Bid', 'Cost Analysis', 'Clarifications Bid'])(
    'someone who cannot edit sees the files on %s but gets no delete button and no drop zone',
    (tab) => {
      renderTab({ isEditable: false })
      open(tab)
      expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
      expect(screen.queryByText('browse')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument()
    },
  )
})
