import { describe, it, expect } from 'vitest'
import {
  PROJECT_FILE_TABS,
  projectFileTabs,
  visibleProjectFiles,
  countByTab,
  type ProjectFileItem,
} from '../projectFiles'

const file = (over: Partial<ProjectFileItem>): ProjectFileItem => ({
  source: 'attachments',
  tab: 'attachments',
  fileId: Math.random().toString(36).slice(2),
  filename: 'a.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  title: 'a.pdf',
  detail: null,
  uploadedAt: '2026-11-03T10:00:00Z',
  attachmentId: null,
  ...over,
})

// Own uploads carry their category in the label, like the page's parseFileCategory.
const categoryOf = (f: ProjectFileItem): string => /^\[(\w+)\]/.exec(f.title)?.[1] ?? 'General'

const files = [
  file({ title: '[Technical] plan.pdf', attachmentId: 'att-1' }),
  file({ title: '[Commercial] boq.xlsx', attachmentId: 'att-2' }),
  file({ title: 'notes.pdf', attachmentId: 'att-3' }),
  file({ source: 'client_documents', tab: 'client_documents', title: 'Tender drawing' }),
  file({ source: 'bid_technical', tab: 'bidding', title: 'package.zip' }),
  file({ source: 'bid_commercial', tab: 'bidding', title: 'pricing.zip' }),
]

const view = (over: Partial<Parameters<typeof visibleProjectFiles>[1]> = {}) =>
  visibleProjectFiles(files, {
    categoryOf,
    hiddenCategories: new Set(),
    category: 'All',
    tab: 'all',
    ...over,
  }).map((f) => f.title)

describe('projectFileTabs - which tabs to ask the server for', () => {
  it('asks only for the tabs the viewer can open', () => {
    expect(
      projectFileTabs([
        'overview',
        'client_documents',
        'bidding',
        'attachments',
        'team',
        'history',
      ]),
    ).toEqual(['attachments', 'client_documents', 'bidding'])
  })

  it('never asks for a tab that is not visible, and ignores tabs that cannot hold files', () => {
    expect(projectFileTabs(['overview', 'procurement', 'risk_register'])).toEqual([])
    expect(projectFileTabs([])).toEqual([])
  })

  it('knows all eight tabs that take uploads', () => {
    expect([...PROJECT_FILE_TABS]).toEqual([
      'attachments',
      'client_documents',
      'rfq_lines',
      'bidding',
      'meetings',
      'contracts',
      'handover',
      'execution',
    ])
    expect(projectFileTabs([...PROJECT_FILE_TABS, 'team'])).toEqual([...PROJECT_FILE_TABS])
  })
})

describe('visibleProjectFiles', () => {
  it('shows everything when nothing is filtered', () => {
    expect(view()).toHaveLength(6)
  })

  it("hides a Commercial-tagged upload from a technical member, but not the other tabs' files", () => {
    const titles = view({ hiddenCategories: new Set(['Commercial']) })
    expect(titles).not.toContain('[Commercial] boq.xlsx')
    expect(titles).toEqual(
      expect.arrayContaining([
        '[Technical] plan.pdf',
        'notes.pdf',
        'Tender drawing',
        'package.zip',
      ]),
    )
  })

  it('a category chip narrows to Attachments uploads of that category only', () => {
    expect(view({ category: 'Technical' })).toEqual(['[Technical] plan.pdf'])
    // "General" is an Attachments category too, not a way to see every other tab's files.
    expect(view({ category: 'General' })).toEqual(['notes.pdf'])
  })

  it('a hidden category stays hidden even when its chip is chosen', () => {
    expect(view({ category: 'Commercial', hiddenCategories: new Set(['Commercial']) })).toEqual([])
  })

  it("a tab chip narrows to that tab's files", () => {
    expect(view({ tab: 'bidding' })).toEqual(['package.zip', 'pricing.zip'])
    expect(view({ tab: 'client_documents' })).toEqual(['Tender drawing'])
    expect(view({ tab: 'meetings' })).toEqual([])
  })

  it('a tab chip and a category chip together', () => {
    expect(view({ tab: 'attachments', category: 'Technical' })).toEqual(['[Technical] plan.pdf'])
    expect(view({ tab: 'bidding', category: 'Technical' })).toEqual([])
  })
})

describe('countByTab', () => {
  it('counts what each tab contributes, using the same hiding rule', () => {
    const counts = countByTab(files, categoryOf, new Set(['Commercial']))
    expect(counts.get('attachments')).toBe(2) // the Commercial upload is not counted
    expect(counts.get('client_documents')).toBe(1)
    expect(counts.get('bidding')).toBe(2)
    expect(counts.get('meetings')).toBeUndefined()
  })
})
