// Every file uploaded for a project, from every place a project can take one.
//
// The Attachments tab used to list only what was uploaded through itself (a `document_attachments`
// row with entity_type 'project'), while each other tab keeps its files elsewhere: Client Documents in
// project_client_documents, Preliminary Engineering in engineering_documents, bid packages and
// deliverables as document_attachments of their own entity types, meetings, drawings, punch photos,
// and so on. A project with a document in Client Documents showed "0 documents" under Attachments
// (AW-PRJ-2026-0080). This is the one list of all of them.
//
// Each SOURCE below is one kind of file, tagged with the project TAB it lives in, so the page can ask
// only for the tabs the viewer may open and the server can require the same company-wide permission
// that tab's own queries already require (PROJECT_FILE_TAB_PERMISSION). Adding a new place that takes
// uploads is one entry here plus a test row in tests/project-files.test.ts.
import { query } from '@fnc-erp/db'

export type ProjectFileTab =
  | 'attachments'
  | 'client_documents'
  | 'rfq_lines' // Preliminary Engineering
  | 'bidding'
  | 'meetings'
  | 'contracts'
  | 'handover'
  | 'execution'

// The tab key the page uses -> the registry permission that tab's own server queries require.
// (clientDocuments needs projects.client_documents.view, engineeringDocuments projects.engineering.view,
// the bidding queries projects.bidding.view, ...). A file is listed here only if the caller could also
// open it there.
export const PROJECT_FILE_TAB_PERMISSION: Record<ProjectFileTab, string> = {
  attachments: 'projects.attachments.view',
  client_documents: 'projects.client_documents.view',
  rfq_lines: 'projects.engineering.view',
  bidding: 'projects.bidding.view',
  meetings: 'projects.meetings.view',
  contracts: 'projects.contracts.view',
  handover: 'projects.handover.view',
  execution: 'projects.execution.view',
}

export const PROJECT_FILE_TABS = Object.keys(PROJECT_FILE_TAB_PERMISSION) as ProjectFileTab[]

export interface ProjectFileSource {
  key: string
  tab: ProjectFileTab
  // Bid pricing material: hidden from technical project members, like the Commercial bid tab itself.
  commercial?: boolean
  // One or more SELECTs returning the common columns; $1 = project id, $2 = company id.
  selects: string[]
}

// A file that still exists in this company. Every source joins through this.
const liveFile = (fileId: string): string =>
  `JOIN files f ON f.id = ${fileId} AND f.company_id = $2 AND f.status <> 'deleted'`

interface SelectParts {
  source: string
  from: string
  where: string
  title: string
  at: string
  detail?: string
  // Only the Attachments tab's own uploads can be removed from the Attachments tab.
  attachmentId?: string
}

function select(p: SelectParts): string {
  return `SELECT '${p.source}'::text AS source, f.id AS file_id, f.original_filename AS filename,
                 f.mime_type AS mime_type, f.size_bytes AS size_bytes,
                 (${p.title})::text AS title, (${p.detail ?? 'NULL'})::text AS detail,
                 ${p.at} AS uploaded_at, ${p.attachmentId ?? 'NULL'}::uuid AS attachment_id
            FROM ${p.from}
           WHERE ${p.where}`
}

// A document_attachments row of one entity type, whose entity belongs to the project through `entityJoin`
// (a join to the entity's table that ends with the project's id compared to $1).
function attached(
  source: string,
  entityType: string,
  entityJoin: string,
  projectWhere: string,
  detail?: string,
): string {
  return select({
    source,
    from: `document_attachments da ${entityJoin} ${liveFile('da.file_id')}`,
    where: `da.entity_type = '${entityType}' AND ${projectWhere}`,
    title: `COALESCE(NULLIF(da.label, ''), f.original_filename)`,
    at: 'da.created_at',
    ...(detail ? { detail } : {}),
  })
}

const REV = (col: string): string =>
  `CASE WHEN NULLIF(${col}, '') IS NOT NULL THEN 'Rev ' || ${col} END`

