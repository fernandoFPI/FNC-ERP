// The project's Attachments tab lists every file uploaded for the project, not only the ones uploaded
// through itself (playbook #52): on AW-PRJ-2026-0080 a document in Client Documents left the tab at
// "0 documents". Renders the real tab with the server's list mocked.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MockedProvider } from '@apollo/client/testing'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { useTheme } from '../../../../theme/ThemeContext'
import { PROJECT_FILES_QUERY } from '../../../../graphql/projects'
import { AttachmentsTab } from '../ProjectDetail'

const PROJECT_ID = 'p-1'

const row = (over: Record<string, unknown>) => ({
  source: 'attachments',
  tab: 'attachments',
  fileId: `f-${Math.random().toString(36).slice(2)}`,
  filename: 'file.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  title: 'file.pdf',
  detail: null,
  uploadedAt: '2026-11-03 10:00:00+00',
  attachmentId: null,
  ...over,
})

const ownTechnical = row({ title: '[Technical] plan.pdf', attachmentId: 'att-1', fileId: 'f-own1' })
const ownCommercial = row({
  title: '[Commercial] boq.xlsx',
  attachmentId: 'att-2',
  fileId: 'f-own2',
})
const clientDoc = row({
  source: 'client_documents',
  tab: 'client_documents',
  title: 'Tender drawing',
  detail: 'CD-001 · Rev B',
  filename: 'WhatsApp Image.jpeg',
  mimeType: 'image/jpeg',
  fileId: 'f-cd',
})
const bidPackage = row({
  source: 'bid_technical',
  tab: 'bidding',
  title: 'package.zip',
  filename: 'package.zip',
  mimeType: 'application/zip',
  fileId: 'f-bid',
})

function Harness(props: {
  visibleTabs: string[]
  viewerRole?: 'admin' | 'pm' | 'technical' | 'commercial' | 'both' | 'none'
  isAdmin?: boolean
  onOpenTab?: (tab: string) => void
}) {
  const { theme } = useTheme()
  return (
    <AttachmentsTab
      projectId={PROJECT_ID}
      theme={theme}
      isAdmin={props.isAdmin ?? true}
      viewerRole={props.viewerRole ?? 'admin'}
      visibleTabs={props.visibleTabs}
      onOpenTab={props.onOpenTab ?? vi.fn()}
    />
  )
}

function renderTab(rows: unknown[], tabsAsked: string[], props: Parameters<typeof Harness>[0]) {
  const mock = {
    request: { query: PROJECT_FILES_QUERY, variables: { projectId: PROJECT_ID, tabs: tabsAsked } },
    result: { data: { projectFiles: rows } },
  }
  return render(
    <MockedProvider mocks={[mock]} addTypename={false}>
      <MemoryRouter>
        <ThemeProvider>
          <Harness {...props} />
        </ThemeProvider>
      </MemoryRouter>
    </MockedProvider>,
  )
}

describe('AttachmentsTab - every file uploaded for the project', () => {
  it('shows a Client Document and a bid package under Attachments, each with where it came from', async () => {
    renderTab(
      [ownTechnical, clientDoc, bidPackage],
      ['attachments', 'client_documents', 'bidding'],
      {
        visibleTabs: ['overview', 'client_documents', 'bidding', 'attachments', 'team'],
      },
    )

    expect(await screen.findByText('Tender drawing')).toBeInTheDocument()
    expect(screen.getByText('package.zip')).toBeInTheDocument()
    expect(screen.getByText('plan.pdf')).toBeInTheDocument()
    // The kind of file, as a link to its tab, and the document number and revision.
    expect(screen.getByRole('button', { name: 'Client document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Technical bid package' })).toBeInTheDocument()
    expect(screen.getByText(/CD-001 · Rev B/)).toBeInTheDocument()
    expect(screen.getByText(/3 documents?/i)).toBeInTheDocument()
  })

  it('asks the server only for the tabs this viewer can open', async () => {
    // The mock only answers a request for exactly these tabs: a different list would leave the tab
    // empty, so seeing the file proves the request carried just the visible, file-bearing tabs.
    renderTab([clientDoc], ['attachments', 'client_documents'], {
      visibleTabs: ['overview', 'client_documents', 'attachments', 'procurement', 'team'],
    })
    expect(await screen.findByText('Tender drawing')).toBeInTheDocument()
  })

  it("clicking a file's source takes the user to that tab", async () => {
    const onOpenTab = vi.fn()
    renderTab([clientDoc, bidPackage], ['attachments', 'client_documents', 'bidding'], {
      visibleTabs: ['client_documents', 'bidding', 'attachments'],
      onOpenTab,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Technical bid package' }))

    expect(onOpenTab).toHaveBeenCalledWith('bidding')
  })

  it("narrows to one tab's files with the tab chips (which only appear when several tabs have files)", async () => {
    renderTab(
      [ownTechnical, clientDoc, bidPackage],
      ['attachments', 'client_documents', 'bidding'],
      {
        visibleTabs: ['client_documents', 'bidding', 'attachments'],
      },
    )
    await screen.findByText('Tender drawing')

    fireEvent.click(screen.getByRole('button', { name: /^Bidding Stage/ }))

    expect(screen.getByText('package.zip')).toBeInTheDocument()
    expect(screen.queryByText('Tender drawing')).not.toBeInTheDocument()
    expect(screen.queryByText('plan.pdf')).not.toBeInTheDocument()
  })

  it('only a file uploaded through this tab can be removed from it', async () => {
    renderTab([ownTechnical, clientDoc], ['attachments', 'client_documents'], {
      visibleTabs: ['client_documents', 'attachments'],
    })
    await screen.findByText('Tender drawing')

    const removeButtons = screen.getAllByTitle('Remove')
    expect(removeButtons).toHaveLength(1)
    const ownRow = screen
      .getByText('plan.pdf')
      .closest<HTMLElement>('div[style*="border-radius: 8px"]')
    if (!ownRow) throw new Error('the row of plan.pdf was not found')
    expect(within(ownRow).getByTitle('Remove')).toBeInTheDocument()
  })

  it('does not offer removal to a viewer who cannot edit attachments', async () => {
    renderTab([ownTechnical, clientDoc], ['attachments', 'client_documents'], {
      visibleTabs: ['client_documents', 'attachments'],
      isAdmin: false,
    })
    await screen.findByText('Tender drawing')
    expect(screen.queryByTitle('Remove')).not.toBeInTheDocument()
  })

  it('keeps a Commercial-tagged upload from a technical team member', async () => {
    renderTab([ownTechnical, ownCommercial, clientDoc], ['attachments', 'client_documents'], {
      visibleTabs: ['client_documents', 'attachments'],
      viewerRole: 'technical',
      isAdmin: false,
    })
    await screen.findByText('Tender drawing')

    expect(screen.getByText('plan.pdf')).toBeInTheDocument()
    expect(screen.queryByText('boq.xlsx')).not.toBeInTheDocument()
  })

  it('says there are no documents when the project has none', async () => {
    renderTab([], ['attachments', 'client_documents'], {
      visibleTabs: ['client_documents', 'attachments'],
    })
    await waitFor(() => {
      expect(screen.getByText(/No documents found/i)).toBeInTheDocument()
    })
  })
})
