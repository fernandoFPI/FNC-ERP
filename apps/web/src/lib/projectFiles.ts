// The Attachments tab shows every file uploaded for the project, from every tab that takes uploads
// (the server list is `projectFiles`, services/gateway/src/lib/projectFiles.ts). This is the page's
// side of it: which tabs to ask for, and how the list is filtered. Kept as plain functions so the
// visibility rules can be tested without rendering the page.

// The project tabs (page tab keys) that can hold uploaded files. Must match the server's
// PROJECT_FILE_TABS; an unknown key is ignored there, so drift only hides files, it never exposes any.
export const PROJECT_FILE_TABS = [
  'attachments',
  'client_documents',
  'rfq_lines', // Preliminary Engineering
  'bidding',
  'meetings',
  'contracts',
  'handover',
  'execution',
] as const

export interface ProjectFileItem {
  source: string
  tab: string
  fileId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  title: string
  detail: string | null
  uploadedAt: string | null
  attachmentId: string | null
}

// The tabs to ask the server for: only those the viewer can open on this project (the page's own tab
// list, which already applies the capability matrix and the project phase). The server then drops
// any tab the viewer lacks the permission for, so this is the first filter, never the only one.
export function projectFileTabs(visibleTabKeys: readonly string[]): string[] {
  const visible = new Set(visibleTabKeys)
  return PROJECT_FILE_TABS.filter((t) => visible.has(t))
}

// What is shown. Files uploaded through the Attachments tab itself carry a category in their label
// ("[Technical] plan.pdf"); every other source has none. So:
//  - a Commercial-tagged upload is hidden from a technical member (`hiddenCategories`);
//  - a category chip other than All narrows to Attachments uploads of that category (other tabs'
//    files do not carry a category, so they are not shown under a category);
//  - a tab chip narrows to the files that live in that tab.
export function visibleProjectFiles<T extends ProjectFileItem>(
  files: readonly T[],
  opts: {
    categoryOf: (file: T) => string
    hiddenCategories: ReadonlySet<string>
    // 'All' / 'all' = no filter
    category: string
    tab: string
  },
): T[] {
  return files.filter((f) => {
    const own = f.source === 'attachments'
    if (own && opts.hiddenCategories.has(opts.categoryOf(f))) return false
    if (opts.category !== 'All' && !(own && opts.categoryOf(f) === opts.category)) return false
    if (opts.tab !== 'all' && f.tab !== opts.tab) return false
    return true
  })
}

// How many files each tab contributes, for the tab chips (same visibility rule, no chip filters).
export function countByTab<T extends ProjectFileItem>(
  files: readonly T[],
  categoryOf: (file: T) => string,
  hiddenCategories: ReadonlySet<string>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const f of visibleProjectFiles(files, {
    categoryOf,
    hiddenCategories,
    category: 'All',
    tab: 'all',
  }))
    counts.set(f.tab, (counts.get(f.tab) ?? 0) + 1)
  return counts
}