export const PROJECT_FILE_SOURCES: ProjectFileSource[] = [
  {
    key: 'attachments',
    tab: 'attachments',
    selects: [
      select({
        source: 'attachments',
        from: `document_attachments da ${liveFile('da.file_id')}`,
        where: `da.entity_type = 'project' AND da.entity_id = $1`,
        title: `COALESCE(NULLIF(da.label, ''), f.original_filename)`,
        at: 'da.created_at',
        attachmentId: 'da.id',
      }),
    ],
  },
  {
    key: 'client_documents',
    tab: 'client_documents',
    selects: [
      // Every revision's file, not only the current one: each was uploaded for the project.
      select({
        source: 'client_documents',
        from: `project_client_documents d ${liveFile('d.file_id')}`,
        where: `d.project_id = $1`,
        title: 'd.title',
        detail: `NULLIF(concat_ws(' · ', NULLIF(d.document_number, ''), ${REV('d.revision')}), '')`,
        at: 'd.created_at',
      }),
    ],
  },
  {
    key: 'engineering',
    tab: 'rfq_lines',
    selects: [
      select({
        source: 'engineering',
        from: `engineering_documents e ${liveFile('e.file_id')}`,
        where: `e.project_id = $1 AND e.company_id = $2`,
        title: 'e.title',
        detail: `NULLIF(concat_ws(' · ', NULLIF(e.ref_number, ''), ${REV('e.revision')}), '')`,
        at: 'e.created_at',
      }),
    ],
  },
  {
    key: 'rfq_phase',
    tab: 'rfq_lines',
    selects: [
      attached(
        'rfq_phase',
        'rfq_phase',
        'JOIN rfq_phases rp ON rp.id = da.entity_id',
        'rp.project_id = $1',
        'rp.phase_type',
      ),
    ],
  },
  {
    key: 'drawings',
    tab: 'rfq_lines',
    selects: [
      select({
        source: 'drawings',
        from: `project_drawings d ${liveFile('d.file_id')}`,
        where: `d.project_id = $1`,
        title: 'd.title',
        detail: `NULLIF(concat_ws(' · ', NULLIF(d.drawing_number, ''), ${REV('d.revision')}), '')`,
        at: 'd.created_at',
      }),
    ],
  },
  {
    key: 'bid_technical',
    tab: 'bidding',
    selects: [attached('bid_technical', 'bid_package_technical', '', 'da.entity_id = $1')],
  },
  {
    key: 'bid_commercial',
    tab: 'bidding',
    commercial: true,
    selects: [attached('bid_commercial', 'bid_package_commercial', '', 'da.entity_id = $1')],
  },
  {
    key: 'bid_deliverables',
    tab: 'bidding',
    selects: [
      attached(
        'bid_deliverables',
        'bid_deliverable',
        'JOIN bid_deliverables bd ON bd.id = da.entity_id',
        'bd.project_id = $1',
        'bd.name',
      ),
    ],
  },
  {
    key: 'bid_quotations',
    tab: 'bidding',
    commercial: true,
    selects: [
      select({
        source: 'bid_quotations',
        from: `bid_supplier_quotations q ${liveFile('q.file_id')}`,
        where: `q.project_id = $1`,
        title: 'q.supplier_name',
        detail: 'q.item_description',
        at: 'q.created_at',
      }),
    ],
  },
  {
    key: 'bid_cost_analysis',
    tab: 'bidding',
    commercial: true,
    selects: [attached('bid_cost_analysis', 'bid_package_cost_analysis', '', 'da.entity_id = $1')],
  },
  // The Clarifications Bid sub-tab: plain files since migration 321 (it used to be Technical Queries).
  {
    key: 'bid_clarifications',
    tab: 'bidding',
    selects: [attached('bid_clarifications', 'bid_package_clarifications', '', 'da.entity_id = $1')],
  },
  {
    key: 'meetings',
    tab: 'meetings',
    selects: [
      select({
        source: 'meetings',
        from: `project_meeting_attachments a JOIN project_meetings m ON m.id = a.meeting_id ${liveFile('a.file_id')}`,
        where: `m.project_id = $1`,
        title: `COALESCE(NULLIF(a.title, ''), f.original_filename)`,
        detail: 'm.meeting_number',
        at: 'a.created_at',
      }),
    ],
  },
  {
    key: 'contract_documents',
    tab: 'contracts',
    commercial: true,
    selects: [
      attached(
        'contract_documents',
        'project_contract',
        'JOIN project_contracts c ON c.id = da.entity_id',
        'c.project_id = $1',
        'c.contract_number',
      ),
    ],
  },
  {
    key: 'invoice_documents',
    tab: 'contracts',
    commercial: true,
    selects: [
      attached(
        'invoice_documents',
        'project_invoice',
        'JOIN project_invoices i ON i.id = da.entity_id',
        'i.project_id = $1',
        'i.invoice_number',
      ),
    ],
  },
  {
    key: 'handover_certificates',
    tab: 'handover',
    selects: [
      attached(
        'handover_certificates',
        'handover_cert',
        'JOIN project_handover_certificates h ON h.id = da.entity_id',
        'h.project_id = $1',
        'h.certificate_no',
      ),
    ],
  },
  {
    key: 'punch_photos',
    tab: 'handover',
    selects: [
      select({
        source: 'punch_photos',
        from: `project_punch_photos ph JOIN project_punch_items pi ON pi.id = ph.punch_id ${liveFile('ph.file_id')}`,
        where: `pi.project_id = $1`,
        title: `COALESCE(NULLIF(ph.caption, ''), f.original_filename)`,
        detail: 'pi.punch_no',
        at: 'ph.created_at',
      }),
    ],
  },
  {
    key: 'rfis',
    tab: 'execution',
    selects: [
      attached(
        'rfis',
        'rfi',
        'JOIN project_rfis r ON r.id = da.entity_id',
        'r.project_id = $1',
        'r.rfi_number',
      ),
    ],
  },
  {
    key: 'site_instructions',
    tab: 'execution',
    selects: [
      attached(
        'site_instructions',
        'site_instruction',
        'JOIN project_site_instructions s ON s.id = da.entity_id',
        's.project_id = $1',
        's.si_number',
      ),
    ],
  },
  {
    key: 'inspection_requests',
    tab: 'execution',
    selects: [
      attached(
        'inspection_requests',
        'inspection_request',
        'JOIN project_inspection_requests ir ON ir.id = da.entity_id',
        'ir.project_id = $1',
        'ir.ir_number',
      ),
    ],
  },
  {
    key: 'ncrs',
    tab: 'execution',
    selects: [
      attached(
        'ncrs',
        'ncr',
        'JOIN project_ncrs n ON n.id = da.entity_id',
        'n.project_id = $1',
        'n.ncr_number',
      ),
    ],
  },
  {
    key: 'hse_records',
    tab: 'execution',
    selects: [
      attached(
        'hse_records',
        'hse_record',
        'JOIN project_hse_records hr ON hr.id = da.entity_id',
        'hr.project_id = $1',
        'hr.record_type',
      ),
    ],
  },
  {
    key: 'daily_reports',
    tab: 'execution',
    selects: [
      attached(
        'daily_reports',
        'daily_report',
        'JOIN project_daily_reports dr ON dr.id = da.entity_id',
        'dr.project_id = $1',
        'dr.report_number',
      ),
      select({
        source: 'daily_reports',
        from: `project_daily_report_machinery mc ${liveFile('mc.live_photo_file_id')}`,
        where: `mc.project_id = $1`,
        title: `COALESCE(NULLIF(mc.equipment_description, ''), f.original_filename)`,
        detail: `'Machinery photo'`,
        at: 'mc.created_at',
      }),
    ],
  },
  {
    key: 'transmittals',
    tab: 'execution',
    selects: [
      attached(
        'transmittals',
        'transmittal',
        'JOIN project_transmittals t ON t.id = da.entity_id',
        't.project_id = $1',
        't.transmittal_number',
      ),
      select({
        source: 'transmittals',
        from: `project_transmittal_items i JOIN project_transmittals t ON t.id = i.transmittal_id ${liveFile('i.file_id')}`,
        where: `t.project_id = $1`,
        title: `COALESCE(NULLIF(i.document_title, ''), f.original_filename)`,
        detail: 't.transmittal_number',
        at: 'i.created_at',
      }),
    ],
  },
]

export interface ProjectFileRow {
  source: string
  tab: ProjectFileTab
  fileId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  title: string
  detail: string | null
  uploadedAt: string | null
  attachmentId: string | null
}

interface RawRow {
  source: string
  file_id: string
  filename: string
  mime_type: string | null
  size_bytes: string | number | null
  title: string
  detail: string | null
  uploaded_at: string | null
  attachment_id: string | null
}

const MAX_ROWS = 2000

// The files of `tabs` for one project of this company. The caller has already decided which tabs the
// person may see (permission + commercial rule); this only reads. `includeCommercial` keeps the
// bid-pricing sources out unless the caller may see them.
export async function listProjectFiles(
  projectId: string,
  companyId: string,
  opts: { tabs: ProjectFileTab[]; includeCommercial: boolean },
): Promise<ProjectFileRow[]> {
  const wanted = new Set<string>(opts.tabs)
  const sources = PROJECT_FILE_SOURCES.filter(
    (s) => wanted.has(s.tab) && (opts.includeCommercial || !s.commercial),
  )
  if (sources.length === 0) return []
  const tabOf = new Map(sources.map((s) => [s.key, s.tab] as const))
  const sql = `SELECT * FROM (${sources.flatMap((s) => s.selects).join('\n UNION ALL \n')}) u
                ORDER BY uploaded_at DESC NULLS LAST, filename LIMIT ${MAX_ROWS}`
  const r = await query<RawRow>(sql, [projectId, companyId])
  return r.rows.map((row) => ({
    source: row.source,
    tab: tabOf.get(row.source) ?? 'attachments',
    fileId: row.file_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    title: row.title,
    detail: row.detail,
    uploadedAt: row.uploaded_at,
    attachmentId: row.attachment_id,
  }))
}
