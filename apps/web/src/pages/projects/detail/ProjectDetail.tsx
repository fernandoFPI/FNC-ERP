import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PROJECT_QUERY, ADMIN_SET_PROJECT_STATUS, ADMIN_SET_PHASE, RFQ_LINES_QUERY, UPSERT_RFQ_LINES, RFQ_PHASES_QUERY, UPDATE_RFQ_PHASE,
  CLIENT_DOCUMENTS_QUERY, UPLOAD_CLIENT_DOCUMENT, UPLOAD_CLIENT_DOCUMENT_REVISION,
  UPDATE_CLIENT_DOCUMENT, UPDATE_CLIENT_DOCUMENT_STATUS, DELETE_CLIENT_DOCUMENT,
  ENG_DOCS_QUERY, CREATE_ENG_DOC, REVISE_ENG_DOC, UPDATE_ENG_DOC_STATUS, DELETE_ENG_DOC, UPDATE_ENG_DOC_META,
  DOC_COMMENTS_QUERY, ADD_DOC_COMMENT, RESPOND_TO_COMMENT, DELETE_DOC_COMMENT,
  DOC_DISTRIBUTION_QUERY, UPSERT_DISTRIBUTION_ENTRY, DELETE_DISTRIBUTION_ENTRY,
  ENG_TRANSMITTALS_QUERY, CREATE_ENG_TRANSMITTAL, UPDATE_ENG_TRANSMITTAL,
  ISSUE_ENG_TRANSMITTAL, MARK_ENG_TRANSMITTAL_RECEIVED, ACKNOWLEDGE_ENG_TRANSMITTAL,
  DELETE_ENG_TRANSMITTAL, ADD_ENG_TRANSMITTAL_ITEM, REMOVE_ENG_TRANSMITTAL_ITEM,
  ENGINEERING_REVISIONS_QUERY, ISSUE_ENGINEERING_REVISION,
  PROJECT_DRAWINGS_QUERY, CREATE_PROJECT_DRAWING, REVISE_PROJECT_DRAWING,
  UPDATE_PROJECT_DRAWING_STATUS, DELETE_PROJECT_DRAWING,
  BID_DELIVERABLES_QUERY, CREATE_BID_DELIVERABLE, UPDATE_BID_DELIVERABLE, DELETE_BID_DELIVERABLE,
  UPLOAD_BID_DELIVERABLE_FILE, DELETE_BID_DELIVERABLE_FILE,
  BID_COST_ITEMS_QUERY, UPSERT_BID_COST_ITEMS,
  BID_SUPPLIER_QUOTATIONS_QUERY, CREATE_BID_SUPPLIER_QUOTATION, UPDATE_BID_SUPPLIER_QUOTATION, DELETE_BID_SUPPLIER_QUOTATION,
  BID_COMMERCIAL_SUMMARY_QUERY, UPDATE_BID_COMMERCIAL_SUMMARY, SUBMIT_BID_FOR_APPROVAL, APPROVE_BID, REJECT_BID,
  PROJECT_RFIS_QUERY, CREATE_PROJECT_RFI, UPDATE_PROJECT_RFI, RESPOND_TO_RFI, DELETE_PROJECT_RFI, UPLOAD_RFI_FILE, DELETE_RFI_FILE,
  PROJECT_SUBMITTALS_QUERY, CREATE_PROJECT_SUBMITTAL, UPDATE_PROJECT_SUBMITTAL, DELETE_PROJECT_SUBMITTAL, UPLOAD_SUBMITTAL_FILE, DELETE_SUBMITTAL_FILE,
  PROJECT_SITE_INSTRUCTIONS_QUERY, CREATE_SITE_INSTRUCTION, UPDATE_SITE_INSTRUCTION, DELETE_SITE_INSTRUCTION, UPLOAD_SI_FILE, DELETE_SI_FILE,
  PROJECT_ITPS_QUERY, CREATE_PROJECT_ITP, UPDATE_PROJECT_ITP, DELETE_PROJECT_ITP, UPSERT_ITP_ITEMS, RECORD_ITP_ITEM_RESULT,
  PROJECT_INSPECTION_REQUESTS_QUERY, CREATE_INSPECTION_REQUEST, UPDATE_INSPECTION_REQUEST, DELETE_INSPECTION_REQUEST, UPLOAD_IR_FILE, DELETE_IR_FILE,
  PROJECT_NCRS_QUERY, CREATE_PROJECT_NCR, UPDATE_PROJECT_NCR, DELETE_PROJECT_NCR, UPLOAD_NCR_FILE, DELETE_NCR_FILE,
  PROJECT_HSE_RECORDS_QUERY, CREATE_HSE_RECORD, UPDATE_HSE_RECORD, DELETE_HSE_RECORD, UPLOAD_HSE_FILE, DELETE_HSE_FILE,
  PROJECT_TRANSMITTALS_QUERY, CREATE_PROJECT_TRANSMITTAL, UPDATE_PROJECT_TRANSMITTAL, DELETE_PROJECT_TRANSMITTAL, ADD_TRANSMITTAL_ITEM, DELETE_TRANSMITTAL_ITEM,
  PROJECT_WBS_QUERY, PROJECT_ACTIVITIES_QUERY, PROJECT_BASELINES_QUERY, PROJECT_RESOURCES_QUERY, PROJECT_RESOURCE_LOADING_QUERY, PROJECT_EVM_QUERY,
  CREATE_WBS_NODE, UPDATE_WBS_NODE, DELETE_WBS_NODE,
  CREATE_ACTIVITY, UPDATE_ACTIVITY, UPDATE_ACTIVITY_PROGRESS, DELETE_ACTIVITY, BULK_IMPORT_ACTIVITIES,
  CREATE_DEPENDENCY, DELETE_DEPENDENCY, RECALCULATE_CPM, LEVEL_RESOURCES,
  CREATE_BASELINE, SET_ACTIVE_BASELINE, APPLY_BASELINE, DELETE_BASELINE,
  CREATE_RESOURCE, UPDATE_RESOURCE, DELETE_RESOURCE,
  SET_CALENDAR_DAY, DELETE_CALENDAR_DAY,
  ASSIGN_RESOURCE, UPDATE_RESOURCE_ASSIGNMENT, REMOVE_RESOURCE_ASSIGNMENT,
  PROJECT_COST_CODES_QUERY, PROJECT_COMMITTED_COSTS_QUERY, PROJECT_CASH_FLOW_QUERY,
  PROJECT_SUBCONTRACTS_QUERY, PROJECT_LABOR_ENTRIES_QUERY, PROJECT_EQUIPMENT_LOG_QUERY,
  PROJECT_COST_FORECAST_QUERY, PROJECT_CLIENT_BILLINGS_QUERY, PROJECT_COST_SUMMARY_QUERY,
  CREATE_COST_CODE, UPDATE_COST_CODE, DELETE_COST_CODE,
  CREATE_COMMITTED_COST, UPDATE_COMMITTED_COST, DELETE_COMMITTED_COST, SYNC_PO_COMMITMENTS,
  UPSERT_CASH_FLOW_PERIOD,
  CREATE_SUBCONTRACT, UPDATE_SUBCONTRACT, DELETE_SUBCONTRACT,
  CREATE_SUBCONTRACT_BILLING, UPDATE_SUBCONTRACT_BILLING, DELETE_SUBCONTRACT_BILLING,
  CREATE_LABOR_ENTRY, UPDATE_LABOR_ENTRY, DELETE_LABOR_ENTRY,
  CREATE_EQUIPMENT_LOG, UPDATE_EQUIPMENT_LOG, DELETE_EQUIPMENT_LOG,
  UPSERT_COST_FORECAST,
  CREATE_CLIENT_BILLING, UPDATE_CLIENT_BILLING, DELETE_CLIENT_BILLING,
  PROJECT_VARIATION_ORDERS_QUERY,
  CREATE_VARIATION_ORDER, UPDATE_VARIATION_ORDER, DELETE_VARIATION_ORDER,
  SUBMIT_VARIATION_ORDER, APPROVE_VARIATION_ORDER, REJECT_VARIATION_ORDER, SET_VO_STATUS,
  CREATE_VO_COST_ITEM, UPDATE_VO_COST_ITEM, DELETE_VO_COST_ITEM,
  CREATE_VO_CORRESPONDENCE, DELETE_VO_CORRESPONDENCE,
  ADD_VO_DRAWING, REMOVE_VO_DRAWING,
  PROJECT_MEETINGS_QUERY,
  CREATE_MEETING, UPDATE_MEETING, DELETE_MEETING, ISSUE_MEETING, CLOSE_MEETING,
  CREATE_MEETING_ACTION, UPDATE_MEETING_ACTION, DELETE_MEETING_ACTION,
  MATERIAL_ISSUES_QUERY,
  UPDATE_PROJECT_STAGE,
} from '../../../graphql/projects'
import { MANUFACTURING_REQUESTS_QUERY } from '../../../graphql/manufacturing-requests'
import { useTheme } from '../../../theme/ThemeContext'
import { usePermission } from '../../../hooks/usePermission'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { TabBar } from '../../../components/ui/TabBar'
import { ProjectStatusBar } from '../../../components/projects/ProjectStatusBar'
import { ProjectStageBar } from '../../../components/projects/ProjectStageBar'
import { ProjectKPIRow } from '../../../components/projects/ProjectKPIRow'
import { StageEditDrawer } from '../../../components/projects/StageEditDrawer'
import { ManufacturingRequestForm } from '../components/ManufacturingRequestForm'
import { formatCurrency } from '../../../lib/format'
import { api } from '../../../lib/axios'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { Modal } from '../../../components/ui/Modal'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  pending: 'neutral', ongoing: 'info', submitted: 'warning',
  approved: 'success', completed: 'success', on_hold: 'warning',
  cancelled: 'danger', cancelled_after_approval: 'danger',
}

const ALL_TABS = [
  { key: 'overview',         label: 'Overview' },
  { key: 'client_documents', label: 'Client Documents' },
  { key: 'rfq_lines',        label: 'Engineering' },
  { key: 'transmittals',     label: 'Transmittals' },
  { key: 'bidding',          label: 'Bidding' },
  { key: 'planning',         label: 'Planning' },
  { key: 'team',             label: 'Team' },
  { key: 'execution',        label: 'Execution' },
  { key: 'procurement',      label: 'Procurement' },
  { key: 'cost_control',     label: 'Cost Control' },
  { key: 'variation_orders', label: 'Variation Orders' },
  { key: 'meetings',         label: 'Meetings (MOM)' },
  { key: 'attachments',      label: 'Attachments' },
  { key: 'history',          label: 'History' },
]

// Statuses where an RFQ project has been decided (approved, won, or closed)
const RFQ_POST_DECISION = new Set(['approved', 'ongoing', 'completed', 'on_hold', 'cancelled', 'cancelled_after_approval'])

const LIFECYCLE_STAGES = [
  { key: 'enquiry',         label: 'Client Enquiry'  },
  { key: 'scope_review',    label: 'Scope Review'    },
  { key: 'bidding',         label: 'Bidding'         },
  { key: 'client_approval', label: 'Client Approval' },
  { key: 'execution',       label: 'Execution'       },
  { key: 'closeout',        label: 'Closeout'        },
]

const PHASE_ORDER = ['enquiry', 'scope_review', 'bidding', 'client_approval', 'execution', 'closeout']
const phaseGte = (phase: string, min: string) =>
  PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(min)

function lifecycleIdx(phase: string): number {
  const idx = LIFECYCLE_STAGES.findIndex(s => s.key === phase)
  return idx >= 0 ? idx : 0
}

function lifecycleBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'completed' || status === 'approved' || status === 'ongoing') return 'success'
  if (status === 'on_hold') return 'warning'
  if (status === 'cancelled' || status === 'cancelled_after_approval') return 'danger'
  if (status === 'submitted') return 'warning'
  return 'info'
}


interface Stage { id: string; name: string; sequence: number; status: string; completionPct: number; plannedStartDate?: string; plannedEndDate?: string; actualStartDate?: string; actualEndDate?: string; notes?: string; assignedTo?: string; assignedToName?: string }
interface Member { id: string; employeeId: string; name: string; role?: string; allocatedHours?: number; isActive?: boolean }

export default function ProjectDetail() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const pagePadding = usePagePadding()
  const { can }         = usePermission()
  const isAdmin         = can('projects.edit')
  const currentUser     = useAuthStore(s => s.user)
  const currentUserName = currentUser
    ? ([currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email) ?? ''
    : ''
  const addToast = useToastStore((s) => s.addToast)
  const [adminStatus, setAdminStatus] = useState('')
  const [adminPhase,  setAdminPhase]  = useState('')
  const [adminSetProjectStatus, { loading: adminSetting }] = useMutation(ADMIN_SET_PROJECT_STATUS, {
    onCompleted: () => { setAdminStatus(''); addToast({ type: 'success', message: 'Status updated' }); void refetch() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [adminSetPhase, { loading: adminPhaseSetting }] = useMutation(ADMIN_SET_PHASE, {
    onCompleted: () => { setAdminPhase(''); addToast({ type: 'success', message: 'Phase updated' }); void refetch() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [showActionsPanel, setShowActionsPanel] = useState(false)
  const [tab, setTab]               = useState('overview')
  const [bidSection, setBidSection] = useState<'technical' | 'commercial'>('technical')
  const [procSection, setProcSection] = useState<'purchase_orders' | 'manufacturing' | 'store_out'>('purchase_orders')
  const [editStage, setEditStage]   = useState<Stage | null>(null)
  const [quickUpdateStage] = useMutation(UPDATE_PROJECT_STAGE, { onCompleted: () => void refetch(), onError: (e) => addToast({ type: 'error', message: e.message }) })
  const [stageDrawer, setStageDrawer] = useState(false)
  const [showMRForm, setShowMRForm] = useState(false)

  // Team tab state
  interface LiveMember { id: string; employee_id: string; employee_name: string; job_title?: string; role?: string; member_type?: string; allocated_hours?: number; permissions?: Record<string, string> }
  interface Employee { id: string; first_name: string; last_name: string; job_title?: string }
  const [liveTeam, setLiveTeam]       = useState<LiveMember[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [employees, setEmployees]     = useState<Employee[]>([])
  const [addForm, setAddForm]         = useState({ employee_id: '', allocated_hours: '', member_type: 'technical' })
  const [addLoading, setAddLoading]   = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [permEditMemberId, setPermEditMemberId] = useState<string | null>(null)
  const [permEditDraft,    setPermEditDraft]    = useState<Record<string, string>>({})
  const [permSaving,       setPermSaving]       = useState(false)

  useEffect(() => {
    if (!id) return
    setTeamLoading(true)
    api.get<LiveMember[]>(`/projects/${id}/members`)
      .then(r => setLiveTeam(Array.isArray(r.data) ? r.data : []))
      .catch(() => addToast({ type: 'error', message: 'Failed to load team members' }))
      .finally(() => setTeamLoading(false))
  }, [id])

  useEffect(() => {
    if (!showAddForm) return
    api.get<Employee[]>('/hr/employees', { params: { limit: 200, status: 'active' } })
      .then(r => setEmployees(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
  }, [showAddForm])

  async function handleAddMember() {
    if (!addForm.employee_id) { addToast({ type: 'error', message: 'Select an employee' }); return }
    setAddLoading(true)
    try {
      const res = await api.post<LiveMember>(`/projects/${id}/members`, {
        employee_id: addForm.employee_id,
        member_type: addForm.member_type,
        allocated_hours: addForm.allocated_hours ? parseFloat(addForm.allocated_hours) : null,
      })
      // Reload full list so we get employee_name joined from DB
      const refreshed = await api.get<LiveMember[]>(`/projects/${id}/members`)
      setLiveTeam(Array.isArray(refreshed.data) ? refreshed.data : [res.data])
      setAddForm({ employee_id: '', allocated_hours: '', member_type: 'technical' })
      setShowAddForm(false)
      addToast({ type: 'success', message: 'Team member added' })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add member'
      addToast({ type: 'error', message: msg })
    } finally { setAddLoading(false) }
  }

  async function handleSavePerms() {
    if (!id || !permEditMemberId) return
    setPermSaving(true)
    try {
      await api.put(`/projects/${id}/members/${permEditMemberId}/permissions`, permEditDraft)
      setLiveTeam(prev => prev.map(m => m.id === permEditMemberId ? { ...m, permissions: { ...permEditDraft } } : m))
      setPermEditMemberId(null)
      addToast({ type: 'success', message: 'Permissions saved' })
    } catch {
      addToast({ type: 'error', message: 'Failed to save permissions' })
    } finally { setPermSaving(false) }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await api.delete(`/projects/${id}/members/${memberId}`)
      setLiveTeam(prev => prev.filter(m => m.id !== memberId))
      setConfirmRemoveId(null)
      addToast({ type: 'success', message: 'Member removed' })
    } catch {
      addToast({ type: 'error', message: 'Failed to remove member' })
    }
  }

  const { data, loading, refetch } = useQuery(PROJECT_QUERY, {
    variables: { id }, skip: !id, fetchPolicy: 'cache-and-network',
  })
  const { data: mrData, refetch: refetchMRs } = useQuery(MANUFACTURING_REQUESTS_QUERY, {
    variables: { projectId: id },
    skip: !id || tab !== 'procurement',
    fetchPolicy: 'cache-and-network',
  })
  const { data: miData, refetch: refetchMIs } = useQuery(MATERIAL_ISSUES_QUERY, {
    variables: { projectId: id },
    skip: !id || tab !== 'procurement' || procSection !== 'store_out',
    fetchPolicy: 'cache-and-network',
  })
  const { data: rfqLinesData, refetch: refetchRFQLines } = useQuery(RFQ_LINES_QUERY, {
    variables: { projectId: id },
    skip: !id || (tab !== 'rfq_lines' && tab !== 'execution'),
    fetchPolicy: 'cache-and-network',
  })
  const [upsertRFQLines, { loading: savingLines }] = useMutation(UPSERT_RFQ_LINES, {
    onCompleted: () => { addToast({ type: 'success', message: 'Scope of work saved' }); void refetchRFQLines() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const { data: drawingsData, refetch: refetchDrawings } = useQuery(PROJECT_DRAWINGS_QUERY, {
    variables: { projectId: id },
    skip: !id || tab !== 'execution',
    fetchPolicy: 'cache-and-network',
  })

  // ── Bidding hooks ──────────────────────────────────────────────────────────
  const { data: bidDeliverableData, refetch: refetchBidDeliverables } = useQuery(BID_DELIVERABLES_QUERY, {
    variables: { projectId: id }, skip: !id || tab !== 'bidding', fetchPolicy: 'cache-and-network',
  })
  const { data: bidCostData, refetch: refetchBidCosts } = useQuery(BID_COST_ITEMS_QUERY, {
    variables: { projectId: id }, skip: !id || tab !== 'bidding', fetchPolicy: 'cache-and-network',
  })
  const { data: bidQuotationsData, refetch: refetchBidQuotations } = useQuery(BID_SUPPLIER_QUOTATIONS_QUERY, {
    variables: { projectId: id }, skip: !id || tab !== 'bidding', fetchPolicy: 'cache-and-network',
  })
  const { data: bidSummaryData, refetch: refetchBidSummary } = useQuery(BID_COMMERCIAL_SUMMARY_QUERY, {
    variables: { projectId: id }, skip: !id || tab !== 'bidding', fetchPolicy: 'cache-and-network',
  })
  const [createBidDeliverable, { loading: creatingDeliverable }] = useMutation(CREATE_BID_DELIVERABLE, {
    onCompleted: () => { addToast({ type: 'success', message: 'Deliverable added' }); void refetchBidDeliverables() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [updateBidDeliverable] = useMutation(UPDATE_BID_DELIVERABLE, {
    onCompleted: () => { void refetchBidDeliverables() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [deleteBidDeliverable] = useMutation(DELETE_BID_DELIVERABLE, {
    onCompleted: () => { addToast({ type: 'success', message: 'Deliverable removed' }); void refetchBidDeliverables() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [uploadBidDeliverableFile] = useMutation(UPLOAD_BID_DELIVERABLE_FILE, {
    onCompleted: () => { void refetchBidDeliverables() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [deleteBidDeliverableFile] = useMutation(DELETE_BID_DELIVERABLE_FILE, {
    onCompleted: () => { void refetchBidDeliverables() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [upsertBidCostItems, { loading: savingCosts }] = useMutation(UPSERT_BID_COST_ITEMS, {
    onCompleted: () => { addToast({ type: 'success', message: 'Cost items saved' }); void refetchBidCosts(); void refetchBidSummary() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [createBidSupplierQuotation] = useMutation(CREATE_BID_SUPPLIER_QUOTATION, {
    onCompleted: () => { addToast({ type: 'success', message: 'Quotation added' }); void refetchBidQuotations() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [updateBidSupplierQuotation] = useMutation(UPDATE_BID_SUPPLIER_QUOTATION, {
    onCompleted: () => { void refetchBidQuotations() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [deleteBidSupplierQuotation] = useMutation(DELETE_BID_SUPPLIER_QUOTATION, {
    onCompleted: () => { addToast({ type: 'success', message: 'Quotation removed' }); void refetchBidQuotations() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [updateBidCommercialSummary, { loading: savingSummary }] = useMutation(UPDATE_BID_COMMERCIAL_SUMMARY, {
    onCompleted: () => { void refetchBidSummary() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [submitBidForApproval, { loading: submittingBid }] = useMutation(SUBMIT_BID_FOR_APPROVAL, {
    onCompleted: () => { addToast({ type: 'success', message: 'Bid submitted for approval' }); void refetchBidSummary() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [approveBid, { loading: approvingBid }] = useMutation(APPROVE_BID, {
    onCompleted: () => { addToast({ type: 'success', message: 'Bid approved' }); void refetchBidSummary() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })
  const [rejectBid, { loading: rejectingBid }] = useMutation(REJECT_BID, {
    onCompleted: () => { addToast({ type: 'success', message: 'Bid rejected' }); void refetchBidSummary() },
    onError: (e) => addToast({ type: 'error', message: e.message }),
  })

  // ── Execution queries ──────────────────────────────────────────────────────
  const skipExec = !id || tab !== 'execution'
  const { data: rfiData,       refetch: refetchRFIs }       = useQuery(PROJECT_RFIS_QUERY,               { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: submittalData, refetch: refetchSubmittals }  = useQuery(PROJECT_SUBMITTALS_QUERY,         { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: siData,        refetch: refetchSIs }         = useQuery(PROJECT_SITE_INSTRUCTIONS_QUERY, { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: itpData,       refetch: refetchITPs }        = useQuery(PROJECT_ITPS_QUERY,              { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: irData,        refetch: refetchIRs }         = useQuery(PROJECT_INSPECTION_REQUESTS_QUERY,{ variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: ncrData,       refetch: refetchNCRs }        = useQuery(PROJECT_NCRS_QUERY,              { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: hseData,       refetch: refetchHSE }         = useQuery(PROJECT_HSE_RECORDS_QUERY,       { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })
  const { data: transmittalData, refetch: refetchTransmittals } = useQuery(PROJECT_TRANSMITTALS_QUERY,  { variables: { projectId: id }, skip: skipExec, fetchPolicy: 'cache-and-network' })

  // ── Execution mutations ────────────────────────────────────────────────────
  const execError = (e: Error) => addToast({ type: 'error', message: e.message })
  const [createProjectRFI]        = useMutation(CREATE_PROJECT_RFI,        { onCompleted: () => { addToast({ type: 'success', message: 'RFI created' });              void refetchRFIs() },        onError: execError })
  const [updateProjectRFI]        = useMutation(UPDATE_PROJECT_RFI,        { onCompleted: () => void refetchRFIs(),        onError: execError })
  const [respondToRFI]            = useMutation(RESPOND_TO_RFI,            {
    onCompleted: () => { addToast({ type: 'success', message: 'Response recorded' }); void refetchRFIs() },
    onError: execError,
    update(cache, { data }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rfi = (data as any)?.respondToRFI
      if (!rfi?.id) return
      const cacheId = cache.identify({ __typename: 'ProjectRFI', id: rfi.id })
      if (!cacheId) { void refetchRFIs(); return }
      cache.modify({
        id: cacheId,
        fields: {
          status:           () => 'responded',
          response:         () => rfi.response ?? null,
          respondedByName:  () => rfi.respondedByName ?? null,
          respondedDate:    () => rfi.respondedDate ?? null,
        },
      })
    },
  })
  const [deleteProjectRFI]        = useMutation(DELETE_PROJECT_RFI,        { onCompleted: () => void refetchRFIs(),        onError: execError })
  const [uploadRFIFile]           = useMutation(UPLOAD_RFI_FILE,           { onCompleted: () => void refetchRFIs(),        onError: execError })
  const [deleteRFIFile]           = useMutation(DELETE_RFI_FILE,           { onCompleted: () => void refetchRFIs(),        onError: execError })

  const [createProjectSubmittal]  = useMutation(CREATE_PROJECT_SUBMITTAL,  { onCompleted: () => { addToast({ type: 'success', message: 'Submittal created' });         void refetchSubmittals() },  onError: execError })
  const [updateProjectSubmittal]  = useMutation(UPDATE_PROJECT_SUBMITTAL,  { onCompleted: () => void refetchSubmittals(),  onError: execError })
  const [deleteProjectSubmittal]  = useMutation(DELETE_PROJECT_SUBMITTAL,  { onCompleted: () => void refetchSubmittals(),  onError: execError })
  const [uploadSubmittalFile]     = useMutation(UPLOAD_SUBMITTAL_FILE,     { onCompleted: () => void refetchSubmittals(),  onError: execError })
  const [deleteSubmittalFile]     = useMutation(DELETE_SUBMITTAL_FILE,     { onCompleted: () => void refetchSubmittals(),  onError: execError })

  const [createSiteInstruction]   = useMutation(CREATE_SITE_INSTRUCTION,   { onCompleted: () => { addToast({ type: 'success', message: 'Site Instruction created' }); void refetchSIs() },         onError: execError })
  const [updateSiteInstruction]   = useMutation(UPDATE_SITE_INSTRUCTION,   { onCompleted: () => void refetchSIs(),         onError: execError })
  const [deleteSiteInstruction]   = useMutation(DELETE_SITE_INSTRUCTION,   { onCompleted: () => void refetchSIs(),         onError: execError })
  const [uploadSIFile]            = useMutation(UPLOAD_SI_FILE,            { onCompleted: () => void refetchSIs(),         onError: execError })
  const [deleteSIFile]            = useMutation(DELETE_SI_FILE,            { onCompleted: () => void refetchSIs(),         onError: execError })

  const [createProjectITP]        = useMutation(CREATE_PROJECT_ITP,        { onCompleted: () => { addToast({ type: 'success', message: 'ITP created' });               void refetchITPs() },        onError: execError })
  const [updateProjectITP]        = useMutation(UPDATE_PROJECT_ITP,        { onCompleted: () => void refetchITPs(),        onError: execError })
  const [deleteProjectITP]        = useMutation(DELETE_PROJECT_ITP,        { onCompleted: () => void refetchITPs(),        onError: execError })
  const [upsertITPItems]          = useMutation(UPSERT_ITP_ITEMS,          { onCompleted: () => { addToast({ type: 'success', message: 'ITP items saved' });            void refetchITPs() },        onError: execError })
  const [recordITPItemResult]     = useMutation(RECORD_ITP_ITEM_RESULT,    { onCompleted: () => void refetchITPs(),        onError: execError })

  const [createInspectionRequest] = useMutation(CREATE_INSPECTION_REQUEST, { onCompleted: () => { addToast({ type: 'success', message: 'Inspection Request created' });void refetchIRs() },         onError: execError })
  const [updateInspectionRequest] = useMutation(UPDATE_INSPECTION_REQUEST, { onCompleted: () => void refetchIRs(),         onError: execError })
  const [deleteInspectionRequest] = useMutation(DELETE_INSPECTION_REQUEST, { onCompleted: () => void refetchIRs(),         onError: execError })
  const [uploadIRFile]            = useMutation(UPLOAD_IR_FILE,            { onCompleted: () => void refetchIRs(),         onError: execError })
  const [deleteIRFile]            = useMutation(DELETE_IR_FILE,            { onCompleted: () => void refetchIRs(),         onError: execError })

  const [createProjectNCR]        = useMutation(CREATE_PROJECT_NCR,        { onCompleted: () => { addToast({ type: 'success', message: 'NCR created' });               void refetchNCRs() },        onError: execError })
  const [updateProjectNCR]        = useMutation(UPDATE_PROJECT_NCR,        { onCompleted: () => void refetchNCRs(),        onError: execError })
  const [deleteProjectNCR]        = useMutation(DELETE_PROJECT_NCR,        { onCompleted: () => void refetchNCRs(),        onError: execError })
  const [uploadNCRFile]           = useMutation(UPLOAD_NCR_FILE,           { onCompleted: () => void refetchNCRs(),        onError: execError })
  const [deleteNCRFile]           = useMutation(DELETE_NCR_FILE,           { onCompleted: () => void refetchNCRs(),        onError: execError })

  const [createHSERecord]         = useMutation(CREATE_HSE_RECORD,         { onCompleted: () => { addToast({ type: 'success', message: 'HSE record created' });        void refetchHSE() },         onError: execError })
  const [updateHSERecord]         = useMutation(UPDATE_HSE_RECORD,         { onCompleted: () => void refetchHSE(),         onError: execError })
  const [deleteHSERecord]         = useMutation(DELETE_HSE_RECORD,         { onCompleted: () => void refetchHSE(),         onError: execError })
  const [uploadHSEFile]           = useMutation(UPLOAD_HSE_FILE,           { onCompleted: () => void refetchHSE(),         onError: execError })
  const [deleteHSEFile]           = useMutation(DELETE_HSE_FILE,           { onCompleted: () => void refetchHSE(),         onError: execError })

  const [createProjectTransmittal]= useMutation(CREATE_PROJECT_TRANSMITTAL,{ onCompleted: () => { addToast({ type: 'success', message: 'Transmittal created' });       void refetchTransmittals() },onError: execError })
  const [updateProjectTransmittal]= useMutation(UPDATE_PROJECT_TRANSMITTAL,{ onCompleted: () => void refetchTransmittals(),onError: execError })
  const [deleteProjectTransmittal]= useMutation(DELETE_PROJECT_TRANSMITTAL,{ onCompleted: () => void refetchTransmittals(),onError: execError })
  const [addTransmittalItem]      = useMutation(ADD_TRANSMITTAL_ITEM,      { onCompleted: () => void refetchTransmittals(),onError: execError })
  const [deleteTransmittalItem]   = useMutation(DELETE_TRANSMITTAL_ITEM,   { onCompleted: () => void refetchTransmittals(),onError: execError })

  // ── Planning queries ───────────────────────────────────────────────────────
  const skipPlan = !id || tab !== 'planning'
  const planStart = React.useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) }, [])
  const planEnd   = React.useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 9); return d.toISOString().slice(0, 10) }, [])
  const { data: wbsData,       refetch: refetchWBS }        = useQuery(PROJECT_WBS_QUERY,              { variables: { projectId: id }, skip: skipPlan, fetchPolicy: 'cache-and-network' })
  const { data: activitiesData,refetch: refetchActivities } = useQuery(PROJECT_ACTIVITIES_QUERY,       { variables: { projectId: id }, skip: skipPlan, fetchPolicy: 'cache-and-network' })
  const { data: baselinesData, refetch: refetchBaselines }  = useQuery(PROJECT_BASELINES_QUERY,        { variables: { projectId: id }, skip: skipPlan, fetchPolicy: 'cache-and-network' })
  const { data: resourcesData, refetch: refetchResources }  = useQuery(PROJECT_RESOURCES_QUERY,        { variables: { projectId: id }, skip: skipPlan, fetchPolicy: 'cache-and-network' })
  const { data: loadingData }                               = useQuery(PROJECT_RESOURCE_LOADING_QUERY, { variables: { projectId: id, startDate: planStart, endDate: planEnd }, skip: skipPlan, fetchPolicy: 'cache-and-network' })
  const { data: evmData,       refetch: refetchEVM }        = useQuery(PROJECT_EVM_QUERY,              { variables: { projectId: id }, skip: skipPlan, fetchPolicy: 'cache-and-network' })

  // ── Planning mutations ─────────────────────────────────────────────────────
  const planRefresh = () => { void refetchWBS(); void refetchActivities(); void refetchBaselines(); void refetchResources(); void refetchEVM() }
  const planError   = (e: Error) => addToast({ type: 'error', message: e.message })
  const [createWBSNode]             = useMutation(CREATE_WBS_NODE,             { onCompleted: () => void refetchWBS(),        onError: planError })
  const [updateWBSNode]             = useMutation(UPDATE_WBS_NODE,             { onCompleted: () => void refetchWBS(),        onError: planError })
  const [deleteWBSNode]             = useMutation(DELETE_WBS_NODE,             { onCompleted: () => void refetchWBS(),        onError: planError })
  const [createActivity]            = useMutation(CREATE_ACTIVITY,             { onCompleted: () => void refetchActivities(), onError: planError })
  const [updateActivity]            = useMutation(UPDATE_ACTIVITY,             { onCompleted: () => void refetchActivities(), onError: planError })
  const [updateActivityProgress]    = useMutation(UPDATE_ACTIVITY_PROGRESS,    { onCompleted: () => { void refetchActivities(); void refetchEVM() }, onError: planError })
  const [deleteActivity]            = useMutation(DELETE_ACTIVITY,             { onCompleted: () => void refetchActivities(), onError: planError })
  const [bulkImportActivities]      = useMutation(BULK_IMPORT_ACTIVITIES,      { onCompleted: () => { planRefresh(); addToast({ type: 'success', message: 'Schedule imported' }) }, onError: planError })
  const [createDependency]          = useMutation(CREATE_DEPENDENCY,           { onCompleted: () => void refetchActivities(), onError: planError })
  const [deleteDependency]          = useMutation(DELETE_DEPENDENCY,           { onCompleted: () => void refetchActivities(), onError: planError })
  const [recalculateCPM]            = useMutation(RECALCULATE_CPM,             { onCompleted: () => { void refetchActivities(); addToast({ type: 'success', message: 'CPM recalculated' }) }, onError: planError })
  const [levelResources]            = useMutation(LEVEL_RESOURCES,             { onCompleted: () => { planRefresh();           addToast({ type: 'success', message: 'Resources leveled' }) }, onError: planError })
  const [createBaseline]            = useMutation(CREATE_BASELINE,             { onCompleted: () => { void refetchBaselines(); addToast({ type: 'success', message: 'Baseline saved' }) }, onError: planError })
  const [setActiveBaseline]         = useMutation(SET_ACTIVE_BASELINE,         { onCompleted: () => void refetchBaselines(),   onError: planError })
  const [applyBaseline]             = useMutation(APPLY_BASELINE,              { onCompleted: () => { void refetchActivities(); addToast({ type: 'success', message: 'Baseline applied to schedule' }) }, onError: planError })
  const [deleteBaseline]            = useMutation(DELETE_BASELINE,             { onCompleted: () => void refetchBaselines(),   onError: planError })
  const [createResource]            = useMutation(CREATE_RESOURCE,             { onCompleted: () => void refetchResources(),   onError: planError })
  const [updateResource]            = useMutation(UPDATE_RESOURCE,             { onCompleted: () => void refetchResources(),   onError: planError })
  const [deleteResource]            = useMutation(DELETE_RESOURCE,             { onCompleted: () => void refetchResources(),   onError: planError })
  const [setCalendarDay]            = useMutation(SET_CALENDAR_DAY,            { onCompleted: () => void refetchResources(),   onError: planError })
  const [deleteCalendarDay]         = useMutation(DELETE_CALENDAR_DAY,         { onCompleted: () => void refetchResources(),   onError: planError })
  const [assignResource]            = useMutation(ASSIGN_RESOURCE,             { onCompleted: () => void refetchActivities(),  onError: planError })
  const [updateResourceAssignment]  = useMutation(UPDATE_RESOURCE_ASSIGNMENT,  { onCompleted: () => void refetchActivities(),  onError: planError })
  const [removeResourceAssignment]  = useMutation(REMOVE_RESOURCE_ASSIGNMENT,  { onCompleted: () => void refetchActivities(),  onError: planError })

  // ── Cost Control queries ───────────────────────────────────────────────────
  const skipCC = !id || tab !== 'cost_control'
  const { data: ccCodesData,   refetch: refetchCCCodes }   = useQuery(PROJECT_COST_CODES_QUERY,   { variables: { projectId: id }, skip: skipCC, fetchPolicy: 'cache-and-network' })
  const { data: ccSummaryData, refetch: refetchCCSummary } = useQuery(PROJECT_COST_SUMMARY_QUERY, { variables: { projectId: id }, skip: skipCC, fetchPolicy: 'cache-and-network' })
  const ccError = (e: Error) => addToast({ type: 'error', message: e.message })
  const [createCostCode] = useMutation(CREATE_COST_CODE, { onCompleted: () => { void refetchCCCodes(); void refetchCCSummary() }, onError: ccError })
  const [updateCostCode] = useMutation(UPDATE_COST_CODE, { onCompleted: () => { void refetchCCCodes(); void refetchCCSummary() }, onError: ccError })
  const [deleteCostCode] = useMutation(DELETE_COST_CODE, { onCompleted: () => { void refetchCCCodes(); void refetchCCSummary() }, onError: ccError })

  // ── Variation Orders ───────────────────────────────────────────────────────
  const skipVO = !id || tab !== 'variation_orders'
  const { data: voData, refetch: refetchVO } = useQuery(PROJECT_VARIATION_ORDERS_QUERY, { variables: { projectId: id }, skip: skipVO, fetchPolicy: 'cache-and-network' })
  const voError = (e: Error) => addToast({ type: 'error', message: e.message })
  const voRefresh = () => { void refetchVO() }
  const [createVariationOrder]   = useMutation(CREATE_VARIATION_ORDER,   { onCompleted: voRefresh, onError: voError })
  const [updateVariationOrder]   = useMutation(UPDATE_VARIATION_ORDER,   { onCompleted: voRefresh, onError: voError })
  const [deleteVariationOrder]   = useMutation(DELETE_VARIATION_ORDER,   { onCompleted: voRefresh, onError: voError })
  const [submitVariationOrder]   = useMutation(SUBMIT_VARIATION_ORDER,   { onCompleted: voRefresh, onError: voError })
  const [approveVariationOrder]  = useMutation(APPROVE_VARIATION_ORDER,  { onCompleted: voRefresh, onError: voError })
  const [rejectVariationOrder]   = useMutation(REJECT_VARIATION_ORDER,   { onCompleted: voRefresh, onError: voError })
  const [setVOStatus]            = useMutation(SET_VO_STATUS,            { onCompleted: voRefresh, onError: voError })
  const [createVOCostItem]       = useMutation(CREATE_VO_COST_ITEM,      { onCompleted: voRefresh, onError: voError })
  const [updateVOCostItem]       = useMutation(UPDATE_VO_COST_ITEM,      { onCompleted: voRefresh, onError: voError })
  const [deleteVOCostItem]       = useMutation(DELETE_VO_COST_ITEM,      { onCompleted: voRefresh, onError: voError })
  const [createVOCorrespondence] = useMutation(CREATE_VO_CORRESPONDENCE, { onCompleted: voRefresh, onError: voError })
  const [deleteVOCorrespondence] = useMutation(DELETE_VO_CORRESPONDENCE, { onCompleted: voRefresh, onError: voError })
  const [addVODrawing]           = useMutation(ADD_VO_DRAWING,           { onCompleted: voRefresh, onError: voError })
  const [removeVODrawing]        = useMutation(REMOVE_VO_DRAWING,        { onCompleted: voRefresh, onError: voError })

  // ── Meetings / MOM ─────────────────────────────────────────────────────────
  const skipMOM = !id || tab !== 'meetings'
  const { data: momData, refetch: refetchMOM } = useQuery(PROJECT_MEETINGS_QUERY, { variables: { projectId: id }, skip: skipMOM, fetchPolicy: 'cache-and-network' })
  const momError = (e: Error) => addToast({ type: 'error', message: e.message })
  const momRefresh = () => { void refetchMOM() }
  const [createMeeting]       = useMutation(CREATE_MEETING,       { onCompleted: momRefresh, onError: momError })
  const [updateMeeting]       = useMutation(UPDATE_MEETING,       { onCompleted: momRefresh, onError: momError })
  const [deleteMeeting]       = useMutation(DELETE_MEETING,       { onCompleted: momRefresh, onError: momError })
  const [issueMeeting]        = useMutation(ISSUE_MEETING,        { onCompleted: momRefresh, onError: momError })
  const [closeMeeting]        = useMutation(CLOSE_MEETING,        { onCompleted: momRefresh, onError: momError })
  const [createMeetingAction] = useMutation(CREATE_MEETING_ACTION,{ onCompleted: momRefresh, onError: momError })
  const [updateMeetingAction] = useMutation(UPDATE_MEETING_ACTION,{ onCompleted: momRefresh, onError: momError })
  const [deleteMeetingAction] = useMutation(DELETE_MEETING_ACTION,{ onCompleted: momRefresh, onError: momError })

  const p = data?.project

  if (loading && !p) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted }}>Loading project…</div>
  if (!p) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: theme.textMuted }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      </div>
      <span style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>Project not found</span>
      <span style={{ fontSize: '13px' }}>This project may have been removed or you may not have access.</span>
      <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>Back to Projects</Button>
    </div>
  )

  const isRfqPhase = p.isRfq && !RFQ_POST_DECISION.has(p.status)

  // ── Project-role derivation (name-match against managerName / team) ───────
  type ProjectRole = 'admin' | 'pm' | 'technical' | 'commercial' | 'both' | 'none'
  const myTeamEntry = liveTeam.find(m => m.employee_name === currentUserName)
  const isPM        = !isAdmin && p.managerName === currentUserName
  const projectRole: ProjectRole = isAdmin
    ? 'admin'
    : isPM
    ? 'pm'
    : myTeamEntry
    ? ((myTeamEntry.member_type ?? 'technical') as ProjectRole)
    : 'none'
  const isMember = projectRole !== 'none'
  const isTech   = projectRole === 'technical' || projectRole === 'both'
  const isComm   = projectRole === 'commercial' || projectRole === 'both'

  // Individual overrides: 'edit' | 'view' | 'none' — take precedence over role defaults
  const myOverrides = myTeamEntry?.permissions ?? {}
  // resolve(tab, roleCanEdit) → { canView, canEdit }
  const resolve = (tab: string, roleCanEdit: boolean): { canView: boolean; canEdit: boolean } => {
    if (isAdmin) return { canView: true, canEdit: true }
    const ov = myOverrides[tab]
    if (ov === 'edit')  return { canView: true,  canEdit: true  }
    if (ov === 'view')  return { canView: true,  canEdit: false }
    if (ov === 'none')  return { canView: false, canEdit: false }
    // No override — fall back to role default
    const roleView = isPM || isMember
    return { canView: roleCanEdit || roleView, canEdit: roleCanEdit }
  }

  const canEdit = {
    overview:    resolve('overview',    isPM).canEdit,
    clientDocs:  resolve('client_documents', isMember).canEdit,
    engineering: resolve('rfq_lines',   isPM || isTech).canEdit,
    bidding:     resolve('bidding',     isComm).canEdit,
    team:        resolve('team',        isPM).canEdit,
    execution:   resolve('execution',   isMember).canEdit,
    procurement: resolve('procurement', false).canEdit,
    costControl: resolve('cost_control',false).canEdit,
    variation:   resolve('variation_orders', false).canEdit,
    meetings:    resolve('meetings',    isMember).canEdit,
    planning:    resolve('planning',    isPM).canEdit,
    attachments: resolve('attachments', isMember).canEdit,
  }
  const canView = {
    costControl:    resolve('cost_control',     isPM).canView,
    variationOrders:resolve('variation_orders', isPM).canView,
  }

  const phase = p.lifecyclePhase ?? 'enquiry'

  const TABS = ALL_TABS
    .filter(() => teamLoading || isMember || Object.values(myOverrides).some(v => v !== 'none'))
    .filter(t => t.key !== 'rfq_lines'        || (p.isRfq && phaseGte(phase, 'scope_review')))
    .filter(t => t.key !== 'bidding'          || p.isRfq)
    .filter(t => t.key !== 'execution'        || phaseGte(phase, 'execution'))
    .filter(t => t.key !== 'procurement'      || phaseGte(phase, 'scope_review'))
    .filter(t => t.key !== 'meetings'         || phaseGte(phase, 'scope_review'))
    .filter(t => t.key !== 'cost_control'     || (canView.costControl && phaseGte(phase, 'scope_review')))
    .filter(t => t.key !== 'variation_orders' || (canView.variationOrders && phaseGte(phase, 'execution')))

  const parse = (v: unknown): unknown[] => { try { return Array.isArray(v) ? v : JSON.parse(String(v ?? '[]')) } catch { return [] } }
  const stages        = parse(p.stages)        as Stage[]
  const team          = parse(p.team)          as Member[]
  const statusHistory = parse(p.statusHistory) as Record<string, unknown>[]
  const activityLog   = parse(p.activityLog)   as Record<string, unknown>[]
  const recentPos     = parse(p.recentPos)     as Record<string, unknown>[]
  const costSummary   = (() => { try { if (!p.costSummary) return null; return typeof p.costSummary === 'object' ? p.costSummary : JSON.parse(String(p.costSummary)) } catch { return null } })()

  const sec = (title: string) => (
    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, padding: '8px 0 4px', borderBottom: `1px solid ${theme.border}`, marginBottom: '12px' }}>{title}</div>
  )

  // ── header-level computations ───────────────────────────────────────────────
  const cs          = costSummary as Record<string, unknown> | null
  const hdrCcy      = String(cs?.['currencyCode'] ?? p.budgetCurrency ?? 'USD')
  const hdrActual   = Number(cs?.['actualCosts']    ?? 0)
  const hdrBudget   = Number(cs?.['budgetAmount']   ?? p.budgetAmount ?? 0)
  const hdrRemain   = Number(cs?.['budgetRemaining'] ?? (hdrBudget - hdrActual))
  const hdrUtilPct  = hdrBudget > 0 ? Math.round((hdrActual / hdrBudget) * 100) : 0
  const hdrApprPOs  = recentPos.filter(po => (po as Record<string,unknown>)['status'] === 'approved')
  const hdrPendPOs  = recentPos.filter(po => (po as Record<string,unknown>)['status'] === 'pending_approval')
  const hdrApprAmt  = hdrApprPOs.reduce((s, po) => s + Number((po as Record<string,unknown>)['totalAmount'] ?? (po as Record<string,unknown>)['amount'] ?? 0), 0)
  const hdrPendAmt  = hdrPendPOs.reduce((s, po) => s + Number((po as Record<string,unknown>)['totalAmount'] ?? (po as Record<string,unknown>)['amount'] ?? 0), 0)
  const remainDays  = p.plannedEndDate ? Math.max(0, Math.ceil((new Date(p.plannedEndDate).getTime() - Date.now()) / 86400000)) : null
  const totalDays   = (p.plannedStartDate && p.plannedEndDate) ? Math.ceil((new Date(p.plannedEndDate).getTime() - new Date(p.plannedStartDate).getTime()) / 86400000) : null
  const daysPct     = (totalDays && remainDays != null && totalDays > 0) ? Math.round(((totalDays - remainDays) / totalDays) * 100) : 0
  const pct         = p.overallCompletionPct ?? 0
  const r = 13; const circ = 2 * Math.PI * r

  const kpiCircle = (val: number, color: string) => (
    <svg width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r={r} fill="none" stroke={`${color}25`} strokeWidth="3.5"/>
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${Math.min(val,100)/100*circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 17 17)"/>
    </svg>
  )

  const kpiTile = (label: string, value: React.ReactNode, sub: React.ReactNode, icon: React.ReactNode, valColor = theme.textPrimary) => (
    <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted }}>{label}</span>
        <span style={{ color: theme.textMuted, display: 'flex', alignItems: 'center' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: valColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      {sub != null && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Project Header ── */}
      <div style={{ padding: isPhone ? '14px 12px 0' : '18px 24px 0', background: theme.bgCanvas, borderBottom: `1px solid ${theme.border}` }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary, margin: 0, lineHeight: 1.2 }}>{p.name}</h1>
              <Badge variant={lifecycleBadgeVariant(p.status)}>
                {LIFECYCLE_STAGES[lifecycleIdx(p.lifecyclePhase ?? 'enquiry')]?.label ?? p.status.replace(/_/g, ' ')}
              </Badge>
              {p.isRfq && isRfqPhase && <Badge variant="info">RFQ</Badge>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, position: 'relative' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/projects/${id}/edit`)}>Edit</Button>
            {((p.allowedActions ?? []).length > 0 || isAdmin) && (
              <>
                <button
                  onClick={() => setShowActionsPanel(v => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: `1px solid ${theme.border}`, background: showActionsPanel ? theme.accent : theme.bgCanvas, color: showActionsPanel ? '#fff' : theme.textPrimary, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {(p.allowedActions ?? []).length > 0 && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: showActionsPanel ? 'rgba(255,255,255,0.7)' : '#f59e0b', flexShrink: 0 }} />
                  )}
                  Actions
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform 0.15s', transform: showActionsPanel ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showActionsPanel && (
                  <>
                    {/* click-away backdrop */}
                    <div onClick={() => setShowActionsPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                    {/* panel */}
                    <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 200, width: 460, background: theme.bgCanvas, border: `1px solid ${theme.border}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
                      {/* panel header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Workflow Actions</span>
                        <button onClick={() => setShowActionsPanel(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                      </div>
                      {/* workflow buttons */}
                      <div style={{ padding: '14px 16px' }}>
                        <ProjectStatusBar
                          projectId={id!}
                          status={p.status}
                          lifecyclePhase={p.lifecyclePhase ?? 'enquiry'}
                          allowedActions={p.allowedActions ?? []}
                          clientDocCount={p.clientDocCount ?? 0}
                          rfqLineCount={p.rfqLineCount ?? 0}
                          isRfq={p.isRfq ?? false}
                          onTransitioned={() => { void refetch(); setShowActionsPanel(false) }}
                          timeline={{ siteVisitDate: p.siteVisitDate, siteVisitTime: p.siteVisitTime, questionDate: p.questionDate, questionTime: p.questionTime, submissionDate: p.submissionDate, submissionTime: p.submissionTime }}
                        />
                      </div>
                      {/* admin override */}
                      {isAdmin && (
                        <div style={{ borderTop: `1px solid ${theme.dangerBorder}`, margin: '0 16px 16px', borderRadius: 8, overflow: 'hidden', border: `1px solid ${theme.dangerBorder}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: theme.dangerBg }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={theme.danger} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            <span style={{ fontSize: 10, fontWeight: 700, color: theme.danger, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Admin Override</span>
                            <span style={{ fontSize: 10, color: theme.danger, opacity: 0.6, marginLeft: 'auto' }}>Bypasses workflow</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: theme.bgCanvas }}>
                            <SearchableSelect
                              value={adminStatus}
                              onChange={setAdminStatus}
                              placeholder="Select target status…"
                              options={[
                                { value: 'pending',                  label: 'Pending' },
                                { value: 'ongoing',                  label: 'Ongoing' },
                                { value: 'submitted',                label: 'Submitted' },
                                { value: 'approved',                 label: 'Approved' },
                                { value: 'completed',                label: 'Completed' },
                                { value: 'on_hold',                  label: 'On Hold' },
                                { value: 'cancelled',                label: 'Cancelled' },
                                { value: 'cancelled_after_approval', label: 'Cancelled After Approval' },
                              ]}
                            />
                            <Button variant="danger" size="sm" disabled={!adminStatus || adminStatus === p.status} loading={adminSetting}
                              onClick={() => void adminSetProjectStatus({ variables: { id: id!, status: adminStatus } })}>
                              Apply
                            </Button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 10px', background: theme.bgCanvas }}>
                            <SearchableSelect
                              value={adminPhase}
                              onChange={setAdminPhase}
                              placeholder="Select lifecycle phase…"
                              options={[
                                { value: 'enquiry',         label: 'Client Enquiry' },
                                { value: 'scope_review',    label: 'Scope Review' },
                                { value: 'bidding',         label: 'Bidding' },
                                { value: 'client_approval', label: 'Client Approval' },
                                { value: 'execution',       label: 'Execution' },
                                { value: 'closeout',        label: 'Closeout' },
                              ]}
                            />
                            <Button variant="danger" size="sm" disabled={!adminPhase || adminPhase === (p.lifecyclePhase ?? 'enquiry')} loading={adminPhaseSetting}
                              onClick={() => void adminSetPhase({ variables: { id: id!, phase: adminPhase } })}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {/* Meta info row */}
        <div style={{ display: 'flex', gap: isPhone ? '10px' : '24px', flexWrap: 'wrap', fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>
          {([['Project No', p.code], ['RFQ No', p.rfqNumber], ['Client', p.clientName], ['Contract No', p.contractName], ['Project Manager', p.managerName]] as [string,string|null|undefined][]).filter(([,v]) => v).map(([label, value]) => (
            <span key={label}>{label}: <strong style={{ color: theme.textPrimary }}>{String(value)}</strong></span>
          ))}
        </div>

        {/* Lifecycle progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '16px' }}>
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const cur = lifecycleIdx(p.lifecyclePhase ?? 'enquiry')
            const isActive = idx === cur
            const isPast   = idx < cur
            return (
              <React.Fragment key={stage.key}>
                {idx > 0 && (
                  <div style={{ flex: 1, height: '2px', background: isPast ? '#22c55e' : theme.border, transition: 'background 0.3s', minWidth: '10px' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '50%',
                    background: isPast ? '#22c55e' : isActive ? theme.accent : theme.bgCanvas,
                    border: `2px solid ${isPast ? '#22c55e' : isActive ? theme.accent : theme.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s',
                    boxShadow: isActive ? `0 0 0 4px ${theme.accent}22` : 'none',
                  }}>
                    {isPast
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span style={{ fontSize: '12px', fontWeight: 700, color: isActive ? '#fff' : theme.textMuted }}>{idx + 1}</span>
                    }
                  </div>
                  {!isPhone && (
                    <span style={{ fontSize: '10px', fontWeight: isActive ? 700 : 500, color: isActive ? theme.accent : isPast ? '#22c55e' : theme.textMuted, whiteSpace: 'nowrap' }}>
                      {stage.label}
                    </span>
                  )}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div style={{ padding: isPhone ? '10px 12px' : '12px 24px', background: theme.bgCanvas, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isAdmin ? 8 : 5}, minmax(110px, 1fr))`, gap: '10px', minWidth: isAdmin ? '820px' : '500px' }}>
          {kpiTile('Contract Value', formatCurrency(p.projectValue ?? 0, hdrCcy), null,
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          )}
          {kpiTile('Approved Budget', formatCurrency(hdrBudget, hdrCcy), null,
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          )}
          {isAdmin && kpiTile('Actual Cost',
            formatCurrency(hdrActual, hdrCcy),
            `${hdrUtilPct}% of budget`,
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
            hdrUtilPct > 80 ? '#ef4444' : hdrUtilPct > 60 ? '#f59e0b' : theme.textPrimary
          )}
          {isAdmin && kpiTile('Remaining Budget',
            formatCurrency(hdrRemain, hdrCcy),
            null,
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hdrRemain < 0 ? '#ef4444' : '#22c55e'} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
            hdrRemain < 0 ? '#ef4444' : '#22c55e'
          )}
          {kpiTile('Approved POs',
            String(hdrApprPOs.length || (p.openPoCount != null ? recentPos.length - (p.openPoCount ?? 0) : 0)),
            hdrApprAmt > 0 ? formatCurrency(hdrApprAmt, hdrCcy) : null,
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          )}
          {kpiTile('Pending POs',
            String(p.openPoCount ?? hdrPendPOs.length),
            hdrPendAmt > 0 ? formatCurrency(hdrPendAmt, hdrCcy) : null,
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
            (p.openPoCount ?? 0) > 0 ? '#f59e0b' : theme.textPrimary
          )}
          {kpiTile('Project Progress', `${pct}%`, null, kpiCircle(pct, theme.accent))}
          {remainDays !== null && kpiTile('Remaining Days', String(remainDays), null, kpiCircle(daysPct, '#8b5cf6'))}
        </div>
      </div>


      {/* Stage bar */}
      {stages.length > 0 && (
        <div style={{ padding: '12px 24px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
          <ProjectStageBar stages={stages} overallPct={p.overallCompletionPct ?? 0} onStageClick={s => { setEditStage(s); setStageDrawer(true) }} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: isPhone ? '0 8px' : '0 24px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto' }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isPhone ? '16px 12px' : '20px 24px', paddingBottom: isPhone ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : undefined }}>
        {!teamLoading && projectRole === 'none' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '280px', gap: '12px', color: theme.textMuted, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>Not a project member</div>
            <div style={{ fontSize: '13px', maxWidth: '340px', lineHeight: 1.6 }}>You are not assigned to this project. Contact the Project Manager or an Admin to request access.</div>
          </div>
        )}
        {(teamLoading || projectRole !== 'none') && <>
        {tab === 'rfq_lines' && (
          <EngineeringTab
            projectId={id!}
            projectCode={String(p?.rfqNumber ?? p?.code ?? '')}
            theme={theme}
            isAdmin={isAdmin}
          />
        )}

        {tab === 'transmittals' && (
          <TransmittalsTab
            projectId={id!}
            projectCode={String(p?.rfqNumber ?? p?.code ?? '')}
            theme={theme}
            isAdmin={isAdmin}
          />
        )}

        {tab === 'overview' && (() => {
          // ── overview-local computations ──────────────────────────────────────
          const ovCcy       = String(cs?.['currencyCode'] ?? p.budgetCurrency ?? 'USD')
          const ovActual    = Number(cs?.['actualCosts']    ?? 0)
          const ovCommitted = Number(cs?.['committedCosts'] ?? 0)
          const ovStoreCosts = Number(cs?.['storeCosts']   ?? 0)
          const ovBudget    = Number(cs?.['budgetAmount']   ?? p.budgetAmount ?? 0)
          const ovRemaining = Number(cs?.['budgetRemaining'] ?? (ovBudget - ovActual - ovCommitted))
          const ovUtilPct   = ovBudget > 0 ? Math.round((ovActual / ovBudget) * 100) : 0
          const ovCompletion = p.overallCompletionPct ?? 0

          // EAC / profit
          const ovEAC      = ovCompletion > 0 ? Math.round(ovActual / (ovCompletion / 100)) : ovBudget
          const ovProfit   = ovBudget - ovEAC
          const ovMarginPct = ovBudget > 0 ? (ovProfit / ovBudget) * 100 : 0

          // Schedule execution status
          const today2        = new Date()
          const projEndDate   = p.plannedEndDate ? new Date(p.plannedEndDate) : null
          const projStartDate = p.plannedStartDate ? new Date(p.plannedStartDate) : null
          const ovTotalDays   = (projStartDate && projEndDate) ? (projEndDate.getTime() - projStartDate.getTime()) / 86400000 : 0
          const ovElapsedPct  = (projStartDate && ovTotalDays > 0) ? Math.min(100, Math.round((today2.getTime() - projStartDate.getTime()) / 86400000 / ovTotalDays * 100)) : 0
          const execStatus    = !projStartDate ? 'Not Started'
                              : p.status === 'completed' ? 'Completed'
                              : projEndDate && today2 > projEndDate ? 'Delayed'
                              : ovCompletion < ovElapsedPct - 10 ? 'Behind Schedule'
                              : 'On Schedule'
          const execColor     = execStatus === 'On Schedule' || execStatus === 'Completed' ? '#22c55e'
                              : execStatus === 'Behind Schedule' ? '#f59e0b' : '#ef4444'

          // PO summary
          const ovPoMap: Record<string, { count: number; amount: number }> = {}
          recentPos.forEach(po => {
            const st = String((po as Record<string, unknown>)['status'] ?? 'draft')
            if (!ovPoMap[st]) ovPoMap[st] = { count: 0, amount: 0 }
            ovPoMap[st].count++
            ovPoMap[st].amount += Number((po as Record<string, unknown>)['totalAmount'] ?? (po as Record<string, unknown>)['amount'] ?? 0)
          })
          const PO_ORDER  = ['draft','pending_approval','approved','closed']
          const PO_LABELS: Record<string,string> = { draft:'Draft', pending_approval:'Pending Approval', approved:'Approved', closed:'Closed' }
          const PO_DOT:    Record<string,string> = { draft: theme.textMuted, pending_approval:'#f59e0b', approved:'#22c55e', closed: theme.accent }
          const poTotal   = recentPos.length
          const poTotalAmt = recentPos.reduce((s, po) => s + Number((po as Record<string,unknown>)['totalAmount'] ?? (po as Record<string,unknown>)['amount'] ?? 0), 0)

          // Health score
          const hBudget  = ovUtilPct < 50 ? 30 : ovUtilPct < 80 ? 25 : ovUtilPct < 95 ? 12 : 4
          const hSched   = ovCompletion >= ovElapsedPct - 5 ? 20 : ovCompletion >= ovElapsedPct - 20 ? 13 : 5
          const hProcure = (p.openPoCount ?? 0) < 5 ? 20 : (p.openPoCount ?? 0) < 15 ? 14 : 7
          const hEng     = (p.teamCount ?? team.length ?? 0) > 0 ? 15 : 0
          const hSafety  = 15
          const healthScore  = hBudget + hSched + hProcure + hEng + hSafety
          const healthLabel  = healthScore >= 80 ? 'Good' : healthScore >= 55 ? 'Fair' : 'At Risk'
          const healthColor  = healthScore >= 80 ? '#22c55e' : healthScore >= 55 ? '#f59e0b' : '#ef4444'
          const healthChecks = [
            { label: 'Budget',      ok: ovUtilPct < 80 },
            { label: 'Schedule',    ok: execStatus === 'On Schedule' || execStatus === 'Completed' },
            { label: 'Procurement', ok: (p.openPoCount ?? 0) < 10 },
            { label: 'Engineering', ok: (p.teamCount ?? team.length) > 0 },
            { label: 'Safety',      ok: true },
          ]

          // Alerts
          const ovAlerts: string[] = []
          if (ovUtilPct > 80) ovAlerts.push(`Budget utilization reached ${ovUtilPct}%`)
          if ((ovPoMap['pending_approval']?.count ?? 0) > 0) ovAlerts.push(`${ovPoMap['pending_approval'].count} Purchase Order${ovPoMap['pending_approval'].count > 1 ? 's' : ''} awaiting approval`)
          if (ovRemaining < 0) ovAlerts.push('Project is over budget')
          ;([[p.submissionDate, 'Bid submission'], [p.siteVisitDate, 'Site visit'], [p.plannedEndDate, 'Project end']] as [string|null|undefined, string][]).forEach(([d, label]) => {
            if (!d) return
            const diff = Math.ceil((new Date(d).getTime() - today2.getTime()) / 86400000)
            if (diff > 0 && diff <= 30) ovAlerts.push(`${label} in ${diff} days`)
          })

          // Upcoming
          const upcomingDates: { label: string; date: string }[] = []
          ;([[p.siteVisitDate,'Site Visit'], [p.questionDate,'Questions Due'], [p.submissionDate,'Bid Submission'], [p.plannedEndDate,'Project Completion']] as [string|null|undefined,string][]).filter(([d]) => !!d).forEach(([d, label]) => {
            upcomingDates.push({ label, date: String(d) })
          })
          if (stages.length > 0) {
            stages.filter(s => s.plannedEndDate && new Date(s.plannedEndDate) > today2).slice(0, 3).forEach(s => {
              upcomingDates.push({ label: s.name, date: s.plannedEndDate ?? '' })
            })
          }

          // Recent events (last 6 for the denser layout)
          const ovEvents = activityLog.length > 0 ? activityLog : statusHistory
          const recent6  = [...ovEvents].reverse().slice(0, 6)

          // Gantt setup
          const ganttStart = projStartDate ?? today2
          const ganttEnd   = projEndDate ?? new Date(today2.getTime() + 365 * 86400000)
          const ganttMs    = ganttEnd.getTime() - ganttStart.getTime()
          const ganttPct   = (d: string | null | undefined): number => {
            if (!d) return 0
            return Math.min(100, Math.max(0, (new Date(d).getTime() - ganttStart.getTime()) / ganttMs * 100))
          }
          const ganttWidth = (s: string | null | undefined, e: string | null | undefined): number => {
            if (!s || !e) return 0
            return Math.min(100, Math.max(0, (new Date(e).getTime() - new Date(s).getTime()) / ganttMs * 100))
          }
          const ganttMonths: string[] = []
          const d0 = new Date(ganttStart); d0.setDate(1)
          while (d0 <= ganttEnd) {
            ganttMonths.push(d0.toLocaleString('default', { month: 'short', year: '2-digit' }))
            d0.setMonth(d0.getMonth() + 1)
          }
          const todayPct = ganttPct(today2.toISOString().slice(0, 10))
          const ganttRows = stages.length > 0 ? stages.slice(0, 6) : []

          // Card header helper
          const ch = (title: string, action?: React.ReactNode) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '8px', borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted }}>{title}</span>
              {action}
            </div>
          )
          const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
            <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px', ...extra }}>{children}</div>
          )
          const infoRow = (label: string, value: React.ReactNode, bold?: boolean) => (
            <div style={{ display: 'flex', gap: '8px', padding: '5px 0', borderBottom: `1px solid ${theme.border}22`, alignItems: 'flex-start' }}>
              <div style={{ width: '130px', flexShrink: 0, fontSize: '12px', color: theme.textMuted }}>{label}</div>
              <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: bold ? 600 : 400, flex: 1 }}>{value}</div>
            </div>
          )
          const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Status banners */}
              {p.status === 'on_hold' && p.holdReason && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef3c7', border: '1px solid #f59e0b', fontSize: '13px', color: '#92400e' }}>
                  <strong>On Hold:</strong> {p.holdReason}
                </div>
              )}
              {p.cancelReason && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fee2e2', border: '1px solid #ef4444', fontSize: '13px', color: '#991b1b' }}>
                  <strong>Cancelled:</strong> {p.cancelReason}
                </div>
              )}

              {/* ── Row 1: 4 cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(4, minmax(0,1fr))', gap: '14px', alignItems: 'start' }}>

                {/* 1. Project Information */}
                {card(<>
                  {ch('Project Information')}
                  {infoRow('Client', p.clientName ?? '—')}
                  {infoRow('Contract Value', formatCurrency(p.projectValue ?? 0, ovCcy), true)}
                  {infoRow('Start Date', fmtDate(p.plannedStartDate))}
                  {infoRow('Completion Date', fmtDate(p.plannedEndDate))}
                  {infoRow('Project Manager', p.managerName ?? '—')}
                  {p.contractName && infoRow('Contract No.', p.contractName)}
                  <div style={{ display: 'flex', gap: '8px', padding: '8px 0 0', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: theme.textMuted, width: '130px', flexShrink: 0 }}>Execution Status</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '999px', background: execColor + '18', fontSize: '11px', fontWeight: 700, color: execColor }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: execColor, display: 'inline-block' }} />
                      {execStatus}
                    </span>
                  </div>
                </>)}

                {/* 2. Financial Summary */}
                {card(<>
                  {ch('Financial Summary')}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <th style={{ textAlign: 'left', padding: '0 0 6px', fontSize: '11px', color: theme.textMuted, fontWeight: 600 }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '0 0 6px', fontSize: '11px', color: theme.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>Amount ({ovCcy})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Approved Budget',            val: ovBudget,       color: theme.textPrimary, bold: false },
                          { label: 'Actual Cost',                val: ovActual,       color: theme.textPrimary, bold: false },
                          { label: 'Committed Cost (incl. store)',val: ovCommitted,   color: theme.textPrimary, bold: false },
                          ...(ovStoreCosts > 0 ? [{ label: '  · Store Price Component', val: ovStoreCosts, color: theme.textMuted, bold: false }] : []),
                          { label: 'Remaining Budget',           val: ovRemaining,    color: ovRemaining < 0 ? '#ef4444' : '#22c55e', bold: true },
                          { label: 'Forecast Cost at Completion',val: ovEAC,         color: theme.textPrimary, bold: false },
                          { label: 'Expected Profit',            val: ovProfit,      color: ovProfit >= 0 ? '#22c55e' : '#ef4444', bold: false },
                          { label: 'Profit Margin',              val: null,          color: ovProfit >= 0 ? '#22c55e' : '#ef4444', bold: true, text: `${ovMarginPct.toFixed(1)}%` },
                        ].map(row => (
                          <tr key={row.label} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                            <td style={{ padding: '6px 0', color: theme.textPrimary, fontSize: '12px' }}>{row.label}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.color, fontWeight: row.bold ? 700 : 400 }}>
                              {row.text ?? (row.val != null ? formatCurrency(row.val, ovCcy) : '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>)}

                {/* 3. Purchase Order Summary */}
                {card(<>
                  {ch('Purchase Order Summary', <button onClick={() => setTab('procurement')} style={{ fontSize: '11px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>)}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <th style={{ textAlign: 'left', padding: '0 0 6px', fontSize: '11px', color: theme.textMuted, fontWeight: 600 }}>Status</th>
                          <th style={{ textAlign: 'right', padding: '0 0 6px', fontSize: '11px', color: theme.textMuted, fontWeight: 600 }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '0 0 6px', fontSize: '11px', color: theme.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>Amount ({ovCcy})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PO_ORDER.map(st => {
                          const row = ovPoMap[st]
                          if (!row) return null
                          return (
                            <tr key={st} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                              <td style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: PO_DOT[st], flexShrink: 0, display: 'inline-block' }} />
                                <span style={{ color: theme.textPrimary }}>{PO_LABELS[st] ?? st}</span>
                              </td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{row.count}</td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.amount, ovCcy)}</td>
                            </tr>
                          )
                        })}
                        <tr style={{ borderTop: `2px solid ${theme.border}` }}>
                          <td style={{ padding: '7px 0', fontWeight: 700, color: theme.textPrimary }}>Total</td>
                          <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{poTotal}</td>
                          <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(poTotalAmt, ovCcy)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>)}

                {/* 4. Project Health */}
                {card(<>
                  {ch('Project Health')}
                  {/* Semi-circle gauge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', width: '120px', height: '70px', overflow: 'hidden', marginBottom: '4px' }}>
                      <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', top: 0, left: 0 }}>
                        <circle cx="60" cy="60" r="48" fill="none" stroke={`${theme.border}`} strokeWidth="12"
                          strokeDasharray={`${Math.PI * 48} ${2 * Math.PI * 48}`} strokeLinecap="round"
                          transform="rotate(180 60 60)" />
                        <circle cx="60" cy="60" r="48" fill="none" stroke={healthColor} strokeWidth="12"
                          strokeDasharray={`${(healthScore / 100) * Math.PI * 48} ${2 * Math.PI * 48}`} strokeLinecap="round"
                          transform="rotate(180 60 60)"
                          style={{ transition: 'stroke-dasharray 0.6s' }} />
                      </svg>
                      <div style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '26px', fontWeight: 800, color: healthColor, lineHeight: 1 }}>{healthScore}</span>
                        <span style={{ fontSize: '10px', color: theme.textMuted }}>of 100</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: healthColor }}>{healthLabel}</span>
                  </div>
                  {/* Category checks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {healthChecks.map(hc => (
                      <div key={hc.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: hc.ok ? '#22c55e18' : '#ef444418', border: `1px solid ${hc.ok ? '#22c55e' : '#ef4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {hc.ok
                            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          }
                        </div>
                        <span style={{ fontSize: '12px', color: theme.textPrimary }}>{hc.label}</span>
                      </div>
                    ))}
                  </div>
                </>)}
              </div>

              {/* ── Row 2: 5 cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(5, minmax(0,1fr))', gap: '14px', alignItems: 'start' }}>

                {/* 5. Schedule Overview */}
                {card(<>
                  {ch('Schedule Overview')}
                  {ganttRows.length > 0 ? (
                    <div>
                      {/* Month header */}
                      <div style={{ display: 'flex', marginBottom: '4px', paddingLeft: '70px' }}>
                        {ganttMonths.slice(0, 6).map((m, i) => (
                          <div key={i} style={{ flex: 1, fontSize: '9px', color: theme.textMuted, textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>{m}</div>
                        ))}
                      </div>
                      {/* Gantt rows */}
                      {ganttRows.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                          <div style={{ width: '66px', flexShrink: 0, fontSize: '10px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          <div style={{ flex: 1, position: 'relative', height: '18px' }}>
                            {/* baseline */}
                            {s.plannedStartDate && s.plannedEndDate && (
                              <div style={{ position: 'absolute', top: '1px', height: '7px', left: `${ganttPct(s.plannedStartDate)}%`, width: `${ganttWidth(s.plannedStartDate, s.plannedEndDate)}%`, background: theme.border, borderRadius: '3px', minWidth: '3px' }} />
                            )}
                            {/* actual */}
                            {(s.actualStartDate || s.plannedStartDate) && (
                              <div style={{ position: 'absolute', bottom: '1px', height: '7px', left: `${ganttPct(s.actualStartDate ?? s.plannedStartDate)}%`, width: `${Math.max(ganttWidth(s.actualStartDate ?? s.plannedStartDate, s.actualEndDate ?? s.plannedEndDate) * (s.completionPct / 100 || 0.1), 0.5)}%`, background: theme.accent, borderRadius: '3px', minWidth: '2px' }} />
                            )}
                            {/* today line */}
                            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: '1px', background: '#ef4444', opacity: 0.6 }} />
                          </div>
                        </div>
                      ))}
                      {/* Legend */}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.border}22` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '14px', height: '4px', background: theme.border, borderRadius: '2px' }} />
                          <span style={{ fontSize: '10px', color: theme.textMuted }}>Baseline</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '14px', height: '4px', background: theme.accent, borderRadius: '2px' }} />
                          <span style={{ fontSize: '10px', color: theme.textMuted }}>Actual</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {[
                        ['Start', fmtDate(p.plannedStartDate)],
                        ['End',   fmtDate(p.plannedEndDate)],
                        ['Progress', `${ovCompletion}%`],
                      ].filter(([,v]) => v !== '—').map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '12px' }}>
                          <span style={{ color: theme.textMuted }}>{l}</span>
                          <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: '10px', height: '6px', borderRadius: '3px', background: theme.border, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ovCompletion}%`, background: theme.accent, borderRadius: '3px' }} />
                      </div>
                    </div>
                  )}
                </>)}

                {/* 6. Recent Activities */}
                {card(<>
                  {ch('Recent Activities')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recent6.length === 0 && <span style={{ fontSize: '12px', color: theme.textMuted }}>No recent activity.</span>}
                    {recent6.map((ev, i) => {
                      const evType = String(ev['event_type'] ?? ev['type'] ?? '')
                      const summary = String(ev['summary'] ?? ev['description'] ?? ev['message'] ?? `Status → ${ev['status'] ?? ''}`)
                      const ts = String(ev['created_at'] ?? ev['timestamp'] ?? '')
                      const age = ts ? (() => {
                        const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
                        return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`
                      })() : ''
                      const iconColor = evType.includes('file') || evType.includes('upload') ? '#8b5cf6'
                                      : evType.includes('po') || evType.includes('purchase') ? '#f59e0b'
                                      : evType.includes('status') ? theme.accent
                                      : theme.accent
                      return (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: iconColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5">
                              {evType.includes('file') || evType.includes('upload')
                                ? <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
                                : evType.includes('po') || evType.includes('purchase')
                                  ? <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>
                                  : <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>
                              }
                            </svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '11px', color: theme.textPrimary, lineHeight: 1.35 }}>{summary}</div>
                            {age && <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '1px' }}>{age}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {ovEvents.length > 6 && (
                    <button onClick={() => setTab('history')} style={{ marginTop: '10px', fontSize: '11px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      View all {ovEvents.length} events →
                    </button>
                  )}
                </>)}

                {/* 7. Upcoming Activities */}
                {card(<>
                  {ch('Upcoming Activities')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {upcomingDates.length === 0 && <span style={{ fontSize: '12px', color: theme.textMuted }}>No upcoming dates.</span>}
                    {upcomingDates.slice(0, 6).map((u, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', padding: '4px 0', borderBottom: `1px solid ${theme.border}22` }}>
                        <span style={{ fontSize: '11px', color: theme.textPrimary, flex: 1 }}>{u.label}</span>
                        <span style={{ fontSize: '11px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDate(u.date)}</span>
                      </div>
                    ))}
                  </div>
                </>)}

                {/* 8. Alerts */}
                {card(<>
                  {ch('Alerts')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ovAlerts.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: '12px', color: '#22c55e' }}>No alerts</span>
                      </div>
                    )}
                    {ovAlerts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" style={{ flexShrink: 0, marginTop: '1px' }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span style={{ fontSize: '11px', color: theme.textPrimary, lineHeight: 1.4 }}>{a}</span>
                      </div>
                    ))}
                  </div>
                </>)}

                {/* 9. Team Members */}
                {card(<>
                  {ch('Team Members', <button onClick={() => setTab('team')} style={{ fontSize: '11px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>)}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {team.length === 0 && liveTeam.length === 0 && <span style={{ fontSize: '12px', color: theme.textMuted }}>No team members.</span>}
                    {(liveTeam.length > 0 ? liveTeam : team).slice(0, 5).map((m, i) => {
                      const mu = m as unknown as Record<string,unknown>
                      const name = String(mu['employee_name'] ?? mu['name'] ?? '?')
                      const role = String(mu['member_type'] ?? mu['role'] ?? mu['job_title'] ?? '')
                      const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()
                      const roleColors: Record<string,string> = { commercial:'#7c3aed', technical:'#0ea5e9', pm:'#22c55e', planning:'#f59e0b' }
                      const dotColor = roleColors[role.toLowerCase()] ?? theme.accent
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: dotColor + '20', border: `1px solid ${dotColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: dotColor, flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                            {role && <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'capitalize' }}>{role.replace(/_/g, ' ')}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {(liveTeam.length > 5 || team.length > 5) && (
                    <button onClick={() => setTab('team')} style={{ marginTop: '8px', fontSize: '11px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      View All Team Members →
                    </button>
                  )}
                </>)}
              </div>
            </div>
          )
        })()}

        {tab === 'stages' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>{stages.length} stage{stages.length !== 1 ? 's' : ''}</span>
              {isAdmin && <Button variant="primary" size="sm" onClick={() => { setEditStage(null); setStageDrawer(true) }}>Add Stage</Button>}
            </div>
            {stages.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No stages defined.</div>}
            {stages.length > 0 && (
              isPhone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...stages].sort((a, b) => a.sequence - b.sequence).map(s => (
                    <div key={s.id} style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                      <div onClick={() => { setEditStage(s); setStageDrawer(true) }}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: theme.accent, flexShrink: 0 }}>{s.sequence}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{s.name}</div>
                          {s.plannedStartDate && <div style={{ fontSize: '11px', color: theme.textMuted }}>{s.plannedStartDate} → {s.plannedEndDate ?? '—'}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{s.completionPct}%</div>
                          <Badge variant={s.status === 'completed' ? 'success' : (s.status === 'active' || s.status === 'in_progress') ? 'info' : 'neutral'}>{s.status.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                      {s.status !== 'completed' && s.status !== 'cancelled' && (
                        <div style={{ padding: '8px 14px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => void quickUpdateStage({ variables: { projectId: id!, stageId: s.id, input: { name: s.name, status: s.status === 'pending' ? 'active' : 'completed', completionPct: s.status === 'pending' ? s.completionPct : 100, plannedStartDate: s.plannedStartDate || null, plannedEndDate: s.plannedEndDate || null, actualStartDate: s.actualStartDate || (s.status === 'pending' ? new Date().toISOString().slice(0, 10) : null), actualEndDate: s.status !== 'pending' ? new Date().toISOString().slice(0, 10) : null, notes: s.notes || null, assignedTo: s.assignedTo || null } } })}
                            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: s.status === 'pending' ? theme.accent : '#22c55e', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            {s.status === 'pending' ? '▶ Start' : '✓ Complete'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 120px 100px 120px', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                    {['#', 'Stage', 'Dates', 'Assigned To', 'Progress', 'Status', ''].map((h, i) => (
                      <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 4 ? 'center' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  {[...stages].sort((a, b) => a.sequence - b.sequence).map((s, i) => (
                    <div key={s.id} onClick={() => { setEditStage(s); setStageDrawer(true) }}
                      style={{ display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 120px 100px 120px', alignItems: 'center', padding: '10px 16px', borderBottom: i < stages.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: theme.accent }}>{s.sequence}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{s.name}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{s.plannedStartDate ? `${s.plannedStartDate} → ${s.plannedEndDate ?? '—'}` : '—'}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{s.assignedToName ?? '—'}</div>
                      <div style={{ padding: '0 8px' }}>
                        <div style={{ height: '6px', borderRadius: '3px', background: theme.border, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.completionPct}%`, background: s.completionPct === 100 ? '#22c55e' : theme.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', marginTop: '2px' }}>{s.completionPct}%</div>
                      </div>
                      <div><Badge variant={s.status === 'completed' ? 'success' : (s.status === 'active' || s.status === 'in_progress') ? 'info' : 'neutral'}>{s.status.replace('_', ' ')}</Badge></div>
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {s.status !== 'completed' && s.status !== 'cancelled' && (
                          <button
                            onClick={() => void quickUpdateStage({ variables: { projectId: id!, stageId: s.id, input: { name: s.name, status: s.status === 'pending' ? 'active' : 'completed', completionPct: s.status === 'pending' ? s.completionPct : 100, plannedStartDate: s.plannedStartDate || null, plannedEndDate: s.plannedEndDate || null, actualStartDate: s.actualStartDate || (s.status === 'pending' ? new Date().toISOString().slice(0, 10) : null), actualEndDate: s.status !== 'pending' ? new Date().toISOString().slice(0, 10) : null, notes: s.notes || null, assignedTo: s.assignedTo || null } } })}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: s.status === 'pending' ? theme.accent : '#22c55e', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            {s.status === 'pending' ? '▶ Start' : '✓ Complete'}
                          </button>
                        )}
                        {s.status === 'completed' && <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>✓ Done</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {tab === 'team' && (() => {
          const technical  = liveTeam.filter(m => (m.member_type ?? 'technical') === 'technical')
          const commercial = liveTeam.filter(m => m.member_type === 'commercial')
          const both       = liveTeam.filter(m => m.member_type === 'both')

          const typeColor = (type: string) =>
            type === 'commercial' ? '#7c3aed' : type === 'both' ? '#06b6d4' : theme.accent

          const typeTag = (type: string) => (
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: `${typeColor(type)}18`,
              color: typeColor(type),
            }}>
              {type === 'commercial' ? 'Commercial' : type === 'both' ? 'Both' : 'Technical'}
            </span>
          )

          const memberRow = (m: LiveMember, i: number, last: boolean) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: confirmRemoveId === m.id ? '40px 1fr 1fr 100px 80px 220px' : '40px 1fr 1fr 100px 80px 72px', alignItems: 'center', padding: '10px 16px', borderBottom: !last ? `1px solid ${theme.border}` : 'none' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${typeColor(m.member_type ?? 'technical')}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: typeColor(m.member_type ?? 'technical') }}>
                {(m.employee_name ?? '?')[0].toUpperCase()}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{m.employee_name}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>{m.job_title ?? '—'}</div>
              <div>{typeTag(m.member_type ?? 'technical')}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'right' }}>{m.allocated_hours != null ? `${m.allocated_hours}h` : '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '2px' }}>
                {/* Permissions editor — admin/PM only */}
                {canEdit.team && (
                  <button
                    onClick={() => { setPermEditMemberId(m.id); setPermEditDraft(m.permissions ?? {}) }}
                    title="Edit permissions"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.color = theme.accent)}
                    onMouseLeave={e => (e.currentTarget.style.color = theme.textMuted)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="7.5" cy="15.5" r="4.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5L17 6l2.5 2.5L18 10"/>
                    </svg>
                  </button>
                )}
                {canEdit.team && (
                  confirmRemoveId === m.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>Remove?</span>
                      <button onClick={() => void handleRemoveMember(m.id)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                      <button onClick={() => setConfirmRemoveId(null)} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRemoveId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = theme.textMuted)} title="Remove">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )
                )}
              </div>
            </div>
          )

          const sectionHeader = (label: string, count: number, color: string) => (
            <div style={{ padding: '8px 16px', background: `${color}10`, borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>{label}</span>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>({count})</span>
            </div>
          )

          const tableHeader = (
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 100px 80px 40px', gap: '0', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
              <div /><div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Title</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Hours</div>
              <div />
            </div>
          )

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>
                  {technical.length} technical · {commercial.length} commercial{both.length > 0 ? ` · ${both.length} both` : ''}
                </span>
                {canEdit.team && (
                  <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>Add Member</Button>
                )}
              </div>

              {/* Add Member Modal */}
              <Modal open={showAddForm} onClose={() => { setShowAddForm(false); setAddForm({ employee_id: '', allocated_hours: '', member_type: 'technical' }) }} title="Add Team Member" size="sm">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Team type toggle */}
                  <div>
                    <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team Type</label>
                    <div style={{ display: 'flex', gap: '0', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                      {(['technical', 'commercial', 'both'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAddForm(f => ({ ...f, member_type: t }))}
                          style={{
                            flex: 1, padding: '8px 0', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer',
                            background: addForm.member_type === t ? typeColor(t) : theme.bgCanvas,
                            color: addForm.member_type === t ? '#fff' : theme.textMuted,
                            transition: 'background 0.15s',
                          }}
                        >
                          {t === 'technical' ? 'Technical' : t === 'commercial' ? 'Commercial' : 'Both'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <SearchableSelect
                    label="Employee"
                    value={addForm.employee_id}
                    onChange={(v) => setAddForm(f => ({ ...f, employee_id: v }))}
                    placeholder="Select employee…"
                    options={employees.map(e => ({
                      value: e.id,
                      label: `${e.first_name} ${e.last_name}${e.job_title ? ` — ${e.job_title}` : ''}`,
                    }))}
                  />
                  <div>
                    <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px', fontWeight: 500 }}>Allocated Hours (optional)</label>
                    <input
                      type="number" min="0" step="0.5" placeholder="0"
                      value={addForm.allocated_hours}
                      onChange={e => setAddForm(f => ({ ...f, allocated_hours: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                    <Button variant="ghost" onClick={() => { setShowAddForm(false); setAddForm({ employee_id: '', allocated_hours: '', member_type: 'technical' }) }}>Cancel</Button>
                    <Button variant="primary" loading={addLoading} onClick={handleAddMember}>Add Member</Button>
                  </div>
                </div>
              </Modal>

              {/* Permission Editor Modal */}
              {(() => {
                const editingMember = liveTeam.find(m => m.id === permEditMemberId)
                const PERM_TABS: Array<{ key: string; label: string }> = [
                  { key: 'overview',         label: 'Overview' },
                  { key: 'client_documents', label: 'Client Documents' },
                  { key: 'rfq_lines',        label: 'Scope of Work' },
                  { key: 'bidding',          label: 'Bidding' },
                  { key: 'team',             label: 'Team' },
                  { key: 'planning',         label: 'Planning' },
                  { key: 'execution',        label: 'Execution' },
                  { key: 'procurement',      label: 'Procurement' },
                  { key: 'cost_control',     label: 'Cost Control' },
                  { key: 'variation_orders', label: 'Variation Orders' },
                  { key: 'meetings',         label: 'Meetings' },
                  { key: 'attachments',      label: 'Attachments' },
                ]
                const LEVELS: Array<{ value: string; label: string; color: string }> = [
                  { value: 'none', label: 'None',  color: theme.textMuted },
                  { value: 'view', label: 'View',  color: '#f59e0b' },
                  { value: 'edit', label: 'Edit',  color: theme.accent },
                ]
                return (
                  <Modal
                    open={!!permEditMemberId}
                    onClose={() => setPermEditMemberId(null)}
                    title={`Permissions — ${editingMember?.employee_name ?? ''}`}
                    size="sm"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                      <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px' }}>
                        Override role defaults per tab. "None" hides the tab; "View" allows read-only; "Edit" grants full access. Leave unset to use role defaults.
                      </p>
                      {PERM_TABS.map(({ key, label }) => {
                        const current = permEditDraft[key] ?? ''
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                            <span style={{ fontSize: '13px', color: theme.textPrimary }}>{label}</span>
                            <div style={{ display: 'flex', gap: '0', border: `1px solid ${theme.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                              <button
                                type="button"
                                onClick={() => setPermEditDraft(d => { const n = { ...d }; delete n[key]; return n })}
                                style={{
                                  padding: '4px 10px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                                  background: current === '' ? theme.bgCanvas : 'transparent',
                                  color: current === '' ? theme.textPrimary : theme.textMuted,
                                  borderRight: `1px solid ${theme.border}`,
                                }}
                              >Default</button>
                              {LEVELS.map(lv => (
                                <button
                                  key={lv.value}
                                  type="button"
                                  onClick={() => setPermEditDraft(d => ({ ...d, [key]: lv.value }))}
                                  style={{
                                    padding: '4px 10px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                                    background: current === lv.value ? `${lv.color}20` : 'transparent',
                                    color: current === lv.value ? lv.color : theme.textMuted,
                                    borderRight: lv.value !== 'edit' ? `1px solid ${theme.border}` : 'none',
                                  }}
                                >{lv.label}</button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '14px' }}>
                        <Button variant="ghost" onClick={() => setPermEditMemberId(null)}>Cancel</Button>
                        <Button variant="primary" loading={permSaving} onClick={handleSavePerms}>Save Permissions</Button>
                      </div>
                    </div>
                  </Modal>
                )
              })()}

              {/* Team list */}
              {teamLoading && <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>}
              {!teamLoading && liveTeam.length === 0 && (
                <div style={{ color: theme.textMuted, fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>No team members yet.</div>
              )}
              {!teamLoading && liveTeam.length > 0 && (
                isPhone ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(['technical', 'commercial', 'both'] as const).map(type => {
                      const group = liveTeam.filter(m => (m.member_type ?? 'technical') === type)
                      if (group.length === 0) return null
                      return (
                        <React.Fragment key={type}>
                          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: typeColor(type), padding: '4px 0' }}>
                            {type === 'commercial' ? 'Commercial Team' : type === 'both' ? 'Both Teams' : 'Technical Team'}
                          </div>
                          {group.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${typeColor(m.member_type ?? 'technical')}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: typeColor(m.member_type ?? 'technical'), flexShrink: 0 }}>
                                {(m.employee_name ?? '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{m.employee_name}</div>
                                <div style={{ fontSize: '11px', color: theme.textMuted }}>{m.job_title ?? '—'}</div>
                              </div>
                              {m.allocated_hours != null && <span style={{ fontSize: '12px', color: theme.textMuted }}>{m.allocated_hours}h</span>}
                              {canEdit.team && (
                                confirmRemoveId === m.id ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', color: theme.textMuted }}>Remove?</span>
                                    <button onClick={() => void handleRemoveMember(m.id)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                                    <button onClick={() => setConfirmRemoveId(null)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>No</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmRemoveId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', display: 'flex', alignItems: 'center' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = theme.textMuted)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                )
                              )}
                            </div>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                    {tableHeader}
                    {technical.length > 0 && sectionHeader('Technical Team', technical.length, theme.accent)}
                    {technical.map((m, i) => memberRow(m, i, i === technical.length - 1 && commercial.length === 0 && both.length === 0))}
                    {commercial.length > 0 && sectionHeader('Commercial Team', commercial.length, '#7c3aed')}
                    {commercial.map((m, i) => memberRow(m, i, i === commercial.length - 1 && both.length === 0))}
                    {both.length > 0 && sectionHeader('Both Teams', both.length, '#06b6d4')}
                    {both.map((m, i) => memberRow(m, i, i === both.length - 1))}
                  </div>
                )
              )}
            </div>
          )
        })()}

        {tab === 'cost_control' && id && (
          <CostControlTab
            projectId={id}
            th={theme as unknown as Record<string, string>}
            isEditable={canEdit.costControl}
            isAdmin={canEdit.costControl}
            costCodes={ccCodesData?.projectCostCodes ?? []}
            summary={ccSummaryData?.projectCostSummary ?? null}
            onCreateCostCode={(v) => void createCostCode({ variables: v })}
            onUpdateCostCode={(v) => void updateCostCode({ variables: v })}
            onDeleteCostCode={(id) => void deleteCostCode({ variables: { id } })}
            projectAnalyticAccountId={p?.analyticAccountId ?? null}
            projectAnalyticAccountName={p?.analyticAccountName ?? null}
          />
        )}

        {/* ── Procurement tab (Purchase Orders + Manufacturing Requests) ── */}
        {tab === 'procurement' && (() => {
          const mrs = (mrData?.manufacturingRequests ?? []) as Array<Record<string, unknown>>
          const mrStatusVariant: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
            draft: 'neutral', pending_approval: 'warning', approved: 'info',
            in_production: 'info', completed: 'success', cancelled: 'danger',
          }
          const storeOuts = (miData?.materialIssues ?? []) as Array<Record<string, unknown>>
          const subNav: { key: typeof procSection; label: string; count: number }[] = [
            { key: 'purchase_orders', label: 'Purchase Orders', count: recentPos.length },
            { key: 'manufacturing',   label: 'Manufacturing Requests', count: mrs.length },
            { key: 'store_out',       label: 'Store Out', count: storeOuts.length },
          ]
          return (
            <div>
              {/* Sub-nav */}
              <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${theme.border}`, marginBottom: '24px' }}>
                {subNav.map(s => (
                  <button key={s.key} onClick={() => setProcSection(s.key)}
                    style={{ padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: procSection === s.key ? 600 : 400,
                      color: procSection === s.key ? theme.accent : theme.textSecondary,
                      borderBottom: `2px solid ${procSection === s.key ? theme.accent : 'transparent'}`,
                      marginBottom: '-1px' }}>
                    {s.label}
                    {s.count > 0 && <span style={{ marginLeft: '5px', fontSize: '11px', opacity: 0.75 }}>({s.count})</span>}
                  </button>
                ))}
              </div>

              {/* Purchase Orders */}
              {procSection === 'purchase_orders' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>{recentPos.length} purchase order{recentPos.length !== 1 ? 's' : ''}</span>
                    {canEdit.procurement && <Button variant="primary" size="sm" onClick={() => navigate(`/procurement/purchase-orders/new?projectId=${id}`)}>+ Create PO</Button>}
                  </div>
                  {recentPos.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No purchase orders for this project.</div>}
                  {recentPos.length > 0 && (
                    isPhone ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recentPos.map((po, i) => (
                          <div key={String(po.id ?? i)} onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)} onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}>
                            <div>
                              <div style={{ fontWeight: 500, color: theme.textPrimary, fontSize: '13px' }}>{String(po.po_number ?? '—')}</div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>{String(po.vendor_name ?? '')}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{String(po.total_amount ?? '—')}</div>
                              <Badge variant="neutral">{String(po.status ?? '—')}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 140px 110px 32px', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                          {['PO Number', 'Vendor', 'Amount', 'Status', ''].map((h, i) => (
                            <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                          ))}
                        </div>
                        {recentPos.map((po, i) => (
                          <div key={String(po.id ?? i)} onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}
                            style={{ display: 'grid', gridTemplateColumns: '180px 1fr 140px 110px 32px', alignItems: 'center', padding: '10px 16px', borderBottom: i < recentPos.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: theme.accent }}>{String(po.po_number ?? '—')}</div>
                            <div style={{ fontSize: '13px', color: theme.textPrimary }}>{String(po.vendor_name ?? '—')}</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{String(po.total_amount ?? '—')}</div>
                            <div><Badge variant="neutral">{String(po.status ?? '—')}</Badge></div>
                            <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Manufacturing Requests */}
              {procSection === 'manufacturing' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>{mrs.length} request{mrs.length !== 1 ? 's' : ''}</span>
                    {canEdit.procurement && <Button variant="primary" size="sm" onClick={() => setShowMRForm(true)}>New Request</Button>}
                  </div>
                  {mrs.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No manufacturing requests yet.</div>}
                  {mrs.length > 0 && (
                    isPhone ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {mrs.map(mr => (
                          <div key={String(mr['id'])} onClick={() => navigate(`/manufacturing/requests/${mr['id']}`)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px 14px', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = theme.accent)} onMouseLeave={e => (e.currentTarget.style.borderColor = theme.border)}>
                            <div>
                              <div style={{ fontWeight: 600, color: theme.accent, fontFamily: 'monospace', fontSize: '13px' }}>{String(mr['requestNumber'] ?? '—')}</div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>{String(mr['productName'] ?? '')} · Qty {String(mr['qtyRequested'] ?? 0)}</div>
                            </div>
                            <Badge variant={mrStatusVariant[String(mr['status'])] ?? 'neutral'}>{String(mr['status']).replace(/_/g, ' ')}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 130px 120px 32px', padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCanvas }}>
                          {['Request #', 'Product', 'Qty', 'Required Date', 'Status', ''].map((h, i) => (
                            <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                          ))}
                        </div>
                        {mrs.map((mr, i) => (
                          <div key={String(mr['id'])} onClick={() => navigate(`/manufacturing/requests/${mr['id']}`)}
                            style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 130px 120px 32px', alignItems: 'center', padding: '10px 16px', borderBottom: i < mrs.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: theme.accent }}>{String(mr['requestNumber'] ?? '—')}</div>
                            <div style={{ fontSize: '13px', color: theme.textPrimary }}>{String(mr['productName'] ?? '—')}</div>
                            <div style={{ fontSize: '13px', color: theme.textMuted }}>{String(mr['qtyRequested'] ?? 0)}</div>
                            <div style={{ fontSize: '13px', color: theme.textMuted }}>{mr['requiredDate'] ? String(mr['requiredDate']).slice(0, 10) : '—'}</div>
                            <div><Badge variant={mrStatusVariant[String(mr['status'])] ?? 'neutral'}>{String(mr['status']).replace(/_/g, ' ')}</Badge></div>
                            <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Store Out — read-only summary, managed via Inventory > Store Out */}
              {procSection === 'store_out' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>
                      {storeOuts.length} store-out{storeOuts.length !== 1 ? 's' : ''} linked to this project
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/inventory/store-out?projectId=${id}`)}>
                      Manage in Store Out module →
                    </Button>
                  </div>
                  {storeOuts.length === 0 && (
                    <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
                      No store-outs for this project yet.{' '}
                      <button onClick={() => navigate('/inventory/store-out')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontSize: '13px', textDecoration: 'underline' }}>
                        Go to Store Out
                      </button>{' '}to create one.
                    </div>
                  )}
                  {storeOuts.length > 0 && (
                    <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 130px 120px 100px', padding: '8px 16px', background: theme.bgCanvas, borderBottom: `1px solid ${theme.border}` }}>
                        {['Issue #', 'Description', 'Date', 'Total Cost', 'Status'].map((h, i) => (
                          <div key={i} style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                        ))}
                      </div>
                      {storeOuts.map((si, i) => {
                        const siLines = (si['lines'] as Array<Record<string, unknown>>) ?? []
                        const totalCost = siLines.reduce((sum, l) => sum + parseFloat(String(l['totalCost'] ?? '0')), 0)
                        const statusVariant: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = { draft: 'warning', issued: 'success', cancelled: 'danger' }
                        return (
                          <div key={String(si['id'])}
                            style={{ display: 'grid', gridTemplateColumns: '160px 1fr 130px 120px 100px', alignItems: 'center', padding: '10px 16px', borderBottom: i < storeOuts.length - 1 ? `1px solid ${theme.border}` : 'none', cursor: 'pointer' }}
                            onClick={() => navigate('/inventory/store-out')}
                            onMouseEnter={e => (e.currentTarget.style.background = theme.bgCanvas)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: theme.accent }}>{String(si['issueNumber'] ?? '—')}</div>
                            <div style={{ fontSize: '13px', color: theme.textPrimary }}>
                              {si['poNumber'] ? `PO: ${String(si['poNumber'])}` : (si['notes'] ? String(si['notes']).slice(0, 40) : 'Manual issue')}
                            </div>
                            <div style={{ fontSize: '12px', color: theme.textMuted }}>{String(si['issueDate'] ?? '').slice(0, 10)}</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {totalCost > 0 ? totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                            </div>
                            <div><Badge variant={statusVariant[String(si['status'])] ?? 'neutral'}>{String(si['status'])}</Badge></div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Bidding tab ── */}
        {tab === 'bidding' && id && (
          <BiddingTab
            projectId={id}
            isEditable={isRfqPhase || canEdit.bidding}
            isAdmin={isAdmin}
            theme={theme}
            teamMembers={liveTeam.map(m => ({ id: m.employee_id, name: m.employee_name }))}
            deliverables={bidDeliverableData?.bidDeliverables ?? []}
            creatingDeliverable={creatingDeliverable}
            onCreateDeliverable={(v) => void createBidDeliverable({ variables: v })}
            onUpdateDeliverable={(v) => void updateBidDeliverable({ variables: v })}
            onDeleteDeliverable={(id2) => void deleteBidDeliverable({ variables: { id: id2 } })}
            onUploadDeliverableFile={(deliverableId, fileId, title) => void uploadBidDeliverableFile({ variables: { deliverableId, fileId, title } })}
            onDeleteDeliverableFile={(attachmentId, deliverableId) => void deleteBidDeliverableFile({ variables: { attachmentId, deliverableId } })}
            costItems={bidCostData?.bidCostItems ?? []}
            savingCosts={savingCosts}
            onSaveCosts={(items) => void upsertBidCostItems({ variables: { projectId: id, items } })}
            quotations={bidQuotationsData?.bidSupplierQuotations ?? []}
            onCreateQuotation={(v) => void createBidSupplierQuotation({ variables: v })}
            onUpdateQuotation={(v) => void updateBidSupplierQuotation({ variables: v })}
            onDeleteQuotation={(id2) => void deleteBidSupplierQuotation({ variables: { id: id2 } })}
            summary={bidSummaryData?.bidCommercialSummary ?? null}
            savingSummary={savingSummary}
            onUpdateSummary={(v) => void updateBidCommercialSummary({ variables: { projectId: id, ...v } })}
            submittingBid={submittingBid}
            onSubmitBid={() => void submitBidForApproval({ variables: { projectId: id } })}
            approvingBid={approvingBid}
            onApproveBid={() => void approveBid({ variables: { projectId: id } })}
            rejectingBid={rejectingBid}
            onRejectBid={(reason) => void rejectBid({ variables: { projectId: id, reason } })}
          />
        )}

        {/* ── Client Documents ── */}
        {tab === 'client_documents' && (
          <ClientDocumentsTab projectId={id ?? ''} theme={theme} isAdmin={canEdit.clientDocs} />
        )}
        {tab === 'planning' && id && (
          <PlanningTab
            projectId={id}
            th={theme as unknown as Record<string, string>}
            isEditable={canEdit.planning}
            isAdmin={isAdmin}
            wbsNodes={wbsData?.projectWBS ?? []}
            activities={activitiesData?.projectActivities ?? []}
            baselines={baselinesData?.projectBaselines ?? []}
            resources={resourcesData?.projectResources ?? []}
            resourceLoading={loadingData?.projectResourceLoading ?? []}
            evm={evmData?.projectEVM ?? null}
            onCreateWBS={(v) => void createWBSNode({ variables: v })}
            onUpdateWBS={(v) => void updateWBSNode({ variables: v })}
            onDeleteWBS={(id) => void deleteWBSNode({ variables: { id } })}
            onCreateActivity={(v) => void createActivity({ variables: v })}
            onUpdateActivity={(v) => void updateActivity({ variables: v })}
            onUpdateProgress={(v) => void updateActivityProgress({ variables: v })}
            onDeleteActivity={(id) => void deleteActivity({ variables: { id } })}
            onBulkImport={(v) => void bulkImportActivities({ variables: v })}
            onCreateDependency={(v) => void createDependency({ variables: v })}
            onDeleteDependency={(id) => void deleteDependency({ variables: { id } })}
            onRecalculateCPM={() => void recalculateCPM({ variables: { projectId: id } })}
            onLevelResources={() => void levelResources({ variables: { projectId: id } })}
            onCreateBaseline={(v) => void createBaseline({ variables: v })}
            onSetActiveBaseline={(id) => void setActiveBaseline({ variables: { id } })}
            onApplyBaseline={(id) => void applyBaseline({ variables: { id } })}
            onDeleteBaseline={(id) => void deleteBaseline({ variables: { id } })}
            onCreateResource={(v) => void createResource({ variables: v })}
            onUpdateResource={(v) => void updateResource({ variables: v })}
            onDeleteResource={(id) => void deleteResource({ variables: { id } })}
            onSetCalendarDay={(v) => void setCalendarDay({ variables: v })}
            onDeleteCalendarDay={(id) => void deleteCalendarDay({ variables: { id } })}
            onAssignResource={(v) => void assignResource({ variables: v })}
            onUpdateAssignment={(v) => void updateResourceAssignment({ variables: v })}
            onRemoveAssignment={(id) => void removeResourceAssignment({ variables: { id } })}
          />
        )}
        {tab === 'execution' && id && (
          <ExecutionTab
            projectId={id}
            theme={theme as unknown as Record<string, string>}
            isEditable={canEdit.execution}
            isAdmin={isAdmin}
            rfis={rfiData?.projectRFIs ?? []}
            submittals={submittalData?.projectSubmittals ?? []}
            siteInstructions={siData?.projectSiteInstructions ?? []}
            itps={itpData?.projectITPs ?? []}
            inspectionRequests={irData?.projectInspectionRequests ?? []}
            ncrs={ncrData?.projectNCRs ?? []}
            hseRecords={hseData?.projectHSERecords ?? []}
            transmittals={transmittalData?.projectTransmittals ?? []}
            drawings={drawingsData?.projectDrawings ?? []}
            rfqLines={rfqLinesData?.rfqLines ?? []}
            team={liveTeam}
            onCreateRFI={(v) => void createProjectRFI({ variables: { projectId: id, ...v } })}
            onUpdateRFI={(v) => void updateProjectRFI({ variables: v })}
            onRespondRFI={(v) => void respondToRFI({ variables: v })}
            onDeleteRFI={(rfId) => void deleteProjectRFI({ variables: { id: rfId } })}
            onUploadRFIFile={(v) => void uploadRFIFile({ variables: v })}
            onDeleteRFIFile={(v) => void deleteRFIFile({ variables: v })}
            onCreateSubmittal={(v) => void createProjectSubmittal({ variables: { projectId: id, ...v } })}
            onUpdateSubmittal={(v) => void updateProjectSubmittal({ variables: v })}
            onDeleteSubmittal={(sId) => void deleteProjectSubmittal({ variables: { id: sId } })}
            onUploadSubmittalFile={(v) => void uploadSubmittalFile({ variables: v })}
            onDeleteSubmittalFile={(v) => void deleteSubmittalFile({ variables: v })}
            onCreateSI={(v) => void createSiteInstruction({ variables: { projectId: id, ...v } })}
            onUpdateSI={(v) => void updateSiteInstruction({ variables: v })}
            onDeleteSI={(sId) => void deleteSiteInstruction({ variables: { id: sId } })}
            onUploadSIFile={(v) => void uploadSIFile({ variables: v })}
            onDeleteSIFile={(v) => void deleteSIFile({ variables: v })}
            onCreateITP={(v) => void createProjectITP({ variables: { projectId: id, ...v } })}
            onUpdateITP={(v) => void updateProjectITP({ variables: v })}
            onDeleteITP={(iId) => void deleteProjectITP({ variables: { id: iId } })}
            onUpsertITPItems={(v) => void upsertITPItems({ variables: v })}
            onRecordITPResult={(v) => void recordITPItemResult({ variables: v })}
            onCreateIR={(v) => void createInspectionRequest({ variables: { projectId: id, ...v } })}
            onUpdateIR={(v) => void updateInspectionRequest({ variables: v })}
            onDeleteIR={(iId) => void deleteInspectionRequest({ variables: { id: iId } })}
            onUploadIRFile={(v) => void uploadIRFile({ variables: v })}
            onDeleteIRFile={(v) => void deleteIRFile({ variables: v })}
            onCreateNCR={(v) => void createProjectNCR({ variables: { projectId: id, ...v } })}
            onUpdateNCR={(v) => void updateProjectNCR({ variables: v })}
            onDeleteNCR={(nId) => void deleteProjectNCR({ variables: { id: nId } })}
            onUploadNCRFile={(v) => void uploadNCRFile({ variables: v })}
            onDeleteNCRFile={(v) => void deleteNCRFile({ variables: v })}
            onCreateHSE={(v) => void createHSERecord({ variables: { projectId: id, ...v } })}
            onUpdateHSE={(v) => void updateHSERecord({ variables: v })}
            onDeleteHSE={(hId) => void deleteHSERecord({ variables: { id: hId } })}
            onUploadHSEFile={(v) => void uploadHSEFile({ variables: v })}
            onDeleteHSEFile={(v) => void deleteHSEFile({ variables: v })}
            onCreateTransmittal={(v) => void createProjectTransmittal({ variables: { projectId: id, ...v } })}
            onUpdateTransmittal={(v) => void updateProjectTransmittal({ variables: v })}
            onDeleteTransmittal={(tId) => void deleteProjectTransmittal({ variables: { id: tId } })}
            onAddTransmittalItem={(v) => void addTransmittalItem({ variables: v })}
            onDeleteTransmittalItem={(iId) => void deleteTransmittalItem({ variables: { id: iId } })}
          />
        )}
        {tab === 'variation_orders' && id && (
          <VariationOrdersTab
            projectId={id}
            th={theme as unknown as Record<string, string>}
            isAdmin={canEdit.variation}
            variationOrders={voData?.projectVariationOrders ?? []}
            onCreateVO={(v) => void createVariationOrder({ variables: v })}
            onUpdateVO={(v) => void updateVariationOrder({ variables: v })}
            onDeleteVO={(voId) => void deleteVariationOrder({ variables: { id: voId } })}
            onSubmitVO={(voId) => void submitVariationOrder({ variables: { id: voId } })}
            onApproveVO={(voId, approvedValue) => void approveVariationOrder({ variables: { id: voId, approvedValue } })}
            onRejectVO={(voId, reason) => void rejectVariationOrder({ variables: { id: voId, reason } })}
            onSetVOStatus={(voId, status) => void setVOStatus({ variables: { id: voId, status } })}
            onCreateCostItem={(v) => void createVOCostItem({ variables: v })}
            onUpdateCostItem={(v) => void updateVOCostItem({ variables: v })}
            onDeleteCostItem={(itemId) => void deleteVOCostItem({ variables: { id: itemId } })}
            onCreateCorrespondence={(v) => void createVOCorrespondence({ variables: v })}
            onDeleteCorrespondence={(corrId) => void deleteVOCorrespondence({ variables: { id: corrId } })}
            onAddDrawing={(v) => void addVODrawing({ variables: v })}
            onRemoveDrawing={(drawId) => void removeVODrawing({ variables: { id: drawId } })}
          />
        )}
        {tab === 'meetings' && (
          <MeetingsTab
            projectId={id!}
            th={theme as unknown as Record<string, string>}
            isAdmin={canEdit.meetings}
            meetings={(momData?.projectMeetings ?? []) as MeetingType[]}
            onCreateMeeting={(v) => void createMeeting({ variables: v })}
            onUpdateMeeting={(v) => void updateMeeting({ variables: v })}
            onDeleteMeeting={(mid) => void deleteMeeting({ variables: { id: mid } })}
            onIssueMeeting={(mid) => void issueMeeting({ variables: { id: mid } })}
            onCloseMeeting={(mid) => void closeMeeting({ variables: { id: mid } })}
            onCreateAction={(v) => void createMeetingAction({ variables: v })}
            onUpdateAction={(v) => void updateMeetingAction({ variables: v })}
            onDeleteAction={(aid) => void deleteMeetingAction({ variables: { id: aid } })}
          />
        )}

        {tab === 'attachments' && id && (
          <AttachmentsTab projectId={id} theme={theme} isAdmin={canEdit.attachments} userTeamRole={myTeamEntry?.member_type ?? myTeamEntry?.role ?? null} />
        )}

        {tab === 'history' && (() => {
          const EVENT_LABEL: Record<string, string> = {
            status_change: 'Status', field_update: 'Edit',
            stage_create: 'Stage', stage_update: 'Stage',
            team_add: 'Team', team_remove: 'Team',
            rfq_phase_status: 'Phase', rfq_phase_notes: 'Notes',
            rfq_phase_file: 'File', rfq_phase_file_delete: 'File',
          }
          const EVENT_COLOR: Record<string, string> = {
            status_change: theme.accent, field_update: '#8b5cf6',
            stage_create: '#0ea5e9', stage_update: '#0ea5e9',
            team_add: '#10b981', team_remove: '#ef4444',
            rfq_phase_status: '#f59e0b', rfq_phase_notes: '#8b5cf6',
            rfq_phase_file: '#10b981', rfq_phase_file_delete: '#ef4444',
          }
          const log = activityLog.length > 0 ? activityLog : statusHistory.map(h => ({
            eventType: 'status_change',
            actorName: h.changed_by_name ?? 'System',
            summary: h.from_status
              ? `Status changed: ${String(h.from_status).replace(/_/g, ' ')} → ${String(h.to_status ?? '').replace(/_/g, ' ')}` + (h.reason ? ` ("${String(h.reason)}")` : '')
              : `Project created with status: ${String(h.to_status ?? '').replace(/_/g, ' ')}`,
            createdAt: h.created_at,
          }))
          return (
            <div style={{ maxWidth: '700px' }}>
              {log.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 0', gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>No activity yet</div>
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>Project events will appear here as work progresses.</div>
                </div>
              )}
              {log.length > 0 && (
                <div style={{ position: 'relative', paddingLeft: '24px' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '12px', bottom: '12px', width: '2px', background: `${theme.border}`, borderRadius: '1px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {log.map((entry, i) => {
                      const e = entry as Record<string, unknown>
                      const et = String(e['eventType'] ?? 'status_change')
                      const dotColor = EVENT_COLOR[et] ?? theme.accent
                      const evLabel = EVENT_LABEL[et] ?? 'Event'
                      const ts = e['createdAt']
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: i < log.length - 1 ? '12px' : '0' }}>
                          <div style={{ position: 'absolute', left: '-20px', top: '14px', width: '10px', height: '10px', borderRadius: '50%', background: dotColor, border: `2px solid ${theme.bgCanvas}`, zIndex: 1 }} />
                          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                                <span style={{ flexShrink: 0, marginTop: '1px', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: dotColor + '18', color: dotColor }}>{evLabel}</span>
                                <div>
                                  <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>
                                    {String(e['summary'] ?? '')}
                                  </div>
                                  {!!e['actorName'] && String(e['actorName']) !== 'System' && (
                                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                                      by {String(e['actorName'])}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {!!ts && (
                                <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '3px' }}>
                                  {new Date(String(ts)).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        </>}
      </div>

      <StageEditDrawer
        projectId={id!}
        stage={editStage}
        open={stageDrawer}
        onClose={() => setStageDrawer(false)}
        onSaved={() => refetch()}
        teamMembers={liveTeam.map(m => ({ id: m.id, employeeId: m.employee_id, name: m.employee_name, role: m.role }))}
        isAdmin={isAdmin}
      />
      {showMRForm && (
        <ManufacturingRequestForm projectId={id!} onClose={() => setShowMRForm(false)} onCreated={() => refetchMRs()} />
      )}
    </div>
  )
}

// ── RFQ Scope-of-Work Tab ──────────────────────────────────────────────────

interface RFQLine {
  id?: string
  sequence: number
  phaseLabel: string
  description: string
  quantity: string
  unit: string
  estimatedUnitCost: string
  bidUnitPrice: string
  notes: string
}

function blankLine(seq: number): RFQLine {
  return { sequence: seq, phaseLabel: '', description: '', quantity: '', unit: '', estimatedUnitCost: '', bidUnitPrice: '', notes: '' }
}

function RFQLinesTab({
  projectId: _projectId,
  lines: serverLines,
  isEditable,
  saving,
  onSave,
  theme,
  rfqEstimatedCost,
  rfqOutcome,
  rfqOutcomeReason,
}: {
  projectId: string
  lines: Array<Record<string, unknown>>
  isEditable: boolean
  saving: boolean
  onSave: (lines: Array<{ sequence: number; phaseLabel?: string; description: string; quantity?: number; unit?: string; estimatedUnitCost?: number; bidUnitPrice?: number; notes?: string }>) => void
  theme: ReturnType<typeof useTheme>['theme']
  rfqEstimatedCost?: number | null
  rfqOutcome?: string | null
  rfqOutcomeReason?: string | null
}) {
  const [rows, setRows] = React.useState<RFQLine[]>([blankLine(0)])
  const [dirty, setDirty] = React.useState(false)
  const hasLoadedRef = React.useRef(false)

  React.useEffect(() => {
    if (serverLines.length > 0) {
      hasLoadedRef.current = true
      setRows(serverLines.map((l) => ({
        id: String(l['id'] ?? ''),
        sequence: parseInt(String(l['sequence'] ?? 0)),
        phaseLabel: String(l['phaseLabel'] ?? ''),
        description: String(l['description'] ?? ''),
        quantity: l['quantity'] != null ? String(l['quantity']) : '',
        unit: String(l['unit'] ?? ''),
        estimatedUnitCost: l['estimatedUnitCost'] != null ? String(l['estimatedUnitCost']) : '',
        bidUnitPrice: l['bidUnitPrice'] != null ? String(l['bidUnitPrice']) : '',
        notes: String(l['notes'] ?? ''),
      })))
      setDirty(false)
    } else if (!hasLoadedRef.current) {
      setRows([blankLine(0)])
      setDirty(false)
    }
    // if hasLoadedRef.current is true and serverLines is transiently empty (Apollo refetch in-flight),
    // leave rows unchanged to avoid flickering back to blank
  }, [serverLines])

  const update = (i: number, key: keyof RFQLine, val: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
    setDirty(true)
  }

  const addRow = () => { setRows(prev => [...prev, blankLine(prev.length)]); setDirty(true) }
  const removeRow = (i: number) => { setRows(prev => prev.filter((_, idx) => idx !== i)); setDirty(true) }

  const handleSave = () => {
    const payload = rows.filter(r => r.description.trim()).map((r, idx) => ({
      sequence: idx,
      phaseLabel: r.phaseLabel.trim() || undefined,
      description: r.description.trim(),
      quantity: r.quantity ? parseFloat(r.quantity) : undefined,
      unit: r.unit || undefined,
      estimatedUnitCost: r.estimatedUnitCost ? parseFloat(r.estimatedUnitCost) : undefined,
      bidUnitPrice: r.bidUnitPrice ? parseFloat(r.bidUnitPrice) : undefined,
      notes: r.notes || undefined,
    }))
    onSave(payload)
    setDirty(false)
  }

  const totalEstimated = rows.reduce((s, r) => {
    const qty = parseFloat(r.quantity || '1')
    const cost = parseFloat(r.estimatedUnitCost || '0')
    return s + (qty * cost)
  }, 0)
  const totalBid = rows.reduce((s, r) => {
    const qty = parseFloat(r.quantity || '1')
    const price = parseFloat(r.bidUnitPrice || '0')
    return s + (qty * price)
  }, 0)

  const outcomeColors: Record<string, string> = { won: '#16a34a', lost: '#ef4444', withdrawn: '#f59e0b' }
  const cellStyle: React.CSSProperties = { padding: '4px 6px', fontSize: '12px', border: `1px solid ${theme.border}`, borderRadius: '5px', background: theme.bgCanvas, color: theme.textPrimary, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Outcome banner */}
      {rfqOutcome && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', background: `${outcomeColors[rfqOutcome] ?? theme.border}22`, border: `1px solid ${outcomeColors[rfqOutcome] ?? theme.border}`, fontSize: '13px', color: outcomeColors[rfqOutcome] ?? theme.textMuted, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>RFQ Outcome: {rfqOutcome.charAt(0).toUpperCase() + rfqOutcome.slice(1)}</span>
          {rfqOutcomeReason && <span>— {rfqOutcomeReason}</span>}
        </div>
      )}

      {/* Summary row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          ...(rfqEstimatedCost != null ? [{ label: 'Internal Estimate', sub: 'from project form', value: rfqEstimatedCost, color: theme.textMuted }] : []),
          { label: 'Scope Cost', sub: 'qty × est. cost/unit', value: totalEstimated, color: '#f59e0b' },
          { label: 'Bid Total', sub: 'qty × bid price/unit', value: totalBid, color: theme.accent },
        ].map(({ label, sub, value, color }) => (
          <div key={label} style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px', minWidth: '160px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
              {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '1px' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Lines table */}
      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                {['#', 'Phase / Group', 'Description *', 'Qty', 'Unit', 'Est. Cost/Unit', 'Bid Price/Unit', 'Notes', ...(isEditable ? [''] : [])].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const prevPhase = i > 0 ? rows[i - 1]!.phaseLabel.trim() : null
                const thisPhase = row.phaseLabel.trim()
                const isNewPhaseGroup = !isEditable && thisPhase && thisPhase !== prevPhase
                return (
                  <React.Fragment key={i}>
                    {isNewPhaseGroup && (
                      <tr style={{ background: `${theme.accent}18` }}>
                        <td colSpan={8} style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 700, color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {thisPhase}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: `1px solid ${theme.border}22` }}>
                      <td style={{ padding: '6px 10px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums', width: '32px' }}>{i + 1}</td>
                      <td style={{ padding: '4px 6px', width: '120px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.phaseLabel} onChange={e => update(i, 'phaseLabel', e.target.value)} placeholder="e.g. Light Gauge" />
                          : <span style={{ fontSize: '11px', color: theme.accent, fontWeight: 500 }}>{row.phaseLabel || ''}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', minWidth: '200px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.description} onChange={e => update(i, 'description', e.target.value)} placeholder="Describe item or deliverable…" />
                          : <span style={{ color: theme.textPrimary }}>{row.description}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '80px' }}>
                        {isEditable
                          ? <input style={cellStyle} type="number" min="0" step="any" value={row.quantity} onChange={e => update(i, 'quantity', e.target.value)} placeholder="0" />
                          : <span style={{ color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{row.quantity || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '80px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.unit} onChange={e => update(i, 'unit', e.target.value)} placeholder="pcs" />
                          : <span style={{ color: theme.textMuted }}>{row.unit || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '120px' }}>
                        {isEditable
                          ? <input style={cellStyle} type="number" min="0" step="any" value={row.estimatedUnitCost} onChange={e => update(i, 'estimatedUnitCost', e.target.value)} placeholder="0.00" />
                          : <span style={{ color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>{row.estimatedUnitCost || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', width: '120px' }}>
                        {isEditable
                          ? <input style={cellStyle} type="number" min="0" step="any" value={row.bidUnitPrice} onChange={e => update(i, 'bidUnitPrice', e.target.value)} placeholder="0.00" />
                          : <span style={{ color: theme.textPrimary, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{row.bidUnitPrice || '—'}</span>}
                      </td>
                      <td style={{ padding: '4px 6px', minWidth: '140px' }}>
                        {isEditable
                          ? <input style={cellStyle} value={row.notes} onChange={e => update(i, 'notes', e.target.value)} placeholder="Optional notes…" />
                          : <span style={{ color: theme.textMuted }}>{row.notes || '—'}</span>}
                      </td>
                      {isEditable && (
                        <td style={{ padding: '4px 8px', width: '32px' }}>
                          <button
                            onClick={() => removeRow(i)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 4px' }}
                            title="Remove line"
                          >×</button>
                        </td>
                      )}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isEditable && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={addRow}
            style={{ padding: '6px 14px', borderRadius: '7px', border: `1px dashed ${theme.border}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
          >
            + Add Line
          </button>
          <button
            disabled={!dirty || saving}
            onClick={handleSave}
            style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: dirty ? theme.accent : theme.border, color: '#fff', cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 500 }}
          >
            {saving ? 'Saving…' : 'Save Scope'}
          </button>
        </div>
      )}

      {/* Phase breakdown — only shown when at least one line has a phase label */}
      {(() => {
        const phaseMap = new Map<string, { scopeCost: number; bidTotal: number; count: number }>()
        for (const r of rows) {
          const label = r.phaseLabel.trim() || '(Unassigned)'
          const qty = parseFloat(r.quantity || '0') || 0
          const cost = parseFloat(r.estimatedUnitCost || '0') || 0
          const bid = parseFloat(r.bidUnitPrice || '0') || 0
          const existing = phaseMap.get(label) ?? { scopeCost: 0, bidTotal: 0, count: 0 }
          phaseMap.set(label, { scopeCost: existing.scopeCost + qty * cost, bidTotal: existing.bidTotal + qty * bid, count: existing.count + 1 })
        }
        const hasPhases = [...phaseMap.keys()].some(k => k !== '(Unassigned)')
        if (!hasPhases) return null
        const phases = [...phaseMap.entries()]
        return (
          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>
              Phase Breakdown {isEditable ? '' : '— stages auto-created on approval'}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Phase / Group', 'Lines', 'Scope Cost', 'Bid Total'].map(h => (
                    <th key={h} style={{ padding: '7px 14px', textAlign: h === 'Phase / Group' ? 'left' : 'right', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phases.map(([label, { scopeCost, bidTotal, count }]) => (
                  <tr key={label} style={{ borderBottom: `1px solid ${theme.border}22` }}>
                    <td style={{ padding: '7px 14px', fontWeight: label === '(Unassigned)' ? 400 : 600, color: label === '(Unassigned)' ? theme.textMuted : theme.textPrimary }}>{label}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: theme.textMuted }}>{count}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#f59e0b' }}>{scopeCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: theme.accent, fontWeight: 600 }}>{bidTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}
    </div>
  )
}

// ── RFQ Phases Tab ───────────────────────────────────────────────────────────

interface RFQPhaseFile {
  id: string; fileId: string; filename: string; mimeType: string
  sizeBytes: number; title: string | null; description: string | null; createdAt: string; downloadUrl: string | null
}
interface RFQPhaseData {
  id: string; projectId: string; phaseType: string; serviceType: string
  status: string; notes: string | null; sequence: number; fileCount: number
  files: RFQPhaseFile[]
}

const PHASE_META: Record<string, { label: string; icon: string; description: string }> = {
  engineering: { label: 'Engineering', icon: '⚙', description: 'Technical scope, drawings, specs & site surveys' },
  pricing:     { label: 'Pricing',     icon: '💰', description: 'Cost estimation, supplier quotes & margin analysis' },
  executing:   { label: 'Executing',   icon: '📋', description: 'Final commercial offer, work schedule & contract terms' },
}

function serviceTypeBadge(serviceType: string, theme: ReturnType<typeof useTheme>['theme']) {
  const cfg = serviceType === 'commercial'
    ? { label: 'Commercial', bg: '#7c3aed18', color: '#7c3aed' }
    : serviceType === 'both'
    ? { label: 'Technical + Commercial', bg: '#05966918', color: '#059669' }
    : { label: 'Technical', bg: `${theme.accent}18`, color: theme.accent }
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function phaseStatusBadge(status: string) {
  const cfg = status === 'complete'
    ? { label: 'Complete',    bg: '#05966918', color: '#059669' }
    : status === 'in_progress'
    ? { label: 'In Progress', bg: '#f59e0b18', color: '#f59e0b' }
    : { label: 'Pending',     bg: '#6b728018', color: '#6b7280' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: cfg.bg, color: cfg.color }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  )
}

function fileIcon(mimeType: string) {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'application/vnd.ms-excel') return { icon: '📊', color: '#16a34a' }
  if (mimeType === 'application/pdf') return { icon: '📄', color: '#dc2626' }
  if (mimeType.includes('word') || mimeType.includes('document')) return { icon: '📝', color: '#2563eb' }
  if (mimeType.startsWith('image/')) return { icon: '🖼', color: '#7c3aed' }
  return { icon: '📎', color: '#6b7280' }
}

function PlaceholderTab({ icon, title, description, badge }: { icon: string; title: string; description: string; badge?: string }) {
  const { theme } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center', gap: '12px' }}>
      <div style={{ fontSize: '48px', lineHeight: 1 }}>{icon}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>{title}</h2>
        {badge && <span style={{ padding: '2px 10px', borderRadius: '999px', background: theme.accentBg, color: theme.accent, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{badge}</span>}
      </div>
      <p style={{ fontSize: '14px', color: theme.textMuted, maxWidth: '480px', lineHeight: 1.6, margin: 0 }}>{description}</p>
    </div>
  )
}

function RFQPhasesTab({ projectId, isReadOnly, theme, serviceSection }: { projectId: string; isReadOnly: boolean; theme: ReturnType<typeof useTheme>['theme']; serviceSection?: 'technical' | 'commercial' }) {
  const { data, loading, refetch } = useQuery(RFQ_PHASES_QUERY, { variables: { projectId }, fetchPolicy: 'cache-and-network' })
  const [updateRFQPhase] = useMutation(UPDATE_RFQ_PHASE)
  const addToast = useToastStore((s) => s.addToast)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const allPhases: RFQPhaseData[] = data?.rfqPhases ?? []
  const phases = serviceSection
    ? allPhases.filter(ph => ph.serviceType === serviceSection || ph.serviceType === 'both')
    : allPhases
  const [selectedType, setSelectedType] = React.useState<string>('engineering')
  const [noteDraft, setNoteDraft]       = React.useState<Record<string, string>>({})
  const [savingNote, setSavingNote]     = React.useState(false)

  // Upload modal state
  const [pendingFile, setPendingFile]   = React.useState<{ file: File; phase: RFQPhaseData } | null>(null)
  const [uploadTitle, setUploadTitle]   = React.useState('')
  const [uploadDesc,  setUploadDesc]    = React.useState('')
  const [uploading,   setUploading]     = React.useState(false)

  // Preview lightbox state
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null)

  const selected = phases.find(p => p.phaseType === selectedType) ?? null
  const doneCount = phases.filter(p => p.status === 'complete').length

  // Keyboard nav for preview lightbox
  React.useEffect(() => {
    if (previewIndex === null) return
    const files = selected?.files ?? []
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     setPreviewIndex(null)
      if (e.key === 'ArrowRight') setPreviewIndex(i => i !== null ? Math.min(i + 1, files.length - 1) : null)
      if (e.key === 'ArrowLeft')  setPreviewIndex(i => i !== null ? Math.max(i - 1, 0) : null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewIndex, selected])

  const handleStatusChange = async (phase: RFQPhaseData, status: string) => {
    try {
      await updateRFQPhase({ variables: { id: phase.id, status } })
      void refetch()
    } catch { addToast({ type: 'error', message: 'Failed to update status' }) }
  }

  const handleSaveNote = async (phase: RFQPhaseData) => {
    setSavingNote(true)
    try {
      await updateRFQPhase({ variables: { id: phase.id, notes: noteDraft[phase.id] ?? '' } })
      void refetch()
      addToast({ type: 'success', message: 'Notes saved' })
    } catch { addToast({ type: 'error', message: 'Failed to save notes' }) }
    finally { setSavingNote(false) }
  }

  const openUploadModal = (phase: RFQPhaseData, file: File) => {
    setPendingFile({ file, phase })
    setUploadTitle(file.name.replace(/\.[^.]+$/, ''))
    setUploadDesc('')
  }

  const confirmUpload = async () => {
    if (!pendingFile) return
    const { file, phase } = pendingFile
    setUploading(true)
    try {
      const { data: urlData } = await api.post<{ uploadUrl: string; fileId: string }>('/files/upload-url', {
        filename: file.name, mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size, category: 'attachment',
      })
      const buf = await file.arrayBuffer()
      await api.post(`/files/${urlData.fileId}/content`, buf, { headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      await api.post('/files/attach', {
        fileId: urlData.fileId, entityType: 'rfq_phase', entityId: phase.id,
        label: uploadTitle.trim() || file.name,
        description: uploadDesc.trim() || null,
      })
      void refetch()
      setPendingFile(null)
      addToast({ type: 'success', message: `${uploadTitle || file.name} uploaded` })
    } catch { addToast({ type: 'error', message: 'Upload failed' }) }
    finally { setUploading(false) }
  }

  const handleDelete = async (attachmentId: string) => {
    try {
      await api.delete(`/files/attachments/${attachmentId}`)
      void refetch()
    } catch { addToast({ type: 'error', message: 'Failed to delete file' }) }
  }

  const handleDownload = (file: RFQPhaseFile) => {
    const url = file.downloadUrl
    if (!url) { addToast({ type: 'error', message: 'Download URL unavailable' }); return }
    const a = document.createElement('a'); a.href = url; a.download = file.filename; a.click()
  }

  const onDrop = (phase: RFQPhaseData) => (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) openUploadModal(phase, file)
  }

  if (loading && phases.length === 0) return <div style={{ color: theme.textMuted, fontSize: '13px', padding: '24px 0' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>Bid Preparation Progress</span>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{doneCount} / {phases.length} phases complete</span>
        </div>
        <div style={{ height: '6px', borderRadius: '999px', background: theme.border, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: theme.accent, width: `${(doneCount / Math.max(phases.length, 1)) * 100}%`, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Phase selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {phases.map(phase => {
          const meta = PHASE_META[phase.phaseType] ?? { label: phase.phaseType, icon: '📌', description: '' }
          const active = phase.phaseType === selectedType
          return (
            <button
              key={phase.phaseType}
              onClick={() => { setSelectedType(phase.phaseType); setNoteDraft(d => ({ ...d, [phase.id]: phase.notes ?? '' })) }}
              style={{
                display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px',
                borderRadius: '10px', border: `2px solid ${active ? theme.accent : theme.border}`,
                background: active ? theme.accentBg : theme.bgSurface,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '18px' }}>{meta.icon}</span>
                {phaseStatusBadge(phase.status)}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: active ? theme.accent : theme.textPrimary }}>{meta.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const }}>
                {serviceTypeBadge(phase.serviceType, theme)}
                <span style={{ fontSize: '11px', color: theme.textMuted }}>{phase.fileCount} file{phase.fileCount !== 1 ? 's' : ''}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected phase detail */}
      {selected && (() => {
        const meta = PHASE_META[selected.phaseType] ?? { label: selected.phaseType, icon: '📌', description: '' }
        const noteVal = noteDraft[selected.id] ?? selected.notes ?? ''
        const noteDirty = noteVal !== (selected.notes ?? '')
        return (
          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            {/* Phase header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: theme.bgCanvas, borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '20px' }}>{meta.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>{meta.label} Phase</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{meta.description}</div>
              </div>
              {serviceTypeBadge(selected.serviceType, theme)}
              {/* Status selector */}
              {!isReadOnly && (
                <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: '7px', overflow: 'hidden' }}>
                  {(['pending', 'in_progress', 'complete'] as const).map(s => {
                    const labels: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', complete: 'Complete' }
                    const active = selected.status === s
                    return (
                      <button key={s} onClick={() => void handleStatusChange(selected, s)}
                        style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                          background: active ? theme.accent : theme.bgCanvas, color: active ? '#fff' : theme.textMuted }}>
                        {labels[s]}
                      </button>
                    )
                  })}
                </div>
              )}
              {isReadOnly && phaseStatusBadge(selected.status)}
            </div>

            {/* Notes */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '6px' }}>Notes</div>
              {isReadOnly ? (
                <div style={{ fontSize: '13px', color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>{selected.notes || <span style={{ color: theme.textMuted }}>—</span>}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <textarea
                    value={noteVal}
                    onChange={e => setNoteDraft(d => ({ ...d, [selected.id]: e.target.value }))}
                    placeholder="Add notes for this phase…"
                    rows={3}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' as const }}
                  />
                  {noteDirty && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="primary" size="sm" loading={savingNote} onClick={() => void handleSaveNote(selected)}>Save Notes</Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Files */}
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  Files ({selected.fileCount})
                </div>
                {!isReadOnly && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      style={{ display: 'none' }}
                      accept=".xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.csv"
                      onChange={e => { const f = e.target.files?.[0]; if (f && selected) openUploadModal(selected, f); e.target.value = '' }}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      loading={uploading}
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      + Upload
                    </Button>
                  </>
                )}
              </div>

              {selected.files.length === 0 ? (
                !isReadOnly ? (
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={onDrop(selected)}
                    style={{ border: `2px dashed ${theme.border}`, borderRadius: '8px', padding: '32px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}
                  >
                    Drop files here or click Upload
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>No files yet.</div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selected.files.map((file, idx) => {
                    const { icon, color } = fileIcon(file.mimeType)
                    return (
                      <div
                        key={file.id}
                        onClick={() => setPreviewIndex(idx)}
                        style={{ display: 'flex', alignItems: 'stretch', borderRadius: '10px', border: `1px solid ${theme.border}`, background: theme.bgSurface, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}18` }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.boxShadow = 'none' }}
                      >
                        {/* Left accent stripe */}
                        <div style={{ width: '4px', background: color, flexShrink: 0 }} />

                        {/* Body */}
                        <div style={{ flex: 1, padding: '12px 14px', minWidth: 0 }}>
                          {/* Title row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: file.description ? '5px' : '4px' }}>
                            <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {file.title || file.filename}
                            </span>
                            <span style={{ fontSize: '11px', color: theme.textMuted, flexShrink: 0 }}>{formatBytes(file.sizeBytes)}</span>
                          </div>
                          {/* Description */}
                          {file.description && (
                            <div style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.5, marginBottom: '6px', paddingLeft: '24px' }}>
                              {file.description}
                            </div>
                          )}
                          {/* Filename + actions */}
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '24px' }}
                          >
                            <span style={{ flex: 1, fontSize: '10px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, opacity: 0.7 }}>{file.filename}</span>
                            <button
                              onClick={() => handleDownload(file)} title="Download"
                              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '5px', border: `1px solid ${theme.border}`, background: theme.bgCanvas, color: theme.textMuted, cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textMuted }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Download
                            </button>
                            {!isReadOnly && (
                              <button
                                onClick={() => void handleDelete(file.id)} title="Remove"
                                style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', borderRadius: '5px', border: `1px solid transparent`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', flexShrink: 0 }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#ef444415'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444430' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.textMuted; e.currentTarget.style.borderColor = 'transparent' }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Preview lightbox */}
      {previewIndex !== null && selected && (() => {
        const files = selected.files
        const file  = files[previewIndex]
        if (!file) return null
        const { icon, color } = fileIcon(file.mimeType)
        const isImage   = file.mimeType.startsWith('image/')
        const isPdf     = file.mimeType === 'application/pdf'
        const canPreview = (isImage || isPdf) && !!file.downloadUrl
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setPreviewIndex(null)}
          >
            {/* Left nav */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
              <button
                disabled={previewIndex === 0}
                onClick={e => { e.stopPropagation(); setPreviewIndex(i => i !== null ? Math.max(i - 1, 0) : 0) }}
                style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: previewIndex === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '18px', cursor: previewIndex === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >‹</button>
            </div>

            {/* Main panel */}
            <div
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: '24px 0', background: theme.bgCanvas, borderRadius: '12px', overflow: 'hidden', maxWidth: '900px', marginLeft: 'auto', marginRight: 'auto' }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
                <span style={{ fontSize: '22px' }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.title || file.filename}</div>
                  {file.description && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{file.description}</div>}
                </div>
                <span style={{ fontSize: '12px', color: theme.textMuted, flexShrink: 0 }}>{previewIndex + 1} / {files.length}</span>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleDownload(file)}
                    title="Download"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </button>
                  {!isReadOnly && (
                    <button
                      onClick={() => { void handleDelete(file.id); setPreviewIndex(null) }}
                      title="Delete"
                      style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #ef444440', background: '#ef444410', color: '#ef4444', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  )}
                  <button
                    onClick={() => setPreviewIndex(null)}
                    style={{ width: '32px', height: '32px', borderRadius: '7px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Preview body */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.bgSurface, minHeight: 0 }}>
                {canPreview && isImage && (
                  <img src={file.downloadUrl!} alt={file.title || file.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '16px' }} />
                )}
                {canPreview && isPdf && (
                  <iframe src={file.downloadUrl!} title={file.title || file.filename} style={{ width: '100%', height: '100%', border: 'none' }} />
                )}
                {!canPreview && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px 32px', textAlign: 'center' }}>
                    <span style={{ fontSize: '64px', color }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>{file.title || file.filename}</div>
                      {file.description && <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '6px', maxWidth: '360px' }}>{file.description}</div>}
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>{formatBytes(file.sizeBytes)} · {file.filename}</div>
                    </div>
                    <button
                      onClick={() => handleDownload(file)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.accent, color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download to view
                    </button>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Preview not available for this file type</div>
                  </div>
                )}
              </div>

              {/* Footer — file meta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 18px', borderTop: `1px solid ${theme.border}`, flexShrink: 0, background: theme.bgCanvas }}>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>{file.filename}</span>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>·</span>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>{formatBytes(file.sizeBytes)}</span>
                <div style={{ marginLeft: 'auto', fontSize: '11px', color: theme.textMuted }}>← → to navigate · Esc to close</div>
              </div>
            </div>

            {/* Right nav */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
              <button
                disabled={previewIndex === files.length - 1}
                onClick={e => { e.stopPropagation(); setPreviewIndex(i => i !== null ? Math.min(i + 1, files.length - 1) : 0) }}
                style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: previewIndex === files.length - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '18px', cursor: previewIndex === files.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >›</button>
            </div>
          </div>
        )
      })()}

      {/* Upload modal — title + description before confirming upload */}
      <Modal open={!!pendingFile} onClose={() => setPendingFile(null)} title="Add Document" size="sm" closeOnBackdrop={false}>
        {pendingFile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* File preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: theme.bgSurface, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
              <span style={{ fontSize: '22px' }}>{fileIcon(pendingFile.file.type || '').icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{formatBytes(pendingFile.file.size)}</div>
              </div>
            </div>
            {/* Title */}
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Title *</label>
              <input
                autoFocus
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. Structural Drawings Rev A"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' as const }}
              />
            </div>
            {/* Description */}
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Description <span style={{ fontWeight: 400 }}>(optional)</span></label>
              <textarea
                value={uploadDesc}
                onChange={e => setUploadDesc(e.target.value)}
                placeholder="Briefly describe this document…"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${theme.borderInput}`, background: theme.bgCanvas, color: theme.textPrimary, fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '2px' }}>
              <Button variant="ghost" onClick={() => setPendingFile(null)}>Cancel</Button>
              <Button variant="primary" loading={uploading} disabled={!uploadTitle.trim()} onClick={() => void confirmUpload()}>Upload</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Attachments Tab ───────────────────────────────────────────────────────────

interface FileAttachment {
  id: string
  file_id: string
  original_filename: string
  mime_type: string
  size_bytes: number
  label: string
  created_at: string
  download_url: string | null
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function FileTypeIcon({ mime }: { mime: string }) {
  const isExcel = mime.includes('spreadsheet') || mime.includes('excel')
  const isPdf   = mime === 'application/pdf'
  const isWord  = mime.includes('word')
  const isImage = mime.startsWith('image/')
  const color   = isExcel ? '#16a34a' : isPdf ? '#ef4444' : isWord ? '#2563eb' : isImage ? '#8b5cf6' : '#6b7280'
  return (
    <span style={{ fontSize: '18px', lineHeight: 1, color }}>
      {isExcel ? '📊' : isPdf ? '📄' : isWord ? '📝' : isImage ? '🖼' : '📎'}
    </span>
  )
}

const DOC_CATEGORIES = ['General', 'Technical', 'Commercial', 'Financial', 'Legal', 'HSE'] as const
type DocCategory = typeof DOC_CATEGORIES[number]

const CAT_COLOR: Record<DocCategory, { bg: string; color: string }> = {
  General:    { bg: '#6b728018', color: '#6b7280' },
  Technical:  { bg: '#0ea5e918', color: '#0ea5e9' },
  Commercial: { bg: '#7c3aed18', color: '#7c3aed' },
  Financial:  { bg: '#22c55e18', color: '#22c55e' },
  Legal:      { bg: '#f59e0b18', color: '#f59e0b' },
  HSE:        { bg: '#ef444418', color: '#ef4444' },
}

function parseFileCategory(label: string): { category: DocCategory; name: string } {
  const m = label.match(/^\[(\w+)\]\s*(.*)$/)
  if (m && DOC_CATEGORIES.includes(m[1] as DocCategory)) {
    return { category: m[1] as DocCategory, name: m[2] || label }
  }
  return { category: 'General', name: label }
}

const ROLE_VISIBLE: Record<string, DocCategory[]> = {
  technical:  ['General', 'Technical', 'HSE'],
  commercial: ['General', 'Commercial', 'Financial', 'Legal'],
  pm:         ['General', 'Technical', 'Commercial', 'Financial', 'Legal', 'HSE'],
  planning:   ['General', 'Technical'],
  finance:    ['General', 'Commercial', 'Financial', 'Legal'],
}

// ── Client Documents Tab ─────────────────────────────────────────────────

const CD_CATEGORIES = [
  { key: 'rfq_tender',     label: 'RFQ / Tender'         },
  { key: 'drawings',       label: 'Technical Drawings'    },
  { key: 'boq_specs',      label: 'BOQ / Specifications'  },
  { key: 'correspondence', label: 'Correspondence'        },
  { key: 'contracts',      label: 'Contracts'             },
  { key: 'other',          label: 'General'               },
] as const

type CDCategory = typeof CD_CATEGORIES[number]['key']

const CD_COLORS: Record<CDCategory, { bg: string; text: string }> = {
  rfq_tender:     { bg: '#dbeafe', text: '#1d4ed8' },
  drawings:       { bg: '#dcfce7', text: '#15803d' },
  boq_specs:      { bg: '#fef9c3', text: '#a16207' },
  correspondence: { bg: '#fce7f3', text: '#be185d' },
  contracts:      { bg: '#ede9fe', text: '#6d28d9' },
  other:          { bg: '#f3f4f6', text: '#374151' },
}

interface ClientDoc {
  id: string; projectId: string; fileId: string | null
  category: string; title: string; documentNumber: string | null
  revision: string | null; description: string | null
  receivedFrom: string | null; transmissionDate: string | null
  status: string; parentDocumentId: string | null
  uploadedByName: string | null; downloadUrl: string | null
  filename: string | null; mimeType: string | null; sizeBytes: number | null
  revisions: ClientDoc[]; createdAt: string
}

function ClientDocumentsTab({ projectId, theme, isAdmin }: {
  projectId: string
  theme: ReturnType<typeof useTheme>['theme']
  isAdmin?: boolean
}) {
  const addToast = useToastStore((s) => s.addToast)
  const [filterCat, setFilterCat]   = useState<CDCategory | 'all'>('all')
  const [search, setSearch]         = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [reviseDoc, setReviseDoc]   = useState<ClientDoc | null>(null)
  const [editDoc, setEditDoc]       = useState<ClientDoc | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [form, setForm] = useState({
    title: '', documentNumber: '', revision: '', category: 'rfq_tender' as CDCategory,
    receivedFrom: '', transmissionDate: '', description: '', fileId: '', filename: '',
  })
  const [revForm, setRevForm] = useState({ revision: '', description: '', fileId: '', filename: '' })
  const [editForm, setEditForm] = useState({
    title: '', documentNumber: '', revision: '', category: 'rfq_tender' as CDCategory,
    receivedFrom: '', transmissionDate: '', description: '',
  })

  const { data, loading, refetch } = useQuery(CLIENT_DOCUMENTS_QUERY, {
    variables: { projectId },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  })

  const [uploadDoc]    = useMutation(UPLOAD_CLIENT_DOCUMENT)
  const [uploadRev]    = useMutation(UPLOAD_CLIENT_DOCUMENT_REVISION)
  const [updateDoc]    = useMutation(UPDATE_CLIENT_DOCUMENT)
  const [updateStatus] = useMutation(UPDATE_CLIENT_DOCUMENT_STATUS)
  const [deleteDoc]    = useMutation(DELETE_CLIENT_DOCUMENT)

  const docs: ClientDoc[] = (data?.clientDocuments ?? [])

  const filtered = docs.filter(d => {
    if (filterCat !== 'all' && d.category !== filterCat) return false
    if (search) {
      const q = search.toLowerCase()
      return d.title.toLowerCase().includes(q) || (d.documentNumber ?? '').toLowerCase().includes(q) || (d.receivedFrom ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const pickFile = async (onPicked: (fileId: string, filename: string) => void) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '*/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const { data: urlRes } = await api.post('/files/upload-url', {
          filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, category: 'attachment',
        })
        const { fileId } = urlRes as { fileId: string }
        const buf = await file.arrayBuffer()
        await api.post(`/files/${fileId}/content`, buf, { headers: { 'Content-Type': file.type || 'application/octet-stream' }, timeout: 120_000 })
        onPicked(fileId, file.name)
      } catch { addToast({ type: 'error', message: 'File upload failed' }) }
      finally { setUploading(false) }
    }
    input.click()
  }

  const handleSubmit = async () => {
    if (!form.title || !form.fileId) { addToast({ type: 'error', message: 'Title and file are required' }); return }
    try {
      await uploadDoc({ variables: { projectId, fileId: form.fileId, category: form.category, title: form.title, documentNumber: form.documentNumber || null, revision: form.revision || null, description: form.description || null, receivedFrom: form.receivedFrom || null, transmissionDate: form.transmissionDate || null }})
      addToast({ type: 'success', message: 'Document uploaded' })
      setShowModal(false)
      setForm({ title: '', documentNumber: '', revision: '', category: 'rfq_tender', receivedFrom: '', transmissionDate: '', description: '', fileId: '', filename: '' })
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleRevise = async () => {
    if (!revForm.revision || !revForm.fileId) { addToast({ type: 'error', message: 'Revision and file are required' }); return }
    try {
      await uploadRev({ variables: { parentDocumentId: reviseDoc!.id, fileId: revForm.fileId, revision: revForm.revision, description: revForm.description || null }})
      addToast({ type: 'success', message: 'Revision uploaded' })
      setReviseDoc(null)
      setRevForm({ revision: '', description: '', fileId: '', filename: '' })
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleArchive = async (doc: ClientDoc) => {
    try { await updateStatus({ variables: { id: doc.id, status: doc.status === 'archived' ? 'active' : 'archived' }}); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const openEdit = (doc: ClientDoc) => {
    setEditDoc(doc)
    setEditForm({
      title: doc.title, documentNumber: doc.documentNumber ?? '', revision: doc.revision ?? '',
      category: (doc.category as CDCategory) ?? 'rfq_tender', receivedFrom: doc.receivedFrom ?? '',
      transmissionDate: doc.transmissionDate ?? '', description: doc.description ?? '',
    })
  }

  const handleEditSave = async () => {
    if (!editDoc || !editForm.title) { addToast({ type: 'error', message: 'Title is required' }); return }
    try {
      await updateDoc({ variables: {
        id: editDoc.id, title: editForm.title, category: editForm.category,
        documentNumber: editForm.documentNumber || null, revision: editForm.revision || null,
        description: editForm.description || null, receivedFrom: editForm.receivedFrom || null,
        transmissionDate: editForm.transmissionDate || null,
      }})
      addToast({ type: 'success', message: 'Document updated' })
      setEditDoc(null)
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleDelete = async (doc: ClientDoc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return
    try { await deleteDoc({ variables: { id: doc.id }}); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const fileTypeIcon = (filename: string | null) => {
    const ext = (filename?.split('.').pop() ?? '').toUpperCase()
    const MAP: Record<string, { bg: string; fg: string }> = {
      PDF:  { bg: '#fee2e2', fg: '#b91c1c' },
      DOC:  { bg: '#dbeafe', fg: '#1d4ed8' }, DOCX: { bg: '#dbeafe', fg: '#1d4ed8' },
      XLS:  { bg: '#d1fae5', fg: '#065f46' }, XLSX: { bg: '#d1fae5', fg: '#065f46' },
      PPT:  { bg: '#ffedd5', fg: '#9a3412' }, PPTX: { bg: '#ffedd5', fg: '#9a3412' },
      PNG:  { bg: '#ede9fe', fg: '#5b21b6' }, JPG:  { bg: '#ede9fe', fg: '#5b21b6' },
      JPEG: { bg: '#ede9fe', fg: '#5b21b6' }, SVG:  { bg: '#ede9fe', fg: '#5b21b6' },
      DWG:  { bg: '#fef9c3', fg: '#a16207' }, DXF:  { bg: '#fef9c3', fg: '#a16207' },
      ZIP:  { bg: '#f3f4f6', fg: '#374151' }, RAR:  { bg: '#f3f4f6', fg: '#374151' },
    }
    const c = MAP[ext] ?? { bg: '#e0f2fe', fg: '#0369a1' }
    const label = ext.slice(0, 4) || 'FILE'
    return (
      <div style={{ width: 42, height: 42, borderRadius: 10, background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 1 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: c.fg }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={c.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke={c.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 7, fontWeight: 800, color: c.fg, letterSpacing: '0.03em', lineHeight: 1 }}>{label}</span>
      </div>
    )
  }

  const statusPill = (s: string) => {
    const cfg = s === 'active'
      ? { dot: '#22c55e', text: '#15803d', bg: '#f0fdf4', label: 'Active' }
      : s === 'superseded'
      ? { dot: '#f59e0b', text: '#a16207', bg: '#fffbeb', label: 'Superseded' }
      : { dot: '#9ca3af', text: '#6b7280', bg: '#f9fafb', label: 'Archived' }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: cfg.bg, fontSize: 11, fontWeight: 600, color: cfg.text }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
        {cfg.label}
      </span>
    )
  }

  const iconActionBtn = (tooltip: string, icon: React.ReactNode, onClick: () => void, variant: 'default' | 'danger' | 'accent' = 'default') => {
    const styles = {
      default: { color: theme.textMuted, hoverBg: theme.bgSurface },
      danger:  { color: '#dc2626',       hoverBg: '#fff1f2' },
      accent:  { color: theme.accent,    hoverBg: theme.accentBg },
    }[variant]
    return (
      <button
        title={tooltip}
        onClick={onClick}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6, border: `1px solid transparent`,
          background: 'transparent', color: styles.color,
          cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={e => {
          const t = e.currentTarget
          t.style.background = styles.hoverBg
          t.style.borderColor = variant === 'danger' ? '#fca5a5' : theme.border
        }}
        onMouseLeave={e => {
          const t = e.currentTarget
          t.style.background = 'transparent'
          t.style.borderColor = 'transparent'
        }}
      >
        {icon}
      </button>
    )
  }

  const inp = (value: string, onChange: (v: string) => void, placeholder?: string, type = 'text') => (
    <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
  )
  const lbl = (t: string, required = false) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {t}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
  )

  const COL = '52px minmax(0,1fr) 150px 72px 110px 180px'

  const renderDocRow = (doc: ClientDoc, isRevision = false) => {
    const catColor = CD_COLORS[doc.category as CDCategory] ?? CD_COLORS.other
    const catLabel = CD_CATEGORIES.find(c => c.key === doc.category)?.label ?? doc.category
    const isExpanded = expandedId === doc.id
    const hasRevisions = !isRevision && doc.revisions.length > 0
    const meta = [
      doc.receivedFrom && `From ${doc.receivedFrom}`,
      doc.transmissionDate && doc.transmissionDate,
      doc.uploadedByName && `by ${doc.uploadedByName}`,
      doc.documentNumber && `#${doc.documentNumber}`,
    ].filter(Boolean).join('  ·  ')

    return (
      <React.Fragment key={doc.id}>
        <div style={{
          display: 'grid', gridTemplateColumns: COL, alignItems: 'center',
          padding: isRevision ? '10px 20px 10px 68px' : '14px 20px',
          borderBottom: `1px solid ${theme.border}`,
          background: isRevision ? (theme.bgSurface + (theme.bgSurface.length === 7 ? '88' : '')) : 'transparent',
          opacity: doc.status === 'archived' ? 0.55 : 1,
          gap: 16,
        }}>
          {/* File icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasRevisions && (
              <button onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                style={{ all: 'unset', cursor: 'pointer', color: theme.textMuted, fontSize: 10, lineHeight: 1, marginRight: -8, position: 'relative', zIndex: 1, padding: '4px 2px' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {fileTypeIcon(doc.filename)}
          </div>

          {/* Title + meta */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {isRevision && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, flexShrink: 0 }}>
                  <path d="M9 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              <span style={{ fontWeight: 600, fontSize: 13, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {doc.title}
              </span>
            </div>
            {meta && (
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta}
              </div>
            )}
            {doc.description && (
              <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                {doc.description}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            {!isRevision && (
              <span style={{ padding: '4px 10px', borderRadius: 999, background: catColor.bg, color: catColor.text, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {catLabel}
              </span>
            )}
          </div>

          {/* Revision badge */}
          <div>
            {doc.revision
              ? <span style={{ padding: '3px 9px', borderRadius: 6, background: theme.accentBg, color: theme.accent, fontSize: 11, fontWeight: 700 }}>Rev {doc.revision}</span>
              : <span style={{ color: theme.textMuted, fontSize: 12 }}>—</span>
            }
          </div>

          {/* Status */}
          <div>{statusPill(doc.status)}</div>

          {/* Actions — icon-only compact row */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-end' }}>
            {/* Preview */}
            {doc.downloadUrl && iconActionBtn('Preview',
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>,
              () => { if (doc.downloadUrl) window.open(doc.downloadUrl, '_blank') }
            )}
            {/* Download */}
            {doc.downloadUrl && iconActionBtn('Download',
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
              () => { if (doc.downloadUrl) window.open(doc.downloadUrl, '_blank') }, 'accent'
            )}
            {/* Divider */}
            {(isAdmin || !isRevision) && doc.downloadUrl && (
              <span style={{ width: 1, height: 16, background: theme.border, margin: '0 4px', flexShrink: 0 }} />
            )}
            {/* Edit */}
            {isAdmin && !isRevision && iconActionBtn('Edit document',
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
              () => openEdit(doc)
            )}
            {/* + Revision */}
            {!isRevision && iconActionBtn('Upload new revision',
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="19" y1="7" x2="3" y2="23" stroke="none"/><path d="M20 12v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M17 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
              () => { setReviseDoc(doc); setRevForm({ revision: '', description: '', fileId: '', filename: '' }) }
            )}
            {/* Archive / Restore */}
            {isAdmin && iconActionBtn(doc.status === 'archived' ? 'Restore document' : 'Archive document',
              doc.status === 'archived'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="1 4 1 10 7 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.51 15a9 9 0 1 0 .49-3.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="21 8 21 21 3 21 3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="3" width="22" height="5" rx="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
              () => void handleArchive(doc)
            )}
            {/* Delete */}
            {isAdmin && iconActionBtn('Delete document',
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
              () => void handleDelete(doc), 'danger'
            )}
          </div>
        </div>
        {isExpanded && doc.revisions.map(rev => renderDocRow(rev, true))}
      </React.Fragment>
    )
  }

  const openUpload = () => {
    setShowModal(true)
    setForm({ title: '', documentNumber: '', revision: '', category: 'rfq_tender', receivedFrom: '', transmissionDate: '', description: '', fileId: '', filename: '' })
  }

  return (
    <div style={{ padding: '2px 0 20px' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Category pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {(['all', ...CD_CATEGORIES.map(c => c.key)] as (CDCategory | 'all')[]).map(k => {
            const label = k === 'all' ? 'All Documents' : CD_CATEGORIES.find(c => c.key === k)?.label ?? k
            const count = k === 'all' ? docs.length : docs.filter(d => d.category === k).length
            const active = filterCat === k
            return (
              <button key={k} onClick={() => setFilterCat(k)} style={{
                padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.1s',
                background: active ? theme.accent : 'transparent',
                color: active ? '#fff' : theme.textSecondary,
                border: active ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`,
              }}>
                {label}
                {count > 0 && <span style={{ padding: '0 5px', borderRadius: 999, background: active ? 'rgba(255,255,255,0.25)' : theme.bgSurface, color: active ? '#fff' : theme.textMuted, fontSize: 10, fontWeight: 700, lineHeight: '16px', minWidth: 16, textAlign: 'center' }}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…"
            style={{ padding: '7px 12px 7px 32px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, width: 210, outline: 'none' }} />
        </div>

        {/* Upload button */}
        <button onClick={openUpload} style={{ padding: '7px 18px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          Upload Document
        </button>
      </div>

      {/* ── Document list ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60, color: theme.textMuted, fontSize: 14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke={theme.border} strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke={theme.accent} strokeWidth="3" strokeLinecap="round"/>
          </svg>
          Loading documents…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ border: `2px dashed ${theme.border}`, borderRadius: 16, padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>
            {search || filterCat !== 'all' ? 'No matching documents' : 'No documents yet'}
          </div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
            {search || filterCat !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Upload RFQ packages, drawings, BOQ specs, and correspondence to keep the team aligned.'}
          </div>
          {!search && filterCat === 'all' && (
            <button onClick={openUpload} style={{ padding: '8px 20px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Upload First Document
            </button>
          )}
        </div>
      ) : (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 16, padding: '10px 20px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
            {['', 'Document', 'Category', 'Revision', 'Status', 'Actions'].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i === 5 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          {filtered.map(doc => renderDocRow(doc, false))}
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showModal && (
        <Modal open={true} size="lg" title="Upload Client Document" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>{lbl('Document Title', true)}{inp(form.title, v => setForm(f => ({...f, title: v})), 'e.g. RFQ Package — Civil Works')}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                {lbl('Category')}
                <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value as CDCategory}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13 }}>
                  {CD_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>{lbl('Revision')}{inp(form.revision, v => setForm(f => ({...f, revision: v})), 'e.g. A, 1, B2')}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>{lbl('Document Number')}{inp(form.documentNumber, v => setForm(f => ({...f, documentNumber: v})), 'e.g. RFQ-2024-001')}</div>
              <div>{lbl('Transmission Date')}{inp(form.transmissionDate, v => setForm(f => ({...f, transmissionDate: v})), '', 'date')}</div>
            </div>

            <div>{lbl('Received From')}{inp(form.receivedFrom, v => setForm(f => ({...f, receivedFrom: v})), 'Client name or organisation')}</div>

            <div>
              {lbl('Notes')}
              <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Optional context or notes about this document…"
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 72, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
            </div>

            {/* File picker zone */}
            <div>
              {lbl('File', true)}
              <div
                onClick={() => !uploading && pickFile((fid, fn) => setForm(f => ({...f, fileId: fid, filename: fn})))}
                style={{ border: `2px dashed ${form.fileId ? theme.accent : theme.border}`, borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: form.fileId ? theme.accentBg : 'transparent', transition: 'all 0.15s' }}>
                {uploading ? (
                  <div style={{ color: theme.textMuted, fontSize: 13 }}>Uploading…</div>
                ) : form.fileId ? (
                  <div>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>✓</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.accent }}>{form.filename}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Click to replace</div>
                  </div>
                ) : (
                  <div>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, margin: '0 auto 8px' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    <div style={{ fontSize: 13, fontWeight: 500, color: theme.textSecondary }}>Click to select a file</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>PDF, DWG, XLSX, DOCX, images — any format</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!form.title || !form.fileId || uploading} onClick={() => void handleSubmit()}
                style={{ padding: '8px 22px', borderRadius: 8, background: (form.title && form.fileId && !uploading) ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: (form.title && form.fileId && !uploading) ? 'pointer' : 'not-allowed' }}>
                Upload Document
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Revision Modal ── */}
      {reviseDoc && (
        <Modal open={true} title={`New Revision — ${reviseDoc.title}`} onClose={() => setReviseDoc(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: theme.bgSurface, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textSecondary }}>
              Current version: <strong style={{ color: theme.textPrimary }}>Rev {reviseDoc.revision ?? 'Initial'}</strong>
              {reviseDoc.status !== 'archived' && <span style={{ marginLeft: 8, color: '#a16207' }}>→ will be marked Superseded</span>}
            </div>

            <div>{lbl('New Revision Number', true)}{inp(revForm.revision, v => setRevForm(f => ({...f, revision: v})), 'e.g. B, 2, C1')}</div>

            <div>
              {lbl('Change Summary')}
              <textarea value={revForm.description} onChange={e => setRevForm(f => ({...f, description: e.target.value}))} placeholder="What changed in this revision?"
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 72, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
            </div>

            <div>
              {lbl('Revised File', true)}
              <div
                onClick={() => !uploading && pickFile((fid, fn) => setRevForm(f => ({...f, fileId: fid, filename: fn})))}
                style={{ border: `2px dashed ${revForm.fileId ? theme.accent : theme.border}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: revForm.fileId ? theme.accentBg : 'transparent' }}>
                {uploading ? (
                  <div style={{ color: theme.textMuted, fontSize: 13 }}>Uploading…</div>
                ) : revForm.fileId ? (
                  <div>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>✓</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.accent }}>{revForm.filename}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Click to replace</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: theme.textSecondary }}>Click to select revised file</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => setReviseDoc(null)} style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!revForm.revision || !revForm.fileId || uploading} onClick={() => void handleRevise()}
                style={{ padding: '8px 22px', borderRadius: 8, background: (revForm.revision && revForm.fileId && !uploading) ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: (revForm.revision && revForm.fileId && !uploading) ? 'pointer' : 'not-allowed' }}>
                Upload Revision
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editDoc && (
        <Modal open={true} title={`Edit Document — ${editDoc.title}`} onClose={() => setEditDoc(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Title', true)}
                {inp(editForm.title, v => setEditForm(f => ({...f, title: v})), 'Document title')}
              </div>
              <div>
                {lbl('Category', true)}
                <select value={editForm.category} onChange={e => setEditForm(f => ({...f, category: e.target.value as CDCategory}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }}>
                  {CD_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Revision')}
                {inp(editForm.revision, v => setEditForm(f => ({...f, revision: v})), 'e.g. A, 1, C2')}
              </div>
              <div>
                {lbl('Document Number')}
                {inp(editForm.documentNumber, v => setEditForm(f => ({...f, documentNumber: v})), 'e.g. DOC-001')}
              </div>
              <div>
                {lbl('Received From')}
                {inp(editForm.receivedFrom, v => setEditForm(f => ({...f, receivedFrom: v})), 'Client / sender name')}
              </div>
              <div>
                {lbl('Transmission Date')}
                {inp(editForm.transmissionDate, v => setEditForm(f => ({...f, transmissionDate: v})), '', 'date')}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Description')}
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} placeholder="Brief description…"
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 72, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => setEditDoc(null)} style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!editForm.title} onClick={() => void handleEditSave()}
                style={{ padding: '8px 22px', borderRadius: 8, background: editForm.title ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: editForm.title ? 'pointer' : 'not-allowed' }}>
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Bidding types ──────────────────────────────────────────────────────────
interface BidDeliverable { id: string; projectId: string; name: string; deliverableType: string; discipline: string | null; status: string; assignedTo: string | null; dueDate: string | null; notes: string | null; sequence: number; createdByName: string | null; fileCount: number; files: { id: string; fileId: string; filename: string; mimeType: string; sizeBytes: number | null; title: string | null; description: string | null; createdAt: string; downloadUrl: string | null }[]; createdAt: string; updatedAt: string }
interface BidCostItem { id: string; costType: string; description: string; quantity: number | null; unit: string | null; unitCost: number | null; totalCost: number | null; currencyCode: string; supplierRef: string | null; notes: string | null; sequence: number }
interface BidQuotation { id: string; supplierName: string; itemDescription: string; amount: number | null; currencyCode: string; validityDate: string | null; downloadUrl: string | null; filename: string | null; notes: string | null; status: string; createdAt: string }
interface BidSummary { id: string | null; projectId: string; overheadPct: number; marginPct: number; discountPct: number; contingencyPct: number; currencyCode: string; directCostTotal: number; overheadAmount: number; contingencyAmount: number; marginAmount: number; discountAmount: number; bidPrice: number; approvalStatus: string; submittedByName: string | null; submittedAt: string | null; approvedByName: string | null; approvedAt: string | null; rejectionReason: string | null; notes: string | null; updatedAt: string | null }

const DELIVERABLE_TYPES: Record<string, { label: string; color: string }> = {
  mto:                { label: 'MTO',                color: '#3b82f6' },
  calculations:       { label: 'Calculations',       color: '#8b5cf6' },
  datasheets:         { label: 'Datasheets',         color: '#06b6d4' },
  compliance_matrix:  { label: 'Compliance Matrix',  color: '#f59e0b' },
  technical_proposal: { label: 'Technical Proposal', color: '#10b981' },
  design_docs:        { label: 'Design Docs',        color: '#ef4444' },
  custom:             { label: 'Custom',             color: '#6b7280' },
}
const DELIVERABLE_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: '#6b7280' },
  in_progress:  { label: 'In Progress', color: '#3b82f6' },
  in_review:    { label: 'In Review',   color: '#f59e0b' },
  approved:     { label: 'Approved',    color: '#22c55e' },
  na:           { label: 'N/A',         color: '#94a3b8' },
}
const COST_TYPES = ['material', 'labour', 'subcontract', 'equipment'] as const
const COST_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  material:    { label: 'Material',    icon: '🧱', color: '#3b82f6' },
  labour:      { label: 'Labour',      icon: '👷', color: '#10b981' },
  subcontract: { label: 'Subcontract', icon: '🤝', color: '#f59e0b' },
  equipment:   { label: 'Equipment',   icon: '⚙',  color: '#8b5cf6' },
}
const QUOTATION_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: '#94a3b8' },
  received: { label: 'Received', color: '#3b82f6' },
  selected: { label: 'Selected', color: '#22c55e' },
  rejected: { label: 'Rejected', color: '#ef4444' },
}

const APPROVAL_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',               color: '#6b7280', bg: '#6b728020' },
  submitted: { label: 'Pending Approval',    color: '#f59e0b', bg: '#f59e0b20' },
  approved:  { label: 'Approved',            color: '#22c55e', bg: '#22c55e20' },
  rejected:  { label: 'Rejected',            color: '#ef4444', bg: '#ef444420' },
}

function BiddingTab({
  projectId, isEditable, isAdmin, theme, teamMembers,
  deliverables, creatingDeliverable, onCreateDeliverable, onUpdateDeliverable, onDeleteDeliverable, onUploadDeliverableFile, onDeleteDeliverableFile,
  costItems, savingCosts, onSaveCosts,
  quotations, onCreateQuotation, onUpdateQuotation, onDeleteQuotation,
  summary, savingSummary, onUpdateSummary,
  submittingBid, onSubmitBid, approvingBid, onApproveBid, rejectingBid, onRejectBid,
}: {
  projectId: string
  isEditable: boolean
  isAdmin: boolean
  theme: ReturnType<typeof useTheme>['theme']
  teamMembers: { id: string; name: string }[]
  deliverables: BidDeliverable[]
  creatingDeliverable: boolean
  onCreateDeliverable: (v: { projectId: string; name: string; deliverableType: string; discipline?: string; dueDate?: string; notes?: string }) => void
  onUpdateDeliverable: (v: { id: string; status?: string; assignedTo?: string; dueDate?: string; notes?: string; name?: string; discipline?: string }) => void
  onDeleteDeliverable: (id: string) => void
  onUploadDeliverableFile: (deliverableId: string, fileId: string, title?: string) => void
  onDeleteDeliverableFile: (attachmentId: string, deliverableId: string) => void
  costItems: BidCostItem[]
  savingCosts: boolean
  onSaveCosts: (items: Array<{ costType: string; description: string; quantity?: number; unit?: string; unitCost?: number; totalCost?: number; currencyCode?: string; supplierRef?: string; notes?: string; sequence?: number }>) => void
  quotations: BidQuotation[]
  onCreateQuotation: (v: { projectId: string; supplierName: string; itemDescription: string; amount?: number; currencyCode?: string; validityDate?: string; notes?: string }) => void
  onUpdateQuotation: (v: { id: string; status?: string; supplierName?: string; itemDescription?: string; amount?: number; validityDate?: string; notes?: string }) => void
  onDeleteQuotation: (id: string) => void
  summary: BidSummary | null
  savingSummary: boolean
  onUpdateSummary: (v: { overheadPct?: number; marginPct?: number; discountPct?: number; contingencyPct?: number; currencyCode?: string; notes?: string }) => void
  submittingBid: boolean
  onSubmitBid: () => void
  approvingBid: boolean
  onApproveBid: () => void
  rejectingBid: boolean
  onRejectBid: (reason: string) => void
}) {
  const addToast = useToastStore((s) => s.addToast)
  const [bidSub, setBidSub] = React.useState<'technical' | 'commercial'>('technical')

  // ── Technical state ────────────────────────────────────────────────────
  const [showAddDeliverable, setShowAddDeliverable] = React.useState(false)
  const [expandedDel, setExpandedDel]               = React.useState<string | null>(null)
  const [uploadingDelId, setUploadingDelId]          = React.useState<string | null>(null)
  const [delUploadProgress, setDelUploadProgress]    = React.useState(0)
  const delFileRef = React.useRef<HTMLInputElement>(null)
  const newDelForm = React.useRef({ name: '', deliverableType: 'mto', discipline: '', dueDate: '', notes: '' })

  async function handleDelFileUpload(deliverableId: string, file: File) {
    try {
      setUploadingDelId(deliverableId)
      setDelUploadProgress(10)
      const { data: urlRes } = await api.post('/files/upload-url', { filename: file.name, mimeType: file.type, sizeBytes: file.size, category: 'attachment' })
      const { fileId } = urlRes as { fileId: string }
      setDelUploadProgress(40)
      const buf = await file.arrayBuffer()
      await api.post(`/files/${fileId}/content`, buf, { headers: { 'Content-Type': file.type }, timeout: 120_000 })
      setDelUploadProgress(90)
      onUploadDeliverableFile(deliverableId, fileId, file.name.replace(/\.[^.]+$/, ''))
      setDelUploadProgress(100)
    } catch { addToast({ type: 'error', message: 'Upload failed' }) }
    finally { setUploadingDelId(null); setDelUploadProgress(0) }
  }

  const approvedCount = deliverables.filter(d => d.status === 'approved').length
  const totalCount    = deliverables.filter(d => d.status !== 'na').length

  // ── Commercial state ────────────────────────────────────────────────────
  // Cost table rows (mirrors upsert pattern)
  interface CostRow { costType: string; description: string; quantity: string; unit: string; unitCost: string; totalCost: string; supplierRef: string; notes: string; sequence: number }
  const blankCostRow = (type: string, seq: number): CostRow => ({ costType: type, description: '', quantity: '', unit: '', unitCost: '', totalCost: '', supplierRef: '', notes: '', sequence: seq })
  const [costRows, setCostRows] = React.useState<CostRow[]>([])
  const [costDirty, setCostDirty] = React.useState(false)
  const hasLoadedCosts = React.useRef(false)

  React.useEffect(() => {
    if (costItems.length > 0 && !hasLoadedCosts.current) {
      hasLoadedCosts.current = true
      setCostRows(costItems.map((c, i) => ({
        costType: c.costType, description: c.description,
        quantity: c.quantity != null ? String(c.quantity) : '',
        unit: c.unit ?? '', unitCost: c.unitCost != null ? String(c.unitCost) : '',
        totalCost: c.totalCost != null ? String(c.totalCost) : '',
        supplierRef: c.supplierRef ?? '', notes: c.notes ?? '', sequence: i,
      })))
    }
  }, [costItems])

  function updCostRow(idx: number, field: keyof CostRow, val: string) { setCostRows(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r)); setCostDirty(true) }
  function addCostRow(type: string) { setCostRows(p => [...p, blankCostRow(type, p.length)]); setCostDirty(true) }
  function removeCostRow(idx: number) { setCostRows(p => p.filter((_, i) => i !== idx)); setCostDirty(true) }

  function saveCosts() {
    onSaveCosts(costRows.map((r, i) => ({
      costType: r.costType, description: r.description,
      quantity: r.quantity ? Number(r.quantity) : undefined,
      unit: r.unit || undefined, unitCost: r.unitCost ? Number(r.unitCost) : undefined,
      totalCost: r.totalCost ? Number(r.totalCost) : undefined,
      supplierRef: r.supplierRef || undefined, notes: r.notes || undefined, sequence: i,
    })))
    setCostDirty(false)
    hasLoadedCosts.current = false
  }

  // Computed totals from rows (live)
  const rowTotals = costRows.reduce((acc, r) => {
    const total = r.totalCost ? Number(r.totalCost) : (r.quantity && r.unitCost ? Number(r.quantity) * Number(r.unitCost) : 0)
    acc[r.costType] = (acc[r.costType] ?? 0) + total
    acc['__total'] = (acc['__total'] ?? 0) + total
    return acc
  }, {} as Record<string, number>)

  const [summaryPcts, setSummaryPcts] = React.useState({ overheadPct: '0', marginPct: '0', discountPct: '0', contingencyPct: '0' })
  const [pctDirty, setPctDirty] = React.useState(false)
  React.useEffect(() => {
    if (summary) setSummaryPcts({ overheadPct: String(summary.overheadPct), marginPct: String(summary.marginPct), discountPct: String(summary.discountPct), contingencyPct: String(summary.contingencyPct) })
  }, [summary])

  const pctNum = (k: keyof typeof summaryPcts) => parseFloat(summaryPcts[k]) || 0
  const directTotal    = rowTotals['__total'] ?? 0
  const overheadAmt    = directTotal * pctNum('overheadPct') / 100
  const contingencyAmt = directTotal * pctNum('contingencyPct') / 100
  const subTotal       = directTotal + overheadAmt + contingencyAmt
  const marginAmt      = subTotal * pctNum('marginPct') / 100
  const discountAmt    = (subTotal + marginAmt) * pctNum('discountPct') / 100
  const livePrice      = subTotal + marginAmt - discountAmt

  // Quotation form
  const [showAddQuotation, setShowAddQuotation] = React.useState(false)
  const [rejectReason, setRejectReason]          = React.useState('')
  const [showRejectModal, setShowRejectModal]    = React.useState(false)
  const quotForm = React.useRef({ supplierName: '', itemDescription: '', amount: '', currencyCode: 'USD', validityDate: '', notes: '' })

  const fmt = (n: number, currency = 'USD') => n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const inp: React.CSSProperties = { width: '100%', padding: '6px 9px', border: `1px solid ${theme.border}`, borderRadius: '7px', background: theme.bgSurface, color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' }
  const lbl = (t: string) => <label style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, marginBottom: 2, display: 'block' }}>{t}</label>

  const statusBadge = (s: string) => {
    const st = DELIVERABLE_STATUS[s] ?? { label: s, color: '#6b7280' }
    return <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', fontWeight: 600, background: st.color + '20', color: st.color, border: `1px solid ${st.color}40`, whiteSpace: 'nowrap' }}>{st.label}</span>
  }

  return (
    <div>
      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${theme.border}` }}>
        {(['technical', 'commercial'] as const).map(s => (
          <button key={s} onClick={() => setBidSub(s)} style={{ padding: '8px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: bidSub === s ? theme.accent : theme.textMuted, borderBottom: bidSub === s ? `2px solid ${theme.accent}` : '2px solid transparent', marginBottom: '-1px' }}>
            {s === 'technical' ? 'Technical Bid' : 'Commercial Bid'}
          </button>
        ))}
      </div>

      {/* ═══ TECHNICAL BID ═══════════════════════════════════════════ */}
      {bidSub === 'technical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#22c55e', width: `${totalCount > 0 ? Math.round(approvedCount / totalCount * 100) : 0}%`, transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>{approvedCount}/{totalCount} approved</span>
            {isEditable && (
              <button onClick={() => setShowAddDeliverable(true)} style={{ padding: '6px 14px', border: 'none', borderRadius: 7, background: theme.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Deliverable</button>
            )}
          </div>

          {/* Deliverables table */}
          {deliverables.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: theme.textMuted }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 4, color: theme.textPrimary }}>No deliverables yet</div>
              <div style={{ fontSize: '13px' }}>Add technical deliverables that need to be produced for this bid.</div>
            </div>
          ) : (
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 90px 140px 80px 110px', gap: '0 10px', padding: '8px 12px 8px 16px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span /><span>Deliverable</span><span>Type</span><span>Discipline</span><span>Assigned To</span><span>Due</span><span>Status</span>
              </div>
              {deliverables.map(del => {
                const typeInfo = DELIVERABLE_TYPES[del.deliverableType] ?? DELIVERABLE_TYPES['custom']
                const isExp = expandedDel === del.id
                return (
                  <React.Fragment key={del.id}>
                    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 90px 140px 80px 110px', gap: '0 10px', padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center', fontSize: '13px', borderLeft: `4px solid ${DELIVERABLE_STATUS[del.status]?.color ?? '#6b7280'}`, background: (DELIVERABLE_STATUS[del.status]?.color ?? '#6b7280') + '08' }}>
                      <button onClick={() => setExpandedDel(isExp ? null : del.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DELIVERABLE_STATUS[del.status]?.color ?? theme.textMuted, fontSize: '10px', padding: 0 }}>{isExp ? '▼' : '▶'}</button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, color: theme.textPrimary }}>{del.name}</span>
                        {del.fileCount > 0 && <span style={{ fontSize: '11px', color: theme.textMuted }}>📎 {del.fileCount} file{del.fileCount !== 1 ? 's' : ''}</span>}
                      </div>
                      <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 700, background: typeInfo.color, color: '#fff', textAlign: 'center', width: 'fit-content', letterSpacing: '0.01em' }}>{typeInfo.label}</span>
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>{del.discipline ?? '—'}</span>
                      {isEditable ? (
                        <select
                          value={del.assignedTo ?? ''}
                          onChange={e => onUpdateDeliverable({ id: del.id, assignedTo: e.target.value || undefined })}
                          style={{ ...inp, padding: '3px 7px', fontSize: '12px' }}
                        >
                          <option value="">— Unassigned —</option>
                          {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      ) : <span style={{ fontSize: '12px', color: del.assignedTo ? theme.textPrimary : theme.textMuted }}>{del.assignedTo ?? '—'}</span>}
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>{del.dueDate ? new Date(del.dueDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—'}</span>
                      {isEditable ? (
                        <select value={del.status} onChange={e => onUpdateDeliverable({ id: del.id, status: e.target.value })} style={{ ...inp, padding: '3px 7px', fontSize: '12px', background: DELIVERABLE_STATUS[del.status]?.color + '18', color: DELIVERABLE_STATUS[del.status]?.color, fontWeight: 600, border: `1px solid ${DELIVERABLE_STATUS[del.status]?.color ?? theme.border}40` }}>
                          {Object.entries(DELIVERABLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ) : statusBadge(del.status)}
                    </div>
                    {isExp && (
                      <div style={{ padding: '12px 16px 14px 36px', borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Files list */}
                        {del.files.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {del.files.map(f => (
                              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px' }}>
                                <span style={{ color: theme.textMuted, flexShrink: 0 }}>📎</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary }}>{f.title ?? f.filename}</span>
                                {f.downloadUrl && <a href={f.downloadUrl} download={f.filename} style={{ color: theme.accent, fontSize: '11px', textDecoration: 'none', border: `1px solid ${theme.accent}40`, borderRadius: 4, padding: '1px 6px' }}>↓</a>}
                                {isEditable && <button onClick={() => onDeleteDeliverableFile(f.id, del.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '13px', padding: '0 2px' }}>×</button>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Upload zone */}
                        {isEditable && (
                          <div
                            onClick={() => { delFileRef.current?.setAttribute('data-del-id', del.id); delFileRef.current?.click() }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void handleDelFileUpload(del.id, file) }}
                            style={{ border: `2px dashed ${theme.border}`, borderRadius: 8, padding: '12px', textAlign: 'center', cursor: 'pointer', fontSize: '12px', color: theme.textMuted }}>
                            {uploadingDelId === del.id ? (
                              <div style={{ width: '100%', height: 4, background: theme.border, borderRadius: 999, overflow: 'hidden', margin: '4px 0' }}>
                                <div style={{ height: '100%', background: theme.accent, width: `${delUploadProgress}%`, transition: 'width 0.3s' }} />
                              </div>
                            ) : <>Drop file or <span style={{ color: theme.accent }}>browse</span></>}
                          </div>
                        )}
                        {/* Notes & delete */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {del.notes && <span style={{ fontSize: '12px', color: theme.textMuted, flex: 1 }}>{del.notes}</span>}
                          {isAdmin && <button onClick={() => { if (confirm('Delete this deliverable?')) onDeleteDeliverable(del.id) }} style={{ marginLeft: 'auto', fontSize: '11px', color: '#ef4444', background: 'none', border: `1px solid #ef444440`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>Delete</button>}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          )}
          {/* Hidden file input for deliverable uploads */}
          <input ref={delFileRef} type="file" style={{ display: 'none' }} onChange={e => {
            const file = e.target.files?.[0]; const delId = delFileRef.current?.getAttribute('data-del-id')
            if (file && delId) void handleDelFileUpload(delId, file)
            if (e.target) e.target.value = ''
          }} />

          {/* Add Deliverable modal */}
          <Modal open={showAddDeliverable} onClose={() => setShowAddDeliverable(false)} title="Add Deliverable">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
              <div>
                {lbl('Name *')}
                <input onChange={e => { newDelForm.current.name = e.target.value }} placeholder="e.g. Structural MTO" style={inp} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  {lbl('Type')}
                  <select onChange={e => { newDelForm.current.deliverableType = e.target.value }} style={inp}>
                    {Object.entries(DELIVERABLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  {lbl('Discipline')}
                  <select onChange={e => { newDelForm.current.discipline = e.target.value }} style={inp}>
                    <option value="">—</option>
                    {ENG_DISCIPLINES.filter(d => d.key !== 'overview').map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  {lbl('Due Date')}
                  <input type="date" onChange={e => { newDelForm.current.dueDate = e.target.value }} style={inp} />
                </div>
                <div>
                  {lbl('Notes')}
                  <input onChange={e => { newDelForm.current.notes = e.target.value }} placeholder="Optional" style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => setShowAddDeliverable(false)} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${theme.border}`, background: 'none', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button disabled={creatingDeliverable} onClick={() => {
                  if (!newDelForm.current.name.trim()) { addToast({ type: 'error', message: 'Name required' }); return }
                  onCreateDeliverable({ projectId, name: newDelForm.current.name.trim(), deliverableType: newDelForm.current.deliverableType || 'custom', discipline: newDelForm.current.discipline || undefined, dueDate: newDelForm.current.dueDate || undefined, notes: newDelForm.current.notes || undefined })
                  setShowAddDeliverable(false)
                }} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  {creatingDeliverable ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ═══ COMMERCIAL BID ══════════════════════════════════════════ */}
      {bidSub === 'commercial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Approval Status Banner ─────────────────────────────── */}
          {summary && summary.approvalStatus !== 'draft' && (() => {
            const st = APPROVAL_STATUS[summary.approvalStatus]
            return (
              <div style={{ borderRadius: 12, border: `1px solid ${st?.color ?? '#6b7280'}30`, background: st?.bg ?? '#6b728012', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: (st?.color ?? '#6b7280') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {summary.approvalStatus === 'approved' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={st?.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    {summary.approvalStatus === 'submitted' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={st?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                    {summary.approvalStatus === 'rejected' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={st?.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: st?.color }}>{st?.label}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: 2 }}>
                      {summary.approvalStatus === 'submitted' && `Submitted by ${summary.submittedByName} · ${summary.submittedAt ? new Date(summary.submittedAt).toLocaleDateString() : ''}`}
                      {summary.approvalStatus === 'approved' && `Approved by ${summary.approvedByName} · ${summary.approvedAt ? new Date(summary.approvedAt).toLocaleDateString() : ''}`}
                      {summary.approvalStatus === 'rejected' && `Rejection reason: ${summary.rejectionReason}`}
                    </div>
                  </div>
                  {isAdmin && summary.approvalStatus === 'submitted' && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={onApproveBid} disabled={approvingBid} style={{ padding: '8px 20px', border: 'none', borderRadius: 8, background: '#22c55e', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: approvingBid ? 'not-allowed' : 'pointer', opacity: approvingBid ? 0.7 : 1 }}>
                        {approvingBid ? 'Approving…' : 'Approve Bid'}
                      </button>
                      <button onClick={() => setShowRejectModal(true)} style={{ padding: '8px 20px', border: '1px solid #ef4444', borderRadius: 8, background: 'none', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Reject</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── Cost Breakdown ─────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: theme.textPrimary }}>Cost Breakdown</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: 3 }}>
                  Direct cost total: <span style={{ fontWeight: 600, color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{fmt(directTotal, summary?.currencyCode ?? 'USD')}</span>
                </div>
              </div>
              {isEditable && costDirty && (
                <button onClick={saveCosts} disabled={savingCosts} style={{ padding: '8px 20px', border: 'none', borderRadius: 8, background: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: savingCosts ? 'not-allowed' : 'pointer', opacity: savingCosts ? 0.7 : 1 }}>
                  {savingCosts ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {COST_TYPES.map(type => {
                const meta = COST_TYPE_META[type]!
                const typeRows = costRows.map((r, i) => ({ ...r, _idx: i })).filter(r => r.costType === type)
                const subtotal = typeRows.reduce((s, r) => s + (r.totalCost ? Number(r.totalCost) : (r.quantity && r.unitCost ? Number(r.quantity) * Number(r.unitCost) : 0)), 0)
                const costSvg: Record<string, React.ReactNode> = {
                  material:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
                  labour:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
                  subcontract: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                  equipment:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
                }
                return (
                  <div key={type} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: theme.bgSurface, borderBottom: typeRows.length > 0 ? `1px solid ${theme.border}` : 'none', borderLeft: `3px solid ${meta.color}` }}>
                      <span style={{ color: meta.color, display: 'flex', alignItems: 'center' }}>{costSvg[type]}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>{meta.label}</span>
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>{typeRows.length} item{typeRows.length !== 1 ? 's' : ''}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: meta.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotal, summary?.currencyCode ?? 'USD')}</span>
                        {isEditable && <button onClick={() => addCostRow(type)} style={{ padding: '3px 10px', border: `1px solid ${theme.border}`, borderRadius: 6, background: 'none', color: theme.accent, fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>}
                      </div>
                    </div>
                    {typeRows.length > 0 && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 56px 96px 96px 130px 28px', gap: '0 8px', padding: '7px 16px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <span>Description</span><span>Qty</span><span>Unit</span><span style={{ textAlign: 'right' }}>Unit Cost</span><span style={{ textAlign: 'right' }}>Total</span><span>Supplier Ref</span><span />
                        </div>
                        {typeRows.map((r, ri) => (
                          <div key={r._idx} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 56px 96px 96px 130px 28px', gap: '0 8px', padding: '7px 16px', borderBottom: ri < typeRows.length - 1 ? `1px solid ${theme.border}` : 'none', alignItems: 'center' }}>
                            <input value={r.description} onChange={e => updCostRow(r._idx, 'description', e.target.value)} disabled={!isEditable} placeholder="Description" style={{ ...inp, padding: '5px 8px', fontSize: '13px' }} />
                            <input value={r.quantity} onChange={e => updCostRow(r._idx, 'quantity', e.target.value)} disabled={!isEditable} type="number" placeholder="0" style={{ ...inp, padding: '5px 8px', fontSize: '13px' }} />
                            <input value={r.unit} onChange={e => updCostRow(r._idx, 'unit', e.target.value)} disabled={!isEditable} placeholder="m²" style={{ ...inp, padding: '5px 8px', fontSize: '13px' }} />
                            <input value={r.unitCost} onChange={e => updCostRow(r._idx, 'unitCost', e.target.value)} disabled={!isEditable} type="number" placeholder="0.00" style={{ ...inp, padding: '5px 8px', fontSize: '13px', textAlign: 'right' }} />
                            <input value={r.totalCost || (r.quantity && r.unitCost ? String(Number(r.quantity) * Number(r.unitCost)) : '')} onChange={e => updCostRow(r._idx, 'totalCost', e.target.value)} disabled={!isEditable} type="number" placeholder="Auto" style={{ ...inp, padding: '5px 8px', fontSize: '13px', textAlign: 'right' }} />
                            <input value={r.supplierRef} onChange={e => updCostRow(r._idx, 'supplierRef', e.target.value)} disabled={!isEditable} placeholder="Vendor / PO ref" style={{ ...inp, padding: '5px 8px', fontSize: '13px' }} />
                            {isEditable ? <button onClick={() => removeCostRow(r._idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '18px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button> : <span />}
                          </div>
                        ))}
                      </>
                    )}
                    {typeRows.length === 0 && (
                      <div style={{ padding: '14px 16px', fontSize: '13px', color: theme.textMuted }}>No {meta.label.toLowerCase()} items added yet.</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Pricing Summary ────────────────────────────────────── */}
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>Pricing Summary</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: 2 }}>Configure overhead, contingency, margin and discount</div>
              </div>
              {isEditable && pctDirty && (
                <button onClick={() => { onUpdateSummary({ overheadPct: pctNum('overheadPct'), marginPct: pctNum('marginPct'), discountPct: pctNum('discountPct'), contingencyPct: pctNum('contingencyPct') }); setPctDirty(false) }} disabled={savingSummary} style={{ padding: '7px 18px', border: 'none', borderRadius: 8, background: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  Save Percentages
                </button>
              )}
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Percentage input tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                {([
                  { key: 'overheadPct' as const, label: 'Overhead', color: '#3b82f6', amt: overheadAmt },
                  { key: 'contingencyPct' as const, label: 'Contingency', color: '#f59e0b', amt: contingencyAmt },
                  { key: 'marginPct' as const, label: 'Margin', color: '#22c55e', amt: marginAmt },
                  { key: 'discountPct' as const, label: 'Discount', color: '#ef4444', amt: discountAmt },
                ]).map(({ key, label, color, amt }) => (
                  <div key={key} style={{ padding: '14px', border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.bgSurface, borderTop: `3px solid ${color}` }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: theme.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label} %</div>
                    <input
                      type="text" inputMode="decimal"
                      value={summaryPcts[key]}
                      onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setSummaryPcts(p => ({ ...p, [key]: v })); setPctDirty(true) }}
                      disabled={!isEditable}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '24px', fontWeight: 700, color: theme.textPrimary, padding: 0, outline: 'none', fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box' }}
                    />
                    <div style={{ fontSize: '11px', color, marginTop: 6, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(amt, summary?.currencyCode ?? 'USD')}</div>
                  </div>
                ))}
              </div>

              {/* Price waterfall */}
              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
                {[
                  { label: 'Direct Cost Total',                              value: directTotal,                          prefix: '',  bold: false, dividerBefore: false },
                  { label: `+ Overhead (${summaryPcts.overheadPct}%)`,       value: overheadAmt,                          prefix: '',  bold: false, dividerBefore: false },
                  { label: `+ Contingency (${summaryPcts.contingencyPct}%)`, value: contingencyAmt,                       prefix: '',  bold: false, dividerBefore: false },
                  { label: 'Sub-total',                                       value: directTotal + overheadAmt + contingencyAmt, prefix: '', bold: true, dividerBefore: true },
                  { label: `+ Margin (${summaryPcts.marginPct}%)`,           value: marginAmt,                            prefix: '',  bold: false, dividerBefore: false },
                  { label: `− Discount (${summaryPcts.discountPct}%)`,       value: -discountAmt,                         prefix: '',  bold: false, dividerBefore: false },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: row.dividerBefore ? `2px solid ${theme.border}` : i > 0 ? `1px solid ${theme.border}` : 'none', background: row.bold ? theme.bgSurface : 'transparent' }}>
                    <span style={{ fontSize: '13px', fontWeight: row.bold ? 700 : 400, color: row.bold ? theme.textPrimary : theme.textMuted }}>{row.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: row.bold ? 700 : 400, color: row.value < 0 ? '#ef4444' : row.bold ? theme.textPrimary : theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                      {row.value < 0 ? `(${fmt(Math.abs(row.value), summary?.currencyCode ?? 'USD')})` : fmt(row.value, summary?.currencyCode ?? 'USD')}
                    </span>
                  </div>
                ))}
                {/* Bid Price */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: theme.accent + '0e', borderTop: `2px solid ${theme.accent}30` }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Total Bid Price</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Incl. overhead, contingency &amp; margin · excl. tax</div>
                  </div>
                  <div style={{ fontSize: '30px', fontWeight: 800, color: theme.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{fmt(livePrice, summary?.currencyCode ?? 'USD')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Supplier Quotations ────────────────────────────────── */}
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>Supplier Quotations</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: 2 }}>{quotations.length} quotation{quotations.length !== 1 ? 's' : ''} on record</div>
              </div>
              {isEditable && (
                <button onClick={() => setShowAddQuotation(true)} style={{ padding: '7px 16px', border: `1px solid ${theme.border}`, borderRadius: 8, background: 'none', color: theme.accent, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  + Add Quotation
                </button>
              )}
            </div>
            {quotations.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, marginBottom: 4 }}>No quotations recorded</div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>Add supplier quotations to track pricing for this bid</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px 70px 100px 120px 32px', gap: '0 12px', padding: '8px 20px', borderBottom: `1px solid ${theme.border}`, fontSize: '10px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <span>Supplier</span><span>Description</span><span style={{ textAlign: 'right' }}>Amount</span><span>Currency</span><span>Valid Until</span><span>Status</span><span />
                </div>
                {quotations.map(q => {
                  const qSt = QUOTATION_STATUS[q.status] ?? { label: q.status, color: '#6b7280' }
                  return (
                    <div key={q.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px 70px 100px 120px 32px', gap: '0 12px', padding: '12px 20px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{q.supplierName}</span>
                      <span style={{ fontSize: '13px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.itemDescription}</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{q.amount != null ? q.amount.toLocaleString() : '—'}</span>
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>{q.currencyCode}</span>
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>{q.validityDate ? new Date(q.validityDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</span>
                      <select value={q.status} onChange={e => onUpdateQuotation({ id: q.id, status: e.target.value })} disabled={!isEditable}
                        style={{ padding: '5px 8px', fontSize: '11px', fontWeight: 700, background: qSt.color + '18', color: qSt.color, border: `1px solid ${qSt.color}40`, borderRadius: 6, cursor: isEditable ? 'pointer' : 'default', outline: 'none' }}>
                        {Object.entries(QUOTATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {isEditable && <button onClick={() => { if (confirm('Remove quotation?')) onDeleteQuotation(q.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '18px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* ── Submit / Action Bar ────────────────────────────────── */}
          {isEditable && (!summary || summary.approvalStatus === 'draft' || summary.approvalStatus === 'rejected') && (
            <div style={{ padding: '18px 22px', border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.bgSurface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary, marginBottom: 4 }}>
                  {summary?.approvalStatus === 'rejected' ? 'Resubmit for approval' : 'Ready to submit?'}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  Bid price: <span style={{ fontWeight: 700, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{fmt(livePrice, summary?.currencyCode ?? 'USD')}</span>
                  {summary?.approvalStatus === 'rejected' && <span style={{ color: '#ef4444', marginLeft: 6 }}>· Previously rejected</span>}
                </div>
              </div>
              <button onClick={onSubmitBid} disabled={submittingBid} style={{ padding: '10px 26px', border: 'none', borderRadius: 9, background: theme.accent, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: submittingBid ? 'not-allowed' : 'pointer', opacity: submittingBid ? 0.7 : 1, flexShrink: 0 }}>
                {submittingBid ? 'Submitting…' : 'Submit Bid for Approval'}
              </button>
            </div>
          )}

          {/* ── Add Quotation Modal ────────────────────────────────── */}
          <Modal open={showAddQuotation} onClose={() => setShowAddQuotation(false)} title="Add Supplier Quotation">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>{lbl('Supplier Name *')}<input onChange={e => { quotForm.current.supplierName = e.target.value }} placeholder="ACME Co." style={inp} /></div>
                <div>{lbl('Item / Description *')}<input onChange={e => { quotForm.current.itemDescription = e.target.value }} placeholder="Structural steel supply" style={inp} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>{lbl('Amount')}<input type="number" onChange={e => { quotForm.current.amount = e.target.value }} placeholder="0.00" style={inp} /></div>
                <div>{lbl('Currency')}<input defaultValue="USD" onChange={e => { quotForm.current.currencyCode = e.target.value }} style={inp} /></div>
                <div>{lbl('Validity Date')}<input type="date" onChange={e => { quotForm.current.validityDate = e.target.value }} style={inp} /></div>
              </div>
              <div>{lbl('Notes')}<textarea rows={2} onChange={e => { quotForm.current.notes = e.target.value }} style={{ ...inp, resize: 'vertical' }} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddQuotation(false)} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${theme.border}`, background: 'none', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => {
                  if (!quotForm.current.supplierName.trim() || !quotForm.current.itemDescription.trim()) { addToast({ type: 'error', message: 'Supplier and item required' }); return }
                  onCreateQuotation({ projectId, supplierName: quotForm.current.supplierName, itemDescription: quotForm.current.itemDescription, amount: quotForm.current.amount ? Number(quotForm.current.amount) : undefined, currencyCode: quotForm.current.currencyCode || 'USD', validityDate: quotForm.current.validityDate || undefined, notes: quotForm.current.notes || undefined })
                  setShowAddQuotation(false)
                }} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Add Quotation</button>
              </div>
            </div>
          </Modal>

          {/* ── Reject Bid Modal ───────────────────────────────────── */}
          <Modal open={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Bid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
              {lbl('Reason for rejection *')}
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Describe the reason…" style={{ ...inp, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowRejectModal(false)} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${theme.border}`, background: 'none', color: theme.textPrimary, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { if (!rejectReason.trim()) { addToast({ type: 'error', message: 'Reason required' }); return }; onRejectBid(rejectReason); setShowRejectModal(false); setRejectReason('') }} disabled={rejectingBid} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: rejectingBid ? 'not-allowed' : 'pointer', opacity: rejectingBid ? 0.7 : 1 }}>
                  {rejectingBid ? 'Rejecting…' : 'Reject Bid'}
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  )
}

// ── Engineering types ─────────────────────────────────────────────────────
interface EngDrawing { id: string; drawingNumber: string; title: string; discipline: string | null; scale: string | null; paperSize: string | null; revision: string | null; status: string; issueDate: string | null; notes: string | null; fileId: string | null; parentDrawingId: string | null; uploadedByName: string | null; downloadUrl: string | null; filename: string | null; revisions: EngDrawing[]; createdAt: string }

interface EngDoc {
  id: string; projectId: string; refNumber: string; discipline: string; docType: string
  seqNo: number; title: string; description: string | null; scale: string | null
  paperSize: string | null; revision: string | null; status: string; issueDate: string | null
  notes: string | null; fileId: string | null; docGroupId: string; isCurrent: boolean
  uploadedByName: string | null; downloadUrl: string | null; filename: string | null
  originatorName: string | null; checkerName: string | null; approverName: string | null
  purposeOfIssue: string | null; commentCount: number; openCommentCount: number
  history: EngDoc[]
  createdAt: string
}

interface DocComment {
  id: string; documentId: string; revision: string; reviewerName: string | null
  commentNumber: number; locationRef: string | null; commentText: string
  category: 'major' | 'minor' | 'info'
  responseText: string | null; responseName: string | null; responseDate: string | null
  resolution: 'accepted' | 'partial' | 'rejected' | 'withdrawn' | null
  createdAt: string
}

interface DDMEntry {
  id: string; projectId: string; companyName: string; contactName: string | null
  contactEmail: string | null; discipline: string | null; docType: string | null
  statusTrigger: string; copies: number; format: 'PDF' | 'DWG' | 'Native' | 'Hard Copy'
  autoTransmit: boolean; notes: string | null; createdAt: string
}

// ── Engineering Documents constants ──────────────────────────────────────
const ENG_DISCIPLINES = [
  { key: 'overview',      label: 'Overview',      code: null },
  { key: 'civil',         label: 'Civil',         code: 'CIV' },
  { key: 'structural',    label: 'Structural',    code: 'STR' },
  { key: 'architectural', label: 'Architectural', code: 'ARC' },
  { key: 'electrical',    label: 'Electrical',    code: 'ELE' },
  { key: 'ist',           label: 'IST',           code: 'IST' },
  { key: 'mechanical',    label: 'Mechanical',    code: 'MEC' },
  { key: 'others',        label: 'Others',        code: 'OTH' },
] as const

const ENG_DOC_TYPES = [
  { key: 'all',           label: 'All' },
  { key: 'calculation',   label: 'Calculations' },
  { key: 'drawing',       label: 'Drawings' },
  { key: 'datasheet',     label: 'Datasheets' },
  { key: 'specification', label: 'Specifications' },
  { key: 'other',         label: 'Others' },
] as const

const ENG_DOC_STATUSES: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  draft:            { label: 'Draft',            dot: '#94a3b8', text: '#475569', bg: '#f1f5f9' },
  IFA:              { label: 'IFA',              dot: '#f59e0b', text: '#a16207', bg: '#fffbeb' },
  IFR:              { label: 'IFR',              dot: '#3b82f6', text: '#1d4ed8', bg: '#eff6ff' },
  IFI:              { label: 'IFI',              dot: '#a78bfa', text: '#5b21b6', bg: '#ede9fe' },
  IFC:              { label: 'IFC',              dot: '#f97316', text: '#c2410c', bg: '#fff7ed' },
  AFC:              { label: 'AFC',              dot: '#22c55e', text: '#15803d', bg: '#f0fdf4' },
  as_built:         { label: 'As-Built',         dot: '#06b6d4', text: '#0e7490', bg: '#ecfeff' },
  superseded:       { label: 'Superseded',       dot: '#9ca3af', text: '#6b7280', bg: '#f9fafb' },
  cancelled:        { label: 'Cancelled',        dot: '#ef4444', text: '#dc2626', bg: '#fef2f2' },
  preliminary:      { label: 'Preliminary',      dot: '#94a3b8', text: '#475569', bg: '#f1f5f9' },
  for_review:       { label: 'For Review',       dot: '#f59e0b', text: '#a16207', bg: '#fffbeb' },
  for_construction: { label: 'For Construction', dot: '#3b82f6', text: '#1d4ed8', bg: '#eff6ff' },
}

const ENG_PURPOSE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  IFA: { label: 'For Approval',       color: '#a16207', bg: '#fffbeb' },
  IFR: { label: 'For Review',         color: '#1d4ed8', bg: '#eff6ff' },
  IFI: { label: 'For Information',    color: '#5b21b6', bg: '#ede9fe' },
  IFC: { label: 'For Construction',   color: '#c2410c', bg: '#fff7ed' },
  AFC: { label: 'Appr. for Constr.',  color: '#15803d', bg: '#f0fdf4' },
}

const DOC_CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  major: { label: 'Major', color: '#dc2626', bg: '#fee2e2' },
  minor: { label: 'Minor', color: '#d97706', bg: '#fef3c7' },
  info:  { label: 'Info',  color: '#2563eb', bg: '#dbeafe' },
}

const DOC_RESOLUTION_META: Record<string, { label: string; color: string; bg: string }> = {
  accepted:  { label: 'Accepted',  color: '#15803d', bg: '#f0fdf4' },
  partial:   { label: 'Partial',   color: '#a16207', bg: '#fffbeb' },
  rejected:  { label: 'Rejected',  color: '#dc2626', bg: '#fee2e2' },
  withdrawn: { label: 'Withdrawn', color: '#6b7280', bg: '#f9fafb' },
}

function EngineeringTab({ projectId, projectCode, theme, isAdmin }: {
  projectId: string
  projectCode: string
  theme: ReturnType<typeof useTheme>['theme']
  isAdmin?: boolean
}) {
  const addToast = useToastStore((s) => s.addToast)

  // sub-view
  const [engView, setEngView] = React.useState<'register' | 'review' | 'distribution'>('register')

  // register state
  const [discipline,  setDiscipline]  = React.useState<string>('overview')
  const [docType,     setDocType]     = React.useState<string>('all')
  const [search,      setSearch]      = React.useState('')
  const [expandedId,  setExpandedId]  = React.useState<string | null>(null)
  const [showModal,   setShowModal]   = React.useState(false)
  const [reviseDoc,   setReviseDoc]   = React.useState<EngDoc | null>(null)
  const [uploading,   setUploading]   = React.useState(false)
  const [form, setForm] = React.useState({
    title: '', description: '', revision: '', scale: '', paperSize: '',
    issueDate: '', notes: '', fileId: '', filename: '',
    originatorName: '', checkerName: '', approverName: '', purposeOfIssue: '',
  })
  const [revForm, setRevForm] = React.useState({
    revision: '', notes: '', issueDate: '', fileId: '', filename: '',
    originatorName: '', checkerName: '', approverName: '', purposeOfIssue: '',
  })

  // review state
  const [reviewDocId,     setReviewDocId]     = React.useState<string | null>(null)
  const [showCommentForm, setShowCommentForm]  = React.useState(false)
  const [commentForm, setCommentForm] = React.useState({ locationRef: '', commentText: '', category: 'minor' as 'major' | 'minor' | 'info' })
  const [respondingTo,   setRespondingTo]     = React.useState<string | null>(null)
  const [responseForm, setResponseForm] = React.useState({ responseText: '', resolution: 'accepted' })

  // distribution state
  const [showDDMModal, setShowDDMModal] = React.useState(false)
  const [editDDM,      setEditDDM]      = React.useState<DDMEntry | null>(null)
  const emptyDDM: { companyName: string; contactName: string; contactEmail: string; discipline: string; docType: string; statusTrigger: string; copies: number; format: DDMEntry['format']; autoTransmit: boolean; notes: string } = { companyName: '', contactName: '', contactEmail: '', discipline: '', docType: '', statusTrigger: 'IFA', copies: 1, format: 'PDF', autoTransmit: false, notes: '' }
  const [ddmForm, setDDMForm] = React.useState(emptyDDM)

  const { data, loading, refetch } = useQuery(ENG_DOCS_QUERY, {
    variables: { projectId },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  })
  const { data: commentsData, refetch: refetchComments } = useQuery(DOC_COMMENTS_QUERY, {
    variables: { documentId: reviewDocId ?? '' },
    skip: !reviewDocId,
    fetchPolicy: 'cache-and-network',
  })
  const { data: ddmData, refetch: refetchDDM } = useQuery(DOC_DISTRIBUTION_QUERY, {
    variables: { projectId },
    skip: engView !== 'distribution',
    fetchPolicy: 'cache-and-network',
  })

  const [createDoc]      = useMutation(CREATE_ENG_DOC)
  const [reviseDocM]     = useMutation(REVISE_ENG_DOC)
  const [updateStatus]   = useMutation(UPDATE_ENG_DOC_STATUS)
  const [deleteDocM]     = useMutation(DELETE_ENG_DOC)
  const [addCommentM]    = useMutation(ADD_DOC_COMMENT)
  const [respondM]       = useMutation(RESPOND_TO_COMMENT)
  const [deleteCommentM] = useMutation(DELETE_DOC_COMMENT)
  const [upsertDDMM]     = useMutation(UPSERT_DISTRIBUTION_ENTRY)
  const [deleteDDMM]     = useMutation(DELETE_DISTRIBUTION_ENTRY)

  const allDocs: EngDoc[]      = data?.engineeringDocuments ?? []
  const comments: DocComment[] = commentsData?.docComments ?? []
  const ddmEntries: DDMEntry[] = ddmData?.docDistributionMatrix ?? []

  const filtered = allDocs.filter(d => {
    if (discipline !== 'overview' && d.discipline !== discipline) return false
    if (docType !== 'all' && d.docType !== docType) return false
    if (search) {
      const q = search.toLowerCase()
      return d.title.toLowerCase().includes(q) || d.refNumber.toLowerCase().includes(q) || (d.uploadedByName ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const docsForReview = allDocs.filter(d => d.commentCount > 0)
  const reviewDoc     = allDocs.find(d => d.id === reviewDocId) ?? null

  const pickFile = async (onPicked: (fileId: string, filename: string) => void) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.dwg,.dxf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const { data: urlRes } = await api.post('/files/upload-url', {
          filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, category: 'attachment',
        })
        const { fileId } = urlRes as { fileId: string }
        const buf = await file.arrayBuffer()
        await api.post(`/files/${fileId}/content`, buf, { headers: { 'Content-Type': file.type || 'application/octet-stream' }, timeout: 120_000 })
        onPicked(fileId, file.name)
      } catch { addToast({ type: 'error', message: 'File upload failed' }) }
      finally { setUploading(false) }
    }
    input.click()
  }

  const handleCreate = async () => {
    if (!form.title) { addToast({ type: 'error', message: 'Title is required' }); return }
    try {
      await createDoc({ variables: {
        projectId,
        discipline: discipline === 'overview' ? 'others' : discipline,
        docType: docType === 'all' ? 'other' : docType,
        title: form.title, fileId: form.fileId || null, revision: form.revision || null,
        description: form.description || null, scale: form.scale || null,
        paperSize: form.paperSize || null, issueDate: form.issueDate || null, notes: form.notes || null,
        originatorName: form.originatorName || null, checkerName: form.checkerName || null,
        approverName: form.approverName || null, purposeOfIssue: form.purposeOfIssue || null,
      }})
      addToast({ type: 'success', message: 'Document added' })
      setShowModal(false)
      setForm({ title: '', description: '', revision: '', scale: '', paperSize: '', issueDate: '', notes: '', fileId: '', filename: '', originatorName: '', checkerName: '', approverName: '', purposeOfIssue: '' })
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleRevise = async () => {
    if (!revForm.revision) { addToast({ type: 'error', message: 'Revision is required' }); return }
    try {
      await reviseDocM({ variables: {
        id: reviseDoc!.id, fileId: revForm.fileId || null,
        revision: revForm.revision, notes: revForm.notes || null, issueDate: revForm.issueDate || null,
        originatorName: revForm.originatorName || null, checkerName: revForm.checkerName || null,
        approverName: revForm.approverName || null, purposeOfIssue: revForm.purposeOfIssue || null,
      }})
      addToast({ type: 'success', message: 'Revision issued' })
      setReviseDoc(null)
      setRevForm({ revision: '', notes: '', issueDate: '', fileId: '', filename: '', originatorName: '', checkerName: '', approverName: '', purposeOfIssue: '' })
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleAddComment = async () => {
    if (!commentForm.commentText || !reviewDocId) return
    try {
      await addCommentM({ variables: {
        documentId: reviewDocId,
        revision: reviewDoc?.revision ?? 'A',
        locationRef: commentForm.locationRef || null,
        commentText: commentForm.commentText,
        category: commentForm.category,
      }})
      addToast({ type: 'success', message: 'Comment added' })
      setCommentForm({ locationRef: '', commentText: '', category: 'minor' })
      setShowCommentForm(false)
      void refetchComments()
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleRespond = async (commentId: string) => {
    if (!responseForm.responseText) return
    try {
      await respondM({ variables: { id: commentId, responseText: responseForm.responseText, resolution: responseForm.resolution }})
      addToast({ type: 'success', message: 'Response submitted' })
      setRespondingTo(null)
      setResponseForm({ responseText: '', resolution: 'accepted' })
      void refetchComments()
      void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleDeleteComment = async (id: string) => {
    if (!window.confirm('Delete this comment?')) return
    try { await deleteCommentM({ variables: { id }}); void refetchComments(); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleSaveDDM = async () => {
    if (!ddmForm.companyName || !ddmForm.statusTrigger) { addToast({ type: 'error', message: 'Company and status trigger are required' }); return }
    try {
      await upsertDDMM({ variables: {
        id: editDDM?.id ?? null, projectId,
        companyName: ddmForm.companyName, contactName: ddmForm.contactName || null,
        contactEmail: ddmForm.contactEmail || null, discipline: ddmForm.discipline || null,
        docType: ddmForm.docType || null, statusTrigger: ddmForm.statusTrigger,
        copies: ddmForm.copies, format: ddmForm.format,
        autoTransmit: ddmForm.autoTransmit, notes: ddmForm.notes || null,
      }})
      addToast({ type: 'success', message: editDDM ? 'Entry updated' : 'Entry added' })
      setShowDDMModal(false); setEditDDM(null); setDDMForm(emptyDDM)
      void refetchDDM()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleDeleteDDM = async (id: string) => {
    if (!window.confirm('Remove this distribution entry?')) return
    try { await deleteDDMM({ variables: { id }}); void refetchDDM() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleDelete = async (doc: EngDoc) => {
    if (!window.confirm(`Delete "${doc.title}" (${doc.refNumber})?`)) return
    try { await deleteDocM({ variables: { id: doc.id }}); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleStatus = async (doc: EngDoc, status: string) => {
    try { await updateStatus({ variables: { id: doc.id, status }}); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const TYPE_CODE_MAP: Record<string, string> = {
    calculation: 'CAL', drawing: 'DRG', datasheet: 'DAT', specification: 'SPC', other: 'OTH', all: 'OTH',
  }

  const docTypeIcon = (dt: string, size = 42) => {
    const MAP: Record<string, { bg: string; fg: string; ext: string }> = {
      drawing:       { bg: '#dbeafe', fg: '#1d4ed8', ext: 'DRG' },
      calculation:   { bg: '#d1fae5', fg: '#065f46', ext: 'CAL' },
      datasheet:     { bg: '#fef9c3', fg: '#a16207', ext: 'DAT' },
      specification: { bg: '#ede9fe', fg: '#5b21b6', ext: 'SPC' },
      other:         { bg: '#f1f5f9', fg: '#475569', ext: 'OTH' },
    }
    const c = MAP[dt] ?? MAP['other']!
    return (
      <div style={{ width: size, height: size, borderRadius: 10, background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 1 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke={c.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke={c.fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 6.5, fontWeight: 800, color: c.fg, letterSpacing: '0.03em', lineHeight: 1 }}>{c.ext}</span>
      </div>
    )
  }

  const statusPill = (s: string, forAdmin = false, doc?: EngDoc) => {
    const cfg = ENG_DOC_STATUSES[s] ?? ENG_DOC_STATUSES['preliminary']!
    if (forAdmin && doc) {
      return (
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 10px', borderRadius: 999, background: cfg.bg, fontSize: 11, fontWeight: 600, color: cfg.text, whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 1, opacity: 0.5 }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <select
            value={s}
            onChange={e => void handleStatus(doc, e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}>
            {Object.entries(ENG_DOC_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      )
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: cfg.bg, fontSize: 11, fontWeight: 600, color: cfg.text, whiteSpace: 'nowrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
        {cfg.label}
      </span>
    )
  }

  const iconActionBtn = (tooltip: string, icon: React.ReactNode, onClick: () => void, variant: 'default' | 'danger' | 'accent' = 'default') => {
    const variants = {
      default: { color: theme.textMuted,  hoverBg: theme.bgSurface },
      danger:  { color: '#dc2626',        hoverBg: '#fff1f2' },
      accent:  { color: theme.accent,     hoverBg: theme.accentBg },
    }
    const s = variants[variant]
    return (
      <button title={tooltip} onClick={onClick}
        onMouseEnter={e => { const t = e.currentTarget; t.style.background = s.hoverBg; t.style.borderColor = variant === 'danger' ? '#fca5a5' : theme.border }}
        onMouseLeave={e => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.borderColor = 'transparent' }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: s.color, cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s, border-color 0.12s' }}>
        {icon}
      </button>
    )
  }

  const inp = (value: string, onChange: (v: string) => void, placeholder?: string, type = 'text') => (
    <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }} />
  )
  const lbl = (t: string, req = false) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
      {t}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
  )

  const activeDisc      = ENG_DISCIPLINES.find(d => d.key === discipline)
  const activeDisciplineLabel = activeDisc?.label ?? 'Overview'
  const activeDisciplineCode  = activeDisc?.code ?? null

  // grid: icon | document | revision | status | actions
  const COL = '52px minmax(0,1fr) 130px 148px 168px'

  const renderRow = (doc: EngDoc, isHistory = false) => {
    const isExpanded  = expandedId === doc.id
    const hasHistory  = !isHistory && doc.history.length > 0
    const discLabel   = ENG_DISCIPLINES.find(d => d.key === doc.discipline)?.label ?? doc.discipline
    const typeLabel   = ENG_DOC_TYPES.find(t => t.key === doc.docType)?.label ?? doc.docType
    const meta        = [discLabel, typeLabel, doc.uploadedByName && `by ${doc.uploadedByName}`, doc.issueDate && doc.issueDate].filter(Boolean).join('  ·  ')

    return (
      <React.Fragment key={doc.id}>
        <div style={{
          display: 'grid', gridTemplateColumns: COL, alignItems: 'center', gap: 16,
          padding: isHistory ? '10px 20px 10px 68px' : '14px 20px',
          borderBottom: `1px solid ${theme.border}`,
          background: isHistory ? theme.bgSurface : 'transparent',
        }}>
          {/* Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasHistory && (
              <button onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                style={{ all: 'unset', cursor: 'pointer', color: theme.textMuted, marginRight: -8, position: 'relative', zIndex: 1, padding: '4px 2px' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                  style={{ transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}>
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {docTypeIcon(doc.docType)}
          </div>

          {/* Document info */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              {isHistory && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, flexShrink: 0 }}>
                  <path d="M9 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: theme.accent, background: theme.accentBg, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em' }}>
                {doc.refNumber}
              </span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.title}
            </div>
            {meta && (
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta}
              </div>
            )}
            {doc.purposeOfIssue && ENG_PURPOSE_LABELS[doc.purposeOfIssue] && (
              <span style={{ display: 'inline-flex', marginTop: 3, padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: ENG_PURPOSE_LABELS[doc.purposeOfIssue]!.color, background: ENG_PURPOSE_LABELS[doc.purposeOfIssue]!.bg }}>
                {ENG_PURPOSE_LABELS[doc.purposeOfIssue]!.label}
              </span>
            )}
            {!isHistory && doc.openCommentCount > 0 && (
              <button onClick={() => { setEngView('review'); setReviewDocId(doc.id) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3, marginLeft: doc.purposeOfIssue ? 6 : 0, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: 'none', cursor: 'pointer' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">{doc.openCommentCount}</text></svg>
                {doc.openCommentCount} open
              </button>
            )}
            {doc.notes && (
              <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                {doc.notes}
              </div>
            )}
          </div>

          {/* Revision */}
          <div>
            {doc.revision
              ? <span style={{ padding: '3px 9px', borderRadius: 6, background: theme.accentBg, color: theme.accent, fontSize: 11, fontWeight: 700 }}>Rev {doc.revision}</span>
              : <span style={{ color: theme.textMuted, fontSize: 12 }}>—</span>
            }
          </div>

          {/* Status */}
          <div>{statusPill(doc.status, isAdmin && !isHistory, isAdmin && !isHistory ? doc : undefined)}</div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'flex-end' }}>
            {doc.downloadUrl && iconActionBtn('Preview', <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>, () => window.open(doc.downloadUrl!, '_blank'))}
            {doc.downloadUrl && iconActionBtn('Download', <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>, () => window.open(doc.downloadUrl!, '_blank'), 'accent')}
            {!isHistory && (doc.downloadUrl ? <span style={{ width: 1, height: 16, background: theme.border, margin: '0 3px', flexShrink: 0 }} /> : null)}
            {!isHistory && iconActionBtn('Issue revision', <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 12v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M17 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>, () => { setReviseDoc(doc); setRevForm({ revision: '', notes: '', issueDate: '', fileId: '', filename: '', originatorName: '', checkerName: '', approverName: '', purposeOfIssue: '' }) })}
            {isAdmin && !isHistory && iconActionBtn('Delete', <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, () => void handleDelete(doc), 'danger')}
          </div>
        </div>

        {/* History revisions */}
        {isExpanded && doc.history.map(h => renderRow(h, true))}
      </React.Fragment>
    )
  }

  const openAdd = () => {
    setShowModal(true)
    setForm({ title: '', description: '', revision: '', scale: '', paperSize: '', issueDate: '', notes: '', fileId: '', filename: '', originatorName: '', checkerName: '', approverName: '', purposeOfIssue: '' })
  }

  // ── Sub-view tab SVG icons ─────────────────────────────────────────────
  const IconRegister = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="16" x2="12" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  )
  const IconReview = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )
  const IconDist = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )

  return (
    <div style={{ padding: '2px 0 20px' }}>

      {/* ── Sub-view switcher ── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, borderBottom: `1px solid ${theme.border}` }}>
        {([
          { key: 'register',     label: 'Register',     Icon: IconRegister },
          { key: 'review',       label: 'Review',       Icon: IconReview,  badge: allDocs.filter(d => d.openCommentCount > 0).length },
          { key: 'distribution', label: 'Distribution', Icon: IconDist },
        ] as const).map(tab => {
          const active = engView === tab.key
          const badge = 'badge' in tab ? tab.badge : 0
          return (
            <button key={tab.key} onClick={() => setEngView(tab.key)}
              style={{ padding: '9px 18px', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent', color: active ? theme.accent : theme.textSecondary, fontWeight: active ? 600 : 400, fontSize: 13, marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'color 0.1s', whiteSpace: 'nowrap' }}>
              <tab.Icon />
              {tab.label}
              {badge > 0 && <span style={{ padding: '0 5px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '16px', minWidth: 16, textAlign: 'center' }}>{badge}</span>}
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          REGISTER VIEW
      ══════════════════════════════════════════════════════════════════ */}
      {engView === 'register' && <>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>

        {/* Discipline chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {ENG_DISCIPLINES.map(d => {
            const count = d.key === 'overview' ? allDocs.length : allDocs.filter(x => x.discipline === d.key).length
            const active = discipline === d.key
            return (
              <button key={d.key} onClick={() => { setDiscipline(d.key); if (d.key === 'overview') setDocType('all') }}
                style={{
                  padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.1s',
                  background: active ? theme.accent : 'transparent',
                  color: active ? '#fff' : theme.textSecondary,
                  border: active ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`,
                }}>
                {d.label}
                {count > 0 && (
                  <span style={{ padding: '0 5px', borderRadius: 999, background: active ? 'rgba(255,255,255,0.25)' : theme.bgSurface, color: active ? '#fff' : theme.textMuted, fontSize: 10, fontWeight: 700, lineHeight: '16px', minWidth: 16, textAlign: 'center' }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…"
            style={{ padding: '7px 12px 7px 32px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, width: 210, outline: 'none' }} />
        </div>

        {/* Add button */}
        <button onClick={openAdd}
          style={{ padding: '7px 18px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          Add Document
        </button>
      </div>

      {/* ── Doc-type sub-tabs (hidden for Overview) ── */}
      {discipline !== 'overview' && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
          {ENG_DOC_TYPES.map(t => {
            const cnt = t.key === 'all'
              ? allDocs.filter(x => x.discipline === discipline).length
              : allDocs.filter(x => x.discipline === discipline && x.docType === t.key).length
            const active = docType === t.key
            return (
              <button key={t.key} onClick={() => setDocType(t.key)}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent',
                  color: active ? theme.accent : theme.textSecondary,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginBottom: -1, transition: 'color 0.1s',
                }}>
                {t.label}
                {cnt > 0 && <span style={{ fontSize: 11, color: active ? theme.accent : theme.textMuted, fontWeight: 700 }}>{cnt}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Document list ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60, color: theme.textMuted, fontSize: 14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke={theme.border} strokeWidth="3"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke={theme.accent} strokeWidth="3" strokeLinecap="round"/>
          </svg>
          Loading documents…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ border: `2px dashed ${theme.border}`, borderRadius: 16, padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>
            {search || discipline !== 'overview' || docType !== 'all' ? 'No matching documents' : 'No engineering documents yet'}
          </div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
            {search || discipline !== 'overview' || docType !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Add calculations, drawings, datasheets, and specifications organised by discipline.'}
          </div>
          {!search && discipline === 'overview' && docType === 'all' && (
            <button onClick={openAdd} style={{ padding: '8px 20px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Add First Document
            </button>
          )}
        </div>
      ) : (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 16, padding: '10px 20px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
            {['', 'Document', 'Revision', 'Status', 'Actions'].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i === 4 ? 'right' : 'left' as const }}>{h}</div>
            ))}
          </div>
          {filtered.map(doc => renderRow(doc, false))}
        </div>
      )}

      </> /* end register view */}

      {/* ══════════════════════════════════════════════════════════════════
          REVIEW VIEW
      ══════════════════════════════════════════════════════════════════ */}
      {engView === 'review' && (
        <div style={{ display: 'grid', gridTemplateColumns: reviewDocId ? '340px 1fr' : '1fr', gap: 16 }}>

          {/* ── Document list panel ── */}
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
            <div style={{ padding: '12px 16px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Documents</span>
              <span style={{ fontSize: 11, color: theme.textMuted }}>{allDocs.length} total</span>
            </div>
            {allDocs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: theme.textMuted, fontSize: 13 }}>No documents yet</div>
            ) : allDocs.map(doc => {
              const isSelected = reviewDocId === doc.id
              const st = ENG_DOC_STATUSES[doc.status] ?? ENG_DOC_STATUSES['draft']!
              return (
                <button key={doc.id} onClick={() => { setReviewDocId(doc.id); setShowCommentForm(false); setRespondingTo(null) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: isSelected ? theme.accentBg : 'transparent', borderBottom: `1px solid ${theme.border}`, border: 'none', borderLeft: isSelected ? `3px solid ${theme.accent}` : '3px solid transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: isSelected ? theme.accent : theme.textMuted, marginBottom: 2 }}>{doc.refNumber}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 999, background: st.bg, fontSize: 10, fontWeight: 600, color: st.text }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />{st.label}
                      </span>
                      {doc.openCommentCount > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', fontSize: 10, fontWeight: 700 }}>
                          {doc.openCommentCount} open
                        </span>
                      )}
                      {doc.openCommentCount === 0 && doc.commentCount > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: 999, background: '#f0fdf4', color: '#15803d', fontSize: 10, fontWeight: 700 }}>
                          {doc.commentCount} resolved
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── Comment thread panel ── */}
          {reviewDocId && reviewDoc && (
            <div>
              {/* Thread header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '14px 20px', background: theme.bgSurface, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: theme.accent, marginBottom: 2 }}>{reviewDoc.refNumber}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.textPrimary }}>{reviewDoc.title}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                    Rev {reviewDoc.revision ?? '—'}
                    {reviewDoc.originatorName && ` · Orig: ${reviewDoc.originatorName}`}
                    {reviewDoc.checkerName && ` · Checker: ${reviewDoc.checkerName}`}
                  </div>
                </div>
                <button onClick={() => setShowCommentForm(v => !v)}
                  style={{ padding: '7px 16px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  Add Comment
                </button>
              </div>

              {/* Add comment form */}
              {showCommentForm && (
                <div style={{ marginBottom: 16, padding: 16, borderRadius: 12, border: `1px solid ${theme.accent}40`, background: theme.accentBg }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.accent, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Review Comment</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      {lbl('Category', true)}
                      <select value={commentForm.category} onChange={e => setCommentForm(f => ({...f, category: e.target.value as 'major'|'minor'|'info'}))}
                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 7, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                        <option value="major">Major — Must resolve before approval</option>
                        <option value="minor">Minor — Noted, address if possible</option>
                        <option value="info">Info — For reference only</option>
                      </select>
                    </div>
                    <div>
                      {lbl('Location Reference')}
                      {inp(commentForm.locationRef, v => setCommentForm(f => ({...f, locationRef: v})), 'e.g. Sheet 3, Clause 4.2')}
                    </div>
                  </div>
                  {lbl('Comment Text', true)}
                  <textarea value={commentForm.commentText} onChange={e => setCommentForm(f => ({...f, commentText: e.target.value}))} placeholder="Describe the issue clearly…"
                    style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 80, resize: 'vertical', boxSizing: 'border-box' as const, outline: 'none', marginBottom: 12 }} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowCommentForm(false); setCommentForm({ locationRef: '', commentText: '', category: 'minor' }) }}
                      style={{ padding: '7px 16px', borderRadius: 7, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    <button disabled={!commentForm.commentText} onClick={() => void handleAddComment()}
                      style={{ padding: '7px 18px', borderRadius: 7, background: commentForm.commentText ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: commentForm.commentText ? 'pointer' : 'not-allowed' }}>Submit Comment</button>
                  </div>
                </div>
              )}

              {/* Comment list */}
              {comments.length === 0 ? (
                <div style={{ padding: '48px 32px', textAlign: 'center', border: `2px dashed ${theme.border}`, borderRadius: 12 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, margin: '0 auto 12px', display: 'block' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary, marginBottom: 4 }}>No comments yet</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>Click "Add Comment" to start the review thread</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {comments.map((c, idx) => {
                    const catMeta = DOC_CATEGORY_META[c.category] ?? DOC_CATEGORY_META['minor']!
                    const resMeta = c.resolution ? (DOC_RESOLUTION_META[c.resolution] ?? null) : null
                    const isResponding = respondingTo === c.id
                    const hasResponse  = !!c.responseText
                    return (
                      <div key={c.id} style={{ borderRadius: 10, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                        {/* Comment header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: theme.accent, color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 5, background: catMeta.bg, color: catMeta.color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{catMeta.label}</span>
                          {c.locationRef && <span style={{ fontSize: 11, color: theme.textMuted }}>@ {c.locationRef}</span>}
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.textMuted }}>{c.reviewerName ?? 'Reviewer'} · {new Date(c.createdAt).toLocaleDateString()}</span>
                          {isAdmin && !hasResponse && (
                            <button onClick={() => void handleDeleteComment(c.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 2, display: 'inline-flex' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          )}
                        </div>
                        {/* Comment body */}
                        <div style={{ padding: '12px 14px', fontSize: 13, color: theme.textPrimary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.commentText}</div>

                        {/* Response */}
                        {hasResponse && (
                          <div style={{ padding: '10px 14px', background: '#f0fdf4', borderTop: `1px solid #bbf7d0` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>Response</span>
                              {resMeta && <span style={{ padding: '1px 7px', borderRadius: 999, background: resMeta.bg, color: resMeta.color, fontSize: 10, fontWeight: 700 }}>{resMeta.label}</span>}
                              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#15803d' }}>{c.responseName ?? ''}{c.responseDate ? ` · ${new Date(c.responseDate).toLocaleDateString()}` : ''}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.5 }}>{c.responseText}</div>
                          </div>
                        )}

                        {/* Respond form */}
                        {!hasResponse && (
                          <div style={{ borderTop: `1px solid ${theme.border}`, padding: '8px 14px' }}>
                            {isResponding ? (
                              <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 8 }}>
                                  <textarea value={responseForm.responseText} onChange={e => setResponseForm(f => ({...f, responseText: e.target.value}))} placeholder="Enter response to this comment…"
                                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 7, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 60, resize: 'vertical', boxSizing: 'border-box' as const, outline: 'none' }} />
                                  <select value={responseForm.resolution} onChange={e => setResponseForm(f => ({...f, resolution: e.target.value}))}
                                    style={{ padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 7, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 12, height: 'fit-content', alignSelf: 'flex-start' }}>
                                    <option value="accepted">Accepted</option>
                                    <option value="partial">Partial</option>
                                    <option value="rejected">Rejected</option>
                                    <option value="withdrawn">Withdrawn</option>
                                  </select>
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                  <button onClick={() => { setRespondingTo(null); setResponseForm({ responseText: '', resolution: 'accepted' }) }}
                                    style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                                  <button disabled={!responseForm.responseText} onClick={() => void handleRespond(c.id)}
                                    style={{ padding: '5px 14px', borderRadius: 6, background: responseForm.responseText ? '#15803d' : theme.border, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: responseForm.responseText ? 'pointer' : 'not-allowed' }}>Submit Response</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setRespondingTo(c.id); setResponseForm({ responseText: '', resolution: 'accepted' }) }}
                                style={{ fontSize: 12, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: 600 }}>
                                ↩ Respond to this comment
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Placeholder when no doc selected */}
          {!reviewDocId && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', color: theme.textMuted, textAlign: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16, opacity: 0.4 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Select a document</div>
              <div style={{ fontSize: 12 }}>Choose a document from the list to view and add review comments</div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DISTRIBUTION VIEW
      ══════════════════════════════════════════════════════════════════ */}
      {engView === 'distribution' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.textPrimary }}>Document Distribution Matrix</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>Defines who receives which document types at each status milestone</div>
            </div>
            {isAdmin && (
              <button onClick={() => { setEditDDM(null); setDDMForm(emptyDDM); setShowDDMModal(true) }}
                style={{ padding: '8px 18px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                Add Entry
              </button>
            )}
          </div>

          {ddmEntries.length === 0 ? (
            <div style={{ border: `2px dashed ${theme.border}`, borderRadius: 16, padding: '64px 32px', textAlign: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, margin: '0 auto 14px', display: 'block' }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>No distribution entries</div>
              <div style={{ fontSize: 12, color: theme.textMuted, maxWidth: 400, margin: '0 auto 20px' }}>
                Configure which companies receive which documents at each status milestone (IFA, IFR, IFC, etc.).
              </div>
              {isAdmin && (
                <button onClick={() => { setEditDDM(null); setDDMForm(emptyDDM); setShowDDMModal(true) }}
                  style={{ padding: '8px 20px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Add First Entry
                </button>
              )}
            </div>
          ) : (
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {['Company', 'Contact', 'Discipline', 'Doc Type', 'Status Trigger', 'Copies', 'Format', 'Auto', 'Actions'].map((h, i) => (
                        <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ddmEntries.map((e, idx) => {
                      const stMeta = ENG_DOC_STATUSES[e.statusTrigger] ?? ENG_DOC_STATUSES['draft']!
                      return (
                        <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}`, background: idx % 2 === 0 ? 'transparent' : theme.bgSurface }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: theme.textPrimary }}>{e.companyName}</td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>
                            <div>{e.contactName ?? '—'}</div>
                            {e.contactEmail && <div style={{ fontSize: 11, color: theme.textMuted }}>{e.contactEmail}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{e.discipline ?? <span style={{ color: theme.textMuted }}>All</span>}</td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{e.docType ?? <span style={{ color: theme.textMuted }}>All</span>}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: stMeta.bg, color: stMeta.text, fontSize: 11, fontWeight: 700 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: stMeta.dot }} />{stMeta.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{e.copies}</td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{e.format}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {e.autoTransmit
                              ? <span style={{ padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#15803d', fontSize: 10, fontWeight: 700 }}>Auto</span>
                              : <span style={{ color: theme.textMuted, fontSize: 12 }}>Manual</span>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {isAdmin && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => { setEditDDM(e); setDDMForm({ companyName: e.companyName, contactName: e.contactName ?? '', contactEmail: e.contactEmail ?? '', discipline: e.discipline ?? '', docType: e.docType ?? '', statusTrigger: e.statusTrigger, copies: e.copies, format: e.format as DDMEntry['format'], autoTransmit: e.autoTransmit, notes: e.notes ?? '' }); setShowDDMModal(true) }}
                                  style={{ padding: '4px 10px', borderRadius: 6, background: theme.bgSurface, border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 11, cursor: 'pointer' }}>Edit</button>
                                <button onClick={() => void handleDeleteDDM(e.id)}
                                  style={{ padding: '4px 10px', borderRadius: 6, background: '#fff1f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Shared Modals ─────────────────────────────────────────────────── */}

      {/* Add Document Modal */}
      {showModal && (
        <Modal open={true} size="lg" title="Add Engineering Document" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: theme.accentBg, border: `1px solid ${theme.accent}40`, fontSize: 12 }}>
              <span style={{ color: theme.textMuted }}>Reference will be assigned as: </span>
              <strong style={{ fontFamily: 'monospace', color: theme.accent }}>
                {projectCode}-{activeDisciplineCode ?? 'OTH'}-{TYPE_CODE_MAP[docType] ?? 'OTH'}-####
              </strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                {lbl('Discipline', true)}
                <select value={discipline === 'overview' ? 'others' : discipline}
                  onChange={e => setDiscipline(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  {ENG_DISCIPLINES.filter(d => d.key !== 'overview').map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Document Type', true)}
                <select value={docType === 'all' ? 'other' : docType}
                  onChange={e => setDocType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  {ENG_DOC_TYPES.filter(t => t.key !== 'all').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Title', true)}
                {inp(form.title, v => setForm(f => ({...f, title: v})), 'Document title')}
              </div>
              <div>
                {lbl('Revision')}
                {inp(form.revision, v => setForm(f => ({...f, revision: v})), 'e.g. A, 0, P1')}
              </div>
              <div>
                {lbl('Issue Date')}
                {inp(form.issueDate, v => setForm(f => ({...f, issueDate: v})), '', 'date')}
              </div>
              <div>
                {lbl('Purpose of Issue')}
                <select value={form.purposeOfIssue} onChange={e => setForm(f => ({...f, purposeOfIssue: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  <option value="">— None —</option>
                  {Object.entries(ENG_PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Originator')}
                {inp(form.originatorName, v => setForm(f => ({...f, originatorName: v})), 'Name or company')}
              </div>
              <div>
                {lbl('Checker')}
                {inp(form.checkerName, v => setForm(f => ({...f, checkerName: v})), 'Name or company')}
              </div>
              <div>
                {lbl('Approver')}
                {inp(form.approverName, v => setForm(f => ({...f, approverName: v})), 'Name or company')}
              </div>
              {(docType === 'drawing' || docType === 'all') && (
                <>
                  <div>
                    {lbl('Scale')}
                    {inp(form.scale, v => setForm(f => ({...f, scale: v})), '1:100')}
                  </div>
                  <div>
                    {lbl('Paper Size')}
                    <select value={form.paperSize} onChange={e => setForm(f => ({...f, paperSize: e.target.value}))}
                      style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                      <option value="">— Select —</option>
                      {['A0','A1','A2','A3','A4','Letter','Tabloid','Custom'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Description')}
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Optional description…"
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 60, resize: 'vertical', boxSizing: 'border-box' as const, outline: 'none' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Notes')}
                {inp(form.notes, v => setForm(f => ({...f, notes: v})), 'Optional notes')}
              </div>
            </div>
            <div>
              {lbl('File')}
              <div onClick={() => { if (!uploading) void pickFile((fid, fn) => setForm(f => ({...f, fileId: fid, filename: fn}))) }}
                style={{ border: `2px dashed ${form.fileId ? theme.accent : theme.border}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: form.fileId ? theme.accentBg : 'transparent', transition: 'all 0.15s' }}>
                {uploading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: theme.textMuted, fontSize: 13 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}><circle cx="12" cy="12" r="10" stroke={theme.border} strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke={theme.accent} strokeWidth="3" strokeLinecap="round"/></svg>
                    Uploading…
                  </div>
                ) : form.fileId ? (
                  <div>
                    <div style={{ fontSize: 22, marginBottom: 4, color: '#22c55e' }}>✓</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.accent }}>{form.filename}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Click to replace</div>
                  </div>
                ) : (
                  <div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, margin: '0 auto 8px', display: 'block' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    <div style={{ color: theme.textSecondary, fontSize: 13 }}>Click to browse or drop a file</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>PDF, DWG, DXF, PNG, JPG, DOC, XLS</div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!form.title || uploading} onClick={() => void handleCreate()}
                style={{ padding: '8px 22px', borderRadius: 8, background: form.title && !uploading ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: form.title && !uploading ? 'pointer' : 'not-allowed' }}>Add Document</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Issue Revision Modal */}
      {reviseDoc && (
        <Modal open={true} title={`Issue Revision — ${reviseDoc.refNumber}`} onClose={() => setReviseDoc(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: theme.bgSurface, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textSecondary }}>
              Current: <strong style={{ color: theme.textPrimary }}>{reviseDoc.title}</strong>
              {reviseDoc.revision && <span style={{ marginLeft: 8, color: theme.textMuted }}>Rev {reviseDoc.revision}</span>}
              <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 500 }}>→ will be superseded</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>{lbl('New Revision', true)}{inp(revForm.revision, v => setRevForm(f => ({...f, revision: v})), 'e.g. B, 1, P2')}</div>
              <div>{lbl('Issue Date')}{inp(revForm.issueDate, v => setRevForm(f => ({...f, issueDate: v})), '', 'date')}</div>
              <div>
                {lbl('Purpose of Issue')}
                <select value={revForm.purposeOfIssue} onChange={e => setRevForm(f => ({...f, purposeOfIssue: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  <option value="">— None —</option>
                  {Object.entries(ENG_PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>{lbl('Originator')}{inp(revForm.originatorName, v => setRevForm(f => ({...f, originatorName: v})), 'Originator name')}</div>
              <div>{lbl('Checker')}{inp(revForm.checkerName, v => setRevForm(f => ({...f, checkerName: v})), 'Checker name')}</div>
              <div>{lbl('Approver')}{inp(revForm.approverName, v => setRevForm(f => ({...f, approverName: v})), 'Approver name')}</div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Change Notes')}
                <textarea value={revForm.notes} onChange={e => setRevForm(f => ({...f, notes: e.target.value}))} placeholder="What changed in this revision?"
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 72, resize: 'vertical', boxSizing: 'border-box' as const, outline: 'none' }} />
              </div>
            </div>
            <div>
              {lbl('Revised File')}
              <div onClick={() => { if (!uploading) void pickFile((fid, fn) => setRevForm(f => ({...f, fileId: fid, filename: fn}))) }}
                style={{ border: `2px dashed ${revForm.fileId ? theme.accent : theme.border}`, borderRadius: 10, padding: '16px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: revForm.fileId ? theme.accentBg : 'transparent' }}>
                {uploading ? <div style={{ color: theme.textMuted, fontSize: 13 }}>Uploading…</div>
                  : revForm.fileId ? <div style={{ fontSize: 13, fontWeight: 600, color: theme.accent }}>✓ {revForm.filename} <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 400 }}>— click to replace</span></div>
                  : <div style={{ color: theme.textSecondary, fontSize: 13 }}>Click to attach revised file <span style={{ color: theme.textMuted }}>(optional)</span></div>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => setReviseDoc(null)}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!revForm.revision || uploading} onClick={() => void handleRevise()}
                style={{ padding: '8px 22px', borderRadius: 8, background: revForm.revision && !uploading ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: revForm.revision && !uploading ? 'pointer' : 'not-allowed' }}>Issue Revision</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Distribution Entry Modal */}
      {showDDMModal && (
        <Modal open={true} title={editDDM ? 'Edit Distribution Entry' : 'Add Distribution Entry'} onClose={() => { setShowDDMModal(false); setEditDDM(null); setDDMForm(emptyDDM) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Company / Recipient', true)}
                {inp(ddmForm.companyName, v => setDDMForm(f => ({...f, companyName: v})), 'e.g. Client, EPC Contractor, Subcontractor')}
              </div>
              <div>{lbl('Contact Name')}{inp(ddmForm.contactName, v => setDDMForm(f => ({...f, contactName: v})), 'Full name')}</div>
              <div>{lbl('Email')}{inp(ddmForm.contactEmail, v => setDDMForm(f => ({...f, contactEmail: v})), 'email@example.com', 'email')}</div>
              <div>
                {lbl('Discipline (blank = all)')}
                <select value={ddmForm.discipline} onChange={e => setDDMForm(f => ({...f, discipline: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  <option value="">All Disciplines</option>
                  {ENG_DISCIPLINES.filter(d => d.key !== 'overview').map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Doc Type (blank = all)')}
                <select value={ddmForm.docType} onChange={e => setDDMForm(f => ({...f, docType: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  <option value="">All Types</option>
                  {ENG_DOC_TYPES.filter(t => t.key !== 'all').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                {lbl('Status Trigger', true)}
                <select value={ddmForm.statusTrigger} onChange={e => setDDMForm(f => ({...f, statusTrigger: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  {Object.entries(ENG_DOC_STATUSES).filter(([k]) => !['preliminary','for_review','for_construction','superseded','cancelled'].includes(k)).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                {lbl('Format')}
                <select value={ddmForm.format} onChange={e => setDDMForm(f => ({...f, format: e.target.value as DDMEntry['format']}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  {(['PDF','DWG','Native','Hard Copy'] as const).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                {lbl('Copies')}
                <input type="number" min={1} value={ddmForm.copies} onChange={e => setDDMForm(f => ({...f, copies: parseInt(e.target.value) || 1}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="autoTransmit" checked={ddmForm.autoTransmit} onChange={e => setDDMForm(f => ({...f, autoTransmit: e.target.checked}))}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="autoTransmit" style={{ fontSize: 13, color: theme.textPrimary, cursor: 'pointer' }}>
                  Auto-generate transmittal when document reaches this status
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Notes')}
                {inp(ddmForm.notes, v => setDDMForm(f => ({...f, notes: v})), 'Optional notes')}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => { setShowDDMModal(false); setEditDDM(null); setDDMForm(emptyDDM) }}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!ddmForm.companyName} onClick={() => void handleSaveDDM()}
                style={{ padding: '8px 22px', borderRadius: 8, background: ddmForm.companyName ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: ddmForm.companyName ? 'pointer' : 'not-allowed' }}>
                {editDDM ? 'Update Entry' : 'Add Entry'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSMITTALS TAB — Phase 2 of PRODOM Document Control
// Outgoing: issue document packages to recipients (Draft → Sent → Acknowledged)
// Incoming: log documents received from client/subcontractor (Received → Acknowledged)
// ══════════════════════════════════════════════════════════════════════════════

interface EngTransmittalItem {
  id: string; transmittalId: string; documentId: string | null
  extRefNumber: string | null; extTitle: string | null
  revision: string | null; copies: number; format: string
  purposeOfIssue: string | null; remarks: string | null; createdAt: string
  refNumber: string | null; title: string | null; discipline: string | null; docType: string | null; downloadUrl: string | null
}
interface EngTransmittal {
  id: string; projectId: string; transmittalNo: string; direction: string; title: string; subject: string | null
  toCompany: string; toContact: string | null; toEmail: string | null
  fromCompany: string | null; fromContact: string | null
  status: string; sentDate: string | null; receivedDate: string | null
  acknowledgedAt: string | null; acknowledgedBy: string | null
  dueDate: string | null; notes: string | null
  createdByName: string | null; createdAt: string
  items: EngTransmittalItem[]; itemCount: number; isOverdue: boolean
}

const TR_STATUS: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  draft:        { label: 'Draft',        dot: '#94a3b8', text: '#475569', bg: '#f1f5f9' },
  sent:         { label: 'Sent',         dot: '#3b82f6', text: '#1d4ed8', bg: '#eff6ff' },
  received:     { label: 'Received',     dot: '#a78bfa', text: '#5b21b6', bg: '#ede9fe' },
  acknowledged: { label: 'Acknowledged', dot: '#22c55e', text: '#15803d', bg: '#f0fdf4' },
}

const TR_PURPOSES = ['IFA','IFR','IFI','IFC','AFC','For Record','For Information'] as const

function TransmittalsTab({ projectId, projectCode, theme, isAdmin }: {
  projectId: string; projectCode: string
  theme: ReturnType<typeof useTheme>['theme']; isAdmin?: boolean
}) {
  const addToast = useToastStore((s) => s.addToast)

  const [dirFilter, setDirFilter]     = React.useState<'all' | 'outgoing' | 'incoming'>('all')
  const [expandedId, setExpandedId]   = React.useState<string | null>(null)
  const [showModal, setShowModal]     = React.useState(false)
  const [editTr, setEditTr]           = React.useState<EngTransmittal | null>(null)
  const [showPrint, setShowPrint]     = React.useState<EngTransmittal | null>(null)
  const [ackModal, setAckModal]       = React.useState<EngTransmittal | null>(null)
  const [ackBy, setAckBy]             = React.useState('')
  const [addItemTr, setAddItemTr]     = React.useState<EngTransmittal | null>(null)

  const emptyForm = {
    direction: 'outgoing' as 'outgoing' | 'incoming',
    title: '', subject: '',
    toCompany: '', toContact: '', toEmail: '',
    fromCompany: '', fromContact: '',
    dueDate: '', notes: '',
    items: [] as { documentId: string; extRefNumber: string; extTitle: string; revision: string; copies: number; format: string; purposeOfIssue: string; remarks: string }[],
  }
  const [form, setForm] = React.useState(emptyForm)
  const emptyItemForm = { documentId: '', extRefNumber: '', extTitle: '', revision: '', copies: 1, format: 'PDF', purposeOfIssue: '', remarks: '' }
  const [itemForm, setItemForm] = React.useState(emptyItemForm)

  // queries
  const { data, loading, refetch } = useQuery(ENG_TRANSMITTALS_QUERY, {
    variables: { projectId, direction: dirFilter === 'all' ? undefined : dirFilter },
    skip: !projectId, fetchPolicy: 'cache-and-network',
  })
  const { data: docsData } = useQuery(ENG_DOCS_QUERY, {
    variables: { projectId }, skip: !projectId, fetchPolicy: 'cache-first',
  })

  const transmittals: EngTransmittal[] = data?.engTransmittals ?? []
  const allDocs: EngDoc[]              = docsData?.engineeringDocuments ?? []

  // mutations
  const [createTr]      = useMutation(CREATE_ENG_TRANSMITTAL)
  const [updateTr]      = useMutation(UPDATE_ENG_TRANSMITTAL)
  const [issueTr]       = useMutation(ISSUE_ENG_TRANSMITTAL)
  const [receivedTr]    = useMutation(MARK_ENG_TRANSMITTAL_RECEIVED)
  const [ackTr]         = useMutation(ACKNOWLEDGE_ENG_TRANSMITTAL)
  const [deleteTr]      = useMutation(DELETE_ENG_TRANSMITTAL)
  const [addItem]       = useMutation(ADD_ENG_TRANSMITTAL_ITEM)
  const [removeItem]    = useMutation(REMOVE_ENG_TRANSMITTAL_ITEM)

  // kpi
  const draft        = transmittals.filter(t => t.status === 'draft').length
  const sent         = transmittals.filter(t => t.status === 'sent').length
  const received     = transmittals.filter(t => t.status === 'received').length
  const acknowledged = transmittals.filter(t => t.status === 'acknowledged').length
  const overdue      = transmittals.filter(t => t.isOverdue).length

  const handleCreate = async () => {
    if (!form.title || !form.toCompany) { addToast({ type: 'error', message: 'Title and recipient are required' }); return }
    try {
      const items = form.items.map(it => ({
        documentId: it.documentId || null,
        extRefNumber: it.extRefNumber || null, extTitle: it.extTitle || null,
        revision: it.revision || null, copies: it.copies, format: it.format,
        purposeOfIssue: it.purposeOfIssue || null, remarks: it.remarks || null,
      }))
      if (editTr) {
        await updateTr({ variables: { id: editTr.id, title: form.title, subject: form.subject || null, toCompany: form.toCompany, toContact: form.toContact || null, toEmail: form.toEmail || null, fromCompany: form.fromCompany || null, fromContact: form.fromContact || null, dueDate: form.dueDate || null, notes: form.notes || null }})
        addToast({ type: 'success', message: 'Transmittal updated' })
      } else {
        await createTr({ variables: { projectId, direction: form.direction, title: form.title, subject: form.subject || null, toCompany: form.toCompany, toContact: form.toContact || null, toEmail: form.toEmail || null, fromCompany: form.fromCompany || null, fromContact: form.fromContact || null, dueDate: form.dueDate || null, notes: form.notes || null, items: items.length ? items : undefined }})
        addToast({ type: 'success', message: 'Transmittal created' })
      }
      setShowModal(false); setEditTr(null); setForm(emptyForm); void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleIssue = async (tr: EngTransmittal) => {
    if (tr.itemCount === 0) { addToast({ type: 'error', message: 'Add documents before issuing' }); return }
    if (!window.confirm(`Issue ${tr.transmittalNo}? Status will change to Sent.`)) return
    try { await issueTr({ variables: { id: tr.id }}); void refetch(); addToast({ type: 'success', message: 'Transmittal issued' }) }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleMarkReceived = async (tr: EngTransmittal) => {
    try { await receivedTr({ variables: { id: tr.id }}); void refetch(); addToast({ type: 'success', message: 'Marked as received' }) }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleAcknowledge = async () => {
    if (!ackModal) return
    try { await ackTr({ variables: { id: ackModal.id, acknowledgedBy: ackBy || null }}); void refetch(); setAckModal(null); setAckBy(''); addToast({ type: 'success', message: 'Transmittal acknowledged' }) }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleDelete = async (tr: EngTransmittal) => {
    if (!window.confirm(`Delete ${tr.transmittalNo}?`)) return
    try { await deleteTr({ variables: { id: tr.id }}); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleAddItem = async () => {
    if (!addItemTr) return
    const hasDoc = !!itemForm.documentId
    const hasExt = !!itemForm.extTitle
    if (!hasDoc && !hasExt) { addToast({ type: 'error', message: 'Select a document or enter an external reference' }); return }
    try {
      await addItem({ variables: { transmittalId: addItemTr.id, documentId: itemForm.documentId || null, extRefNumber: itemForm.extRefNumber || null, extTitle: itemForm.extTitle || null, revision: itemForm.revision || null, copies: itemForm.copies, format: itemForm.format, purposeOfIssue: itemForm.purposeOfIssue || null, remarks: itemForm.remarks || null }})
      addToast({ type: 'success', message: 'Document added' }); setAddItemTr(null); setItemForm(emptyItemForm); void refetch()
    } catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const handleRemoveItem = async (item: EngTransmittalItem) => {
    if (!window.confirm(`Remove ${item.refNumber ?? item.extRefNumber ?? item.extTitle} from transmittal?`)) return
    try { await removeItem({ variables: { id: item.id }}); void refetch() }
    catch (e: unknown) { addToast({ type: 'error', message: (e as Error).message }) }
  }

  const inp = (value: string, onChange: (v: string) => void, placeholder?: string, type = 'text') => (
    <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }} />
  )
  const lbl = (t: string, req = false) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
      {t}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
  )

  const statusPill = (s: string) => {
    const cfg = TR_STATUS[s] ?? TR_STATUS['draft']!
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: cfg.bg, fontSize: 11, fontWeight: 600, color: cfg.text, whiteSpace: 'nowrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
        {cfg.label}
      </span>
    )
  }

  return (
    <div style={{ padding: '2px 0 20px' }}>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Draft',        value: draft,        color: '#94a3b8', bg: '#f1f5f9' },
          { label: 'Sent',         value: sent,         color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Received',     value: received,     color: '#5b21b6', bg: '#ede9fe' },
          { label: 'Acknowledged', value: acknowledged, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Overdue',      value: overdue,      color: '#dc2626', bg: '#fee2e2' },
        ].map(k => (
          <div key={k.label} style={{ padding: '10px 18px', borderRadius: 10, background: k.bg, border: `1px solid ${k.color}20`, textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Direction filter */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {(['all','outgoing','incoming'] as const).map(d => (
            <button key={d} onClick={() => setDirFilter(d)}
              style={{ padding: '7px 14px', background: dirFilter === d ? theme.accent : theme.bgCanvas, color: dirFilter === d ? '#fff' : theme.textSecondary, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: dirFilter === d ? 600 : 400, borderRight: d !== 'incoming' ? `1px solid ${theme.border}` : 'none' }}>
              {d === 'all' ? 'All' : d === 'outgoing' ? '↑ Outgoing' : '↓ Incoming'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setEditTr(null); setForm(emptyForm); setShowModal(true) }}
          style={{ padding: '8px 18px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          New Transmittal
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60, color: theme.textMuted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}><circle cx="12" cy="12" r="10" stroke={theme.border} strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke={theme.accent} strokeWidth="3" strokeLinecap="round"/></svg>
          Loading…
        </div>
      ) : transmittals.length === 0 ? (
        <div style={{ border: `2px dashed ${theme.border}`, borderRadius: 16, padding: '64px 32px', textAlign: 'center' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, margin: '0 auto 16px', display: 'block' }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.23h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 6.06 6.06l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, marginBottom: 6 }}>No transmittals yet</div>
          <div style={{ fontSize: 13, color: theme.textMuted, maxWidth: 380, margin: '0 auto 24px' }}>
            Create outgoing transmittals to formally issue documents, or log incoming transmittals from clients and subcontractors.
          </div>
          <button onClick={() => { setEditTr(null); setForm(emptyForm); setShowModal(true) }}
            style={{ padding: '8px 20px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Create First Transmittal
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {transmittals.map(tr => {
            const isExpanded = expandedId === tr.id
            const stCfg = TR_STATUS[tr.status] ?? TR_STATUS['draft']!
            return (
              <div key={tr.id} style={{ border: `1px solid ${tr.isOverdue ? '#fca5a5' : theme.border}`, borderRadius: 12, overflow: 'hidden', background: tr.isOverdue ? '#fff5f5' : theme.bgCanvas }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : tr.id)}>
                  {/* Direction badge */}
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: tr.direction === 'outgoing' ? '#eff6ff' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {tr.direction === 'outgoing'
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#15803d" strokeWidth="2" strokeLinecap="round"/></svg>
                    }
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: theme.accent, background: theme.accentBg, padding: '1px 7px', borderRadius: 4 }}>{tr.transmittalNo}</span>
                      {tr.isOverdue && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#fee2e2', color: '#dc2626' }}>OVERDUE</span>}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr.title}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {tr.direction === 'outgoing' ? `To: ${tr.toCompany}` : `From: ${tr.fromCompany ?? tr.toCompany}`}
                      {tr.dueDate && ` · Due: ${tr.dueDate}`}
                      {' · '}{tr.itemCount} doc{tr.itemCount !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Status + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {statusPill(tr.status)}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: theme.textMuted, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${theme.border}`, padding: '16px 18px', background: theme.bgSurface }}>
                    {/* Metadata grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 24px', marginBottom: 14 }}>
                      {[
                        { label: 'Direction',    value: tr.direction === 'outgoing' ? '↑ Outgoing' : '↓ Incoming' },
                        { label: 'To',           value: tr.toCompany + (tr.toContact ? ` — ${tr.toContact}` : '') },
                        { label: tr.direction === 'outgoing' ? 'Sent Date' : 'Received Date',
                          value: tr.sentDate ? new Date(tr.sentDate).toLocaleDateString() : tr.receivedDate ? new Date(tr.receivedDate).toLocaleDateString() : '—' },
                        { label: 'Acknowledged', value: tr.acknowledgedAt ? `${new Date(tr.acknowledgedAt).toLocaleDateString()}${tr.acknowledgedBy ? ` by ${tr.acknowledgedBy}` : ''}` : '—' },
                        { label: 'Due Date',     value: tr.dueDate ?? '—' },
                        { label: 'Created By',   value: tr.createdByName ?? '—' },
                      ].map(m => (
                        <div key={m.label}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{m.label}</div>
                          <div style={{ fontSize: 12, color: theme.textPrimary }}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    {tr.subject && <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 14, padding: '8px 12px', background: theme.bgCanvas, borderRadius: 7, border: `1px solid ${theme.border}` }}>{tr.subject}</div>}

                    {/* Items table */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Documents ({tr.items.length})</div>
                      {tr.items.length === 0 ? (
                        <div style={{ padding: '20px 16px', textAlign: 'center', border: `1px dashed ${theme.border}`, borderRadius: 8, fontSize: 12, color: theme.textMuted }}>
                          No documents attached yet
                        </div>
                      ) : (
                        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: theme.bgCanvas }}>
                                {['Ref #','Title','Rev','Purpose','Copies','Format',''].map((h, i) => (
                                  <th key={i} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tr.items.map((it, idx) => (
                                <tr key={it.id} style={{ borderBottom: idx < tr.items.length - 1 ? `1px solid ${theme.border}` : 'none', background: idx % 2 === 0 ? 'transparent' : theme.bgSurface }}>
                                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: theme.accent }}>
                                    {it.refNumber ?? it.extRefNumber ?? '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', color: theme.textPrimary, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {it.title ?? it.extTitle ?? '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', color: theme.textSecondary }}>{it.revision ?? '—'}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    {it.purposeOfIssue
                                      ? <span style={{ padding: '2px 7px', borderRadius: 4, background: theme.accentBg, color: theme.accent, fontSize: 10, fontWeight: 700 }}>{it.purposeOfIssue}</span>
                                      : <span style={{ color: theme.textMuted }}>—</span>}
                                  </td>
                                  <td style={{ padding: '8px 12px', color: theme.textSecondary, textAlign: 'center' }}>{it.copies}</td>
                                  <td style={{ padding: '8px 12px', color: theme.textSecondary }}>{it.format}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                                      {it.downloadUrl && (
                                        <button onClick={() => window.open(it.downloadUrl!, '_blank')}
                                          style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.accent, fontSize: 11, cursor: 'pointer' }}>↓</button>
                                      )}
                                      {tr.status === 'draft' && (
                                        <button onClick={() => void handleRemoveItem(it)}
                                          style={{ padding: '3px 8px', borderRadius: 5, background: '#fff1f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>✕</button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {tr.status === 'draft' && (
                        <>
                          <button onClick={() => { setEditTr(tr); setForm({ direction: tr.direction as 'outgoing'|'incoming', title: tr.title, subject: tr.subject??'', toCompany: tr.toCompany, toContact: tr.toContact??'', toEmail: tr.toEmail??'', fromCompany: tr.fromCompany??'', fromContact: tr.fromContact??'', dueDate: tr.dueDate??'', notes: tr.notes??'', items: [] }); setShowModal(true) }}
                            style={{ padding: '7px 14px', borderRadius: 7, background: theme.bgCanvas, border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => { setAddItemTr(tr); setItemForm(emptyItemForm) }}
                            style={{ padding: '7px 14px', borderRadius: 7, background: theme.bgCanvas, border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, cursor: 'pointer' }}>+ Add Document</button>
                          <button onClick={() => void handleIssue(tr)}
                            style={{ padding: '7px 16px', borderRadius: 7, background: '#1d4ed8', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            ↑ Issue Transmittal
                          </button>
                          <button onClick={() => void handleDelete(tr)}
                            style={{ padding: '7px 14px', borderRadius: 7, background: '#fff1f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>Delete</button>
                        </>
                      )}
                      {tr.status === 'sent' && (
                        <>
                          <button onClick={() => { setAddItemTr(tr); setItemForm(emptyItemForm) }}
                            style={{ padding: '7px 14px', borderRadius: 7, background: theme.bgCanvas, border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, cursor: 'pointer' }}>+ Add Document</button>
                          <button onClick={() => void handleMarkReceived(tr)}
                            style={{ padding: '7px 16px', borderRadius: 7, background: '#5b21b6', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark Received</button>
                          <button onClick={() => { setAckModal(tr); setAckBy('') }}
                            style={{ padding: '7px 16px', borderRadius: 7, background: '#15803d', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Acknowledge</button>
                        </>
                      )}
                      {tr.status === 'received' && (
                        <button onClick={() => { setAckModal(tr); setAckBy('') }}
                          style={{ padding: '7px 16px', borderRadius: 7, background: '#15803d', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Acknowledge</button>
                      )}
                      <button onClick={() => setShowPrint(tr)}
                        style={{ padding: '7px 14px', borderRadius: 7, background: theme.bgCanvas, border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>
                        🖨 Print Cover Sheet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <Modal open={true} size="lg" title={editTr ? `Edit ${editTr.transmittalNo}` : 'New Transmittal'} onClose={() => { setShowModal(false); setEditTr(null); setForm(emptyForm) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!editTr && (
              <div style={{ display: 'flex', gap: 0, borderRadius: 8, border: `1px solid ${theme.border}`, overflow: 'hidden', alignSelf: 'flex-start' }}>
                {(['outgoing','incoming'] as const).map(d => (
                  <button key={d} onClick={() => setForm(f => ({...f, direction: d}))}
                    style={{ padding: '8px 20px', background: form.direction === d ? theme.accent : theme.bgCanvas, color: form.direction === d ? '#fff' : theme.textSecondary, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: form.direction === d ? 600 : 400, borderRight: d === 'outgoing' ? `1px solid ${theme.border}` : 'none' }}>
                    {d === 'outgoing' ? '↑ Outgoing' : '↓ Incoming'}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: '8px 12px', borderRadius: 7, background: theme.bgSurface, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted }}>
              {form.direction === 'outgoing'
                ? 'Outgoing — issuing documents from your organization to an external recipient'
                : 'Incoming — logging documents received from a client or subcontractor'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Title', true)}
                {inp(form.title, v => setForm(f => ({...f, title: v})), 'e.g. Structural Drawings for Approval')}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Subject / Description')}
                <textarea value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Optional cover note or description…"
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, minHeight: 60, resize: 'vertical', boxSizing: 'border-box' as const, outline: 'none' }} />
              </div>
              <div>
                {lbl(form.direction === 'outgoing' ? 'To Company' : 'From Company', true)}
                {inp(form.toCompany, v => setForm(f => ({...f, toCompany: v})), 'Company name')}
              </div>
              <div>
                {lbl('Contact')}
                {inp(form.direction === 'outgoing' ? form.toContact : form.fromContact,
                  v => form.direction === 'outgoing' ? setForm(f => ({...f, toContact: v})) : setForm(f => ({...f, fromContact: v})),
                  'Contact name')}
              </div>
              <div>
                {lbl('Email')}
                {inp(form.toEmail, v => setForm(f => ({...f, toEmail: v})), 'contact@company.com', 'email')}
              </div>
              <div>
                {lbl('Due Date for Response')}
                {inp(form.dueDate, v => setForm(f => ({...f, dueDate: v})), '', 'date')}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {lbl('Notes')}
                {inp(form.notes, v => setForm(f => ({...f, notes: v})), 'Optional notes')}
              </div>
            </div>

            {!editTr && form.direction === 'outgoing' && allDocs.length > 0 && (
              <div>
                {lbl('Add Documents from Register')}
                <div style={{ maxHeight: 200, overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  {allDocs.map(doc => {
                    const selected = form.items.some(i => i.documentId === doc.id)
                    return (
                      <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', background: selected ? theme.accentBg : 'transparent' }}>
                        <input type="checkbox" checked={selected}
                          onChange={e => {
                            if (e.target.checked) {
                              setForm(f => ({ ...f, items: [...f.items, { documentId: doc.id, extRefNumber: '', extTitle: '', revision: doc.revision ?? '', copies: 1, format: 'PDF', purposeOfIssue: '', remarks: '' }] }))
                            } else {
                              setForm(f => ({ ...f, items: f.items.filter(i => i.documentId !== doc.id) }))
                            }
                          }}
                          style={{ flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: theme.accent, background: theme.accentBg, padding: '1px 6px', borderRadius: 3 }}>{doc.refNumber}</span>
                        <span style={{ fontSize: 12, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.textMuted, flexShrink: 0 }}>Rev {doc.revision ?? '—'}</span>
                      </label>
                    )
                  })}
                </div>
                {form.items.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: theme.accent, fontWeight: 600 }}>{form.items.length} document{form.items.length !== 1 ? 's' : ''} selected</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => { setShowModal(false); setEditTr(null); setForm(emptyForm) }}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button disabled={!form.title || !form.toCompany} onClick={() => void handleCreate()}
                style={{ padding: '8px 22px', borderRadius: 8, background: form.title && form.toCompany ? theme.accent : theme.border, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: form.title && form.toCompany ? 'pointer' : 'not-allowed' }}>
                {editTr ? 'Save Changes' : 'Create Transmittal'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Item Modal ── */}
      {addItemTr && (
        <Modal open={true} title={`Add Document — ${addItemTr.transmittalNo}`} onClose={() => { setAddItemTr(null); setItemForm(emptyItemForm) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '8px 12px', borderRadius: 7, background: theme.bgSurface, border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted }}>
              Select a document from the register, or enter an external reference manually.
            </div>
            <div>
              {lbl('Document from Register')}
              <select value={itemForm.documentId} onChange={e => {
                const doc = allDocs.find(d => d.id === e.target.value)
                setItemForm(f => ({ ...f, documentId: e.target.value, revision: doc?.revision ?? '' }))
              }}
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                <option value="">— Select document —</option>
                {allDocs.map(doc => <option key={doc.id} value={doc.id}>{doc.refNumber} — {doc.title} (Rev {doc.revision ?? '—'})</option>)}
              </select>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: theme.textMuted }}>— or enter manually —</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>{lbl('External Ref #')}{inp(itemForm.extRefNumber, v => setItemForm(f => ({...f, extRefNumber: v})), 'e.g. SUB-A-DRG-001')}</div>
              <div style={{ gridColumn: '1 / -1' }}>{lbl('External Title')}{inp(itemForm.extTitle, v => setItemForm(f => ({...f, extTitle: v})), 'Document title')}</div>
              <div>{lbl('Revision')}{inp(itemForm.revision, v => setItemForm(f => ({...f, revision: v})), 'e.g. A, 0')}</div>
              <div>
                {lbl('Purpose of Issue')}
                <select value={itemForm.purposeOfIssue} onChange={e => setItemForm(f => ({...f, purposeOfIssue: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  <option value="">— None —</option>
                  {TR_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                {lbl('Format')}
                <select value={itemForm.format} onChange={e => setItemForm(f => ({...f, format: e.target.value}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const }}>
                  {(['PDF','DWG','Native','Hard Copy'] as const).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                {lbl('Copies')}
                <input type="number" min={1} value={itemForm.copies} onChange={e => setItemForm(f => ({...f, copies: parseInt(e.target.value)||1}))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>{lbl('Remarks')}{inp(itemForm.remarks, v => setItemForm(f => ({...f, remarks: v})), 'Optional remarks')}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: `1px solid ${theme.border}`, marginTop: 4 }}>
              <button onClick={() => { setAddItemTr(null); setItemForm(emptyItemForm) }}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => void handleAddItem()}
                style={{ padding: '8px 22px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add Document</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Acknowledge Modal ── */}
      {ackModal && (
        <Modal open={true} title={`Acknowledge ${ackModal.transmittalNo}`} onClose={() => { setAckModal(null); setAckBy('') }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, color: '#15803d' }}>
              Acknowledging confirms receipt of all {ackModal.itemCount} document{ackModal.itemCount !== 1 ? 's' : ''} in this transmittal.
            </div>
            <div>
              {lbl('Acknowledged By')}
              <input value={ackBy} onChange={e => setAckBy(e.target.value)} placeholder="Name (optional)"
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCanvas, color: theme.textPrimary, fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setAckModal(null); setAckBy('') }}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => void handleAcknowledge()}
                style={{ padding: '8px 22px', borderRadius: 8, background: '#15803d', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Confirm Acknowledgement</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Print Cover Sheet ── */}
      {showPrint && (
        <Modal open={true} size="lg" title={`Cover Sheet — ${showPrint.transmittalNo}`} onClose={() => setShowPrint(null)}>
          <div>
            <div id="tr-cover-print" style={{ fontFamily: 'Arial, sans-serif', color: '#111', fontSize: 12 }}>
              {/* Header */}
              <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: 12, marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8', letterSpacing: '-0.5px' }}>{projectCode}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>DOCUMENT TRANSMITTAL</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#1d4ed8' }}>{showPrint.transmittalNo}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{showPrint.sentDate ? new Date(showPrint.sentDate).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }) : new Date(showPrint.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}</div>
                </div>
              </div>
              {/* To/From */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {showPrint.direction === 'outgoing' ? 'To' : 'From'}
                  </div>
                  <div style={{ fontWeight: 700 }}>{showPrint.toCompany}</div>
                  {showPrint.toContact && <div style={{ color: '#475569' }}>{showPrint.toContact}</div>}
                  {showPrint.toEmail && <div style={{ color: '#475569' }}>{showPrint.toEmail}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Status</div>
                  <div style={{ fontWeight: 700 }}>{showPrint.status.toUpperCase()}</div>
                  {showPrint.dueDate && <div style={{ color: '#dc2626', fontSize: 11 }}>Response due: {showPrint.dueDate}</div>}
                </div>
              </div>
              {/* Title */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Subject</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{showPrint.title}</div>
                {showPrint.subject && <div style={{ color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{showPrint.subject}</div>}
              </div>
              {/* Documents table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#1d4ed8', color: '#fff' }}>
                    {['#','Document Ref','Title','Rev','Purpose','Copies','Format'].map((h, i) => (
                      <th key={i} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {showPrint.items.map((it, idx) => (
                    <tr key={it.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 10px', color: '#64748b', fontSize: 11 }}>{idx+1}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', fontSize: 11 }}>{it.refNumber ?? it.extRefNumber ?? '—'}</td>
                      <td style={{ padding: '6px 10px', maxWidth: 220 }}>{it.title ?? it.extTitle ?? '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#64748b' }}>{it.revision ?? '—'}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{it.purposeOfIssue ?? '—'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>{it.copies}</td>
                      <td style={{ padding: '6px 10px', color: '#64748b' }}>{it.format}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Footer */}
              {showPrint.notes && <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, marginBottom: 16 }}><strong>Notes: </strong>{showPrint.notes}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 24 }}>
                {['Prepared By','Checked By','Authorized By'].map(label => (
                  <div key={label} style={{ borderTop: '1px solid #94a3b8', paddingTop: 6 }}>
                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ height: 24 }} />
                    <div style={{ borderTop: '1px solid #cbd5e1', fontSize: 9, color: '#94a3b8', paddingTop: 3 }}>Name / Date / Signature</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
              <button onClick={() => setShowPrint(null)}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, cursor: 'pointer' }}>Close</button>
              <button onClick={() => window.print()}
                style={{ padding: '8px 22px', borderRadius: 8, background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🖨 Print</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AttachmentsTab({ projectId, theme, isAdmin, userTeamRole }: { projectId: string; theme: ReturnType<typeof useTheme>['theme']; isAdmin?: boolean; userTeamRole?: string | null }) {
  const addToast  = useToastStore((s) => s.addToast)
  const fileRef   = React.useRef<HTMLInputElement>(null)
  const [files, setFiles]             = React.useState<FileAttachment[]>([])
  const [loading, setLoading]         = React.useState(true)
  const [uploading, setUploading]     = React.useState(false)
  const [progress, setProgress]       = React.useState(0)
  const [dragOver, setDragOver]       = React.useState(false)
  const [uploadCategory, setUploadCategory] = React.useState<DocCategory>('General')
  const [filterCategory, setFilterCategory] = React.useState<DocCategory | 'All'>('All')

  const ACCEPT = '.xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.zip,.rar'

  // Determine which categories this user can see
  const visibleCategories: Set<DocCategory> = React.useMemo(() => {
    if (isAdmin) return new Set(DOC_CATEGORIES)
    const roleKey = (userTeamRole ?? '').toLowerCase()
    const allowed = ROLE_VISIBLE[roleKey] ?? ['General']
    return new Set(allowed as DocCategory[])
  }, [isAdmin, userTeamRole])

  React.useEffect(() => {
    setLoading(true)
    api.get<FileAttachment[]>('/files/attachments', { params: { entityType: 'project', entityId: projectId } })
      .then(r => setFiles(r.data as unknown as FileAttachment[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  // Filter visible files by role + active category filter
  const visibleFiles = files.filter(f => {
    const { category } = parseFileCategory(f.label || f.original_filename)
    if (!visibleCategories.has(category)) return false
    if (filterCategory !== 'All' && category !== filterCategory) return false
    return true
  })

  async function upload(file: File) {
    if (file.size > 52_428_800) { addToast({ type: 'error', message: 'File too large (max 50 MB)' }); return }
    setUploading(true); setProgress(10)
    try {
      const { data: urlRes } = await api.post<{ uploadUrl: string; fileId: string }>(
        '/files/upload-url',
        { filename: file.name, mimeType: file.type, sizeBytes: file.size, category: 'attachment' },
      )
      const { fileId } = urlRes as unknown as { uploadUrl: string; fileId: string }
      setProgress(30)
      const buf = await file.arrayBuffer()
      await api.post(`/files/${fileId}/content`, buf, { headers: { 'Content-Type': file.type }, timeout: 120_000 })
      setProgress(75)
      const labelWithCat = uploadCategory === 'General' ? file.name : `[${uploadCategory}] ${file.name}`
      await api.post('/files/attach', { fileId, entityType: 'project', entityId: projectId, label: labelWithCat })
      setProgress(95)
      const r = await api.get<FileAttachment[]>('/files/attachments', { params: { entityType: 'project', entityId: projectId } })
      setFiles(r.data as unknown as FileAttachment[])
      addToast({ type: 'success', message: `"${file.name}" uploaded (${uploadCategory})` })
    } catch {
      addToast({ type: 'error', message: 'Upload failed — please try again' })
    } finally {
      setUploading(false); setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function download(f: FileAttachment) {
    try {
      const { data: res } = await api.get<{ downloadUrl: string }>(`/files/${f.file_id}/download-url`)
      const url = (res as unknown as { downloadUrl: string }).downloadUrl
      const a = document.createElement('a'); a.href = url; a.download = f.original_filename; a.click()
    } catch { addToast({ type: 'error', message: 'Download failed' }) }
  }

  async function remove(attachment: FileAttachment) {
    try {
      await api.delete(`/files/attachments/${attachment.id}`)
      setFiles(prev => prev.filter(f => f.id !== attachment.id))
      addToast({ type: 'success', message: 'Attachment removed' })
    } catch { addToast({ type: 'error', message: 'Failed to remove attachment' }) }
  }

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
    borderRadius: '5px', color: theme.textMuted, display: 'flex', alignItems: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header row: count + category filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: theme.textMuted, marginRight: '4px' }}>
          {visibleFiles.length} document{visibleFiles.length !== 1 ? 's' : ''}
        </span>
        {/* Category filter chips */}
        {(['All', ...Array.from(visibleCategories)] as (DocCategory | 'All')[]).map(cat => (
          <button key={cat} onClick={() => setFilterCategory(cat)}
            style={{
              padding: '3px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              background: filterCategory === cat ? (cat === 'All' ? theme.accent : (CAT_COLOR[cat as DocCategory]?.color ?? theme.accent)) : theme.bgSurface,
              color: filterCategory === cat ? '#fff' : (cat === 'All' ? theme.textMuted : (CAT_COLOR[cat as DocCategory]?.color ?? theme.textMuted)),
              border: `1px solid ${filterCategory === cat ? 'transparent' : theme.border}`,
            }}>
            {cat}
            {cat !== 'All' && files.filter(f => parseFileCategory(f.label || f.original_filename).category === cat).length > 0 && (
              <span style={{ marginLeft: '4px', opacity: 0.75 }}>
                ({files.filter(f => parseFileCategory(f.label || f.original_filename).category === cat && visibleCategories.has(parseFileCategory(f.label || f.original_filename).category)).length})
              </span>
            )}
          </button>
        ))}
        {!isAdmin && (
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: theme.textMuted }}>
            Showing documents for your role
          </span>
        )}
      </div>

      {/* ── Role info banner ── */}
      {!isAdmin && userTeamRole && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: theme.accentBg, border: `1px solid ${theme.accentBorder}`, fontSize: '12px', color: theme.textPrimary }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          You are viewing as <strong style={{ marginLeft: '4px', textTransform: 'capitalize' }}>{userTeamRole.replace(/_/g, ' ')}</strong> — some categories may be restricted.
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: theme.textMuted }}>Loading…</div>
      ) : visibleFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: theme.textMuted }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: theme.bgSurface, border: `1px solid ${theme.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginBottom: 4 }}>No documents found</div>
          <div style={{ fontSize: '13px' }}>No documents in {filterCategory === 'All' ? 'this project' : `the ${filterCategory} category`}.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visibleFiles.map(f => {
            const { category, name } = parseFileCategory(f.label || f.original_filename)
            const catStyle = CAT_COLOR[category]
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
                <FileTypeIcon mime={f.mime_type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: catStyle.bg, color: catStyle.color }}>
                      {category}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>
                    {formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button style={btnStyle} title="Download" onClick={() => void download(f)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
                {isAdmin && (
                  <button style={{ ...btnStyle, color: '#ef4444' }} title="Remove" onClick={() => void remove(f)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload area */}
      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textMuted, marginBottom: '10px' }}>Upload Document</div>
        {/* Category selector */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {(isAdmin ? DOC_CATEGORIES : DOC_CATEGORIES.filter(c => visibleCategories.has(c))).map(cat => (
            <button key={cat} onClick={() => setUploadCategory(cat)}
              style={{ padding: '4px 12px', borderRadius: '999px', border: `1px solid ${uploadCategory === cat ? CAT_COLOR[cat].color : theme.border}`, cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                background: uploadCategory === cat ? CAT_COLOR[cat].bg : 'transparent', color: uploadCategory === cat ? CAT_COLOR[cat].color : theme.textMuted }}>
              {cat}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }} />

        <div
          style={{ border: `2px dashed ${dragOver ? theme.accent : theme.border}`, borderRadius: '8px', padding: '18px 16px',
            textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
            background: dragOver ? `${theme.accent}12` : theme.bgCanvas, transition: 'border-color 0.15s, background 0.15s' }}
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void upload(f) }}>
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '180px', height: '4px', background: theme.border, borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: theme.accent, width: `${progress}%`, transition: 'width 0.3s' }} />
              </div>
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>Uploading as {uploadCategory}… {progress}%</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 4px' }}>
                Drop file here or <span style={{ color: theme.accent }}>browse</span>
              </p>
              <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
                Will be tagged as <strong style={{ color: CAT_COLOR[uploadCategory].color }}>{uploadCategory}</strong> · Excel, PDF, Word, images, ZIP · Max 50 MB
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ExecutionTab
// ─────────────────────────────────────────────────────────────────────────────

type ExecFile = { id: string; fileId: string; filename: string; mimeType: string; sizeBytes: number; title: string; createdAt: string; downloadUrl: string | null }
type RFIRow = { id: string; projectId: string; rfiNumber: string; subject: string; description: string | null; drawingRef: string | null; specRef: string | null; raisedByName: string | null; raisedDate: string; requiredDate: string | null; respondedDate: string | null; status: string; response: string | null; respondedByName: string | null; files: ExecFile[]; createdAt: string; updatedAt: string }
type SubmittalRow = { id: string; projectId: string; submittalNumber: string; title: string; submittalType: string; revision: string; submittedDate: string | null; reviewerName: string | null; reviewStatus: string; returnDate: string | null; remarks: string | null; files: ExecFile[]; createdAt: string; updatedAt: string }
type SIRow = { id: string; projectId: string; siNumber: string; subject: string; description: string | null; issuedBy: string | null; issuedDate: string; acknowledgedByName: string | null; acknowledgedDate: string | null; potentialVo: boolean; voRef: string | null; status: string; files: ExecFile[]; createdAt: string; updatedAt: string }
type ITPItemRow = { id: string; sequence: number; activity: string; inspectionType: string; contractorRole: string | null; clientRole: string | null; referenceDoc: string | null; acceptanceCriteria: string | null; result: string | null; inspectorName: string | null; inspectionDate: string | null; remarks: string | null }
type ITPRow = { id: string; projectId: string; title: string; workPackage: string | null; discipline: string | null; revision: string; status: string; createdByName: string | null; items: ITPItemRow[]; createdAt: string; updatedAt: string }
type IRRow = { id: string; projectId: string; irNumber: string; title: string; itpId: string | null; workPackage: string | null; location: string | null; requestedDate: string; requestedByName: string | null; inspectorName: string | null; actualDate: string | null; status: string; result: string | null; remarks: string | null; files: ExecFile[]; createdAt: string; updatedAt: string }
type NCRRow = { id: string; projectId: string; ncrNumber: string; title: string; description: string; workPackage: string | null; location: string | null; raisedByName: string | null; raisedDate: string; severity: string; rootCause: string | null; correctiveAction: string | null; preventiveAction: string | null; dueDate: string | null; closedDate: string | null; closedByName: string | null; status: string; files: ExecFile[]; createdAt: string; updatedAt: string }
type HSERow = { id: string; projectId: string; recordType: string; title: string; recordDate: string; conductedBy: string | null; location: string | null; description: string | null; attendeeCount: number | null; attendeeNames: string | null; incidentType: string | null; severity: string | null; injuredPerson: string | null; rootCause: string | null; correctiveAction: string | null; correctiveDueDate: string | null; correctiveClosedDate: string | null; observationType: string | null; ptwType: string | null; ptwNumber: string | null; validFrom: string | null; validTo: string | null; approvedBy: string | null; ptwStatus: string | null; status: string; files: ExecFile[]; createdAt: string; updatedAt: string }
type TransmittalItemRow = { id: string; documentTitle: string; documentNumber: string | null; revision: string | null; fileId: string | null; filename: string | null; downloadUrl: string | null; copies: number }
type TransmittalRow = { id: string; projectId: string; transmittalNumber: string; title: string; toCompany: string | null; toContact: string | null; fromName: string | null; sentDate: string; purpose: string; acknowledgedDate: string | null; notes: string | null; status: string; items: TransmittalItemRow[]; createdAt: string; updatedAt: string }

type ExecProps = {
  projectId: string
  theme: Record<string, string>
  isEditable: boolean
  isAdmin: boolean
  rfis: RFIRow[]
  submittals: SubmittalRow[]
  siteInstructions: SIRow[]
  itps: ITPRow[]
  inspectionRequests: IRRow[]
  ncrs: NCRRow[]
  hseRecords: HSERow[]
  transmittals: TransmittalRow[]
  drawings: EngDrawing[]
  rfqLines: Array<{ specSection?: string | null }>
  team: Array<{ employee_name: string; job_title?: string; member_type?: string }>
  onCreateRFI: (v: Record<string, unknown>) => void
  onUpdateRFI: (v: Record<string, unknown>) => void
  onRespondRFI: (v: Record<string, unknown>) => void
  onDeleteRFI: (id: string) => void
  onUploadRFIFile: (v: Record<string, unknown>) => void
  onDeleteRFIFile: (v: Record<string, unknown>) => void
  onCreateSubmittal: (v: Record<string, unknown>) => void
  onUpdateSubmittal: (v: Record<string, unknown>) => void
  onDeleteSubmittal: (id: string) => void
  onUploadSubmittalFile: (v: Record<string, unknown>) => void
  onDeleteSubmittalFile: (v: Record<string, unknown>) => void
  onCreateSI: (v: Record<string, unknown>) => void
  onUpdateSI: (v: Record<string, unknown>) => void
  onDeleteSI: (id: string) => void
  onUploadSIFile: (v: Record<string, unknown>) => void
  onDeleteSIFile: (v: Record<string, unknown>) => void
  onCreateITP: (v: Record<string, unknown>) => void
  onUpdateITP: (v: Record<string, unknown>) => void
  onDeleteITP: (id: string) => void
  onUpsertITPItems: (v: Record<string, unknown>) => void
  onRecordITPResult: (v: Record<string, unknown>) => void
  onCreateIR: (v: Record<string, unknown>) => void
  onUpdateIR: (v: Record<string, unknown>) => void
  onDeleteIR: (id: string) => void
  onUploadIRFile: (v: Record<string, unknown>) => void
  onDeleteIRFile: (v: Record<string, unknown>) => void
  onCreateNCR: (v: Record<string, unknown>) => void
  onUpdateNCR: (v: Record<string, unknown>) => void
  onDeleteNCR: (id: string) => void
  onUploadNCRFile: (v: Record<string, unknown>) => void
  onDeleteNCRFile: (v: Record<string, unknown>) => void
  onCreateHSE: (v: Record<string, unknown>) => void
  onUpdateHSE: (v: Record<string, unknown>) => void
  onDeleteHSE: (id: string) => void
  onUploadHSEFile: (v: Record<string, unknown>) => void
  onDeleteHSEFile: (v: Record<string, unknown>) => void
  onCreateTransmittal: (v: Record<string, unknown>) => void
  onUpdateTransmittal: (v: Record<string, unknown>) => void
  onDeleteTransmittal: (id: string) => void
  onAddTransmittalItem: (v: Record<string, unknown>) => void
  onDeleteTransmittalItem: (itemId: string) => void
}

const EXEC_STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  open:        { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  responded:   { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  closed:      { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' },
  pending:     { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  approved:    { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  approved_with_comments: { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
  rejected:    { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  resubmit:    { bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' },
  acknowledged:{ bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  draft:       { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
  active:      { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  superseded:  { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  sent:        { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  accepted:    { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  accepted_with_punch: { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
  pending_close: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  minor:       { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  major:       { bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' },
  critical:    { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  toolbox_talk:{ bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  incident:    { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  observation: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  ptw:         { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
}

function execBadge(val: string, th: Record<string, string>) {
  const s = EXEC_STATUS_COLOR[val] ?? { bg: th.bgSurface, color: th.textMuted, border: th.border }
  return (
    <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {val.replace(/_/g, ' ')}
    </span>
  )
}

function execSectionHeader(label: string, count: number, onAdd: (() => void) | null, isEditable: boolean, th: Record<string, string>) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>{label} <span style={{ fontSize: '12px', fontWeight: 400, color: th.textMuted }}>({count})</span></h3>
      {isEditable && onAdd && (
        <button onClick={onAdd} style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
      )}
    </div>
  )
}

function execFileList(files: ExecFile[], onDelete: ((attachId: string) => void) | null, isEditable: boolean, th: Record<string, string>) {
  if (!files || files.length === 0) return null
  return (
    <>
      {files.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: th.bgCanvas, border: `1px solid ${th.border}`, borderRadius: '6px', fontSize: '12px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={th.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          {f.downloadUrl ? (
            <a href={f.downloadUrl} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{f.filename}</a>
          ) : (
            <span style={{ flex: 1, color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
          )}
          <span style={{ color: th.textMuted, flexShrink: 0, fontSize: '11px' }}>{(f.sizeBytes / 1024).toFixed(0)} KB</span>
          {isEditable && onDelete && (
            <button onClick={() => onDelete(f.id)} style={{ border: 'none', background: 'transparent', color: th.textMuted, cursor: 'pointer', padding: '0 2px', fontSize: '14px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
          )}
        </div>
      ))}
    </>
  )
}

type UploadState = { uploading: boolean; progress: number }

async function execUpload(
  file: File,
  entityId: string,
  entityType: string,
  onUpload: (v: Record<string, unknown>) => void,
  setState: React.Dispatch<React.SetStateAction<UploadState>>
) {
  const ENTITY_ID_KEY: Record<string, string> = {
    rfi: 'rfiId', submittal: 'submittalId', site_instruction: 'siId',
    inspection_request: 'irId', ncr: 'ncrId', hse_record: 'hseId',
  }
  setState({ uploading: true, progress: 0 })
  try {
    const { data: urlRes } = await api.post('/files/upload-url', { filename: file.name, mimeType: file.type, sizeBytes: file.size, category: 'attachment' })
    const { fileId } = urlRes as { fileId: string }
    setState({ uploading: true, progress: 30 })
    const buf = await file.arrayBuffer()
    await api.post(`/files/${fileId}/content`, buf, { headers: { 'Content-Type': file.type }, timeout: 120_000 })
    setState({ uploading: true, progress: 90 })
    const idKey = ENTITY_ID_KEY[entityType] ?? 'entityId'
    onUpload({ [idKey]: entityId, fileId, title: file.name })
  } finally {
    setState({ uploading: false, progress: 0 })
  }
}

function ExecUploadButton({ entityId, entityType, onUpload, th }: { entityId: string; entityType: string; onUpload: (v: Record<string, unknown>) => void; th: Record<string, string> }) {
  const [state, setState] = React.useState<UploadState>({ uploading: false, progress: 0 })
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <input ref={ref} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void execUpload(f, entityId, entityType, onUpload, setState); e.target.value = '' }} />
      <button onClick={() => ref.current?.click()} disabled={state.uploading}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: state.uploading ? 'not-allowed' : 'pointer', opacity: state.uploading ? 0.7 : 1 }}>
        {state.uploading ? (
          <>{state.progress}%&nbsp;uploading…</>
        ) : (
          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Attach File</>
        )}
      </button>
    </span>
  )
}

const EXEC_SUB_TABS = [
  { key: 'rfis', label: 'RFIs' },
  { key: 'submittals', label: 'Submittals' },
  { key: 'site_instructions', label: 'Site Instructions' },
  { key: 'qa_qc', label: 'QA/QC' },
  { key: 'hse', label: 'HSE' },
  { key: 'transmittals', label: 'Transmittals' },
]
const QA_SUB_TABS = [
  { key: 'itps', label: 'ITPs' },
  { key: 'irs', label: 'Inspection Requests' },
  { key: 'ncrs', label: 'NCRs' },
]
const HSE_TYPES = ['all', 'toolbox_talk', 'incident', 'observation', 'ptw']

function ExecutionTab({
  projectId, theme: th, isEditable, isAdmin,
  rfis, submittals, siteInstructions, itps, inspectionRequests, ncrs, hseRecords, transmittals, drawings, rfqLines, team,
  onCreateRFI, onUpdateRFI, onRespondRFI, onDeleteRFI, onUploadRFIFile, onDeleteRFIFile,
  onCreateSubmittal, onUpdateSubmittal, onDeleteSubmittal, onUploadSubmittalFile, onDeleteSubmittalFile,
  onCreateSI, onUpdateSI, onDeleteSI, onUploadSIFile, onDeleteSIFile,
  onCreateITP, onUpdateITP, onDeleteITP, onUpsertITPItems, onRecordITPResult,
  onCreateIR, onUpdateIR, onDeleteIR, onUploadIRFile, onDeleteIRFile,
  onCreateNCR, onUpdateNCR, onDeleteNCR, onUploadNCRFile, onDeleteNCRFile,
  onCreateHSE, onUpdateHSE, onDeleteHSE, onUploadHSEFile, onDeleteHSEFile,
  onCreateTransmittal, onUpdateTransmittal, onDeleteTransmittal, onAddTransmittalItem, onDeleteTransmittalItem,
}: ExecProps) {
  const addToast = useToastStore(s => s.addToast)
  const currentUser = useAuthStore(s => s.user)
  const currentUserName = currentUser ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.email : ''
  const [sub, setSub] = React.useState('rfis')
  const [qaSub, setQaSub] = React.useState('itps')
  const [hseType, setHseType] = React.useState('all')
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  // ── RFI modal state
  const [rfiModal, setRfiModal] = React.useState<{ open: boolean; row: RFIRow | null; mode: 'create' | 'edit' | 'respond' }>({ open: false, row: null, mode: 'create' })
  const [rfiForm, setRfiForm] = React.useState({ rfiNumber: '', subject: '', description: '', drawingRef: '', specRef: '', raisedByName: '', raisedDate: '', requiredDate: '', response: '', respondedByName: '', respondedDate: '', status: 'open' })

  // ── Submittal modal state
  const [subModal, setSubModal] = React.useState<{ open: boolean; row: SubmittalRow | null }>({ open: false, row: null })
  const [subForm, setSubForm] = React.useState({ submittalNumber: '', title: '', submittalType: 'shop_drawing', revision: 'A', submittedDate: '', reviewerName: '', reviewStatus: 'pending', returnDate: '', remarks: '' })
  const [subReviewModal, setSubReviewModal] = React.useState<{ open: boolean; row: SubmittalRow | null }>({ open: false, row: null })
  const [subReviewForm, setSubReviewForm] = React.useState({ reviewerName: '', reviewStatus: 'approved', returnDate: '', remarks: '' })

  // ── SI modal state
  const [siModal, setSiModal] = React.useState<{ open: boolean; row: SIRow | null }>({ open: false, row: null })
  const [siForm, setSiForm] = React.useState({ siNumber: '', subject: '', description: '', issuedBy: '', issuedDate: '', acknowledgedByName: '', acknowledgedDate: '', potentialVo: false, voRef: '', status: 'open' })

  // ── ITP modal state
  const [itpModal, setItpModal] = React.useState<{ open: boolean; row: ITPRow | null }>({ open: false, row: null })
  const [itpForm, setItpForm] = React.useState({ title: '', workPackage: '', discipline: '', revision: 'A', status: 'draft', createdByName: '' })
  const [itpItemsModal, setItpItemsModal] = React.useState<{ open: boolean; itp: ITPRow | null }>({ open: false, itp: null })
  const [itpItems, setItpItems] = React.useState<ITPItemRow[]>([])

  // ── IR modal state
  const [irModal, setIrModal] = React.useState<{ open: boolean; row: IRRow | null }>({ open: false, row: null })
  const [irForm, setIrForm] = React.useState({ irNumber: '', title: '', itpId: '', workPackage: '', location: '', requestedDate: '', requestedByName: '', inspectorName: '', actualDate: '', status: 'pending', result: '', remarks: '' })
  const [irInspectModal, setIrInspectModal] = React.useState<{ open: boolean; row: IRRow | null }>({ open: false, row: null })
  const [irInspectForm, setIrInspectForm] = React.useState({ inspectorName: '', actualDate: '', result: '', remarks: '' })

  // ── NCR modal state
  const [ncrModal, setNcrModal] = React.useState<{ open: boolean; row: NCRRow | null }>({ open: false, row: null })
  const [ncrForm, setNcrForm] = React.useState({ ncrNumber: '', title: '', description: '', workPackage: '', location: '', raisedByName: '', raisedDate: '', severity: 'minor', rootCause: '', correctiveAction: '', preventiveAction: '', dueDate: '', closedDate: '', closedByName: '', status: 'open' })
  const [ncrResolveModal, setNcrResolveModal] = React.useState<{ open: boolean; row: NCRRow | null }>({ open: false, row: null })
  const [ncrResolveForm, setNcrResolveForm] = React.useState({ rootCause: '', correctiveAction: '', preventiveAction: '', closedDate: '', closedByName: '', status: 'open' })

  // ── HSE modal state
  const [hseModal, setHseModal] = React.useState<{ open: boolean; row: HSERow | null }>({ open: false, row: null })
  const [hseForm, setHseForm] = React.useState({ recordType: 'toolbox_talk', title: '', recordDate: '', conductedBy: '', location: '', description: '', attendeeCount: '', attendeeNames: '', incidentType: '', severity: '', injuredPerson: '', rootCause: '', correctiveAction: '', correctiveDueDate: '', observationType: '', ptwType: '', ptwNumber: '', validFrom: '', validTo: '', approvedBy: '', ptwStatus: 'pending', status: 'open' })

  // ── Transmittal modal state
  const [txModal, setTxModal] = React.useState<{ open: boolean; row: TransmittalRow | null }>({ open: false, row: null })
  const [txForm, setTxForm] = React.useState({ transmittalNumber: '', title: '', toCompany: '', toContact: '', fromName: '', sentDate: '', purpose: 'for_approval', acknowledgedDate: '', notes: '', status: 'sent' })
  const [txItemModal, setTxItemModal] = React.useState<{ open: boolean; transmittalId: string }>({ open: false, transmittalId: '' })
  const [txItemForm, setTxItemForm] = React.useState({ documentTitle: '', documentNumber: '', revision: '', copies: '1' })

  // ── ITP result modal
  const [itpResultModal, setItpResultModal] = React.useState<{ open: boolean; item: ITPItemRow | null }>({ open: false, item: null })
  const [itpResultForm, setItpResultForm] = React.useState({ result: 'pass', inspectorName: '', inspectionDate: '', remarks: '' })

  const navBtn = (key: string, label: string, activeKey: string, setKey: (k: string) => void) => (
    <button key={key} onClick={() => setKey(key)} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: activeKey === key ? 600 : 400, color: activeKey === key ? th.accent : th.textSecondary, borderBottom: `2px solid ${activeKey === key ? th.accent : 'transparent'}`, marginBottom: '-1px', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '10px', padding: '16px', ...style }}>
      {children}
    </div>
  )

  const modalOverlay = (children: React.ReactNode, onClose: () => void, maxWidth = '560px', maxHeight = '85vh') => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '12px', width: '100%', maxWidth, maxHeight, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  )

  const field = (label: string, input: React.ReactNode) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px' }}>{label}</label>
      {input}
    </div>
  )
  const inp = (val: string, onChange: (v: string) => void, placeholder?: string, type = 'text') => (
    <input type={type} value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '13px', boxSizing: 'border-box' }} />
  )
  const sel = (val: string, onChange: (v: string) => void, options: string[]) => (
    <select value={val} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '13px' }}>
      {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  )
  const textarea = (val: string, onChange: (v: string) => void, placeholder?: string) => (
    <textarea value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
  )
  const modalBtns = (onSave: () => void, onClose: () => void, label = 'Save') => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
      <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: '6px', border: `1px solid ${th.border}`, background: 'transparent', color: th.textSecondary, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
      <button onClick={onSave} style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{label}</button>
    </div>
  )

  // ── RFIs section ──────────────────────────────────────────────────────────
  function openRfiCreate() { const nextNum = String(rfis.length + 1).padStart(3, '0'); setRfiForm({ rfiNumber: nextNum, subject: '', description: '', drawingRef: '', specRef: '', raisedByName: currentUserName, raisedDate: new Date().toISOString().slice(0, 10), requiredDate: '', response: '', respondedByName: '', respondedDate: '', status: 'open' }); setRfiModal({ open: true, row: null, mode: 'create' }) }
  function openRfiEdit(r: RFIRow) { setRfiForm({ rfiNumber: r.rfiNumber, subject: r.subject, description: r.description ?? '', drawingRef: r.drawingRef ?? '', specRef: r.specRef ?? '', raisedByName: r.raisedByName ?? '', raisedDate: r.raisedDate ?? '', requiredDate: r.requiredDate ?? '', response: r.response ?? '', respondedByName: r.respondedByName ?? '', respondedDate: r.respondedDate ?? '', status: r.status }); setRfiModal({ open: true, row: r, mode: 'edit' }) }
  function openRfiRespond(r: RFIRow) { setRfiForm(f => ({ ...f, response: r.response ?? '', respondedByName: currentUserName, respondedDate: r.respondedDate ?? new Date().toISOString().slice(0, 10) })); setRfiModal({ open: true, row: r, mode: 'respond' }) }
  function saveRfi() {
    const v = { ...rfiForm }
    if (rfiModal.mode === 'create') { onCreateRFI({ projectId, ...v }) }
    else if (rfiModal.mode === 'edit' && rfiModal.row) { onUpdateRFI({ id: rfiModal.row.id, ...v }) }
    else if (rfiModal.mode === 'respond' && rfiModal.row) { onRespondRFI({ id: rfiModal.row.id, response: rfiForm.response, respondedByName: rfiForm.respondedByName, respondedDate: rfiForm.respondedDate }) }
    setRfiModal({ open: false, row: null, mode: 'create' })
  }

  // ── Submittals section ────────────────────────────────────────────────────
  function openSubCreate() { const nextNum = String(submittals.length + 1).padStart(3, '0'); setSubForm({ submittalNumber: nextNum, title: '', submittalType: 'shop_drawing', revision: 'A', submittedDate: new Date().toISOString().slice(0, 10), reviewerName: '', reviewStatus: 'pending', returnDate: '', remarks: '' }); setSubModal({ open: true, row: null }) }
  function openSubEdit(r: SubmittalRow) { setSubForm({ submittalNumber: r.submittalNumber, title: r.title, submittalType: r.submittalType, revision: r.revision, submittedDate: r.submittedDate ?? '', reviewerName: r.reviewerName ?? '', reviewStatus: r.reviewStatus, returnDate: r.returnDate ?? '', remarks: r.remarks ?? '' }); setSubModal({ open: true, row: r }) }
  function saveSub() {
    if (!subModal.row) onCreateSubmittal({ projectId, ...subForm })
    else onUpdateSubmittal({ id: subModal.row.id, ...subForm })
    setSubModal({ open: false, row: null })
  }
  function openSubReview(r: SubmittalRow) { setSubReviewForm({ reviewerName: r.reviewerName || currentUserName, reviewStatus: r.reviewStatus === 'pending' ? 'approved' : r.reviewStatus, returnDate: r.returnDate ?? new Date().toISOString().slice(0, 10), remarks: r.remarks ?? '' }); setSubReviewModal({ open: true, row: r }) }
  function saveSubReview() {
    if (!subReviewModal.row) return
    const r = subReviewModal.row
    onUpdateSubmittal({ id: r.id, submittalNumber: r.submittalNumber, title: r.title, submittalType: r.submittalType, revision: r.revision, submittedDate: r.submittedDate ?? '', ...subReviewForm })
    setSubReviewModal({ open: false, row: null })
  }

  // ── Site Instructions section ─────────────────────────────────────────────
  function openSICreate() { const nextNum = String(siteInstructions.length + 1).padStart(3, '0'); setSiForm({ siNumber: nextNum, subject: '', description: '', issuedBy: currentUserName, issuedDate: new Date().toISOString().slice(0, 10), acknowledgedByName: '', acknowledgedDate: '', potentialVo: false, voRef: '', status: 'open' }); setSiModal({ open: true, row: null }) }
  function openSIEdit(r: SIRow) {
    const needsAck = r.status === 'open' && !r.acknowledgedByName
    setSiForm({
      siNumber: r.siNumber, subject: r.subject, description: r.description ?? '',
      issuedBy: r.issuedBy ?? '', issuedDate: r.issuedDate,
      acknowledgedByName: needsAck ? currentUserName : (r.acknowledgedByName ?? ''),
      acknowledgedDate:   needsAck ? new Date().toISOString().slice(0, 10) : (r.acknowledgedDate ?? ''),
      potentialVo: r.potentialVo, voRef: r.voRef ?? '',
      status: needsAck ? 'acknowledged' : r.status,
    })
    setSiModal({ open: true, row: r })
  }
  function saveSI() {
    if (!siModal.row) onCreateSI({ projectId, ...siForm })
    else onUpdateSI({ id: siModal.row.id, ...siForm })
    setSiModal({ open: false, row: null })
  }

  // ── ITP section ───────────────────────────────────────────────────────────
  function openITPCreate() { setItpForm({ title: '', workPackage: '', discipline: '', revision: 'A', status: 'draft', createdByName: currentUserName }); setItpModal({ open: true, row: null }) }
  function openITPEdit(r: ITPRow) { setItpForm({ title: r.title, workPackage: r.workPackage ?? '', discipline: r.discipline ?? '', revision: r.revision, status: r.status, createdByName: r.createdByName ?? '' }); setItpModal({ open: true, row: r }) }
  function saveITP() {
    if (!itpModal.row) onCreateITP({ projectId, ...itpForm })
    else onUpdateITP({ id: itpModal.row.id, ...itpForm })
    setItpModal({ open: false, row: null })
  }
  function openITPItems(itp: ITPRow) { setItpItems(itp.items.map(i => ({ ...i }))); setItpItemsModal({ open: true, itp }) }
  function addITPItem() { setItpItems(prev => [...prev, { id: '', sequence: prev.length, activity: '', inspectionType: 'check', contractorRole: '', clientRole: '', referenceDoc: '', acceptanceCriteria: '', result: null, inspectorName: null, inspectionDate: null, remarks: null }]) }
  function saveITPItems() {
    if (!itpItemsModal.itp) return
    const input = itpItems.map(({ id, sequence, activity, inspectionType, contractorRole, clientRole, referenceDoc, acceptanceCriteria }) => ({
      id, sequence, activity, inspectionType, contractorRole, clientRole, referenceDoc, acceptanceCriteria,
    }))
    onUpsertITPItems({ itpId: itpItemsModal.itp.id, items: input })
    setItpItemsModal({ open: false, itp: null })
  }

  // ── IR section ────────────────────────────────────────────────────────────
  function openIRCreate() { const nextNum = String(inspectionRequests.length + 1).padStart(3, '0'); setIrForm({ irNumber: nextNum, title: '', itpId: '', workPackage: '', location: '', requestedDate: new Date().toISOString().slice(0, 10), requestedByName: currentUserName, inspectorName: '', actualDate: '', status: 'pending', result: '', remarks: '' }); setIrModal({ open: true, row: null }) }
  function openIREdit(r: IRRow) { setIrForm({ irNumber: r.irNumber, title: r.title, itpId: r.itpId ?? '', workPackage: r.workPackage ?? '', location: r.location ?? '', requestedDate: r.requestedDate, requestedByName: r.requestedByName ?? '', inspectorName: r.inspectorName ?? '', actualDate: r.actualDate ?? '', status: r.status, result: r.result ?? '', remarks: r.remarks ?? '' }); setIrModal({ open: true, row: r }) }
  function saveIR() {
    if (!irModal.row) onCreateIR({ projectId, ...irForm })
    else onUpdateIR({ id: irModal.row.id, ...irForm })
    setIrModal({ open: false, row: null })
  }
  function openIRInspect(r: IRRow) { setIrInspectForm({ inspectorName: r.inspectorName || currentUserName, actualDate: r.actualDate ?? new Date().toISOString().slice(0, 10), result: r.result ?? '', remarks: r.remarks ?? '' }); setIrInspectModal({ open: true, row: r }) }
  function saveIRInspect() {
    if (!irInspectModal.row) return
    const r = irInspectModal.row
    const newStatus = irInspectForm.result === 'rejected' ? 'rejected' : irInspectForm.result ? 'accepted' : r.status
    onUpdateIR({ id: r.id, irNumber: r.irNumber, title: r.title, itpId: r.itpId ?? '', workPackage: r.workPackage ?? '', location: r.location ?? '', requestedDate: r.requestedDate, requestedByName: r.requestedByName ?? '', inspectorName: irInspectForm.inspectorName, actualDate: irInspectForm.actualDate, status: newStatus, result: irInspectForm.result, remarks: irInspectForm.remarks })
    setIrInspectModal({ open: false, row: null })
  }

  // ── NCR section ───────────────────────────────────────────────────────────
  function openNCRCreate() { const nextNum = String(ncrs.length + 1).padStart(3, '0'); setNcrForm({ ncrNumber: nextNum, title: '', description: '', workPackage: '', location: '', raisedByName: currentUserName, raisedDate: new Date().toISOString().slice(0, 10), severity: 'minor', rootCause: '', correctiveAction: '', preventiveAction: '', dueDate: '', closedDate: '', closedByName: '', status: 'open' }); setNcrModal({ open: true, row: null }) }
  function openNCREdit(r: NCRRow) { setNcrForm({ ncrNumber: r.ncrNumber, title: r.title, description: r.description, workPackage: r.workPackage ?? '', location: r.location ?? '', raisedByName: r.raisedByName ?? '', raisedDate: r.raisedDate, severity: r.severity, rootCause: r.rootCause ?? '', correctiveAction: r.correctiveAction ?? '', preventiveAction: r.preventiveAction ?? '', dueDate: r.dueDate ?? '', closedDate: r.closedDate ?? '', closedByName: r.closedByName ?? '', status: r.status }); setNcrModal({ open: true, row: r }) }
  function saveNCR() {
    if (!ncrModal.row) onCreateNCR({ projectId, ...ncrForm })
    else onUpdateNCR({ id: ncrModal.row.id, ...ncrForm })
    setNcrModal({ open: false, row: null })
  }
  function openNCRResolve(r: NCRRow) {
    setNcrResolveForm({ rootCause: r.rootCause ?? '', correctiveAction: r.correctiveAction ?? '', preventiveAction: r.preventiveAction ?? '', closedDate: r.closedDate ?? '', closedByName: r.closedByName ?? '', status: r.status })
    setNcrResolveModal({ open: true, row: r })
  }
  function saveNCRResolve() {
    if (!ncrResolveModal.row) return
    const r = ncrResolveModal.row
    const f = ncrResolveForm
    const newStatus = f.closedDate ? 'closed' : (f.rootCause && f.correctiveAction) ? 'pending_close' : f.status
    const closedBy = f.closedDate ? (f.closedByName || currentUserName) : f.closedByName
    onUpdateNCR({ id: r.id, ncrNumber: r.ncrNumber, title: r.title, description: r.description, workPackage: r.workPackage ?? '', location: r.location ?? '', raisedByName: r.raisedByName ?? '', raisedDate: r.raisedDate, severity: r.severity, dueDate: r.dueDate ?? '', rootCause: f.rootCause, correctiveAction: f.correctiveAction, preventiveAction: f.preventiveAction, closedDate: f.closedDate, closedByName: closedBy, status: newStatus })
    setNcrResolveModal({ open: false, row: null })
  }

  // ── HSE section ───────────────────────────────────────────────────────────
  function openHSECreate() { setHseForm({ recordType: 'toolbox_talk', title: '', recordDate: new Date().toISOString().slice(0, 10), conductedBy: '', location: '', description: '', attendeeCount: '', attendeeNames: '', incidentType: '', severity: '', injuredPerson: '', rootCause: '', correctiveAction: '', correctiveDueDate: '', observationType: '', ptwType: '', ptwNumber: '', validFrom: '', validTo: '', approvedBy: '', ptwStatus: 'pending', status: 'open' }); setHseModal({ open: true, row: null }) }
  function openHSEEdit(r: HSERow) { setHseForm({ recordType: r.recordType, title: r.title, recordDate: r.recordDate, conductedBy: r.conductedBy ?? '', location: r.location ?? '', description: r.description ?? '', attendeeCount: r.attendeeCount?.toString() ?? '', attendeeNames: r.attendeeNames ?? '', incidentType: r.incidentType ?? '', severity: r.severity ?? '', injuredPerson: r.injuredPerson ?? '', rootCause: r.rootCause ?? '', correctiveAction: r.correctiveAction ?? '', correctiveDueDate: r.correctiveDueDate ?? '', observationType: r.observationType ?? '', ptwType: r.ptwType ?? '', ptwNumber: r.ptwNumber ?? '', validFrom: r.validFrom ? r.validFrom.slice(0, 16) : '', validTo: r.validTo ? r.validTo.slice(0, 16) : '', approvedBy: r.approvedBy ?? '', ptwStatus: r.ptwStatus ?? 'pending', status: r.status }); setHseModal({ open: true, row: r }) }
  function saveHSE() {
    const v: Record<string, unknown> = { ...hseForm, attendeeCount: hseForm.attendeeCount ? parseInt(hseForm.attendeeCount) : null }
    if (!hseModal.row) onCreateHSE({ projectId, ...v })
    else onUpdateHSE({ id: hseModal.row.id, ...v })
    setHseModal({ open: false, row: null })
  }

  // ── Transmittal section ───────────────────────────────────────────────────
  function openTxCreate() { const nextNum = String(transmittals.length + 1).padStart(3, '0'); setTxForm({ transmittalNumber: nextNum, title: '', toCompany: '', toContact: '', fromName: currentUserName, sentDate: new Date().toISOString().slice(0, 10), purpose: 'for_approval', acknowledgedDate: '', notes: '', status: 'sent' }); setTxModal({ open: true, row: null }) }
  function openTxEdit(r: TransmittalRow) { setTxForm({ transmittalNumber: r.transmittalNumber, title: r.title, toCompany: r.toCompany ?? '', toContact: r.toContact ?? '', fromName: r.fromName ?? '', sentDate: r.sentDate, purpose: r.purpose, acknowledgedDate: r.acknowledgedDate ?? '', notes: r.notes ?? '', status: r.status }); setTxModal({ open: true, row: r }) }
  function saveTx() {
    if (!txModal.row) onCreateTransmittal({ projectId, ...txForm })
    else onUpdateTransmittal({ id: txModal.row.id, ...txForm })
    setTxModal({ open: false, row: null })
  }
  function openTxItem(txId: string) { setTxItemForm({ documentTitle: '', documentNumber: '', revision: '', copies: '1' }); setTxItemModal({ open: true, transmittalId: txId }) }
  function saveTxItem() { onAddTransmittalItem({ transmittalId: txItemModal.transmittalId, ...txItemForm, copies: parseInt(txItemForm.copies) || 1 }); setTxItemModal({ open: false, transmittalId: '' }) }

  const rowStyle = (borderColor: string): React.CSSProperties => ({ padding: '14px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}`, borderRight: `1px solid ${th.border}`, borderBottom: `1px solid ${th.border}`, borderLeft: `4px solid ${borderColor}`, borderRadius: '8px', marginBottom: '8px' })
  const statusBorderColor = (status: string) => {
    const s = EXEC_STATUS_COLOR[status]
    return s ? s.border : th.border
  }

  const filteredHSE = hseType === 'all' ? hseRecords : hseRecords.filter(r => r.recordType === hseType)

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${th.border}`, marginBottom: '24px', flexWrap: 'wrap' }}>
        {EXEC_SUB_TABS.map(t => navBtn(t.key, t.label, sub, setSub))}
      </div>

      {/* ── RFIs ── */}
      {sub === 'rfis' && (
        <div>
          {execSectionHeader('Requests for Information', rfis.length, isEditable ? openRfiCreate : null, isEditable, th)}
          {rfis.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No RFIs raised yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rfis.map(r => (
              <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.status)}` }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>RFI-{r.rfiNumber}</span>
                  {execBadge(r.status, th)}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                    <span>Raised: {r.raisedDate}</span>
                    {r.requiredDate && <span style={{ color: '#ef4444', fontWeight: 500 }}>Required: {r.requiredDate}</span>}
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.subject}</div>
                    {r.description && <div style={{ fontSize: '13px', color: th.textSecondary, lineHeight: 1.5 }}>{r.description}</div>}
                  </div>
                  {(r.raisedByName || r.drawingRef || r.specRef) && (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12px', color: th.textMuted }}>
                      {r.raisedByName && <span>Raised by: <strong style={{ color: th.textPrimary }}>{r.raisedByName}</strong></span>}
                      {r.drawingRef && <span>Drawing: <strong style={{ color: th.textPrimary }}>{r.drawingRef}</strong></span>}
                      {r.specRef && <span>Spec: <strong style={{ color: th.textPrimary }}>{r.specRef}</strong></span>}
                    </div>
                  )}

                  {/* Response block */}
                  {r.response ? (
                    <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Response</div>
                      <div style={{ fontSize: '13px', color: th.textPrimary, lineHeight: 1.5 }}>{r.response}</div>
                      {(r.respondedByName || r.respondedDate) && (
                        <div style={{ fontSize: '11px', color: '#16a34a', marginTop: 6 }}>
                          {r.respondedByName && <span>{r.respondedByName}</span>}
                          {r.respondedDate && <span> · {r.respondedDate}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    r.status === 'open' && <div style={{ fontSize: '12px', color: th.textMuted, fontStyle: 'italic' }}>No response yet.</div>
                  )}

                  {/* Attachments */}
                  {(r.files?.length > 0 || isEditable) && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attachments {r.files?.length > 0 && `(${r.files.length})`}</span>
                        {isEditable && <ExecUploadButton entityId={r.id} entityType="rfi" onUpload={onUploadRFIFile} th={th} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {execFileList(r.files, isEditable ? (aId) => onDeleteRFIFile({ id: r.id, attachId: aId }) : null, isEditable, th)}
                        {(!r.files || r.files.length === 0) && <div style={{ fontSize: '12px', color: th.textMuted }}>No attachments.</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card footer actions */}
                {isEditable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                    {r.status === 'open' && (
                      <button onClick={() => openRfiRespond(r)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                        Respond
                      </button>
                    )}
                    <button onClick={() => openRfiEdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => addToast({ type: 'danger', message: `Delete RFI-${r.rfiNumber}?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteRFI(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Submittals ── */}
      {sub === 'submittals' && (
        <div>
          {execSectionHeader('Submittals', submittals.length, isEditable ? openSubCreate : null, isEditable, th)}
          {submittals.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No submittals yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {submittals.map(r => (
              <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.reviewStatus)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>{r.submittalNumber} · Rev.{r.revision}</span>
                  {execBadge(r.submittalType, th)}
                  {execBadge(r.reviewStatus, th)}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                    {r.submittedDate && <span>Submitted: {r.submittedDate}</span>}
                    {r.returnDate && <span>Return: {r.returnDate}</span>}
                  </div>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.title}</div>
                    {r.reviewerName && <div style={{ fontSize: '12px', color: th.textMuted }}>Reviewer: <strong style={{ color: th.textPrimary }}>{r.reviewerName}</strong></div>}
                    {r.remarks && <div style={{ fontSize: '13px', color: th.textSecondary, marginTop: 4, lineHeight: 1.5 }}>{r.remarks}</div>}
                  </div>
                  {(r.files?.length > 0 || isEditable) && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attachments {r.files?.length > 0 && `(${r.files.length})`}</span>
                        {isEditable && <ExecUploadButton entityId={r.id} entityType="submittal" onUpload={onUploadSubmittalFile} th={th} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {execFileList(r.files, isEditable ? (aId) => onDeleteSubmittalFile({ id: r.id, attachId: aId }) : null, isEditable, th)}
                        {(!r.files || r.files.length === 0) && <div style={{ fontSize: '12px', color: th.textMuted }}>No attachments.</div>}
                      </div>
                    </div>
                  )}
                </div>
                {isEditable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                    <button onClick={() => openSubEdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                    {r.reviewStatus === 'pending' && <button onClick={() => openSubReview(r)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Submit Review</button>}
                    <button onClick={() => addToast({ type: 'danger', message: `Delete submittal "${r.submittalNumber}"?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteSubmittal(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Site Instructions ── */}
      {sub === 'site_instructions' && (
        <div>
          {execSectionHeader('Site Instructions', siteInstructions.length, isEditable ? openSICreate : null, isEditable, th)}
          {siteInstructions.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No site instructions yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {siteInstructions.map(r => (
              <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.status)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>SI-{r.siNumber}</span>
                  {execBadge(r.status, th)}
                  {r.potentialVo && <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>VO Potential</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                    {r.issuedBy && <span>Issued by: {r.issuedBy}</span>}
                    <span>{r.issuedDate}</span>
                  </div>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.subject}</div>
                    {r.description && <div style={{ fontSize: '13px', color: th.textSecondary, lineHeight: 1.5 }}>{r.description}</div>}
                  </div>
                  {(r.acknowledgedByName || r.voRef) && (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12px', color: th.textMuted }}>
                      {r.acknowledgedByName && <span>Acknowledged: <strong style={{ color: th.textPrimary }}>{r.acknowledgedByName}</strong> {r.acknowledgedDate && `· ${r.acknowledgedDate}`}</span>}
                      {r.voRef && <span>VO Ref: <strong style={{ color: th.textPrimary }}>{r.voRef}</strong></span>}
                    </div>
                  )}
                  {(r.files?.length > 0 || isEditable) && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attachments {r.files?.length > 0 && `(${r.files.length})`}</span>
                        {isEditable && <ExecUploadButton entityId={r.id} entityType="site_instruction" onUpload={onUploadSIFile} th={th} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {execFileList(r.files, isEditable ? (aId) => onDeleteSIFile({ id: r.id, attachId: aId }) : null, isEditable, th)}
                        {(!r.files || r.files.length === 0) && <div style={{ fontSize: '12px', color: th.textMuted }}>No attachments.</div>}
                      </div>
                    </div>
                  )}
                </div>
                {isEditable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                    <button onClick={() => openSIEdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                    {r.status === 'open' && <button onClick={() => onUpdateSI({ id: r.id, siNumber: r.siNumber, subject: r.subject, description: r.description ?? '', issuedBy: r.issuedBy ?? '', issuedDate: r.issuedDate, acknowledgedByName: currentUserName, acknowledgedDate: new Date().toISOString().slice(0, 10), potentialVo: r.potentialVo, voRef: r.voRef ?? '', status: 'acknowledged' })} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Acknowledge</button>}
                    <button onClick={() => addToast({ type: 'danger', message: `Delete SI-${r.siNumber}?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteSI(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── QA/QC ── */}
      {sub === 'qa_qc' && (
        <div>
          <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${th.border}`, marginBottom: '20px' }}>
            {QA_SUB_TABS.map(t => navBtn(t.key, t.label, qaSub, setQaSub))}
          </div>

          {/* ITPs */}
          {qaSub === 'itps' && (
            <div>
              {execSectionHeader('Inspection Test Plans', itps.length, isEditable ? openITPCreate : null, isEditable, th)}
              {itps.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No ITPs created yet.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {itps.map(r => (
                  <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.status)}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                      {isEditable ? (() => {
                        const s = EXEC_STATUS_COLOR[r.status] ?? { bg: th.bgSurface, color: th.textMuted, border: th.border }
                        return (
                          <select
                            value={r.status}
                            onChange={e => onUpdateITP({ id: r.id, title: r.title, workPackage: r.workPackage ?? '', discipline: r.discipline ?? '', revision: r.revision, status: e.target.value, createdByName: r.createdByName ?? '' })}
                            style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: s.bg, color: s.color, border: `1px solid ${s.border}`, cursor: 'pointer' }}
                          >
                            <option value="draft">Draft</option>
                            <option value="approved">Approved</option>
                            <option value="active">Active</option>
                            <option value="closed">Closed</option>
                          </select>
                        )
                      })() : execBadge(r.status, th)}
                      <span style={{ fontSize: '11px', color: th.textMuted }}>Rev. {r.revision}</span>
                      {r.discipline && <span style={{ fontSize: '11px', color: th.textMuted }}>· {r.discipline}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: th.textMuted }}>{r.items.length} checklist item{r.items.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.title}</div>
                      {r.workPackage && <div style={{ fontSize: '12px', color: th.textMuted }}>Work Package: <strong style={{ color: th.textPrimary }}>{r.workPackage}</strong></div>}
                    </div>
                    {expandedId === r.id && r.items.length > 0 && (
                      <div style={{ borderTop: `1px solid ${th.border}`, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: th.bgCanvas }}>
                              {['#', 'Activity', 'Type', 'Contractor', 'Client', 'Result', 'Inspector', 'Date', isEditable ? 'Action' : ''].filter(Boolean).map(h => (
                                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: th.textMuted, borderBottom: `1px solid ${th.border}`, whiteSpace: 'nowrap', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map(item => (
                              <tr key={item.id} style={{ borderBottom: `1px solid ${th.border}` }}>
                                <td style={{ padding: '8px 12px', color: th.textMuted }}>{item.sequence + 1}</td>
                                <td style={{ padding: '8px 12px', color: th.textPrimary }}>{item.activity}</td>
                                <td style={{ padding: '8px 12px' }}><span style={{ fontWeight: 700, fontSize: '11px', color: { check: '#1d4ed8', hold: '#991b1b', witness: '#7e22ce', review: '#166534' }[item.inspectionType] ?? th.textMuted }}>{item.inspectionType.charAt(0).toUpperCase()}</span></td>
                                <td style={{ padding: '8px 12px', color: th.textMuted }}>{item.contractorRole ?? '—'}</td>
                                <td style={{ padding: '8px 12px', color: th.textMuted }}>{item.clientRole ?? '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{item.result ? execBadge(item.result, th) : <span style={{ color: th.textMuted }}>—</span>}</td>
                                <td style={{ padding: '8px 12px', color: th.textMuted }}>{item.inspectorName ?? '—'}</td>
                                <td style={{ padding: '8px 12px', color: th.textMuted }}>{item.inspectionDate ?? '—'}</td>
                                {isEditable && <td style={{ padding: '8px 12px' }}><button onClick={() => { setItpResultForm({ result: 'pass', inspectorName: '', inspectionDate: new Date().toISOString().slice(0, 10), remarks: '' }); setItpResultModal({ open: true, item }) }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>Record</button></td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                      <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                        {expandedId === r.id ? '▲ Hide Items' : '▼ View Items'}
                      </button>
                      {isEditable && <>
                        <button onClick={() => openITPItems(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit Items</button>
                        <button onClick={() => openITPEdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => addToast({ type: 'danger', message: `Delete ITP "${r.title}"?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteITP(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                      </>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inspection Requests */}
          {qaSub === 'irs' && (
            <div>
              {execSectionHeader('Inspection Requests', inspectionRequests.length, isEditable ? openIRCreate : null, isEditable, th)}
              {inspectionRequests.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No inspection requests yet.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {inspectionRequests.map(r => (
                  <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.status)}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>IR-{r.irNumber}</span>
                      {execBadge(r.status, th)}
                      {r.result && execBadge(r.result, th)}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                        <span>Requested: {r.requestedDate}</span>
                        {r.actualDate && <span>Actual: {r.actualDate}</span>}
                      </div>
                    </div>
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.title}</div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12px', color: th.textMuted }}>
                          {r.workPackage && <span>Work Pkg: <strong style={{ color: th.textPrimary }}>{r.workPackage}</strong></span>}
                          {r.location && <span>Location: <strong style={{ color: th.textPrimary }}>{r.location}</strong></span>}
                          {r.inspectorName && <span>Inspector: <strong style={{ color: th.textPrimary }}>{r.inspectorName}</strong></span>}
                        </div>
                        {r.remarks && <div style={{ fontSize: '13px', color: th.textSecondary, marginTop: 6, lineHeight: 1.5 }}>{r.remarks}</div>}
                      </div>
                      {(r.files?.length > 0 || isEditable) && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attachments {r.files?.length > 0 && `(${r.files.length})`}</span>
                            {isEditable && <ExecUploadButton entityId={r.id} entityType="inspection_request" onUpload={onUploadIRFile} th={th} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {execFileList(r.files, isEditable ? (aId) => onDeleteIRFile({ id: r.id, attachId: aId }) : null, isEditable, th)}
                            {(!r.files || r.files.length === 0) && <div style={{ fontSize: '12px', color: th.textMuted }}>No attachments.</div>}
                          </div>
                        </div>
                      )}
                    </div>
                    {isEditable && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                        <button onClick={() => openIREdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                        {r.status === 'pending' && <button onClick={() => openIRInspect(r)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Record Inspection</button>}
                        <button onClick={() => addToast({ type: 'danger', message: `Delete IR-${r.irNumber}?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteIR(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NCRs */}
          {qaSub === 'ncrs' && (
            <div>
              {execSectionHeader('Non-Conformance Reports', ncrs.length, isEditable ? openNCRCreate : null, isEditable, th)}
              {ncrs.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No NCRs raised yet.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ncrs.map(r => (
                  <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.severity)}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>NCR-{r.ncrNumber}</span>
                      {execBadge(r.severity, th)}
                      {execBadge(r.status, th)}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                        {r.raisedByName && <span>{r.raisedByName}</span>}
                        <span>{r.raisedDate}</span>
                        {r.dueDate && <span style={{ color: '#f59e0b', fontWeight: 500 }}>Due: {r.dueDate}</span>}
                      </div>
                    </div>
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.title}</div>
                        {r.description && <div style={{ fontSize: '13px', color: th.textSecondary, lineHeight: 1.5 }}>{r.description}</div>}
                        {r.closedDate && <div style={{ fontSize: '12px', color: '#22c55e', marginTop: 4 }}>Closed: {r.closedDate}{r.closedByName ? ` · ${r.closedByName}` : ''}</div>}
                      </div>
                      {r.correctiveAction && (
                        <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Corrective Action</div>
                          <div style={{ fontSize: '13px', color: th.textPrimary, lineHeight: 1.5 }}>{r.correctiveAction}</div>
                        </div>
                      )}
                      {(r.files?.length > 0 || isEditable) && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attachments {r.files?.length > 0 && `(${r.files.length})`}</span>
                            {isEditable && <ExecUploadButton entityId={r.id} entityType="ncr" onUpload={onUploadNCRFile} th={th} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {execFileList(r.files, isEditable ? (aId) => onDeleteNCRFile({ id: r.id, attachId: aId }) : null, isEditable, th)}
                            {(!r.files || r.files.length === 0) && <div style={{ fontSize: '12px', color: th.textMuted }}>No attachments.</div>}
                          </div>
                        </div>
                      )}
                    </div>
                    {isEditable && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                        <button onClick={() => openNCREdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                        {r.status !== 'closed' && <button onClick={() => openNCRResolve(r)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Resolve NCR</button>}
                        <button onClick={() => addToast({ type: 'danger', message: `Delete NCR-${r.ncrNumber}?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteNCR(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HSE ── */}
      {sub === 'hse' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: th.textPrimary }}>HSE Records <span style={{ fontSize: '13px', fontWeight: 400, color: th.textMuted }}>({filteredHSE.length})</span></div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              {HSE_TYPES.map(t => (
                <button key={t} onClick={() => setHseType(t)} style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${hseType === t ? th.accent : th.border}`, background: hseType === t ? th.accent : 'none', color: hseType === t ? '#fff' : th.textSecondary, fontSize: '12px', fontWeight: hseType === t ? 600 : 400, cursor: 'pointer' }}>{t === 'all' ? 'All' : t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</button>
              ))}
              {isEditable && <button onClick={openHSECreate} style={{ padding: '5px 16px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginLeft: '4px' }}>+ Add</button>}
            </div>
          </div>
          {filteredHSE.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No HSE records yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredHSE.map(r => (
              <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.recordType)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}`, flexWrap: 'wrap' }}>
                  {execBadge(r.recordType, th)}
                  {r.severity && execBadge(r.severity, th)}
                  {r.recordType === 'ptw' && r.ptwStatus && isEditable ? (() => {
                    const s = EXEC_STATUS_COLOR[r.ptwStatus] ?? { bg: th.bgSurface, color: th.textMuted, border: th.border }
                    const hsePayload = (extra: Record<string, unknown>) => ({ id: r.id, recordType: r.recordType, title: r.title, recordDate: r.recordDate, conductedBy: r.conductedBy ?? '', location: r.location ?? '', description: r.description ?? '', attendeeCount: r.attendeeCount?.toString() ?? '', attendeeNames: r.attendeeNames ?? '', incidentType: r.incidentType ?? '', severity: r.severity ?? '', injuredPerson: r.injuredPerson ?? '', rootCause: r.rootCause ?? '', correctiveAction: r.correctiveAction ?? '', correctiveDueDate: r.correctiveDueDate ?? '', observationType: r.observationType ?? '', ptwType: r.ptwType ?? '', ptwNumber: r.ptwNumber ?? '', validFrom: r.validFrom ?? '', validTo: r.validTo ?? '', approvedBy: r.approvedBy ?? '', ptwStatus: r.ptwStatus ?? 'pending', status: r.status, ...extra })
                    return <select value={r.ptwStatus} onChange={e => onUpdateHSE(hsePayload({ ptwStatus: e.target.value }))} style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: s.bg, color: s.color, border: `1px solid ${s.border}`, cursor: 'pointer' }}>
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  })() : (r.ptwStatus && execBadge(r.ptwStatus, th))}
                  {execBadge(r.status, th)}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                    <span>{r.recordDate}</span>
                    {r.conductedBy && <span>By: {r.conductedBy}</span>}
                    {r.location && <span>{r.location}</span>}
                  </div>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.title}</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12px', color: th.textMuted }}>
                      {r.attendeeCount != null && <span>Attendees: <strong style={{ color: th.textPrimary }}>{r.attendeeCount}</strong></span>}
                      {r.ptwNumber && <span>PTW#: <strong style={{ color: th.textPrimary }}>{r.ptwNumber}</strong></span>}
                      {r.ptwType && <span>Type: {r.ptwType.replace(/_/g, ' ')}</span>}
                      {r.validFrom && <span>Valid: {r.validFrom.slice(0, 10)} → {r.validTo?.slice(0, 10)}</span>}
                    </div>
                    {r.description && <div style={{ fontSize: '13px', color: th.textSecondary, marginTop: 6, lineHeight: 1.5 }}>{r.description}</div>}
                  </div>
                  {r.correctiveAction && (
                    <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Corrective Action</div>
                      <div style={{ fontSize: '13px', color: th.textPrimary, lineHeight: 1.5 }}>{r.correctiveAction}</div>
                    </div>
                  )}
                  {(r.files?.length > 0 || isEditable) && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attachments {r.files?.length > 0 && `(${r.files.length})`}</span>
                        {isEditable && <ExecUploadButton entityId={r.id} entityType="hse_record" onUpload={onUploadHSEFile} th={th} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {execFileList(r.files, isEditable ? (aId) => onDeleteHSEFile({ id: r.id, attachId: aId }) : null, isEditable, th)}
                        {(!r.files || r.files.length === 0) && <div style={{ fontSize: '12px', color: th.textMuted }}>No attachments.</div>}
                      </div>
                    </div>
                  )}
                </div>
                {isEditable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                    <button onClick={() => openHSEEdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                    {r.recordType !== 'ptw' && r.status === 'open' && <button onClick={() => onUpdateHSE({ id: r.id, recordType: r.recordType, title: r.title, recordDate: r.recordDate, conductedBy: r.conductedBy ?? '', location: r.location ?? '', description: r.description ?? '', attendeeCount: r.attendeeCount?.toString() ?? '', attendeeNames: r.attendeeNames ?? '', incidentType: r.incidentType ?? '', severity: r.severity ?? '', injuredPerson: r.injuredPerson ?? '', rootCause: r.rootCause ?? '', correctiveAction: r.correctiveAction ?? '', correctiveDueDate: r.correctiveDueDate ?? '', observationType: r.observationType ?? '', ptwType: r.ptwType ?? '', ptwNumber: r.ptwNumber ?? '', validFrom: r.validFrom ?? '', validTo: r.validTo ?? '', approvedBy: r.approvedBy ?? '', ptwStatus: r.ptwStatus ?? 'pending', status: 'closed' })} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Close Record</button>}
                    <button onClick={() => addToast({ type: 'danger', message: `Delete HSE record "${r.title}"?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteHSE(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transmittals ── */}
      {sub === 'transmittals' && (
        <div>
          {execSectionHeader('Transmittals', transmittals.length, isEditable ? openTxCreate : null, isEditable, th)}
          {transmittals.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: th.textMuted, fontSize: '13px' }}>No transmittals yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {transmittals.map(r => (
              <div key={r.id} style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden', borderLeft: `3px solid ${statusBorderColor(r.status)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>TXL-{r.transmittalNumber}</span>
                  {execBadge(r.purpose, th)}
                  {execBadge(r.status, th)}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '11px', color: th.textMuted }}>
                    <span>Sent: {r.sentDate}</span>
                    {r.acknowledgedDate && <span style={{ color: '#22c55e', fontWeight: 500 }}>Ack: {r.acknowledgedDate}</span>}
                  </div>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{r.title}</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12px', color: th.textMuted }}>
                      {r.toCompany && <span>To: <strong style={{ color: th.textPrimary }}>{r.toCompany}{r.toContact ? ` / ${r.toContact}` : ''}</strong></span>}
                      {r.fromName && <span>From: <strong style={{ color: th.textPrimary }}>{r.fromName}</strong></span>}
                    </div>
                    {r.notes && <div style={{ fontSize: '13px', color: th.textSecondary, marginTop: 6, lineHeight: 1.5 }}>{r.notes}</div>}
                  </div>
                  {/* Documents section */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Documents ({r.items.length})</span>
                      <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} style={{ fontSize: '11px', color: th.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {expandedId === r.id ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {expandedId === r.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {r.items.map(item => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: th.bgCanvas, border: `1px solid ${th.border}`, borderRadius: 6, fontSize: '12px' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={th.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                            <span style={{ flex: 1, color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.documentTitle}</span>
                            {item.documentNumber && <span style={{ color: th.textMuted, flexShrink: 0 }}>{item.documentNumber}</span>}
                            {item.revision && <span style={{ color: th.textMuted, flexShrink: 0 }}>Rev.{item.revision}</span>}
                            <span style={{ color: th.textMuted, flexShrink: 0 }}>×{item.copies}</span>
                            {item.downloadUrl && <a href={item.downloadUrl} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>}
                            {isEditable && <button onClick={() => onDeleteTransmittalItem(item.id)} style={{ border: 'none', background: 'transparent', color: th.textMuted, cursor: 'pointer', fontSize: '15px', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>}
                          </div>
                        ))}
                        {r.items.length === 0 && <div style={{ fontSize: '12px', color: th.textMuted }}>No documents attached.</div>}
                        {isEditable && <button onClick={() => openTxItem(r.id)} style={{ marginTop: 4, padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.accent, fontSize: '12px', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add Document</button>}
                      </div>
                    )}
                  </div>
                </div>
                {isEditable && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}` }}>
                    <button onClick={() => openTxEdit(r)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${th.border}`, background: 'none', color: th.textSecondary, fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                    {r.status === 'sent' && <button onClick={() => onUpdateTransmittal({ id: r.id, transmittalNumber: r.transmittalNumber, title: r.title, toCompany: r.toCompany ?? '', toContact: r.toContact ?? '', fromName: r.fromName ?? '', sentDate: r.sentDate, purpose: r.purpose, acknowledgedDate: new Date().toISOString().slice(0, 10), notes: r.notes ?? '', status: 'acknowledged' })} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: th.accent, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Acknowledge</button>}
                    <button onClick={() => addToast({ type: 'danger', message: `Delete transmittal TXL-${r.transmittalNumber}?`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteTransmittal(r.id) }, { label: 'Cancel', onClick: () => {} }] })} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RFI Modal ── */}
      {rfiModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{rfiModal.mode === 'create' ? 'New RFI' : rfiModal.mode === 'respond' ? 'Respond to RFI' : 'Edit RFI'}</h3>
          {rfiModal.mode !== 'respond' && (() => {
            const drawingOptions = [...new Set(drawings.map(d => d.drawingNumber))]
            const specOptions = [...new Set(rfqLines.map(l => l.specSection).filter((v): v is string => Boolean(v)))]
            const comboStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '13px', boxSizing: 'border-box' }
            return <>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px' }}>RFI Number</label>
                {rfiModal.mode === 'create' ? (
                  <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>
                    RFI-{rfiForm.rfiNumber}
                  </div>
                ) : inp(rfiForm.rfiNumber, v => setRfiForm(f => ({ ...f, rfiNumber: v })))}
              </div>
              {field('Subject *', inp(rfiForm.subject, v => setRfiForm(f => ({ ...f, subject: v })), 'Brief subject'))}
              {field('Description', textarea(rfiForm.description, v => setRfiForm(f => ({ ...f, description: v }))))}
              <datalist id="rfi-drawing-refs">{drawingOptions.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="rfi-spec-refs">{specOptions.map(v => <option key={v} value={v} />)}</datalist>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('Drawing Ref', <input list="rfi-drawing-refs" value={rfiForm.drawingRef} onChange={e => setRfiForm(f => ({ ...f, drawingRef: e.target.value }))} placeholder="e.g. DWG-A101" style={comboStyle} />)}
                {field('Spec Ref', <input list="rfi-spec-refs" value={rfiForm.specRef} onChange={e => setRfiForm(f => ({ ...f, specRef: e.target.value }))} placeholder="e.g. Section 03300" style={comboStyle} />)}
                {field('Raised By', inp(rfiForm.raisedByName, v => setRfiForm(f => ({ ...f, raisedByName: v }))))}
                {field('Raised Date', inp(rfiForm.raisedDate, v => setRfiForm(f => ({ ...f, raisedDate: v })), '', 'date'))}
                {field('Required By', inp(rfiForm.requiredDate, v => setRfiForm(f => ({ ...f, requiredDate: v })), '', 'date'))}
                {field('Status', sel(rfiForm.status, v => setRfiForm(f => ({ ...f, status: v })), ['open', 'responded', 'closed']))}
              </div>
            </>
          })()}
          {rfiModal.mode === 'respond' && <>
            {field('Response *', textarea(rfiForm.response, v => setRfiForm(f => ({ ...f, response: v })), 'Enter response…'))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Responded By', inp(rfiForm.respondedByName, v => setRfiForm(f => ({ ...f, respondedByName: v }))))}
              {field('Response Date', inp(rfiForm.respondedDate, v => setRfiForm(f => ({ ...f, respondedDate: v })), '', 'date'))}
            </div>
          </>}
          {modalBtns(saveRfi, () => setRfiModal({ open: false, row: null, mode: 'create' }), rfiModal.mode === 'respond' ? 'Submit Response' : 'Save')}
        </>,
        () => setRfiModal({ open: false, row: null, mode: 'create' })
      )}

      {/* ── Submittal Modal ── */}
      {subModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{subModal.row ? 'Edit Submittal' : 'New Submittal'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px' }}>Submittal Number</label>
              {!subModal.row ? (
                <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>
                  SUB-{subForm.submittalNumber}
                </div>
              ) : inp(subForm.submittalNumber, v => setSubForm(f => ({ ...f, submittalNumber: v })))}
            </div>
            {field('Revision', inp(subForm.revision, v => setSubForm(f => ({ ...f, revision: v }))))}
          </div>
          {field('Title *', inp(subForm.title, v => setSubForm(f => ({ ...f, title: v })), 'e.g. Shop Drawing — Steel Connections'))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Type', sel(subForm.submittalType, v => setSubForm(f => ({ ...f, submittalType: v })), ['shop_drawing', 'method_statement', 'material_datasheet', 'certificate', 'om_manual', 'other']))}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px' }}>Review Status</label>
              {!subModal.row ? (
                <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px' }}>
                  Pending (set by reviewer)
                </div>
              ) : sel(subForm.reviewStatus, v => setSubForm(f => ({ ...f, reviewStatus: v })), ['pending', 'approved', 'approved_with_comments', 'rejected', 'resubmit'])}
            </div>
            {field('Submitted Date', inp(subForm.submittedDate, v => setSubForm(f => ({ ...f, submittedDate: v })), '', 'date'))}
            {field('Return Date', inp(subForm.returnDate, v => setSubForm(f => ({ ...f, returnDate: v })), '', 'date'))}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px' }}>Reviewer</label>
              <select value={subForm.reviewerName} onChange={e => setSubForm(f => ({ ...f, reviewerName: e.target.value }))} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: subForm.reviewerName ? th.textPrimary : th.textMuted, fontSize: '13px' }}>
                <option value=''>— Select reviewer —</option>
                {team.map(m => (
                  <option key={m.employee_name} value={m.employee_name}>
                    {m.employee_name}{m.job_title ? ` · ${m.job_title}` : ''}{m.member_type ? ` (${m.member_type.replace(/_/g, ' ')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {field('Remarks', textarea(subForm.remarks, v => setSubForm(f => ({ ...f, remarks: v }))))}
          {modalBtns(saveSub, () => setSubModal({ open: false, row: null }))}
        </>,
        () => setSubModal({ open: false, row: null })
      )}

      {/* ── Submittal Review Modal ── */}
      {subReviewModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: th.textPrimary }}>Submit Review</h3>
          <p style={{ fontSize: '12px', color: th.textMuted, margin: '0 0 16px' }}>SUB-{subReviewModal.row?.submittalNumber} · {subReviewModal.row?.title}</p>
          {field('Reviewer', inp(subReviewForm.reviewerName, v => setSubReviewForm(f => ({ ...f, reviewerName: v }))))}
          {field('Review Status *', sel(subReviewForm.reviewStatus, v => setSubReviewForm(f => ({ ...f, reviewStatus: v })), ['approved', 'approved_with_comments', 'rejected', 'resubmit']))}
          {field('Return Date', inp(subReviewForm.returnDate, v => setSubReviewForm(f => ({ ...f, returnDate: v })), '', 'date'))}
          {field('Remarks', textarea(subReviewForm.remarks, v => setSubReviewForm(f => ({ ...f, remarks: v }))))}
          {modalBtns(saveSubReview, () => setSubReviewModal({ open: false, row: null }), 'Save Review')}
        </>,
        () => setSubReviewModal({ open: false, row: null })
      )}

      {/* ── Site Instruction Modal ── */}
      {siModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{siModal.row ? 'Edit Site Instruction' : 'New Site Instruction'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px' }}>SI Number</label>
              {!siModal.row ? (
                <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>
                  SI-{siForm.siNumber}
                </div>
              ) : inp(siForm.siNumber, v => setSiForm(f => ({ ...f, siNumber: v })))}
            </div>
            {field('Issued Date', inp(siForm.issuedDate, v => setSiForm(f => ({ ...f, issuedDate: v })), '', 'date'))}
          </div>
          {field('Subject *', inp(siForm.subject, v => setSiForm(f => ({ ...f, subject: v }))))}
          {field('Description', textarea(siForm.description, v => setSiForm(f => ({ ...f, description: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Issued By', inp(siForm.issuedBy, v => setSiForm(f => ({ ...f, issuedBy: v }))))}
            {field('Status', sel(siForm.status, v => setSiForm(f => ({ ...f, status: v })), ['open', 'acknowledged', 'closed']))}
            {field('Acknowledged By', inp(siForm.acknowledgedByName, v => setSiForm(f => ({ ...f, acknowledgedByName: v }))))}
            {field('Acknowledged Date', inp(siForm.acknowledgedDate, v => setSiForm(f => ({ ...f, acknowledgedDate: v })), '', 'date'))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <input type="checkbox" id="si-vo" checked={siForm.potentialVo} onChange={e => setSiForm(f => ({ ...f, potentialVo: e.target.checked }))} />
            <label htmlFor="si-vo" style={{ fontSize: '13px', color: th.textPrimary }}>Potential Variation Order</label>
          </div>
          {siForm.potentialVo && field('VO Reference', inp(siForm.voRef, v => setSiForm(f => ({ ...f, voRef: v }))))}
          {modalBtns(saveSI, () => setSiModal({ open: false, row: null }))}
        </>,
        () => setSiModal({ open: false, row: null })
      )}

      {/* ── ITP Modal ── */}
      {itpModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{itpModal.row ? 'Edit ITP' : 'New ITP'}</h3>
          {field('Title *', inp(itpForm.title, v => setItpForm(f => ({ ...f, title: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Work Package', inp(itpForm.workPackage, v => setItpForm(f => ({ ...f, workPackage: v }))))}
            {field('Discipline', inp(itpForm.discipline, v => setItpForm(f => ({ ...f, discipline: v }))))}
            {field('Revision', inp(itpForm.revision, v => setItpForm(f => ({ ...f, revision: v }))))}
            {field('Status', sel(itpForm.status, v => setItpForm(f => ({ ...f, status: v })), ['draft', 'approved', 'active', 'closed']))}
            {field('Created By', inp(itpForm.createdByName, v => setItpForm(f => ({ ...f, createdByName: v }))))}
          </div>
          {modalBtns(saveITP, () => setItpModal({ open: false, row: null }))}
        </>,
        () => setItpModal({ open: false, row: null }),
        '760px'
      )}

      {/* ── ITP Items Modal ── */}
      {itpItemsModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: th.textPrimary }}>ITP Checklist — {itpItemsModal.itp?.title}</h3>
          <p style={{ fontSize: '12px', color: th.textMuted, margin: '0 0 14px' }}>Type: C=Check, H=Hold, W=Witness, R=Review</p>
          <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
            <div style={{ minWidth: '820px' }}>
              {itpItems.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 110px 1fr 1fr 36px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: th.textMuted, textAlign: 'center' }}>{idx + 1}</span>
                  <input value={item.activity} onChange={e => setItpItems(prev => prev.map((x, i) => i === idx ? { ...x, activity: e.target.value } : x))} placeholder="Activity" style={{ padding: '5px 8px', borderRadius: '5px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                  <select value={item.inspectionType} onChange={e => setItpItems(prev => prev.map((x, i) => i === idx ? { ...x, inspectionType: e.target.value } : x))} style={{ padding: '5px 6px', borderRadius: '5px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '12px' }}>
                    <option value="check">Check</option>
                    <option value="hold">Hold</option>
                    <option value="witness">Witness</option>
                    <option value="review">Review</option>
                  </select>
                  <input value={item.contractorRole ?? ''} onChange={e => setItpItems(prev => prev.map((x, i) => i === idx ? { ...x, contractorRole: e.target.value } : x))} placeholder="Contractor role" style={{ padding: '5px 8px', borderRadius: '5px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                  <input value={item.clientRole ?? ''} onChange={e => setItpItems(prev => prev.map((x, i) => i === idx ? { ...x, clientRole: e.target.value } : x))} placeholder="Client role" style={{ padding: '5px 8px', borderRadius: '5px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textPrimary, fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                  <button onClick={() => setItpItems(prev => prev.filter((_, i) => i !== idx))} style={{ padding: '4px 8px', border: 'none', background: '#fef2f2', color: '#991b1b', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
              <button onClick={addITPItem} style={{ marginTop: '8px', padding: '6px 14px', borderRadius: '6px', border: `1px dashed ${th.border}`, background: 'transparent', color: th.textSecondary, fontSize: '12px', cursor: 'pointer', width: '100%' }}>+ Add Item</button>
            </div>
          </div>
          {modalBtns(saveITPItems, () => setItpItemsModal({ open: false, itp: null }), 'Save Checklist')}
        </>,
        () => setItpItemsModal({ open: false, itp: null }),
        '1100px',
        '90vh'
      )}

      {/* ── ITP Result Modal ── */}
      {itpResultModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: th.textPrimary }}>Record Inspection Result</h3>
          <p style={{ fontSize: '12px', color: th.textMuted, margin: '0 0 16px' }}>{itpResultModal.item?.activity}</p>
          {field('Result', sel(itpResultForm.result, v => setItpResultForm(f => ({ ...f, result: v })), ['pass', 'fail', 'na']))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Inspector Name', inp(itpResultForm.inspectorName, v => setItpResultForm(f => ({ ...f, inspectorName: v }))))}
            {field('Inspection Date', inp(itpResultForm.inspectionDate, v => setItpResultForm(f => ({ ...f, inspectionDate: v })), '', 'date'))}
          </div>
          {field('Remarks', textarea(itpResultForm.remarks, v => setItpResultForm(f => ({ ...f, remarks: v }))))}
          {modalBtns(() => { if (itpResultModal.item) { onRecordITPResult({ id: itpResultModal.item.id, result: itpResultForm.result, inspectorName: itpResultForm.inspectorName, inspectionDate: itpResultForm.inspectionDate, remarks: itpResultForm.remarks }); setItpResultModal({ open: false, item: null }) } }, () => setItpResultModal({ open: false, item: null }), 'Record')}
        </>,
        () => setItpResultModal({ open: false, item: null })
      )}

      {/* ── IR Modal ── */}
      {irModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{irModal.row ? 'Edit Inspection Request' : 'New Inspection Request'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('IR Number', irModal.row
              ? inp(irForm.irNumber, v => setIrForm(f => ({ ...f, irNumber: v })))
              : <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>IR-{irForm.irNumber}</div>
            )}
            {field('Requested Date', inp(irForm.requestedDate, v => setIrForm(f => ({ ...f, requestedDate: v })), '', 'date'))}
          </div>
          {field('Title *', inp(irForm.title, v => setIrForm(f => ({ ...f, title: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Work Package', inp(irForm.workPackage, v => setIrForm(f => ({ ...f, workPackage: v }))))}
            {field('Location', inp(irForm.location, v => setIrForm(f => ({ ...f, location: v }))))}
            {field('Requested By', inp(irForm.requestedByName, v => setIrForm(f => ({ ...f, requestedByName: v }))))}
          </div>
          {irModal.row && (
            <>
              <div style={{ margin: '16px 0 12px', borderTop: `1px solid ${th.border}`, paddingTop: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Inspection Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {field('Inspector Name', inp(irForm.inspectorName, v => setIrForm(f => ({ ...f, inspectorName: v }))))}
                  {field('Actual Date', inp(irForm.actualDate, v => setIrForm(f => ({ ...f, actualDate: v })), '', 'date'))}
                  {field('Result', sel(irForm.result, v => { const s = v === 'rejected' ? 'rejected' : v ? 'accepted' : irForm.status; setIrForm(f => ({ ...f, result: v, status: s })) }, ['', 'accepted', 'accepted_with_punch', 'rejected']))}
                  {field('Status', sel(irForm.status, v => setIrForm(f => ({ ...f, status: v })), ['pending', 'accepted', 'rejected', 'closed']))}
                </div>
                {field('Remarks', textarea(irForm.remarks, v => setIrForm(f => ({ ...f, remarks: v }))))}
              </div>
            </>
          )}
          {modalBtns(saveIR, () => setIrModal({ open: false, row: null }))}
        </>,
        () => setIrModal({ open: false, row: null })
      )}

      {/* ── IR Inspect Modal ── */}
      {irInspectModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: th.textPrimary }}>Record Inspection</h3>
          <p style={{ fontSize: '12px', color: th.textMuted, margin: '0 0 16px' }}>IR-{irInspectModal.row?.irNumber} · {irInspectModal.row?.title}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Inspector Name', inp(irInspectForm.inspectorName, v => setIrInspectForm(f => ({ ...f, inspectorName: v }))))}
            {field('Actual Date', inp(irInspectForm.actualDate, v => setIrInspectForm(f => ({ ...f, actualDate: v })), '', 'date'))}
          </div>
          {field('Result *', sel(irInspectForm.result, v => setIrInspectForm(f => ({ ...f, result: v })), ['', 'accepted', 'accepted_with_punch', 'rejected']))}
          {field('Remarks', textarea(irInspectForm.remarks, v => setIrInspectForm(f => ({ ...f, remarks: v }))))}
          {modalBtns(saveIRInspect, () => setIrInspectModal({ open: false, row: null }), 'Save Inspection')}
        </>,
        () => setIrInspectModal({ open: false, row: null })
      )}

      {/* ── NCR Modal ── */}
      {ncrModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{ncrModal.row ? 'Edit NCR' : 'New NCR'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('NCR Number', ncrModal.row
              ? inp(ncrForm.ncrNumber, v => setNcrForm(f => ({ ...f, ncrNumber: v })))
              : <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>NCR-{ncrForm.ncrNumber}</div>
            )}
            {field('Raised Date', inp(ncrForm.raisedDate, v => setNcrForm(f => ({ ...f, raisedDate: v })), '', 'date'))}
          </div>
          {field('Title *', inp(ncrForm.title, v => setNcrForm(f => ({ ...f, title: v }))))}
          {field('Description *', textarea(ncrForm.description, v => setNcrForm(f => ({ ...f, description: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Work Package', inp(ncrForm.workPackage, v => setNcrForm(f => ({ ...f, workPackage: v }))))}
            {field('Location', inp(ncrForm.location, v => setNcrForm(f => ({ ...f, location: v }))))}
            {field('Raised By', inp(ncrForm.raisedByName, v => setNcrForm(f => ({ ...f, raisedByName: v }))))}
            {field('Severity', sel(ncrForm.severity, v => setNcrForm(f => ({ ...f, severity: v })), ['minor', 'major', 'critical']))}
            {field('Due Date', inp(ncrForm.dueDate, v => setNcrForm(f => ({ ...f, dueDate: v })), '', 'date'))}
          </div>
          {ncrModal.row && (
            <>
              <div style={{ margin: '16px 0 12px', borderTop: `1px solid ${th.border}`, paddingTop: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Resolution</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {field('Status', sel(ncrForm.status, v => setNcrForm(f => ({ ...f, status: v })), ['open', 'pending_close', 'closed']))}
                  {field('Closed Date', inp(ncrForm.closedDate, v => {
                    const newStatus = v ? 'closed' : ncrForm.status === 'closed' ? 'pending_close' : ncrForm.status
                    const closedBy = v ? (ncrForm.closedByName || currentUserName) : ncrForm.closedByName
                    setNcrForm(f => ({ ...f, closedDate: v, closedByName: closedBy, status: newStatus }))
                  }, '', 'date'))}
                  {field('Closed By', inp(ncrForm.closedByName, v => setNcrForm(f => ({ ...f, closedByName: v }))))}
                </div>
                {field('Root Cause', textarea(ncrForm.rootCause, v => {
                  const s = v && ncrForm.correctiveAction && ncrForm.status === 'open' ? 'pending_close' : ncrForm.status
                  setNcrForm(f => ({ ...f, rootCause: v, status: s }))
                }))}
                {field('Corrective Action', textarea(ncrForm.correctiveAction, v => {
                  const s = v && ncrForm.rootCause && ncrForm.status === 'open' ? 'pending_close' : ncrForm.status
                  setNcrForm(f => ({ ...f, correctiveAction: v, status: s }))
                }))}
                {field('Preventive Action', textarea(ncrForm.preventiveAction, v => setNcrForm(f => ({ ...f, preventiveAction: v }))))}
              </div>
            </>
          )}
          {modalBtns(saveNCR, () => setNcrModal({ open: false, row: null }))}
        </>,
        () => setNcrModal({ open: false, row: null })
      )}

      {/* ── NCR Resolve Modal ── */}
      {ncrResolveModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: th.textPrimary }}>Resolve NCR</h3>
          <p style={{ fontSize: '12px', color: th.textMuted, margin: '0 0 16px' }}>NCR-{ncrResolveModal.row?.ncrNumber} · {ncrResolveModal.row?.title}</p>
          {field('Root Cause', textarea(ncrResolveForm.rootCause, v => {
            const s = v && ncrResolveForm.correctiveAction && ncrResolveForm.status === 'open' ? 'pending_close' : ncrResolveForm.status
            setNcrResolveForm(f => ({ ...f, rootCause: v, status: s }))
          }))}
          {field('Corrective Action', textarea(ncrResolveForm.correctiveAction, v => {
            const s = v && ncrResolveForm.rootCause && ncrResolveForm.status === 'open' ? 'pending_close' : ncrResolveForm.status
            setNcrResolveForm(f => ({ ...f, correctiveAction: v, status: s }))
          }))}
          {field('Preventive Action', textarea(ncrResolveForm.preventiveAction, v => setNcrResolveForm(f => ({ ...f, preventiveAction: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Closed Date', inp(ncrResolveForm.closedDate, v => {
              const newStatus = v ? 'closed' : ncrResolveForm.status === 'closed' ? 'pending_close' : ncrResolveForm.status
              const closedBy = v ? (ncrResolveForm.closedByName || currentUserName) : ncrResolveForm.closedByName
              setNcrResolveForm(f => ({ ...f, closedDate: v, closedByName: closedBy, status: newStatus }))
            }, '', 'date'))}
            {field('Closed By', inp(ncrResolveForm.closedByName, v => setNcrResolveForm(f => ({ ...f, closedByName: v }))))}
          </div>
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: 8, background: th.bgHover, border: `1px solid ${th.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: th.textMuted }}>Status will be saved as:</span>
            {(() => { const s = ncrResolveForm.closedDate ? 'closed' : (ncrResolveForm.rootCause && ncrResolveForm.correctiveAction) ? 'pending_close' : ncrResolveForm.status; return execBadge(s, th) })()}
          </div>
          {modalBtns(saveNCRResolve, () => setNcrResolveModal({ open: false, row: null }), 'Save Resolution')}
        </>,
        () => setNcrResolveModal({ open: false, row: null })
      )}

      {/* ── HSE Modal ── */}
      {hseModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{hseModal.row ? 'Edit HSE Record' : 'New HSE Record'}</h3>
          {field('Record Type', sel(hseForm.recordType, v => setHseForm(f => ({ ...f, recordType: v })), ['toolbox_talk', 'incident', 'observation', 'ptw']))}
          {field('Title *', inp(hseForm.title, v => setHseForm(f => ({ ...f, title: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Date', inp(hseForm.recordDate, v => setHseForm(f => ({ ...f, recordDate: v })), '', 'date'))}
            {field('Conducted By', inp(hseForm.conductedBy, v => setHseForm(f => ({ ...f, conductedBy: v }))))}
            {field('Location', inp(hseForm.location, v => setHseForm(f => ({ ...f, location: v }))))}
            {field('Status', sel(hseForm.status, v => setHseForm(f => ({ ...f, status: v })), ['open', 'closed']))}
          </div>
          {field('Description', textarea(hseForm.description, v => setHseForm(f => ({ ...f, description: v }))))}

          {hseForm.recordType === 'toolbox_talk' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {field('Attendee Count', inp(hseForm.attendeeCount, v => setHseForm(f => ({ ...f, attendeeCount: v })), '0', 'number'))}
              {field('Attendee Names', inp(hseForm.attendeeNames, v => setHseForm(f => ({ ...f, attendeeNames: v }))))}
            </div>
          )}

          {hseForm.recordType === 'incident' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('Incident Type', sel(hseForm.incidentType, v => setHseForm(f => ({ ...f, incidentType: v })), ['near_miss', 'first_aid', 'lti', 'dangerous_occurrence', 'fatality']))}
                {field('Severity', sel(hseForm.severity, v => setHseForm(f => ({ ...f, severity: v })), ['low', 'medium', 'high', 'critical']))}
                {field('Injured Person', inp(hseForm.injuredPerson, v => setHseForm(f => ({ ...f, injuredPerson: v }))))}
                {field('Corrective Due Date', inp(hseForm.correctiveDueDate, v => setHseForm(f => ({ ...f, correctiveDueDate: v })), '', 'date'))}
              </div>
              {field('Root Cause', textarea(hseForm.rootCause, v => setHseForm(f => ({ ...f, rootCause: v }))))}
              {field('Corrective Action', textarea(hseForm.correctiveAction, v => setHseForm(f => ({ ...f, correctiveAction: v }))))}
            </>
          )}

          {hseForm.recordType === 'observation' && (
            field('Observation Type', sel(hseForm.observationType, v => setHseForm(f => ({ ...f, observationType: v })), ['good', 'bad']))
          )}

          {hseForm.recordType === 'ptw' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('PTW Type', sel(hseForm.ptwType, v => setHseForm(f => ({ ...f, ptwType: v })), ['hot_work', 'confined_space', 'working_at_height', 'electrical', 'excavation', 'general']))}
                {field('PTW Number', inp(hseForm.ptwNumber, v => setHseForm(f => ({ ...f, ptwNumber: v }))))}
                {field('Valid From', inp(hseForm.validFrom, v => setHseForm(f => ({ ...f, validFrom: v })), '', 'datetime-local'))}
                {field('Valid To', inp(hseForm.validTo, v => setHseForm(f => ({ ...f, validTo: v })), '', 'datetime-local'))}
                {field('Approved By', inp(hseForm.approvedBy, v => setHseForm(f => ({ ...f, approvedBy: v }))))}
                {field('PTW Status', sel(hseForm.ptwStatus, v => setHseForm(f => ({ ...f, ptwStatus: v })), ['pending', 'active', 'expired', 'cancelled']))}
              </div>
            </>
          )}
          {modalBtns(saveHSE, () => setHseModal({ open: false, row: null }))}
        </>,
        () => setHseModal({ open: false, row: null })
      )}

      {/* ── Transmittal Modal ── */}
      {txModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>{txModal.row ? 'Edit Transmittal' : 'New Transmittal'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('Transmittal Number', txModal.row
              ? inp(txForm.transmittalNumber, v => setTxForm(f => ({ ...f, transmittalNumber: v })))
              : <div style={{ padding: '7px 12px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, color: th.textMuted, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>TXL-{txForm.transmittalNumber}</div>
            )}
            {field('Sent Date', inp(txForm.sentDate, v => setTxForm(f => ({ ...f, sentDate: v })), '', 'date'))}
          </div>
          {field('Title *', inp(txForm.title, v => setTxForm(f => ({ ...f, title: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {field('To Company', inp(txForm.toCompany, v => setTxForm(f => ({ ...f, toCompany: v }))))}
            {field('To Contact', inp(txForm.toContact, v => setTxForm(f => ({ ...f, toContact: v }))))}
            {field('From Name', inp(txForm.fromName, v => setTxForm(f => ({ ...f, fromName: v }))))}
            {field('Purpose', sel(txForm.purpose, v => setTxForm(f => ({ ...f, purpose: v })), ['for_approval', 'for_information', 'for_review', 'for_record', 'as_built']))}
          </div>
          {field('Notes', textarea(txForm.notes, v => setTxForm(f => ({ ...f, notes: v }))))}
          {txModal.row && (
            <div style={{ margin: '16px 0 12px', borderTop: `1px solid ${th.border}`, paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Acknowledgement</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {field('Status', sel(txForm.status, v => setTxForm(f => ({ ...f, status: v })), ['sent', 'acknowledged', 'superseded']))}
                {field('Acknowledged Date', inp(txForm.acknowledgedDate, v => setTxForm(f => ({ ...f, acknowledgedDate: v })), '', 'date'))}
              </div>
            </div>
          )}
          {modalBtns(saveTx, () => setTxModal({ open: false, row: null }))}
        </>,
        () => setTxModal({ open: false, row: null })
      )}

      {/* ── Transmittal Item Modal ── */}
      {txItemModal.open && modalOverlay(
        <>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: th.textPrimary }}>Add Document to Transmittal</h3>
          {field('Document Title *', inp(txItemForm.documentTitle, v => setTxItemForm(f => ({ ...f, documentTitle: v }))))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '12px' }}>
            {field('Document Number', inp(txItemForm.documentNumber, v => setTxItemForm(f => ({ ...f, documentNumber: v }))))}
            {field('Revision', inp(txItemForm.revision, v => setTxItemForm(f => ({ ...f, revision: v }))))}
            {field('Copies', inp(txItemForm.copies, v => setTxItemForm(f => ({ ...f, copies: v })), '1', 'number'))}
          </div>
          {modalBtns(saveTxItem, () => setTxItemModal({ open: false, transmittalId: '' }))}
        </>,
        () => setTxItemModal({ open: false, transmittalId: '' })
      )}
    </div>
  )
}

// ── PlanningTab ───────────────────────────────────────────────────────────────

type WBSNodeType = { id: string; projectId: string; parentId: string | null; wbsCode: string; name: string; description: string | null; level: number; sequence: number; budgetAmount: number; responsible: string | null; createdAt: string; updatedAt: string; children: WBSNodeType[] }
type ActivityType = { id: string; projectId: string; wbsId: string | null; activityCode: string; name: string; activityType: string; plannedStart: string | null; plannedFinish: string | null; durationDays: number; baselineStart: string | null; baselineFinish: string | null; baselineDuration: number | null; actualStart: string | null; actualFinish: string | null; percentComplete: number; earlyStart: string | null; earlyFinish: string | null; lateStart: string | null; lateFinish: string | null; totalFloat: number | null; freeFloat: number | null; isCritical: boolean; budgetAmount: number; actualCost: number; responsible: string | null; location: string | null; remarks: string | null; sequence: number; createdAt: string; updatedAt: string; predecessors: DepType[]; successors: DepType[]; resources: AssignmentType[] }
type DepType = { id: string; predecessorId: string; successorId: string; dependencyType: string; lagDays: number; predecessorCode: string | null; successorCode: string | null }
type BaselineType = { id: string; projectId: string; name: string; description: string | null; baselineDate: string; isActive: boolean; createdAt: string }
type ResourceType = { id: string; projectId: string; name: string; resourceType: string; unit: string; maxUnitsPerDay: number; costPerUnit: number; currencyCode: string; createdAt: string; updatedAt: string }
type AssignmentType = { id: string; activityId: string; resourceId: string; resourceName: string | null; unit: string | null; unitsPerDay: number; totalUnits: number | null; budgetedCost: number | null; actualUnits: number | null; actualCost: number | null }
type DayLoadType = { date: string; loadedUnits: number; availableUnits: number; isOverloaded: boolean }
type ResLoadType = { resourceId: string; resourceName: string; unit: string; maxUnitsPerDay: number; days: DayLoadType[] }
type EVMType = { bac: number; pv: number; ev: number; ac: number; sv: number; cv: number; spi: number; cpi: number; eac: number; etc: number; vac: number; tcpi: number; criticalPathComplete: number; statusDate: string }

type PlanningProps = {
  projectId: string
  th: Record<string, string>
  isEditable: boolean
  isAdmin: boolean
  wbsNodes: WBSNodeType[]
  activities: ActivityType[]
  baselines: BaselineType[]
  resources: ResourceType[]
  resourceLoading: ResLoadType[]
  evm: EVMType | null
  onCreateWBS: (v: Record<string, unknown>) => void
  onUpdateWBS: (v: Record<string, unknown>) => void
  onDeleteWBS: (id: string) => void
  onCreateActivity: (v: Record<string, unknown>) => void
  onUpdateActivity: (v: Record<string, unknown>) => void
  onUpdateProgress: (v: Record<string, unknown>) => void
  onDeleteActivity: (id: string) => void
  onBulkImport: (v: Record<string, unknown>) => void
  onCreateDependency: (v: Record<string, unknown>) => void
  onDeleteDependency: (id: string) => void
  onRecalculateCPM: () => void
  onLevelResources: () => void
  onCreateBaseline: (v: Record<string, unknown>) => void
  onSetActiveBaseline: (id: string) => void
  onApplyBaseline: (id: string) => void
  onDeleteBaseline: (id: string) => void
  onCreateResource: (v: Record<string, unknown>) => void
  onUpdateResource: (v: Record<string, unknown>) => void
  onDeleteResource: (id: string) => void
  onSetCalendarDay: (v: Record<string, unknown>) => void
  onDeleteCalendarDay: (id: string) => void
  onAssignResource: (v: Record<string, unknown>) => void
  onUpdateAssignment: (v: Record<string, unknown>) => void
  onRemoveAssignment: (id: string) => void
}

function PlanningTab(props: PlanningProps) {
  const { projectId, th, isEditable, isAdmin, wbsNodes, activities, baselines, resources, resourceLoading, evm, onCreateWBS, onUpdateWBS, onDeleteWBS, onCreateActivity, onUpdateActivity, onUpdateProgress, onDeleteActivity, onBulkImport, onCreateDependency, onDeleteDependency, onRecalculateCPM, onLevelResources, onCreateBaseline, onSetActiveBaseline, onApplyBaseline, onDeleteBaseline, onCreateResource, onUpdateResource, onDeleteResource, onAssignResource, onRemoveAssignment } = props
  const addToast = useToastStore(s => s.addToast)

  type PlanSection = 'overview' | 'wbs' | 'schedule' | 'resources' | 'baselines' | 'import'
  const [section, setSection] = React.useState<PlanSection>('overview')
  const [viewMode, setViewMode] = React.useState<'list' | 'gantt'>('list')
  const [expandedWBS, setExpandedWBS] = React.useState<Set<string>>(new Set())

  const [actModal, setActModal] = React.useState<{ open: boolean; mode: 'create' | 'edit' | 'progress'; act: Partial<ActivityType> }>({ open: false, mode: 'create', act: {} })
  const [actForm, setActForm] = React.useState({ activityCode: '', name: '', activityType: 'task', plannedStart: '', plannedFinish: '', durationDays: '0', responsible: '', location: '', remarks: '', budgetAmount: '0', wbsId: '', percentComplete: '0', actualStart: '', actualFinish: '' })

  const [wbsModal, setWbsModal] = React.useState<{ open: boolean; mode: 'create' | 'edit'; node: Partial<WBSNodeType>; parentId?: string }>({ open: false, mode: 'create', node: {} })
  const [wbsForm, setWbsForm] = React.useState({ wbsCode: '', name: '', description: '', level: '1', sequence: '0', budgetAmount: '0', responsible: '' })

  const [depModal, setDepModal] = React.useState(false)
  const [depForm, setDepForm] = React.useState({ predecessorId: '', successorId: '', dependencyType: 'FS', lagDays: '0' })

  const [blModal, setBlModal] = React.useState(false)
  const [blForm, setBlForm] = React.useState({ name: '', description: '' })

  const [resModal, setResModal] = React.useState<{ open: boolean; mode: 'create' | 'edit'; res: Partial<ResourceType> }>({ open: false, mode: 'create', res: {} })
  const [resForm, setResForm] = React.useState({ name: '', resourceType: 'labor', unit: 'hrs', maxUnitsPerDay: '8', costPerUnit: '0', currencyCode: 'USD' })

  const [assignModal, setAssignModal] = React.useState<{ open: boolean; activityId: string }>({ open: false, activityId: '' })
  const [assignForm, setAssignForm] = React.useState({ resourceId: '', unitsPerDay: '1', budgetedCost: '' })

  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importPreview, setImportPreview] = React.useState<{ activities: Array<Record<string, unknown>>; dependencies: Array<Record<string, unknown>> } | null>(null)
  const [importFormat, setImportFormat] = React.useState<'msproject' | 'xer' | null>(null)
  const [clearExisting, setClearExisting] = React.useState(false)
  const importFileRef = React.useRef<HTMLInputElement>(null)

  const nav: Array<{ key: PlanSection; label: string }> = [
    { key: 'overview', label: 'Overview (EVM)' },
    { key: 'wbs', label: 'WBS' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'resources', label: 'Resources' },
    { key: 'baselines', label: 'Baselines' },
    { key: 'import', label: 'Import' },
  ]

  const s = { fontFamily: 'system-ui,sans-serif', color: th.textPrimary }
  const card = { background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '8px', padding: '16px', marginBottom: '12px' } as React.CSSProperties
  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({ padding: '6px 14px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', cursor: 'pointer', fontSize: '13px', ...extra })
  const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: `1px solid ${th.border}`, borderRadius: '6px', background: th.bgSurface, color: th.textPrimary, fontSize: '13px', boxSizing: 'border-box' }
  const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const planField = (label: string, ctrl: React.ReactNode) => (
    <div style={{ marginBottom: '10px' }}><label style={labelSt}>{label}</label>{ctrl}</div>
  )
  const planInp = (val: string, set: (v: string) => void, ph = '', type = 'text') => (
    <input style={inputSt} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
  )
  const planSel = (val: string, set: (v: string) => void, opts: Array<{ value: string; label: string }>) => (
    <select style={inputSt} value={val} onChange={e => set(e.target.value)}>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  const ganttActs = activities.filter(a => a.plannedStart && a.plannedFinish)
  const ganttStart = ganttActs.length > 0 ? new Date(ganttActs.reduce((m, a) => a.plannedStart! < m ? a.plannedStart! : m, ganttActs[0].plannedStart!)) : new Date()
  const ganttEnd   = ganttActs.length > 0 ? new Date(ganttActs.reduce((m, a) => a.plannedFinish! > m ? a.plannedFinish! : m, ganttActs[0].plannedFinish!)) : new Date()
  const ganttTotalDays = Math.max(1, (ganttEnd.getTime() - ganttStart.getTime()) / 86400000)
  const ganttPct = (d: string | null) => d ? ((new Date(d).getTime() - ganttStart.getTime()) / 86400000 / ganttTotalDays * 100) : 0
  const ganttWidth = (ss: string | null, ff: string | null) => ss && ff ? Math.max(0.5, (new Date(ff).getTime() - new Date(ss).getTime()) / 86400000 / ganttTotalDays * 100) : 0

  const evmFmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`
  const evmColor = (n: number, good: 'gt1' | 'lt1') => n === 0 ? th.textSecondary : good === 'gt1' ? (n >= 1 ? '#22c55e' : '#ef4444') : (n <= 1 ? '#22c55e' : '#ef4444')

  function detectAndParse(file: File, text: string) {
    if (file.name.endsWith('.xer') || text.startsWith('%FMT')) { setImportFormat('xer'); parseXER(text) }
    else { setImportFormat('msproject'); parseMSProject(text) }
  }

  function parseXER(text: string) {
    const lines = text.split('\n'); let currentTable = ''; const fields: string[] = []
    const taskRows: Array<Record<string, string>> = []; const relRows: Array<Record<string, string>> = []
    for (const line of lines) {
      if (line.startsWith('%T')) { currentTable = line.slice(3).trim() }
      else if (line.startsWith('%F')) { fields.splice(0, fields.length, ...line.slice(3).trim().split('\t')) }
      else if (line.startsWith('%R')) {
        const vals = line.slice(3).trim().split('\t'); const obj: Record<string, string> = {}
        fields.forEach((f, i) => { obj[f] = vals[i] ?? '' })
        if (currentTable === 'TASK') taskRows.push(obj)
        if (currentTable === 'TASKPRED') relRows.push(obj)
      }
    }
    const acts = taskRows.map((r, i) => ({ activityCode: r['task_code'] ?? `A${i + 1}`, name: r['task_name'] ?? 'Activity', activityType: r['task_type']?.includes('Mile') ? 'milestone' : 'task', plannedStart: r['target_start_date']?.slice(0, 10) ?? null, plannedFinish: r['target_end_date']?.slice(0, 10) ?? null, durationDays: Math.round(parseFloat(r['target_drtn_hr_cnt'] ?? '0') / 8) || 0, responsible: r['rsrc_id'] || null, budgetAmount: parseFloat(r['target_cost'] ?? '0') || 0, sequence: i }))
    const deps = relRows.map(r => ({ predecessorCode: r['pred_task_id'] ?? '', successorCode: r['task_id'] ?? '', dependencyType: (r['pred_type'] ?? 'FS').slice(-2), lagDays: Math.round(parseFloat(r['lag_hr_cnt'] ?? '0') / 8) || 0 }))
    setImportPreview({ activities: acts as Array<Record<string, unknown>>, dependencies: deps as Array<Record<string, unknown>> })
  }

  function parseMSProject(xml: string) {
    const parser = new DOMParser(); const doc = parser.parseFromString(xml, 'application/xml')
    const tasks = Array.from(doc.querySelectorAll('Task'))
    const acts: Array<Record<string, unknown>> = []; const deps: Array<Record<string, unknown>> = []
    const idToCode = new Map<string, string>()
    for (const t of tasks) {
      const uid = t.querySelector('UID')?.textContent ?? '0'; if (uid === '0') continue
      const code = t.querySelector('WBS')?.textContent ?? `A${uid}`
      const name = t.querySelector('Name')?.textContent ?? 'Activity'
      const dur = t.querySelector('Duration')?.textContent ?? 'PT0H0M0S'
      const dMatch = dur.match(/PT(\d+)H/); const dDays = dMatch ? Math.round(parseInt(dMatch[1]) / 8) : 0
      const start = t.querySelector('Start')?.textContent?.slice(0, 10) ?? null
      const finish = t.querySelector('Finish')?.textContent?.slice(0, 10) ?? null
      const milestone = t.querySelector('Milestone')?.textContent === '1'
      const budget = parseFloat(t.querySelector('Cost')?.textContent ?? '0') || 0
      idToCode.set(uid, code)
      acts.push({ activityCode: code, name, activityType: milestone ? 'milestone' : 'task', plannedStart: start, plannedFinish: finish, durationDays: dDays, budgetAmount: budget, sequence: acts.length })
      for (const pred of Array.from(t.querySelectorAll('PredecessorLink'))) {
        const predUid = pred.querySelector('PredecessorUID')?.textContent ?? ''
        const type = pred.querySelector('Type')?.textContent ?? '1'
        const lag = Math.round(parseInt(pred.querySelector('LinkLag')?.textContent ?? '0') / 4800)
        const typeMap: Record<string, string> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' }
        deps.push({ predecessorCode: predUid, successorCode: uid, dependencyType: typeMap[type] ?? 'FS', lagDays: lag })
      }
    }
    for (const d of deps) {
      if (idToCode.has(d.predecessorCode as string)) d.predecessorCode = idToCode.get(d.predecessorCode as string)!
      if (idToCode.has(d.successorCode as string)) d.successorCode = idToCode.get(d.successorCode as string)!
    }
    setImportPreview({ activities: acts, dependencies: deps })
  }

  const renderOverview = () => {
    const evmTiles = evm ? [
      { label: 'BAC', value: evmFmt(evm.bac), color: th.textPrimary },
      { label: 'PV',  value: evmFmt(evm.pv),  color: th.textPrimary },
      { label: 'EV',  value: evmFmt(evm.ev),  color: th.textPrimary },
      { label: 'AC',  value: evmFmt(evm.ac),  color: th.textPrimary },
      { label: 'SV',  value: evmFmt(evm.sv),  color: evm.sv >= 0 ? '#22c55e' : '#ef4444' },
      { label: 'CV',  value: evmFmt(evm.cv),  color: evm.cv >= 0 ? '#22c55e' : '#ef4444' },
      { label: 'SPI', value: evm.spi.toFixed(2), color: evmColor(evm.spi, 'gt1') },
      { label: 'CPI', value: evm.cpi.toFixed(2), color: evmColor(evm.cpi, 'gt1') },
      { label: 'EAC', value: evmFmt(evm.eac), color: th.textPrimary },
      { label: 'ETC', value: evmFmt(evm.etc), color: th.textPrimary },
      { label: 'VAC', value: evmFmt(evm.vac), color: evm.vac >= 0 ? '#22c55e' : '#ef4444' },
      { label: 'TCPI', value: evm.tcpi.toFixed(2), color: evmColor(evm.tcpi, 'lt1') },
    ] : []
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>EVM Dashboard {evm && <span style={{ fontSize: '12px', fontWeight: 400, color: th.textSecondary }}>— {evm.statusDate}</span>}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isEditable && <button style={btn()} onClick={onRecalculateCPM}>Recalculate CPM</button>}
            {isEditable && <button style={btn({ background: '#f59e0b' })} onClick={onLevelResources}>Level Resources</button>}
          </div>
        </div>
        {!evm && <div style={{ color: th.textSecondary, fontSize: '13px' }}>No schedule data. Add activities to see EVM metrics.</div>}
        {evm && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '10px', marginBottom: '16px' }}>
              {evmTiles.map(t => (
                <div key={t.label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: th.textSecondary, textTransform: 'uppercase', marginBottom: '4px' }}>{t.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: t.color }}>{t.value}</div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px' }}>Critical Path Progress</div>
              <div style={{ background: th.border, borderRadius: '4px', height: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${evm.criticalPathComplete}%`, height: '100%', background: '#ef4444' }} />
              </div>
              <div style={{ fontSize: '12px', color: th.textSecondary, marginTop: '4px' }}>{evm.criticalPathComplete.toFixed(1)}% of critical activities complete</div>
            </div>
          </>
        )}
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px' }}>Schedule Summary</div>
          <div style={{ fontSize: '13px', color: th.textSecondary }}>
            Total: <strong style={{ color: th.textPrimary }}>{activities.length}</strong> &nbsp;·&nbsp;
            Critical: <strong style={{ color: '#ef4444' }}>{activities.filter(a => a.isCritical).length}</strong> &nbsp;·&nbsp;
            Complete: <strong style={{ color: '#22c55e' }}>{activities.filter(a => a.percentComplete >= 100).length}</strong> &nbsp;·&nbsp;
            In Progress: <strong style={{ color: '#f59e0b' }}>{activities.filter(a => a.percentComplete > 0 && a.percentComplete < 100).length}</strong>
          </div>
        </div>
      </div>
    )
  }

  const renderWBSNode = (node: WBSNodeType, depth = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedWBS.has(node.id)
    return (
      <div key={node.id}>
        <div style={{ display: 'flex', alignItems: 'center', padding: `8px 12px 8px ${12 + depth * 20}px`, borderBottom: `1px solid ${th.border}`, background: depth % 2 === 0 ? th.bgSurface : th.bgCanvas }}>
          {hasChildren
            ? <button onClick={() => setExpandedWBS(ss => { const n = new Set(ss); isExpanded ? n.delete(node.id) : n.add(node.id); return n })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textSecondary, width: '20px', padding: 0, marginRight: '4px' }}>{isExpanded ? '▾' : '▸'}</button>
            : <span style={{ width: '24px', display: 'inline-block' }} />}
          <span style={{ fontSize: '12px', color: th.textSecondary, width: '80px', flexShrink: 0 }}>{node.wbsCode}</span>
          <span style={{ fontSize: '13px', color: th.textPrimary, flex: 1 }}>{node.name}</span>
          <span style={{ fontSize: '12px', color: th.textSecondary, width: '100px', textAlign: 'right' }}>${node.budgetAmount.toLocaleString()}</span>
          {isEditable && (
            <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
              <button style={{ ...btn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}`, padding: '3px 8px' }) }} onClick={() => { setWbsModal({ open: true, mode: 'create', node: {}, parentId: node.id }); setWbsForm({ wbsCode: '', name: '', description: '', level: String(node.level + 1), sequence: '0', budgetAmount: '0', responsible: '' }) }}>+</button>
              <button style={{ ...btn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}`, padding: '3px 8px' }) }} onClick={() => { setWbsModal({ open: true, mode: 'edit', node }); setWbsForm({ wbsCode: node.wbsCode, name: node.name, description: node.description ?? '', level: String(node.level), sequence: String(node.sequence), budgetAmount: String(node.budgetAmount), responsible: node.responsible ?? '' }) }}>Edit</button>
              <button style={{ ...btn({ background: '#ef4444', padding: '3px 8px' }) }} onClick={() => { if (confirm('Delete?')) onDeleteWBS(node.id) }}>Del</button>
            </div>
          )}
        </div>
        {isExpanded && node.children.map(c => renderWBSNode(c, depth + 1))}
      </div>
    )
  }

  const renderWBS = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Work Breakdown Structure</div>
        {isEditable && <button style={btn()} onClick={() => { setWbsModal({ open: true, mode: 'create', node: {}, parentId: undefined }); setWbsForm({ wbsCode: '', name: '', description: '', level: '1', sequence: '0', budgetAmount: '0', responsible: '' }) }}>+ Root Node</button>}
      </div>
      <div style={{ border: `1px solid ${th.border}`, borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '8px 12px', background: th.bgSurface, borderBottom: `1px solid ${th.border}`, fontSize: '11px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
          <span style={{ width: '24px' }} /><span style={{ width: '80px' }}>Code</span><span style={{ flex: 1 }}>Name</span><span style={{ width: '100px', textAlign: 'right' }}>Budget</span>{isEditable && <span style={{ width: '140px' }} />}
        </div>
        {wbsNodes.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: th.textSecondary, fontSize: '13px' }}>No WBS nodes yet.</div>}
        {wbsNodes.map(n => renderWBSNode(n))}
      </div>
    </div>
  )

  const renderSchedule = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Activity Schedule</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ border: `1px solid ${th.border}`, borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
            {(['list', 'gantt'] as const).map(v => (
              <button key={v} style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: '12px', background: viewMode === v ? th.accent : th.bgSurface, color: viewMode === v ? '#fff' : th.textSecondary }} onClick={() => setViewMode(v)}>{v === 'list' ? 'List' : 'Gantt'}</button>
            ))}
          </div>
          {isEditable && <button style={btn()} onClick={() => { setActModal({ open: true, mode: 'create', act: {} }); setActForm({ activityCode: '', name: '', activityType: 'task', plannedStart: '', plannedFinish: '', durationDays: '0', responsible: '', location: '', remarks: '', budgetAmount: '0', wbsId: '', percentComplete: '0', actualStart: '', actualFinish: '' }) }}>+ Activity</button>}
          {isEditable && <button style={btn({ background: '#6366f1' })} onClick={() => setDepModal(true)}>+ Dependency</button>}
          {isEditable && <button style={btn({ background: '#0ea5e9' })} onClick={onRecalculateCPM}>Run CPM</button>}
        </div>
      </div>
      {viewMode === 'list' && (
        <div style={{ border: `1px solid ${th.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 60px 70px 70px', padding: '8px 12px', background: th.bgSurface, borderBottom: `1px solid ${th.border}`, fontSize: '11px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
            <span>Code</span><span>Name</span><span>Start</span><span>Finish</span><span>Days</span><span>Float</span><span>%</span>
          </div>
          {activities.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: th.textSecondary, fontSize: '13px' }}>No activities yet.</div>}
          {activities.map(a => (
            <div key={a.id} onClick={() => { setActModal({ open: true, mode: 'edit', act: a }); setActForm({ activityCode: a.activityCode, name: a.name, activityType: a.activityType, plannedStart: a.plannedStart ?? '', plannedFinish: a.plannedFinish ?? '', durationDays: String(a.durationDays), responsible: a.responsible ?? '', location: a.location ?? '', remarks: a.remarks ?? '', budgetAmount: String(a.budgetAmount), wbsId: a.wbsId ?? '', percentComplete: String(a.percentComplete), actualStart: a.actualStart ?? '', actualFinish: a.actualFinish ?? '' }) }}
              style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 60px 70px 70px', padding: '8px 12px', borderBottom: `1px solid ${th.border}`, background: th.bgCanvas, borderLeft: a.isCritical ? '3px solid #ef4444' : '3px solid transparent', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: th.textSecondary }}>{a.activityCode}</span>
              <div>
                <div style={{ fontSize: '13px', color: th.textPrimary }}>{a.name}</div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                  {a.isCritical && <span style={{ fontSize: '10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '3px', padding: '1px 5px' }}>Critical</span>}
                  {a.activityType === 'milestone' && <span style={{ fontSize: '10px', background: '#fdf4ff', color: '#a855f7', border: '1px solid #e9d5ff', borderRadius: '3px', padding: '1px 5px' }}>Milestone</span>}
                  {a.predecessors.length > 0 && <span style={{ fontSize: '10px', color: th.textSecondary }}>← {a.predecessors.map(p => p.predecessorCode ?? p.predecessorId.slice(0, 6)).join(', ')}</span>}
                </div>
              </div>
              <span style={{ fontSize: '12px', color: th.textSecondary }}>{a.plannedStart ?? '—'}</span>
              <span style={{ fontSize: '12px', color: th.textSecondary }}>{a.plannedFinish ?? '—'}</span>
              <span style={{ fontSize: '12px', color: th.textSecondary }}>{a.durationDays}</span>
              <span style={{ fontSize: '12px', color: a.totalFloat === 0 ? '#ef4444' : th.textSecondary }}>{a.totalFloat ?? '—'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ background: th.border, borderRadius: '3px', height: '6px', width: '36px', overflow: 'hidden' }}><div style={{ width: `${a.percentComplete}%`, height: '100%', background: '#22c55e' }} /></div>
                <span style={{ fontSize: '10px', color: th.textSecondary }}>{Number(a.percentComplete).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {viewMode === 'gantt' && (
        <div style={{ border: `1px solid ${th.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', padding: '8px 12px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
            <div style={{ width: '220px', flexShrink: 0, fontSize: '11px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>Activity</div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: th.textSecondary }}>
              <span>{ganttStart.toISOString().slice(0, 10)}</span><span>{ganttEnd.toISOString().slice(0, 10)}</span>
            </div>
          </div>
          {ganttActs.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: th.textSecondary, fontSize: '13px' }}>No activities with dates.</div>}
          {ganttActs.map(a => (
            <div key={a.id} style={{ display: 'flex', borderBottom: `1px solid ${th.border}`, background: th.bgCanvas, padding: '5px 12px', alignItems: 'center', borderLeft: a.isCritical ? '3px solid #ef4444' : '3px solid transparent' }}>
              <div style={{ width: '220px', flexShrink: 0, fontSize: '12px', color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ flex: 1, position: 'relative', height: '22px' }}>
                {a.baselineStart && a.baselineFinish && (
                  <div style={{ position: 'absolute', top: '15px', left: `${ganttPct(a.baselineStart)}%`, width: `${ganttWidth(a.baselineStart, a.baselineFinish)}%`, height: '4px', background: '#94a3b8', borderRadius: '2px' }} />
                )}
                <div style={{ position: 'absolute', top: '3px', left: `${ganttPct(a.plannedStart)}%`, width: `${ganttWidth(a.plannedStart, a.plannedFinish)}%`, height: '10px', background: a.isCritical ? '#ef4444' : '#3b82f6', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${a.percentComplete}%`, height: '100%', background: a.isCritical ? '#dc2626' : '#1d4ed8', opacity: 0.5 }} />
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', padding: '6px 12px', background: th.bgSurface, borderTop: `1px solid ${th.border}`, gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: th.textSecondary }}><div style={{ width: '16px', height: '8px', background: '#3b82f6', borderRadius: '2px' }} /> Planned</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: th.textSecondary }}><div style={{ width: '16px', height: '8px', background: '#ef4444', borderRadius: '2px' }} /> Critical</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: th.textSecondary }}><div style={{ width: '16px', height: '4px', background: '#94a3b8', borderRadius: '2px' }} /> Baseline</div>
          </div>
        </div>
      )}
      {isEditable && activities.length > 0 && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: th.textSecondary }}>Click any activity row to edit it or update progress.</div>
      )}
    </div>
  )

  const renderResources = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Resources</div>
        {isEditable && <button style={btn()} onClick={() => { setResModal({ open: true, mode: 'create', res: {} }); setResForm({ name: '', resourceType: 'labor', unit: 'hrs', maxUnitsPerDay: '8', costPerUnit: '0', currencyCode: 'USD' }) }}>+ Resource</button>}
      </div>
      {resources.length > 0 && (
        <div style={{ border: `1px solid ${th.border}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 70px 80px 90px', padding: '8px 12px', background: th.bgSurface, borderBottom: `1px solid ${th.border}`, fontSize: '11px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
            <span>Name</span><span>Type</span><span>Unit</span><span>Max/Day</span><span>Cost/Unit</span>
          </div>
          {resources.map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 70px 80px 90px', padding: '8px 12px', borderBottom: `1px solid ${th.border}`, background: th.bgCanvas, alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: th.textPrimary }}>{r.name}</span>
              <span style={{ fontSize: '12px', color: th.textSecondary, textTransform: 'capitalize' }}>{r.resourceType}</span>
              <span style={{ fontSize: '12px', color: th.textSecondary }}>{r.unit}</span>
              <span style={{ fontSize: '12px', color: th.textSecondary }}>{r.maxUnitsPerDay}</span>
              <span style={{ fontSize: '12px', color: th.textSecondary }}>{r.costPerUnit} {r.currencyCode}</span>
            </div>
          ))}
        </div>
      )}
      {resources.length === 0 && <div style={{ color: th.textSecondary, fontSize: '13px', marginBottom: '20px' }}>No resources defined yet.</div>}
      {resourceLoading.length > 0 && (
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: th.textPrimary, marginBottom: '12px' }}>Loading Histogram</div>
          {resourceLoading.map(rl => {
            const overDays = rl.days.filter(d => d.isOverloaded).length
            const maxLoad = Math.max(rl.maxUnitsPerDay, ...rl.days.map(d => d.loadedUnits), 1)
            const visibleDays = rl.days.filter(d => d.loadedUnits > 0).slice(0, 60)
            return (
              <div key={rl.resourceId} style={{ ...card }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary }}>{rl.resourceName} ({rl.unit})</span>
                  {overDays > 0 && <span style={{ fontSize: '12px', color: '#ef4444' }}>{overDays} overloaded days</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '60px', overflowX: 'auto' }}>
                  {visibleDays.map(d => (
                    <div key={d.date} title={`${d.date}: ${d.loadedUnits}/${d.availableUnits}`}
                      style={{ flex: '0 0 8px', width: '8px', height: `${(d.loadedUnits / maxLoad) * 56 + 2}px`, background: d.isOverloaded ? '#ef4444' : '#3b82f6', borderRadius: '2px 2px 0 0' }} />
                  ))}
                  {visibleDays.length === 0 && <span style={{ fontSize: '12px', color: th.textSecondary }}>No loading in date range.</span>}
                </div>
              </div>
            )
          })}
          {isEditable && <button style={btn({ background: '#f59e0b' })} onClick={onLevelResources}>Auto-Level Resources</button>}
        </div>
      )}
      {activities.length > 0 && resources.length > 0 && isEditable && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: th.textPrimary, marginBottom: '12px' }}>Activity Assignments</div>
          {activities.slice(0, 20).map(a => (
            <div key={a.id} style={{ ...card, marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary }}>{a.activityCode}: {a.name}</span>
                <button style={btn({ fontSize: '11px', padding: '3px 10px' })} onClick={() => { setAssignModal({ open: true, activityId: a.id }); setAssignForm({ resourceId: resources[0]?.id ?? '', unitsPerDay: '1', budgetedCost: '' }) }}>+ Assign</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {a.resources.map(r => (
                  <span key={r.id} style={{ fontSize: '11px', background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '4px', padding: '3px 8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {r.resourceName}: {r.unitsPerDay} {r.unit}/day
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', padding: 0 }} onClick={() => onRemoveAssignment(r.id)}>×</button>
                  </span>
                ))}
                {a.resources.length === 0 && <span style={{ fontSize: '11px', color: th.textSecondary }}>No resources assigned</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderBaselines = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Schedule Baselines</div>
        {isEditable && <button style={btn()} onClick={() => { setBlModal(true); setBlForm({ name: '', description: '' }) }}>Save Current as Baseline</button>}
      </div>
      {baselines.length === 0 && <div style={{ color: th.textSecondary, fontSize: '13px' }}>No baselines saved yet.</div>}
      {baselines.map(b => (
        <div key={b.id} style={{ ...card, borderLeft: b.isActive ? `4px solid ${th.accent}` : `1px solid ${th.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: th.textPrimary }}>{b.name}</span>
              {b.isActive && <span style={{ fontSize: '10px', background: th.accent, color: '#fff', borderRadius: '3px', padding: '2px 6px', marginLeft: '8px' }}>Active</span>}
              {b.description && <div style={{ fontSize: '12px', color: th.textSecondary, marginTop: '2px' }}>{b.description}</div>}
              <div style={{ fontSize: '11px', color: th.textSecondary, marginTop: '4px' }}>{b.baselineDate}</div>
            </div>
            {isEditable && (
              <div style={{ display: 'flex', gap: '6px' }}>
                {!b.isActive && <button style={btn({ background: '#22c55e', fontSize: '11px', padding: '4px 10px' })} onClick={() => onSetActiveBaseline(b.id)}>Set Active</button>}
                <button style={btn({ background: '#f59e0b', fontSize: '11px', padding: '4px 10px' })} onClick={() => addToast({ type: 'warning', message: `Apply "${b.name}" to the schedule? Current planned dates will be overwritten.`, actions: [{ label: 'Apply', variant: 'primary', onClick: () => onApplyBaseline(b.id) }, { label: 'Cancel', onClick: () => {} }] })}>Apply</button>
                <button style={btn({ background: '#ef4444', fontSize: '11px', padding: '4px 10px' })} onClick={() => addToast({ type: 'danger', message: `Delete baseline "${b.name}"? This cannot be undone.`, actions: [{ label: 'Delete', variant: 'danger', onClick: () => onDeleteBaseline(b.id) }, { label: 'Cancel', onClick: () => {} }] })}>Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const renderImport = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: th.textPrimary }}>Import Schedule</div>
        <div style={{ fontSize: '12px', color: th.textSecondary, marginTop: 3 }}>Bring in your existing schedule from MS Project or Primavera P6</div>
      </div>

      {/* Supported formats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'MS Project XML', ext: '.xml', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, color: '#3b82f6', desc: 'Export from Microsoft Project as .xml' },
          { label: 'Primavera P6 XER', ext: '.xer', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>, color: '#f59e0b', desc: 'Export from Oracle Primavera P6 as .xer' },
        ].map(f => (
          <div key={f.ext} style={{ padding: '14px 16px', border: `1px solid ${th.border}`, borderRadius: 10, background: th.bgSurface, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: f.color + '18', color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: th.textPrimary }}>{f.label}</div>
              <div style={{ fontSize: '11px', color: th.textSecondary, marginTop: 2 }}>{f.desc}</div>
              <div style={{ fontSize: '11px', color: f.color, fontWeight: 600, marginTop: 4, fontFamily: 'monospace' }}>{f.ext}</div>
            </div>
          </div>
        ))}
      </div>

      {/* File drop zone */}
      <div
        onClick={() => importFileRef.current?.click()}
        style={{ border: `2px dashed ${importFile ? th.accent : th.border}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: importFile ? th.accent + '08' : th.bgSurface, transition: 'border-color 0.15s, background 0.15s' }}
      >
        <input ref={importFileRef} type="file" accept=".xml,.xer" style={{ display: 'none' }} onChange={e => {
          const f = e.target.files?.[0] ?? null; setImportFile(f); setImportPreview(null); setImportFormat(null)
          if (f) { const r = new FileReader(); r.onload = ev => detectAndParse(f, String(ev.target?.result ?? '')); r.readAsText(f) }
        }} />
        {importFile ? (
          <>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: th.accent + '20', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={th.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: th.textPrimary, marginBottom: 4 }}>{importFile.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: th.textMuted }}>{(importFile.size / 1024).toFixed(1)} KB</span>
              {importFormat && (
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: (importFormat === 'msproject' ? '#3b82f6' : '#f59e0b') + '18', color: importFormat === 'msproject' ? '#3b82f6' : '#f59e0b' }}>
                  {importFormat === 'msproject' ? 'MS Project XML' : 'Primavera P6 XER'}
                </span>
              )}
              {importFile && !importPreview && !importFormat && <span style={{ fontSize: '12px', color: th.textSecondary }}>Parsing…</span>}
            </div>
            <div style={{ fontSize: '12px', color: th.accent, marginTop: 8, cursor: 'pointer' }}>Click to choose a different file</div>
          </>
        ) : (
          <>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: th.bgCanvas, border: `1px solid ${th.border}`, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={th.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: th.textPrimary, marginBottom: 4 }}>Click to choose a file</div>
            <div style={{ fontSize: '12px', color: th.textSecondary }}>Accepts .xml (MS Project) and .xer (Primavera P6)</div>
          </>
        )}
      </div>

      {/* Options */}
      <div style={{ padding: '14px 16px', border: `1px solid ${th.border}`, borderRadius: 10, background: th.bgSurface, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ position: 'relative', flexShrink: 0, marginTop: 1 }}>
          <input type="checkbox" id="clearExistingPlan" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: th.accent }} />
        </div>
        <div>
          <label htmlFor="clearExistingPlan" style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, cursor: 'pointer', display: 'block' }}>Clear existing activities before import</label>
          <div style={{ fontSize: '12px', color: th.textSecondary, marginTop: 2 }}>All current activities and dependencies will be removed before adding imported data</div>
        </div>
      </div>

      {/* Preview table */}
      {importPreview && (
        <div style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}` }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: th.textPrimary }}>Import Preview</div>
              <div style={{ fontSize: '12px', color: th.textSecondary, marginTop: 2 }}>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>{importPreview.activities.length}</span> activities &nbsp;·&nbsp;
                <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{importPreview.dependencies.length}</span> dependencies
              </div>
            </div>
            <button onClick={() => { setImportPreview(null); setImportFile(null); setImportFormat(null); if (importFileRef.current) importFileRef.current.value = '' }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: '18px', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 100px 56px', padding: '7px 16px', background: th.bgSurface, borderBottom: `1px solid ${th.border}`, fontSize: '10px', fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Code</span><span>Name</span><span>Start</span><span>Finish</span><span>Days</span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {(importPreview.activities as Array<{ activityCode?: unknown; name?: unknown; plannedStart?: unknown; plannedFinish?: unknown; durationDays?: unknown }>).slice(0, 15).map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 100px 56px', padding: '8px 16px', borderBottom: `1px solid ${th.border}`, alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: th.textSecondary }}>{String(a.activityCode ?? '')}</span>
                <span style={{ fontSize: '13px', color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(a.name ?? '')}</span>
                <span style={{ fontSize: '12px', color: th.textMuted }}>{String(a.plannedStart ?? '—')}</span>
                <span style={{ fontSize: '12px', color: th.textMuted }}>{String(a.plannedFinish ?? '—')}</span>
                <span style={{ fontSize: '12px', color: th.textMuted }}>{String(a.durationDays ?? '0')}d</span>
              </div>
            ))}
            {importPreview.activities.length > 15 && (
              <div style={{ padding: '10px 16px', fontSize: '12px', color: th.textSecondary, background: th.bgSurface, textAlign: 'center' }}>
                + {importPreview.activities.length - 15} more activities
              </div>
            )}
          </div>
          <div style={{ padding: '14px 16px', background: th.bgSurface, borderTop: `1px solid ${th.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: '12px', color: th.textSecondary }}>
              {clearExisting ? 'Existing activities will be cleared before import.' : 'Activities will be merged with existing schedule.'}
            </div>
            <button style={btn({ background: '#22c55e', padding: '8px 22px', fontSize: '13px', fontWeight: 700 })} onClick={() => { onBulkImport({ projectId, activities: importPreview.activities, dependencies: importPreview.dependencies, clearExisting }); setImportPreview(null); setImportFile(null); setImportFormat(null); if (importFileRef.current) importFileRef.current.value = '' }}>
              Confirm Import
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }
  const modalBox: React.CSSProperties = { background: th.bgSurface, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }
  const mHdr = (title: string) => <div style={{ fontSize: '16px', fontWeight: 700, color: th.textPrimary, marginBottom: '16px' }}>{title}</div>
  const mBtns = (onSave: () => void, onClose: () => void) => (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
      <button style={btn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={onClose}>Cancel</button>
      <button style={btn()} onClick={onSave}>Save</button>
    </div>
  )

  const activityTypes = [{ value: 'task', label: 'Task' }, { value: 'milestone', label: 'Milestone' }, { value: 'summary', label: 'Summary' }]
  const flattenWBS = (nodes: WBSNodeType[], acc: WBSNodeType[] = []): WBSNodeType[] => { for (const n of nodes) { acc.push(n); flattenWBS(n.children, acc) } return acc }
  const wbsOptions = flattenWBS(wbsNodes)

  const saveActivity = () => {
    if (actModal.mode === 'create') {
      onCreateActivity({ projectId, wbsId: actForm.wbsId || null, activityCode: actForm.activityCode, name: actForm.name, activityType: actForm.activityType, plannedStart: actForm.plannedStart || null, plannedFinish: actForm.plannedFinish || null, durationDays: parseInt(actForm.durationDays) || 0, responsible: actForm.responsible || null, location: actForm.location || null, remarks: actForm.remarks || null, budgetAmount: parseFloat(actForm.budgetAmount) || 0, sequence: 0 })
    } else if (actModal.mode === 'edit') {
      onUpdateActivity({ id: actModal.act.id, wbsId: actForm.wbsId || null, activityCode: actForm.activityCode, name: actForm.name, activityType: actForm.activityType, plannedStart: actForm.plannedStart || null, plannedFinish: actForm.plannedFinish || null, durationDays: parseInt(actForm.durationDays) || 0, responsible: actForm.responsible || null, location: actForm.location || null, remarks: actForm.remarks || null, budgetAmount: parseFloat(actForm.budgetAmount) || 0 })
    } else {
      onUpdateProgress({ id: actModal.act.id, percentComplete: parseFloat(actForm.percentComplete) || 0, actualStart: actForm.actualStart || null, actualFinish: actForm.actualFinish || null })
    }
    setActModal({ open: false, mode: 'create', act: {} })
  }

  return (
    <div style={s}>
      <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${th.border}`, marginBottom: '20px', overflowX: 'auto' }}>
        {nav.map(n => (
          <button key={n.key} onClick={() => setSection(n.key)}
            style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: section === n.key ? 600 : 400, color: section === n.key ? th.accent : th.textSecondary, background: 'transparent', borderBottom: `2px solid ${section === n.key ? th.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>
            {n.label}
          </button>
        ))}
      </div>

      {section === 'overview'  && renderOverview()}
      {section === 'wbs'       && renderWBS()}
      {section === 'schedule'  && renderSchedule()}
      {section === 'resources' && renderResources()}
      {section === 'baselines' && renderBaselines()}
      {section === 'import'    && renderImport()}

      {actModal.open && (
        <div style={modalOverlay} onClick={() => setActModal({ open: false, mode: 'create', act: {} })}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {actModal.mode === 'progress' ? (
              <>
                {mHdr(`Progress: ${actModal.act.activityCode ?? ''}`)}
                {planField('% Complete', planInp(actForm.percentComplete, v => setActForm(f => ({ ...f, percentComplete: v })), '0–100', 'number'))}
                {planField('Actual Start', planInp(actForm.actualStart, v => setActForm(f => ({ ...f, actualStart: v })), '', 'date'))}
                {planField('Actual Finish', planInp(actForm.actualFinish, v => setActForm(f => ({ ...f, actualFinish: v })), '', 'date'))}
              </>
            ) : (
              <>
                {mHdr(actModal.mode === 'create' ? 'Add Activity' : 'Edit Activity')}
                {wbsOptions.length > 0 && planField('WBS', planSel(actForm.wbsId, v => setActForm(f => ({ ...f, wbsId: v })), [{ value: '', label: '— None —' }, ...wbsOptions.map(n => ({ value: n.id, label: `${n.wbsCode} ${n.name}` }))]))}
                {planField('Activity Code', planInp(actForm.activityCode, v => setActForm(f => ({ ...f, activityCode: v })), 'A1000'))}
                {planField('Name', planInp(actForm.name, v => setActForm(f => ({ ...f, name: v }))))}
                {planField('Type', planSel(actForm.activityType, v => setActForm(f => ({ ...f, activityType: v })), activityTypes))}
                {planField('Planned Start', planInp(actForm.plannedStart, v => setActForm(f => ({ ...f, plannedStart: v })), '', 'date'))}
                {planField('Planned Finish', planInp(actForm.plannedFinish, v => setActForm(f => ({ ...f, plannedFinish: v })), '', 'date'))}
                {planField('Duration (days)', planInp(actForm.durationDays, v => setActForm(f => ({ ...f, durationDays: v })), '0', 'number'))}
                {planField('Responsible', planInp(actForm.responsible, v => setActForm(f => ({ ...f, responsible: v }))))}
                {planField('Budget Amount', planInp(actForm.budgetAmount, v => setActForm(f => ({ ...f, budgetAmount: v })), '0', 'number'))}
                {planField('Remarks', <textarea style={{ ...inputSt, minHeight: '60px' }} value={actForm.remarks} onChange={e => setActForm(f => ({ ...f, remarks: e.target.value }))} />)}
              </>
            )}
            {mBtns(saveActivity, () => setActModal({ open: false, mode: 'create', act: {} }))}
            {actModal.mode === 'edit' && isAdmin && (
              <button style={{ ...btn({ background: '#ef4444', width: '100%', marginTop: '8px', textAlign: 'center' }) }} onClick={() => { if (confirm('Delete activity?')) { onDeleteActivity(actModal.act.id!); setActModal({ open: false, mode: 'create', act: {} }) } }}>Delete Activity</button>
            )}
          </div>
        </div>
      )}

      {wbsModal.open && (
        <div style={modalOverlay} onClick={() => setWbsModal({ open: false, mode: 'create', node: {} })}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr(wbsModal.mode === 'create' ? 'Add WBS Node' : 'Edit WBS Node')}
            {planField('WBS Code', planInp(wbsForm.wbsCode, v => setWbsForm(f => ({ ...f, wbsCode: v })), '1.1.2'))}
            {planField('Name', planInp(wbsForm.name, v => setWbsForm(f => ({ ...f, name: v }))))}
            {planField('Description', <textarea style={{ ...inputSt, minHeight: '60px' }} value={wbsForm.description} onChange={e => setWbsForm(f => ({ ...f, description: e.target.value }))} />)}
            {planField('Level', planInp(wbsForm.level, v => setWbsForm(f => ({ ...f, level: v })), '1', 'number'))}
            {planField('Budget Amount', planInp(wbsForm.budgetAmount, v => setWbsForm(f => ({ ...f, budgetAmount: v })), '0', 'number'))}
            {planField('Responsible', planInp(wbsForm.responsible, v => setWbsForm(f => ({ ...f, responsible: v }))))}
            {mBtns(() => {
              if (wbsModal.mode === 'create') onCreateWBS({ projectId, parentId: wbsModal.parentId ?? null, wbsCode: wbsForm.wbsCode, name: wbsForm.name, description: wbsForm.description || null, level: parseInt(wbsForm.level) || 1, sequence: 0, budgetAmount: parseFloat(wbsForm.budgetAmount) || 0, responsible: wbsForm.responsible || null })
              else onUpdateWBS({ id: wbsModal.node.id, wbsCode: wbsForm.wbsCode, name: wbsForm.name, description: wbsForm.description || null, budgetAmount: parseFloat(wbsForm.budgetAmount) || 0, responsible: wbsForm.responsible || null })
              setWbsModal({ open: false, mode: 'create', node: {} })
            }, () => setWbsModal({ open: false, mode: 'create', node: {} }))}
          </div>
        </div>
      )}

      {depModal && (
        <div style={modalOverlay} onClick={() => setDepModal(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr('Add Dependency')}
            {planField('Predecessor', planSel(depForm.predecessorId, v => setDepForm(f => ({ ...f, predecessorId: v })), [{ value: '', label: '— Select —' }, ...activities.map(a => ({ value: a.id, label: `${a.activityCode}: ${a.name}` }))]))}
            {planField('Successor', planSel(depForm.successorId, v => setDepForm(f => ({ ...f, successorId: v })), [{ value: '', label: '— Select —' }, ...activities.map(a => ({ value: a.id, label: `${a.activityCode}: ${a.name}` }))]))}
            {planField('Type', planSel(depForm.dependencyType, v => setDepForm(f => ({ ...f, dependencyType: v })), [{ value: 'FS', label: 'Finish-to-Start (FS)' }, { value: 'SS', label: 'Start-to-Start (SS)' }, { value: 'FF', label: 'Finish-to-Finish (FF)' }, { value: 'SF', label: 'Start-to-Finish (SF)' }]))}
            {planField('Lag Days', planInp(depForm.lagDays, v => setDepForm(f => ({ ...f, lagDays: v })), '0', 'number'))}
            {mBtns(() => { if (!depForm.predecessorId || !depForm.successorId) return; onCreateDependency({ projectId, predecessorId: depForm.predecessorId, successorId: depForm.successorId, dependencyType: depForm.dependencyType, lagDays: parseInt(depForm.lagDays) || 0 }); setDepModal(false) }, () => setDepModal(false))}
          </div>
        </div>
      )}

      {blModal && (
        <div style={modalOverlay} onClick={() => setBlModal(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr('Save Baseline')}
            {planField('Name', planInp(blForm.name, v => setBlForm(f => ({ ...f, name: v })), 'Baseline 1'))}
            {planField('Description', <textarea style={{ ...inputSt, minHeight: '60px' }} value={blForm.description} onChange={e => setBlForm(f => ({ ...f, description: e.target.value }))} />)}
            {mBtns(() => { onCreateBaseline({ projectId, name: blForm.name, description: blForm.description || null }); setBlModal(false) }, () => setBlModal(false))}
          </div>
        </div>
      )}

      {resModal.open && (
        <div style={modalOverlay} onClick={() => setResModal({ open: false, mode: 'create', res: {} })}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr(resModal.mode === 'create' ? 'Add Resource' : 'Edit Resource')}
            {planField('Name', planInp(resForm.name, v => setResForm(f => ({ ...f, name: v }))))}
            {planField('Type', planSel(resForm.resourceType, v => setResForm(f => ({ ...f, resourceType: v })), [{ value: 'labor', label: 'Labor' }, { value: 'equipment', label: 'Equipment' }, { value: 'material', label: 'Material' }]))}
            {planField('Unit', planInp(resForm.unit, v => setResForm(f => ({ ...f, unit: v })), 'hrs, days, m², kg'))}
            {planField('Max Units/Day', planInp(resForm.maxUnitsPerDay, v => setResForm(f => ({ ...f, maxUnitsPerDay: v })), '8', 'number'))}
            {planField('Cost/Unit', planInp(resForm.costPerUnit, v => setResForm(f => ({ ...f, costPerUnit: v })), '0', 'number'))}
            {planField('Currency', planInp(resForm.currencyCode, v => setResForm(f => ({ ...f, currencyCode: v })), 'USD'))}
            {mBtns(() => {
              if (resModal.mode === 'create') onCreateResource({ projectId, name: resForm.name, resourceType: resForm.resourceType, unit: resForm.unit, maxUnitsPerDay: parseFloat(resForm.maxUnitsPerDay) || 8, costPerUnit: parseFloat(resForm.costPerUnit) || 0, currencyCode: resForm.currencyCode || 'USD' })
              else onUpdateResource({ id: resModal.res.id, name: resForm.name, resourceType: resForm.resourceType, unit: resForm.unit, maxUnitsPerDay: parseFloat(resForm.maxUnitsPerDay) || 8, costPerUnit: parseFloat(resForm.costPerUnit) || 0 })
              setResModal({ open: false, mode: 'create', res: {} })
            }, () => setResModal({ open: false, mode: 'create', res: {} }))}
          </div>
        </div>
      )}

      {assignModal.open && (
        <div style={modalOverlay} onClick={() => setAssignModal({ open: false, activityId: '' })}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr('Assign Resource')}
            {planField('Resource', planSel(assignForm.resourceId, v => setAssignForm(f => ({ ...f, resourceId: v })), resources.map(r => ({ value: r.id, label: `${r.name} (${r.unit})` }))))}
            {planField('Units/Day', planInp(assignForm.unitsPerDay, v => setAssignForm(f => ({ ...f, unitsPerDay: v })), '1', 'number'))}
            {planField('Budgeted Cost', planInp(assignForm.budgetedCost, v => setAssignForm(f => ({ ...f, budgetedCost: v })), 'optional', 'number'))}
            {mBtns(() => { onAssignResource({ activityId: assignModal.activityId, resourceId: assignForm.resourceId, unitsPerDay: parseFloat(assignForm.unitsPerDay) || 1, budgetedCost: assignForm.budgetedCost ? parseFloat(assignForm.budgetedCost) : null }); setAssignModal({ open: false, activityId: '' }) }, () => setAssignModal({ open: false, activityId: '' }))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── CostControlTab ────────────────────────────────────────────────────────────

type CCCostCode = { id: string; projectId: string; wbsId: string | null; analyticAccountId: string | null; code: string; name: string; category: string; budgetAmount: number; sequence: number; committedAmount: number; actualAmount: number; forecastEAC: number; remainingBudget: number; percentConsumed: number }
type CCSummary = { totalBudget: number; totalCommitted: number; totalActual: number; totalForecastEAC: number; totalRemaining: number; totalVariance: number; percentConsumed: number; totalBilled: number; totalCertified: number; totalPaidByClient: number; totalRetentionHeld: number; outstandingReceivable: number; byCategory: Array<{ category: string; budgetAmount: number; committedAmount: number; actualAmount: number; forecastEAC: number; variance: number }> }

type CostControlProps = {
  projectId: string; th: Record<string, string>; isEditable: boolean; isAdmin: boolean
  costCodes: CCCostCode[]; summary: CCSummary | null
  projectAnalyticAccountId: string | null; projectAnalyticAccountName: string | null
  onCreateCostCode: (v: Record<string, unknown>) => void; onUpdateCostCode: (v: Record<string, unknown>) => void; onDeleteCostCode: (id: string) => void
}

function CostControlTab(props: CostControlProps) {
  const { projectId, th, isEditable, isAdmin, costCodes, summary, projectAnalyticAccountId, projectAnalyticAccountName, onCreateCostCode, onUpdateCostCode, onDeleteCostCode } = props

  type CCSection = 'overview' | 'budget'
  const [section, setSection] = React.useState<CCSection>('overview')

  const [codeModal, setCodeModal] = React.useState<{ open: boolean; mode: 'create' | 'edit'; item: Partial<CCCostCode> }>({ open: false, mode: 'create', item: {} })
  const [codeForm, setCodeForm] = React.useState({ analyticAccountId: '', code: '', name: '', category: 'labor', budgetAmount: '0', sequence: '0' })

  const nav: Array<{ key: CCSection; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'budget', label: 'Budget' },
  ]

  const card = { background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '8px', padding: '16px', marginBottom: '12px' } as React.CSSProperties
  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({ padding: '6px 14px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', cursor: 'pointer', fontSize: '13px', ...extra })
  const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: `1px solid ${th.border}`, borderRadius: '6px', background: th.bgSurface, color: th.textPrimary, fontSize: '13px', boxSizing: 'border-box' }
  const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const ff = (label: string, ctrl: React.ReactNode) => <div style={{ marginBottom: '10px' }}><label style={labelSt}>{label}</label>{ctrl}</div>
  const fi = (val: string, set: (v: string) => void, ph = '', type = 'text') => <input style={inputSt} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
  const fs = (val: string, set: (v: string) => void, opts: Array<{ value: string; label: string }>) => <select style={inputSt} value={val} onChange={e => set(e.target.value)}>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  const fmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  const pct = (n: number) => `${Math.min(100, Math.max(0, n)).toFixed(1)}%`
  const varColor = (v: number) => v >= 0 ? '#22c55e' : '#ef4444'

  const catColors: Record<string, string> = { labor: '#3b82f6', material: '#f59e0b', equipment: '#8b5cf6', subcontract: '#10b981', overhead: '#6b7280', contingency: '#ec4899', other: '#94a3b8' }
  const catOpts = ['labor','material','equipment','subcontract','overhead','contingency','other'].map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))
  const statusOpts = (opts: string[]) => opts.map(s => ({ value: s, label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }
  const modalBox: React.CSSProperties = { background: th.bgSurface, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }
  const mHdr = (t: string) => <div style={{ fontSize: '16px', fontWeight: 700, color: th.textPrimary, marginBottom: '16px' }}>{t}</div>
  const mBtns = (onSave: () => void, onClose: () => void) => (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
      <button style={btn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={onClose}>Cancel</button>
      <button style={btn()} onClick={onSave}>Save</button>
    </div>
  )

  const codeOpts = [{ value: '', label: '— No Cost Code —' }, ...costCodes.map(c => ({ value: c.id, label: `${c.code} ${c.name}` }))]

  // ── Overview ──────────────────────────────────────────────────────────────
  const renderOverview = () => {
    const s = summary
    if (!s) return <div style={{ color: th.textSecondary, fontSize: '13px' }}>No cost data yet. Add cost codes and entries to see the summary.</div>
    const topTiles = [
      { label: 'Total Budget', value: fmt(s.totalBudget), color: th.textPrimary },
      { label: 'Committed', value: fmt(s.totalCommitted), color: '#f59e0b' },
      { label: 'Actual Cost', value: fmt(s.totalActual), color: '#3b82f6' },
      { label: 'Forecast (EAC)', value: fmt(s.totalForecastEAC), color: s.totalForecastEAC > s.totalBudget ? '#ef4444' : '#22c55e' },
      { label: 'Remaining', value: fmt(s.totalRemaining), color: s.totalRemaining < 0 ? '#ef4444' : '#22c55e' },
      { label: 'Variance', value: fmt(s.totalVariance), color: varColor(s.totalVariance) },
    ]
    const billingTiles = [
      { label: 'Total Billed', value: fmt(s.totalBilled) },
      { label: 'Certified', value: fmt(s.totalCertified) },
      { label: 'Paid by Client', value: fmt(s.totalPaidByClient) },
      { label: 'Retention Held', value: fmt(s.totalRetentionHeld) },
      { label: 'Outstanding', value: fmt(s.outstandingReceivable), color: s.outstandingReceivable > 0 ? '#f59e0b' : th.textPrimary },
    ]
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '10px', marginBottom: '16px' }}>
          {topTiles.map(t => (
            <div key={t.label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{t.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: t.color ?? th.textPrimary }}>{t.value}</div>
            </div>
          ))}
        </div>
        {/* Budget consumption bar */}
        <div style={{ ...card, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary }}>Budget Consumption</span>
            <span style={{ fontSize: '13px', color: s.percentConsumed > 100 ? '#ef4444' : th.textSecondary }}>{pct(s.percentConsumed)}</span>
          </div>
          <div style={{ background: th.border, borderRadius: '4px', height: '14px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${Math.min(100, (s.totalActual / s.totalBudget) * 100)}%`, background: '#3b82f6', height: '100%' }} />
            <div style={{ width: `${Math.min(100 - (s.totalActual / s.totalBudget) * 100, (s.totalCommitted / s.totalBudget) * 100)}%`, background: '#f59e0b', height: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', color: th.textSecondary }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: '#3b82f6', display: 'inline-block', borderRadius: '2px' }} /> Actual</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: '#f59e0b', display: 'inline-block', borderRadius: '2px' }} /> Committed</span>
          </div>
        </div>
        {/* Category breakdown */}
        {s.byCategory.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, marginBottom: '10px' }}>By Category</div>
            {s.byCategory.map(c => {
              const consumed = c.budgetAmount > 0 ? ((c.committedAmount + c.actualAmount) / c.budgetAmount) * 100 : 0
              return (
                <div key={c.category} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: th.textPrimary, fontWeight: 500 }}><span style={{ width: '10px', height: '10px', background: catColors[c.category] ?? '#94a3b8', display: 'inline-block', borderRadius: '50%', marginRight: '6px' }} />{c.category.charAt(0).toUpperCase() + c.category.slice(1)}</span>
                    <span style={{ fontSize: '12px', color: th.textSecondary }}>{fmt(c.budgetAmount)} budget · {fmt(c.actualAmount + c.committedAmount)} spent</span>
                  </div>
                  <div style={{ background: th.border, borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, consumed)}%`, background: catColors[c.category] ?? '#94a3b8', height: '100%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {/* Client billing */}
        <div style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px', marginTop: '4px' }}>Client Billing (AR)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '10px' }}>
          {billingTiles.map(t => (
            <div key={t.label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', marginBottom: '4px' }}>{t.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: (t as { color?: string }).color ?? th.textPrimary }}>{t.value}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Budget (Cost Codes) ───────────────────────────────────────────────────
  const renderBudget = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Cost Codes & Budget</div>
        {isEditable && <button style={btn()} onClick={() => { setCodeModal({ open: true, mode: 'create', item: {} }); setCodeForm({ analyticAccountId: projectAnalyticAccountId ?? '', code: '', name: '', category: 'labor', budgetAmount: '0', sequence: '0' }) }}>+ Cost Code</button>}
      </div>
      <div style={{ border: `1px solid ${th.border}`, borderRadius: '8px', overflowX: 'auto' }}>
        <div style={{ minWidth: '720px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 110px 110px 100px 110px 70px', columnGap: '8px', padding: '8px 12px', background: th.bgSurface, borderBottom: `1px solid ${th.border}`, fontSize: '10px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
          <span>Code</span><span>Name</span><span>Category</span><span style={{ textAlign: 'right' }}>Budget</span><span style={{ textAlign: 'right' }}>Committed</span><span style={{ textAlign: 'right' }}>Actual</span><span style={{ textAlign: 'right' }}>Remaining</span><span style={{ textAlign: 'center' }}>%</span>
        </div>
        {costCodes.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: th.textSecondary, fontSize: '13px' }}>No cost codes yet. Add cost codes to track budget.</div>}
        {costCodes.map(c => (
          <div key={c.id} onClick={() => { setCodeModal({ open: true, mode: 'edit', item: c }); setCodeForm({ analyticAccountId: c.analyticAccountId ?? '', code: c.code, name: c.name, category: c.category, budgetAmount: String(c.budgetAmount), sequence: String(c.sequence) }) }}
            style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 110px 110px 100px 110px 70px', columnGap: '8px', padding: '8px 12px', borderBottom: `1px solid ${th.border}`, background: th.bgCanvas, cursor: 'pointer', boxSizing: 'border-box', borderLeft: `3px solid ${catColors[c.category] ?? '#94a3b8'}`, alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: th.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{c.code}</span>
            <span style={{ fontSize: '13px', color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.name}</span>
            <span style={{ fontSize: '11px', color: th.textSecondary, textTransform: 'capitalize', minWidth: 0 }}>{c.category}</span>
            <span style={{ fontSize: '12px', color: th.textPrimary, textAlign: 'right', minWidth: 0 }}>{fmt(c.budgetAmount)}</span>
            <span style={{ fontSize: '12px', color: '#f59e0b', textAlign: 'right', minWidth: 0 }}>{fmt(c.committedAmount)}</span>
            <span style={{ fontSize: '12px', color: '#3b82f6', textAlign: 'right', minWidth: 0 }}>{fmt(c.actualAmount)}</span>
            <span style={{ fontSize: '12px', color: c.remainingBudget < 0 ? '#ef4444' : '#22c55e', textAlign: 'right', minWidth: 0 }}>{fmt(c.remainingBudget)}</span>
            <span style={{ fontSize: '11px', color: c.percentConsumed > 100 ? '#ef4444' : th.textSecondary, textAlign: 'center', minWidth: 0 }}>{pct(c.percentConsumed)}</span>
          </div>
        ))}
        {costCodes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 110px 110px 100px 110px 70px', columnGap: '8px', padding: '8px 12px', background: th.bgSurface, borderTop: `1px solid ${th.border}`, fontSize: '12px', fontWeight: 700, color: th.textPrimary }}>
            <span /><span>Total</span><span />
            <span style={{ textAlign: 'right' }}>{fmt(costCodes.reduce((s, c) => s + c.budgetAmount, 0))}</span>
            <span style={{ textAlign: 'right', color: '#f59e0b' }}>{fmt(costCodes.reduce((s, c) => s + c.committedAmount, 0))}</span>
            <span style={{ textAlign: 'right', color: '#3b82f6' }}>{fmt(costCodes.reduce((s, c) => s + c.actualAmount, 0))}</span>
            <span style={{ textAlign: 'right' }}>{fmt(costCodes.reduce((s, c) => s + c.remainingBudget, 0))}</span>
            <span />
          </div>
        )}
        </div>
      </div>
    </div>
  )

  // ── [removed: Committed, Cash Flow, Invoices, Subcontracts, Labor, Equipment, Forecast moved to Finance module] ──
  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: th.textPrimary }}>
      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${th.border}`, marginBottom: '20px', overflowX: 'auto' }}>
        {nav.map(n => (
          <button key={n.key} onClick={() => setSection(n.key)}
            style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: section === n.key ? 600 : 400, color: section === n.key ? th.accent : th.textSecondary, background: 'transparent', borderBottom: `2px solid ${section === n.key ? th.accent : 'transparent'}`, whiteSpace: 'nowrap' }}>
            {n.label}
          </button>
        ))}
      </div>

      {section === 'overview' && renderOverview()}
      {section === 'budget'   && renderBudget()}

      {/* Cost Code Modal */}
      {codeModal.open && (
        <div style={modalOverlay} onClick={() => setCodeModal({ open: false, mode: 'create', item: {} })}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr(codeModal.mode === 'create' ? 'Add Cost Code' : 'Edit Cost Code')}
            {ff('Analytic Account', (
              <div style={{ padding: '7px 10px', borderRadius: '6px', border: `1px solid ${th.border}`, background: th.bgCanvas, fontSize: '13px', color: th.textMuted }}>
                {projectAnalyticAccountName ?? '—'}
              </div>
            ))}
            {ff('Category', fs(codeForm.category, v => setCodeForm(f => ({ ...f, category: v })), catOpts))}
            {ff('Budget Amount', fi(codeForm.budgetAmount, v => setCodeForm(f => ({ ...f, budgetAmount: v })), '0', 'number'))}
            {mBtns(() => {
              if (codeModal.mode === 'create') onCreateCostCode({ projectId, analyticAccountId: codeForm.analyticAccountId || undefined, code: codeForm.code || undefined, name: codeForm.name || undefined, category: codeForm.category, budgetAmount: parseFloat(codeForm.budgetAmount) || 0, sequence: costCodes.length })
              else onUpdateCostCode({ id: codeModal.item.id, category: codeForm.category, budgetAmount: parseFloat(codeForm.budgetAmount) || 0 })
              setCodeModal({ open: false, mode: 'create', item: {} })
            }, () => setCodeModal({ open: false, mode: 'create', item: {} }))}
            {codeModal.mode === 'edit' && isAdmin && <button style={{ ...btn({ background: '#ef4444', width: '100%', marginTop: '8px', textAlign: 'center' }) }} onClick={() => { if (confirm('Delete cost code?')) { onDeleteCostCode(codeModal.item.id!); setCodeModal({ open: false, mode: 'create', item: {} }) } }}>Delete</button>}
          </div>
        </div>
      )}

    </div>
  )
}

// ── VariationOrdersTab ────────────────────────────────────────────────────────

type VOCostItemType   = { id: string; voId: string; category: string; description: string; quantity: number; unit: string | null; unitRate: number; amount: number; notes: string | null; createdAt: string }
type VOCorrType       = { id: string; voId: string; correspondenceDate: string; direction: string; referenceNumber: string | null; subject: string; description: string | null; createdAt: string }
type VODrawingType    = { id: string; voId: string; drawingNumber: string; revision: string | null; title: string | null; notes: string | null; createdAt: string }
type VariationOrderType = { id: string; projectId: string; voNumber: string; title: string; description: string | null; changeType: string; initiatedBy: string; instructionDate: string | null; receivedDate: string | null; scheduleImpactDays: number; voValue: number; approvedValue: number | null; currencyCode: string; clientRef: string | null; impactAnalysis: string | null; technicalNotes: string | null; status: string; submittedAt: string | null; decidedAt: string | null; rejectionReason: string | null; costItems: VOCostItemType[]; correspondence: VOCorrType[]; drawings: VODrawingType[]; createdAt: string; updatedAt: string }

type VariationOrdersProps = {
  projectId: string; th: Record<string, string>; isAdmin: boolean
  variationOrders: VariationOrderType[]
  onCreateVO: (v: Record<string, unknown>) => void; onUpdateVO: (v: Record<string, unknown>) => void; onDeleteVO: (id: string) => void
  onSubmitVO: (id: string) => void; onApproveVO: (id: string, approvedValue: number) => void; onRejectVO: (id: string, reason: string) => void; onSetVOStatus: (id: string, status: string) => void
  onCreateCostItem: (v: Record<string, unknown>) => void; onUpdateCostItem: (v: Record<string, unknown>) => void; onDeleteCostItem: (id: string) => void
  onCreateCorrespondence: (v: Record<string, unknown>) => void; onDeleteCorrespondence: (id: string) => void
  onAddDrawing: (v: Record<string, unknown>) => void; onRemoveDrawing: (id: string) => void
}

function VariationOrdersTab(props: VariationOrdersProps) {
  const { projectId, th, isAdmin, variationOrders, onCreateVO, onUpdateVO, onDeleteVO, onSubmitVO, onApproveVO, onRejectVO, onSetVOStatus, onCreateCostItem, onUpdateCostItem, onDeleteCostItem, onCreateCorrespondence, onDeleteCorrespondence, onAddDrawing, onRemoveDrawing } = props

  type VOSection = 'register' | 'analysis'
  type VOSubTab  = 'cost' | 'correspondence' | 'drawings'

  const [section, setSection]       = React.useState<VOSection>('register')
  const [expandedVO, setExpandedVO] = React.useState<Set<string>>(new Set())
  const [subTab, setSubTab]         = React.useState<Record<string, VOSubTab>>({})

  const [voModal, setVOModal]   = React.useState<{ open: boolean; mode: 'create' | 'edit'; item: Partial<VariationOrderType> }>({ open: false, mode: 'create', item: {} })
  const [voForm, setVOForm]     = React.useState({ voNumber: '', title: '', description: '', changeType: 'additional_work', initiatedBy: 'client', instructionDate: '', receivedDate: '', scheduleImpactDays: '0', voValue: '0', currencyCode: 'USD', clientRef: '', impactAnalysis: '', technicalNotes: '' })

  const [approveModal, setApproveModal] = React.useState<{ open: boolean; voId: string; voNumber: string; voValue: number }>({ open: false, voId: '', voNumber: '', voValue: 0 })
  const [approvedValue, setApprovedValue] = React.useState('')

  const [rejectModal, setRejectModal] = React.useState<{ open: boolean; voId: string; voNumber: string }>({ open: false, voId: '', voNumber: '' })
  const [rejectReason, setRejectReason] = React.useState('')

  const [costModal, setCostModal] = React.useState<{ open: boolean; mode: 'create' | 'edit'; voId: string; item: Partial<VOCostItemType> }>({ open: false, mode: 'create', voId: '', item: {} })
  const [costForm, setCostForm]   = React.useState({ category: 'labor', description: '', quantity: '1', unit: '', unitRate: '0', amount: '0', notes: '' })

  const [corrModal, setCorrModal] = React.useState<{ open: boolean; voId: string }>({ open: false, voId: '' })
  const [corrForm, setCorrForm]   = React.useState({ correspondenceDate: '', direction: 'received', referenceNumber: '', subject: '', description: '' })

  const [drawModal, setDrawModal] = React.useState<{ open: boolean; voId: string }>({ open: false, voId: '' })
  const [drawForm, setDrawForm]   = React.useState({ drawingNumber: '', revision: '', title: '', notes: '' })

  const [confirmDel, setConfirmDel] = React.useState<{ message: string; onConfirm: () => void } | null>(null)

  const card    = { background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '8px', padding: '16px', marginBottom: '12px' } as React.CSSProperties
  const vbtn    = (extra?: React.CSSProperties): React.CSSProperties => ({ padding: '6px 14px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', cursor: 'pointer', fontSize: '13px', ...extra })
  const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: `1px solid ${th.border}`, borderRadius: '6px', background: th.bgSurface, color: th.textPrimary, fontSize: '13px', boxSizing: 'border-box' }
  const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const voff = (label: string, ctrl: React.ReactNode) => <div style={{ marginBottom: '10px' }}><label style={labelSt}>{label}</label>{ctrl}</div>
  const vfi  = (val: string, set: (v: string) => void, ph = '', type = 'text') => <input style={inputSt} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
  const vfs  = (val: string, set: (v: string) => void, opts: Array<{ value: string; label: string }>) => <select style={inputSt} value={val} onChange={e => set(e.target.value)}>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  const fmt  = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }
  const modalBox: React.CSSProperties    = { background: th.bgSurface, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }
  const mHdr  = (t: string) => <div style={{ fontSize: '16px', fontWeight: 700, color: th.textPrimary, marginBottom: '16px' }}>{t}</div>
  const mBtnsVO = (onSave: () => void, onClose: () => void) => (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
      <button style={vbtn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={onClose}>Cancel</button>
      <button style={vbtn()} onClick={onSave}>Save</button>
    </div>
  )

  const STATUS_COLOR: Record<string, string> = {
    draft: '#94a3b8', submitted: '#f59e0b', under_review: '#3b82f6',
    approved: '#22c55e', rejected: '#ef4444', partial: '#8b5cf6', on_hold: '#f97316',
  }
  const CHANGE_TYPE_LABEL: Record<string, string> = {
    additional_work: 'Additional Work', omission: 'Omission', substitution: 'Substitution',
    acceleration: 'Acceleration', prolongation: 'Prolongation', other: 'Other',
  }
  const INITIATED_BY_LABEL: Record<string, string> = { client: 'Client', engineer: 'Engineer', contractor: 'Contractor', regulatory: 'Regulatory' }

  const changeTypeOpts = Object.entries(CHANGE_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))
  const initiatedByOpts = Object.entries(INITIATED_BY_LABEL).map(([v, l]) => ({ value: v, label: l }))
  const catOpts = ['labor','material','equipment','subcontract','overhead','margin','other'].map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))
  const dirOpts = [{ value: 'received', label: 'Received from Client' }, { value: 'sent', label: 'Sent to Client' }]

  const nextVONumber = `VO-${String(variationOrders.length + 1).padStart(3, '0')}`

  const openCreateVO = () => {
    setVOModal({ open: true, mode: 'create', item: {} })
    setVOForm({ voNumber: nextVONumber, title: '', description: '', changeType: 'additional_work', initiatedBy: 'client', instructionDate: '', receivedDate: new Date().toISOString().slice(0, 10), scheduleImpactDays: '0', voValue: '0', currencyCode: 'USD', clientRef: '', impactAnalysis: '', technicalNotes: '' })
  }

  const openEditVO = (vo: VariationOrderType) => {
    setVOModal({ open: true, mode: 'edit', item: vo })
    setVOForm({ voNumber: vo.voNumber, title: vo.title, description: vo.description ?? '', changeType: vo.changeType, initiatedBy: vo.initiatedBy, instructionDate: vo.instructionDate ?? '', receivedDate: vo.receivedDate ?? '', scheduleImpactDays: String(vo.scheduleImpactDays), voValue: String(vo.voValue), currencyCode: vo.currencyCode, clientRef: vo.clientRef ?? '', impactAnalysis: vo.impactAnalysis ?? '', technicalNotes: vo.technicalNotes ?? '' })
  }

  const toggleVO = (voId: string) => setExpandedVO(s => { const n = new Set(s); n.has(voId) ? n.delete(voId) : n.add(voId); return n })
  const getSubTab = (voId: string): VOSubTab => subTab[voId] ?? 'cost'

  // ── Analysis ──────────────────────────────────────────────────────────────
  const renderAnalysis = () => {
    const approved  = variationOrders.filter(v => v.status === 'approved')
    const pending   = variationOrders.filter(v => ['submitted','under_review'].includes(v.status))
    const rejected  = variationOrders.filter(v => v.status === 'rejected')
    const draft     = variationOrders.filter(v => v.status === 'draft')
    const totalApproved   = approved.reduce((s, v) => s + (v.approvedValue ?? v.voValue), 0)
    const totalPending    = pending.reduce((s, v) => s + v.voValue, 0)
    const totalRejected   = rejected.reduce((s, v) => s + v.voValue, 0)
    const totalDraft      = draft.reduce((s, v) => s + v.voValue, 0)
    const totalSchedule   = approved.reduce((s, v) => s + v.scheduleImpactDays, 0)
    const grandTotal      = variationOrders.reduce((s, v) => s + v.voValue, 0)

    const byChangeType = Object.entries(
      variationOrders.reduce((acc, v) => { const k = v.changeType; acc[k] = (acc[k] ?? 0) + v.voValue; return acc }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1])

    const byInitiator = Object.entries(
      variationOrders.reduce((acc, v) => { const k = v.initiatedBy; acc[k] = (acc[k] ?? 0) + v.voValue; return acc }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1])

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Total VOs', value: String(variationOrders.length), color: th.textPrimary },
            { label: 'Approved Value', value: fmt(totalApproved), color: '#22c55e' },
            { label: 'Pending Value', value: fmt(totalPending), color: '#f59e0b' },
            { label: 'Rejected', value: fmt(totalRejected), color: '#ef4444' },
            { label: 'Schedule Impact', value: `+${totalSchedule} days`, color: totalSchedule > 0 ? '#f97316' : th.textPrimary },
          ].map(t => (
            <div key={t.label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{t.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: t.color }}>{t.value}</div>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, marginBottom: '12px' }}>Status Breakdown</div>
          {[
            { label: `Approved (${approved.length})`, value: totalApproved, color: '#22c55e' },
            { label: `Pending (${pending.length})`, value: totalPending, color: '#f59e0b' },
            { label: `Draft (${draft.length})`, value: totalDraft, color: '#94a3b8' },
            { label: `Rejected (${rejected.length})`, value: totalRejected, color: '#ef4444' },
          ].map(row => (
            <div key={row.label} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span style={{ color: th.textPrimary }}>{row.label}</span>
                <span style={{ color: row.color, fontWeight: 600 }}>{fmt(row.value)}</span>
              </div>
              <div style={{ background: th.border, borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${grandTotal > 0 ? Math.min(100, (row.value / grandTotal) * 100) : 0}%`, background: row.color, height: '100%' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={card}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px' }}>By Change Type</div>
            {byChangeType.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${th.border}`, fontSize: '12px' }}>
                <span style={{ color: th.textSecondary }}>{CHANGE_TYPE_LABEL[k] ?? k}</span>
                <span style={{ color: th.textPrimary, fontWeight: 500 }}>{fmt(v)}</span>
              </div>
            ))}
            {byChangeType.length === 0 && <div style={{ color: th.textSecondary, fontSize: '12px' }}>No data</div>}
          </div>
          <div style={card}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px' }}>By Initiated By</div>
            {byInitiator.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${th.border}`, fontSize: '12px' }}>
                <span style={{ color: th.textSecondary }}>{INITIATED_BY_LABEL[k] ?? k}</span>
                <span style={{ color: th.textPrimary, fontWeight: 500 }}>{fmt(v)}</span>
              </div>
            ))}
            {byInitiator.length === 0 && <div style={{ color: th.textSecondary, fontSize: '12px' }}>No data</div>}
          </div>
        </div>
      </div>
    )
  }

  // ── Register ──────────────────────────────────────────────────────────────
  const renderRegister = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Variation Order Register</div>
        {isAdmin && <button style={vbtn()} onClick={openCreateVO}>+ New VO</button>}
      </div>
      {variationOrders.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: th.textSecondary, fontSize: '13px', padding: '40px' }}>
          No variation orders yet. Click "+ New VO" to raise the first change.
        </div>
      )}
      {variationOrders.map(vo => {
        const isExpanded = expandedVO.has(vo.id)
        const st = getSubTab(vo.id)
        const sc = STATUS_COLOR[vo.status] ?? '#94a3b8'
        const costTotal = vo.costItems.reduce((s, c) => s + c.amount, 0)
        return (
          <div key={vo.id} style={{ border: `1px solid ${th.border}`, borderLeft: `4px solid ${sc}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '10px' }}>

            {/* ── Header band ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: th.bgSurface, gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => toggleVO(vo.id)}>
                <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: th.accent, letterSpacing: '0.03em' }}>{vo.voNumber}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: th.textPrimary }}>{vo.title}</span>
                <span style={{ fontSize: '10px', background: `${sc}18`, color: sc, border: `1px solid ${sc}50`, borderRadius: '10px', padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{vo.status.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: '11px', color: th.textSecondary, background: th.bgCanvas, border: `1px solid ${th.border}`, borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{CHANGE_TYPE_LABEL[vo.changeType]}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.textSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                {isAdmin && vo.status === 'draft' && <button style={vbtn({ padding: '4px 12px', fontSize: '11px', background: '#f59e0b' })} onClick={() => onSubmitVO(vo.id)}>Submit</button>}
                {isAdmin && vo.status === 'submitted' && <button style={vbtn({ padding: '4px 12px', fontSize: '11px', background: '#3b82f6' })} onClick={() => onSetVOStatus(vo.id, 'under_review')}>Under Review</button>}
                {isAdmin && ['submitted','under_review'].includes(vo.status) && (<>
                  <button style={vbtn({ padding: '4px 12px', fontSize: '11px', background: '#22c55e' })} onClick={() => { setApproveModal({ open: true, voId: vo.id, voNumber: vo.voNumber, voValue: vo.voValue }); setApprovedValue(String(vo.voValue)) }}>Approve</button>
                  <button style={vbtn({ padding: '4px 12px', fontSize: '11px', background: '#ef4444' })} onClick={() => { setRejectModal({ open: true, voId: vo.id, voNumber: vo.voNumber }); setRejectReason('') }}>Reject</button>
                </>)}
                {isAdmin && <button style={vbtn({ padding: '4px 12px', fontSize: '11px', background: 'transparent', color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => openEditVO(vo)}>Edit</button>}
                {isAdmin && vo.status === 'draft' && <button style={vbtn({ padding: '4px 12px', fontSize: '11px', background: '#ef4444' })} onClick={() => setConfirmDel({ message: `Delete ${vo.voNumber}?`, onConfirm: () => onDeleteVO(vo.id) })}>Del</button>}
              </div>
            </div>

            {/* ── Metadata band ── */}
            <div style={{ display: 'flex', gap: '0', borderTop: `1px solid ${th.border}`, background: th.bgCanvas, flexWrap: 'wrap' }}>
              {[
                { label: 'Value', value: fmt(vo.voValue), color: th.textPrimary },
                ...(vo.approvedValue != null ? [{ label: 'Approved', value: fmt(vo.approvedValue), color: '#22c55e' }] : []),
                ...(vo.scheduleImpactDays !== 0 ? [{ label: 'Schedule', value: `${vo.scheduleImpactDays > 0 ? '+' : ''}${vo.scheduleImpactDays}d`, color: vo.scheduleImpactDays > 0 ? '#f97316' : '#22c55e' }] : []),
                { label: 'From', value: INITIATED_BY_LABEL[vo.initiatedBy], color: th.textSecondary },
                ...(vo.clientRef ? [{ label: 'Ref', value: vo.clientRef, color: th.textSecondary }] : []),
                ...(vo.receivedDate ? [{ label: 'Received', value: vo.receivedDate, color: th.textSecondary }] : []),
              ].map((m, i) => (
                <div key={m.label} style={{ padding: '7px 14px', borderRight: `1px solid ${th.border}`, fontSize: '12px' }}>
                  <span style={{ color: th.textSecondary, fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, marginRight: '5px' }}>{m.label}</span>
                  <span style={{ color: m.color, fontWeight: 500 }}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* ── Rejection notice ── */}
            {vo.rejectionReason && (
              <div style={{ padding: '8px 14px', background: '#ef444412', borderTop: `1px solid #ef444430`, fontSize: '12px', color: '#ef4444' }}>
                Rejection reason: {vo.rejectionReason}
              </div>
            )}

            {/* ── Expanded content ── */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${th.border}` }}>

                {/* Info fields */}
                {(vo.description || vo.impactAnalysis || vo.technicalNotes) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', borderBottom: `1px solid ${th.border}` }}>
                    {[
                      { label: 'Description', value: vo.description },
                      { label: 'Impact Analysis', value: vo.impactAnalysis },
                      { label: 'Technical Notes', value: vo.technicalNotes },
                    ].filter(f => f.value).map((f, i, arr) => (
                      <div key={f.label} style={{ padding: '10px 14px', borderRight: i < arr.length - 1 ? `1px solid ${th.border}` : 'none', background: th.bgSurface }}>
                        <div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '4px' }}>{f.label}</div>
                        <div style={{ fontSize: '12px', color: th.textPrimary, lineHeight: 1.5 }}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sub-tab nav */}
                <div style={{ display: 'flex', borderBottom: `1px solid ${th.border}`, padding: '0 14px', background: th.bgSurface }}>
                  {(['cost', 'correspondence', 'drawings'] as VOSubTab[]).map(t => (
                    <button key={t} onClick={() => setSubTab(s => ({ ...s, [vo.id]: t }))}
                      style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: st === t ? 600 : 400, color: st === t ? th.accent : th.textSecondary, background: 'transparent', borderBottom: `2px solid ${st === t ? th.accent : 'transparent'}`, marginBottom: '-1px' }}>
                      {t === 'cost' ? `Cost (${vo.costItems.length})` : t === 'correspondence' ? `Correspondence (${vo.correspondence.length})` : `Drawings (${vo.drawings.length})`}
                    </button>
                  ))}
                </div>

                {/* Sub-tab content */}
                <div style={{ padding: '14px', background: th.bgCanvas }}>
                {st === 'cost' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: th.textSecondary }}>Line items total: <strong style={{ color: th.accent }}>{fmt(costTotal)}</strong>{costTotal !== vo.voValue && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>(VO submitted: {fmt(vo.voValue)})</span>}</span>
                      {isAdmin && <button style={vbtn({ padding: '3px 10px', fontSize: '11px' })} onClick={() => { setCostModal({ open: true, mode: 'create', voId: vo.id, item: {} }); setCostForm({ category: 'labor', description: '', quantity: '1', unit: '', unitRate: '0', amount: '0', notes: '' }) }}>+ Line</button>}
                    </div>
                    {vo.costItems.length > 0 ? (
                      <div style={{ border: `1px solid ${th.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 50px 80px 80px 60px', padding: '6px 10px', background: th.bgSurface, fontSize: '10px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
                          <span>Category</span><span>Description</span><span>Qty</span><span>Unit</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Amount</span><span />
                        </div>
                        {vo.costItems.map(ci => (
                          <div key={ci.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 50px 80px 80px 60px', padding: '6px 10px', borderTop: `1px solid ${th.border}`, background: th.bgCanvas, fontSize: '12px', alignItems: 'center' }}>
                            <span style={{ color: th.textSecondary, textTransform: 'capitalize' }}>{ci.category}</span>
                            <span style={{ color: th.textPrimary }}>{ci.description}</span>
                            <span style={{ color: th.textSecondary, textAlign: 'right' }}>{ci.quantity}</span>
                            <span style={{ color: th.textSecondary }}>{ci.unit ?? ''}</span>
                            <span style={{ color: th.textSecondary, textAlign: 'right' }}>{fmt(ci.unitRate)}</span>
                            <span style={{ color: th.accent, fontWeight: 600, textAlign: 'right' }}>{fmt(ci.amount)}</span>
                            {isAdmin && <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                              <button title="Edit" style={vbtn({ padding: '4px 6px', background: 'transparent', color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => { setCostModal({ open: true, mode: 'edit', voId: vo.id, item: ci }); setCostForm({ category: ci.category, description: ci.description, quantity: String(ci.quantity), unit: ci.unit ?? '', unitRate: String(ci.unitRate), amount: String(ci.amount), notes: ci.notes ?? '' }) }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button title="Delete" style={vbtn({ padding: '4px 6px', background: 'transparent', color: '#ef4444', border: `1px solid #ef444450` })} onClick={() => setConfirmDel({ message: 'Delete cost item?', onConfirm: () => onDeleteCostItem(ci.id) })}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                              </button>
                            </div>}
                          </div>
                        ))}
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 50px 80px 80px 60px', padding: '6px 10px', background: th.bgSurface, borderTop: `1px solid ${th.border}`, fontSize: '12px', fontWeight: 700 }}>
                          <span /><span style={{ color: th.textPrimary }}>Total</span><span /><span /><span /><span style={{ color: th.accent, textAlign: 'right' }}>{fmt(costTotal)}</span><span />
                        </div>
                      </div>
                    ) : <div style={{ color: th.textSecondary, fontSize: '12px' }}>No cost items yet.</div>}
                  </div>
                )}
                {st === 'correspondence' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: th.textSecondary }}>{vo.correspondence.length} entries</span>
                      {isAdmin && <button style={vbtn({ padding: '3px 10px', fontSize: '11px' })} onClick={() => { setCorrModal({ open: true, voId: vo.id }); setCorrForm({ correspondenceDate: new Date().toISOString().slice(0, 10), direction: 'received', referenceNumber: '', subject: '', description: '' }) }}>+ Entry</button>}
                    </div>
                    {vo.correspondence.map(c => (
                      <div key={c.id} style={{ ...card, marginBottom: '8px', padding: '10px 12px', borderLeft: `3px solid ${c.direction === 'received' ? '#3b82f6' : '#22c55e'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '10px', background: c.direction === 'received' ? '#3b82f622' : '#22c55e22', color: c.direction === 'received' ? '#3b82f6' : '#22c55e', border: `1px solid ${c.direction === 'received' ? '#3b82f644' : '#22c55e44'}`, borderRadius: '3px', padding: '2px 6px' }}>{c.direction === 'received' ? '← Received' : '→ Sent'}</span>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary }}>{c.subject}</span>
                              {c.referenceNumber && <span style={{ fontSize: '11px', color: th.textSecondary }}>Ref: {c.referenceNumber}</span>}
                              <span style={{ fontSize: '11px', color: th.textSecondary }}>{c.correspondenceDate}</span>
                            </div>
                            {c.description && <div style={{ fontSize: '12px', color: th.textSecondary }}>{c.description}</div>}
                          </div>
                          {isAdmin && <button style={vbtn({ padding: '3px 8px', fontSize: '11px', background: '#ef4444' })} onClick={() => setConfirmDel({ message: 'Delete correspondence entry?', onConfirm: () => onDeleteCorrespondence(c.id) })}>Del</button>}
                        </div>
                      </div>
                    ))}
                    {vo.correspondence.length === 0 && <div style={{ color: th.textSecondary, fontSize: '12px' }}>No correspondence yet.</div>}
                  </div>
                )}
                {st === 'drawings' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: th.textSecondary }}>{vo.drawings.length} linked drawings</span>
                      {isAdmin && <button style={vbtn({ padding: '3px 10px', fontSize: '11px' })} onClick={() => { setDrawModal({ open: true, voId: vo.id }); setDrawForm({ drawingNumber: '', revision: '', title: '', notes: '' }) }}>+ Drawing</button>}
                    </div>
                    {vo.drawings.length > 0 ? (
                      <div style={{ border: `1px solid ${th.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 60px 1fr 1fr 60px', padding: '6px 10px', background: th.bgSurface, fontSize: '10px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
                          <span>Drawing #</span><span>Rev</span><span>Title</span><span>Notes</span><span />
                        </div>
                        {vo.drawings.map(d => (
                          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '130px 60px 1fr 1fr 60px', padding: '6px 10px', borderTop: `1px solid ${th.border}`, background: th.bgSurface, fontSize: '12px', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', color: th.textPrimary }}>{d.drawingNumber}</span>
                            <span style={{ color: th.textSecondary }}>{d.revision ?? '—'}</span>
                            <span style={{ color: th.textSecondary }}>{d.title ?? '—'}</span>
                            <span style={{ color: th.textSecondary, fontSize: '11px' }}>{d.notes ?? ''}</span>
                            {isAdmin && <button style={vbtn({ padding: '2px 6px', fontSize: '10px', background: '#ef4444' })} onClick={() => setConfirmDel({ message: 'Remove linked drawing?', onConfirm: () => onRemoveDrawing(d.id) })}>Del</button>}
                          </div>
                        ))}
                      </div>
                    ) : <div style={{ color: th.textSecondary, fontSize: '12px' }}>No linked drawings yet.</div>}
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: th.textPrimary }}>
      <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${th.border}`, marginBottom: '20px' }}>
        {([['register', `Register (${variationOrders.length})`], ['analysis', 'Analysis']] as [VOSection, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSection(key as VOSection)}
            style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: section === key ? 600 : 400, color: section === key ? th.accent : th.textSecondary, background: 'transparent', borderBottom: `2px solid ${section === key ? th.accent : 'transparent'}` }}>
            {label}
          </button>
        ))}
      </div>

      {section === 'register' && renderRegister()}
      {section === 'analysis' && renderAnalysis()}

      {/* VO Create/Edit Modal */}
      {voModal.open && (
        <div style={modalOverlay} onClick={() => setVOModal(m => ({ ...m, open: false }))}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr(voModal.mode === 'create' ? 'New Variation Order' : `Edit ${voForm.voNumber}`)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{voff('VO Number', vfi(voForm.voNumber, v => setVOForm(f => ({ ...f, voNumber: v })), 'VO-001'))}</div>
              <div>{voff('Currency', vfi(voForm.currencyCode, v => setVOForm(f => ({ ...f, currencyCode: v })), 'USD'))}</div>
            </div>
            {voff('Title', vfi(voForm.title, v => setVOForm(f => ({ ...f, title: v }))))}
            {voff('Description', <textarea style={{ ...inputSt, minHeight: '60px' }} value={voForm.description} onChange={e => setVOForm(f => ({ ...f, description: e.target.value }))} />)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{voff('Change Type', vfs(voForm.changeType, v => setVOForm(f => ({ ...f, changeType: v })), changeTypeOpts))}</div>
              <div>{voff('Initiated By', vfs(voForm.initiatedBy, v => setVOForm(f => ({ ...f, initiatedBy: v })), initiatedByOpts))}</div>
              <div>{voff('Instruction Date', vfi(voForm.instructionDate, v => setVOForm(f => ({ ...f, instructionDate: v })), '', 'date'))}</div>
              <div>{voff('Received Date', vfi(voForm.receivedDate, v => setVOForm(f => ({ ...f, receivedDate: v })), '', 'date'))}</div>
              <div>{voff('Submitted Value ($)', vfi(voForm.voValue, v => setVOForm(f => ({ ...f, voValue: v })), '0', 'number'))}</div>
              <div>{voff('Schedule Impact (days)', vfi(voForm.scheduleImpactDays, v => setVOForm(f => ({ ...f, scheduleImpactDays: v })), '0', 'number'))}</div>
            </div>
            {voff('Client Reference', vfi(voForm.clientRef, v => setVOForm(f => ({ ...f, clientRef: v }))))}
            {voff('Impact Analysis', <textarea style={{ ...inputSt, minHeight: '60px' }} value={voForm.impactAnalysis} onChange={e => setVOForm(f => ({ ...f, impactAnalysis: e.target.value }))} />)}
            {voff('Technical Notes', <textarea style={{ ...inputSt, minHeight: '50px' }} value={voForm.technicalNotes} onChange={e => setVOForm(f => ({ ...f, technicalNotes: e.target.value }))} />)}
            {mBtnsVO(() => {
              if (voModal.mode === 'create') onCreateVO({ projectId, voNumber: voForm.voNumber, title: voForm.title, description: voForm.description || null, changeType: voForm.changeType, initiatedBy: voForm.initiatedBy, instructionDate: voForm.instructionDate || null, receivedDate: voForm.receivedDate || null, scheduleImpactDays: parseInt(voForm.scheduleImpactDays) || 0, voValue: parseFloat(voForm.voValue) || 0, currencyCode: voForm.currencyCode, clientRef: voForm.clientRef || null, impactAnalysis: voForm.impactAnalysis || null, technicalNotes: voForm.technicalNotes || null })
              else onUpdateVO({ id: voModal.item.id, title: voForm.title, description: voForm.description || null, changeType: voForm.changeType, initiatedBy: voForm.initiatedBy, instructionDate: voForm.instructionDate || null, receivedDate: voForm.receivedDate || null, scheduleImpactDays: parseInt(voForm.scheduleImpactDays) || 0, voValue: parseFloat(voForm.voValue) || 0, currencyCode: voForm.currencyCode, clientRef: voForm.clientRef || null, impactAnalysis: voForm.impactAnalysis || null, technicalNotes: voForm.technicalNotes || null })
              setVOModal(m => ({ ...m, open: false }))
            }, () => setVOModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveModal.open && (
        <div style={modalOverlay} onClick={() => setApproveModal(m => ({ ...m, open: false }))}>
          <div style={{ ...modalBox, maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            {mHdr(`Approve ${approveModal.voNumber}`)}
            <div style={{ fontSize: '13px', color: th.textSecondary, marginBottom: '12px' }}>Submitted value: <strong style={{ color: th.textPrimary }}>{fmt(approveModal.voValue)}</strong></div>
            {voff('Approved Value ($)', <input style={inputSt} type="number" value={approvedValue} onChange={e => setApprovedValue(e.target.value)} />)}
            <div style={{ fontSize: '11px', color: th.textSecondary, marginBottom: '8px' }}>Enter a different amount for partial approval.</div>
            {mBtnsVO(() => { onApproveVO(approveModal.voId, parseFloat(approvedValue) || approveModal.voValue); setApproveModal(m => ({ ...m, open: false })) }, () => setApproveModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div style={modalOverlay} onClick={() => setRejectModal(m => ({ ...m, open: false }))}>
          <div style={{ ...modalBox, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            {mHdr(`Reject ${rejectModal.voNumber}`)}
            {voff('Reason for Rejection', <textarea style={{ ...inputSt, minHeight: '80px' }} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason…" />)}
            {mBtnsVO(() => { if (!rejectReason.trim()) return; onRejectVO(rejectModal.voId, rejectReason); setRejectModal(m => ({ ...m, open: false })) }, () => setRejectModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {/* Cost Item Modal */}
      {costModal.open && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            {mHdr(costModal.mode === 'create' ? 'Add Cost Item' : 'Edit Cost Item')}
            {voff('Category', vfs(costForm.category, v => setCostForm(f => ({ ...f, category: v })), catOpts))}
            {voff('Description', vfi(costForm.description, v => setCostForm(f => ({ ...f, description: v }))))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>{voff('Quantity', vfi(costForm.quantity, v => setCostForm(f => ({ ...f, quantity: v })), '1', 'number'))}</div>
              <div>{voff('Unit', vfi(costForm.unit, v => setCostForm(f => ({ ...f, unit: v })), 'm², ton, day…'))}</div>
              <div>{voff('Unit Rate ($)', vfi(costForm.unitRate, v => setCostForm(f => ({ ...f, unitRate: v })), '0', 'number'))}</div>
            </div>
            {voff('Amount ($)', vfi(costForm.amount, v => setCostForm(f => ({ ...f, amount: v })), '0', 'number'))}
            {voff('Notes', <textarea style={{ ...inputSt, minHeight: '50px' }} value={costForm.notes} onChange={e => setCostForm(f => ({ ...f, notes: e.target.value }))} />)}
            {mBtnsVO(() => {
              if (costModal.mode === 'create') onCreateCostItem({ voId: costModal.voId, category: costForm.category, description: costForm.description, quantity: parseFloat(costForm.quantity) || 1, unit: costForm.unit || null, unitRate: parseFloat(costForm.unitRate) || 0, amount: parseFloat(costForm.amount) || 0, notes: costForm.notes || null })
              else onUpdateCostItem({ id: costModal.item.id, category: costForm.category, description: costForm.description, quantity: parseFloat(costForm.quantity) || 1, unit: costForm.unit || null, unitRate: parseFloat(costForm.unitRate) || 0, amount: parseFloat(costForm.amount) || 0, notes: costForm.notes || null })
              setCostModal(m => ({ ...m, open: false }))
            }, () => setCostModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {/* Correspondence Modal */}
      {corrModal.open && (
        <div style={modalOverlay} onClick={() => setCorrModal(m => ({ ...m, open: false }))}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr('Add Correspondence Entry')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{voff('Date', vfi(corrForm.correspondenceDate, v => setCorrForm(f => ({ ...f, correspondenceDate: v })), '', 'date'))}</div>
              <div>{voff('Direction', vfs(corrForm.direction, v => setCorrForm(f => ({ ...f, direction: v })), dirOpts))}</div>
            </div>
            {voff('Reference Number', vfi(corrForm.referenceNumber, v => setCorrForm(f => ({ ...f, referenceNumber: v })), 'optional'))}
            {voff('Subject', vfi(corrForm.subject, v => setCorrForm(f => ({ ...f, subject: v }))))}
            {voff('Description / Summary', <textarea style={{ ...inputSt, minHeight: '80px' }} value={corrForm.description} onChange={e => setCorrForm(f => ({ ...f, description: e.target.value }))} />)}
            {mBtnsVO(() => { onCreateCorrespondence({ voId: corrModal.voId, correspondenceDate: corrForm.correspondenceDate, direction: corrForm.direction, referenceNumber: corrForm.referenceNumber || null, subject: corrForm.subject, description: corrForm.description || null }); setCorrModal(m => ({ ...m, open: false })) }, () => setCorrModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {/* Drawing Modal */}
      {drawModal.open && (
        <div style={modalOverlay} onClick={() => setDrawModal(m => ({ ...m, open: false }))}>
          <div style={{ ...modalBox, maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            {mHdr('Link Affected Drawing')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{voff('Drawing Number', vfi(drawForm.drawingNumber, v => setDrawForm(f => ({ ...f, drawingNumber: v })), 'DWG-A-001'))}</div>
              <div>{voff('Revision', vfi(drawForm.revision, v => setDrawForm(f => ({ ...f, revision: v })), 'Rev A'))}</div>
            </div>
            {voff('Title', vfi(drawForm.title, v => setDrawForm(f => ({ ...f, title: v }))))}
            {voff('Notes', <textarea style={{ ...inputSt, minHeight: '50px' }} value={drawForm.notes} onChange={e => setDrawForm(f => ({ ...f, notes: e.target.value }))} />)}
            {mBtnsVO(() => { onAddDrawing({ voId: drawModal.voId, drawingNumber: drawForm.drawingNumber, revision: drawForm.revision || null, title: drawForm.title || null, notes: drawForm.notes || null }); setDrawModal(m => ({ ...m, open: false })) }, () => setDrawModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={{ ...modalOverlay, zIndex: 9500 }}>
          <div style={{ ...modalBox, maxWidth: '360px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: th.textPrimary, marginBottom: '6px' }}>Confirm</div>
            <div style={{ fontSize: '13px', color: th.textSecondary, marginBottom: '20px' }}>{confirmDel.message}</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button style={vbtn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button style={vbtn({ background: '#ef4444' })} onClick={() => { confirmDel.onConfirm(); setConfirmDel(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MeetingsTab ───────────────────────────────────────────────────────────────

type MeetingActionType = { id: string; meetingId: string; actionNumber: number; description: string; responsiblePerson: string | null; dueDate: string | null; priority: string; status: string; closedAt: string | null; remarks: string | null; carryOverFrom: string | null; createdAt: string }
type MeetingType       = { id: string; projectId: string; meetingNumber: string; meetingType: string; title: string; meetingDate: string; location: string | null; chairperson: string | null; attendees: string | null; agenda: string | null; minutes: string | null; distributionList: string | null; status: string; issuedAt: string | null; actions: MeetingActionType[]; createdAt: string; updatedAt: string }

type MeetingsProps = {
  projectId: string; th: Record<string, string>; isAdmin: boolean
  meetings: MeetingType[]
  onCreateMeeting: (v: Record<string, unknown>) => void
  onUpdateMeeting: (v: Record<string, unknown>) => void
  onDeleteMeeting: (id: string) => void
  onIssueMeeting: (id: string) => void
  onCloseMeeting: (id: string) => void
  onCreateAction: (v: Record<string, unknown>) => void
  onUpdateAction: (v: Record<string, unknown>) => void
  onDeleteAction: (id: string) => void
}

function MeetingsTab(props: MeetingsProps) {
  const { projectId, th, isAdmin, meetings, onCreateMeeting, onUpdateMeeting, onDeleteMeeting, onIssueMeeting, onCloseMeeting, onCreateAction, onUpdateAction, onDeleteAction } = props

  type MSection = 'register' | 'actions' | 'analysis'

  const [section, setSection]       = React.useState<MSection>('register')
  const [expandedM, setExpandedM]   = React.useState<Set<string>>(new Set())
  const [editingMinutes, setEditingMinutes] = React.useState<string | null>(null)
  const [minutesDraft, setMinutesDraft]     = React.useState('')

  const [mModal, setMModal] = React.useState<{ open: boolean; mode: 'create' | 'edit'; item: Partial<MeetingType> }>({ open: false, mode: 'create', item: {} })
  const [mForm, setMForm]   = React.useState({ meetingType: 'site', title: '', meetingDate: '', location: '', chairperson: '', attendees: '', agenda: '', distributionList: '' })

  const [aModal, setAModal] = React.useState<{ open: boolean; mode: 'create' | 'edit'; meetingId: string; item: Partial<MeetingActionType> }>({ open: false, mode: 'create', meetingId: '', item: {} })
  const [aForm, setAForm]   = React.useState({ description: '', responsiblePerson: '', dueDate: '', priority: 'medium', status: 'open', remarks: '' })

  const card: React.CSSProperties     = { background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '8px', padding: '16px', marginBottom: '12px' }
  const inputSt: React.CSSProperties  = { width: '100%', padding: '7px 10px', border: `1px solid ${th.border}`, borderRadius: '6px', background: th.bgSurface, color: th.textPrimary, fontSize: '13px', boxSizing: 'border-box' }
  const labelSt: React.CSSProperties  = { display: 'block', fontSize: '11px', fontWeight: 600, color: th.textSecondary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const mbtn  = (extra?: React.CSSProperties): React.CSSProperties => ({ padding: '6px 14px', borderRadius: '6px', border: 'none', background: th.accent, color: '#fff', cursor: 'pointer', fontSize: '13px', ...extra })
  const voff  = (label: string, ctrl: React.ReactNode) => <div style={{ marginBottom: '10px' }}><label style={labelSt}>{label}</label>{ctrl}</div>
  const vfi   = (val: string, set: (v: string) => void, ph = '', type = 'text') => <input style={inputSt} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
  const vfs   = (val: string, set: (v: string) => void, opts: Array<{ value: string; label: string }>) => <select style={inputSt} value={val} onChange={e => set(e.target.value)}>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }
  const modalBox: React.CSSProperties     = { background: th.bgSurface, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '580px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }
  const mHdr  = (t: string) => <div style={{ fontSize: '16px', fontWeight: 700, color: th.textPrimary, marginBottom: '16px' }}>{t}</div>
  const mBtns = (onSave: () => void, onClose: () => void) => (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
      <button style={mbtn({ background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={onClose}>Cancel</button>
      <button style={mbtn()} onClick={onSave}>Save</button>
    </div>
  )

  const STATUS_COLOR: Record<string, string> = { draft: '#94a3b8', issued: '#3b82f6', closed: '#22c55e' }
  const PRIORITY_COLOR: Record<string, string> = { low: '#94a3b8', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' }
  const ACTION_STATUS_COLOR: Record<string, string> = { open: '#f59e0b', in_progress: '#3b82f6', closed: '#22c55e' }

  const MEETING_TYPE_OPTS = [
    { value: 'site', label: 'Site Meeting' }, { value: 'technical', label: 'Technical' },
    { value: 'commercial', label: 'Commercial' }, { value: 'kickoff', label: 'Kick-off' },
    { value: 'coordination', label: 'Coordination' }, { value: 'closeout', label: 'Closeout' },
    { value: 'subcontractor', label: 'Subcontractor' }, { value: 'hse', label: 'HSE' },
    { value: 'other', label: 'Other' },
  ]
  const PRIORITY_OPTS   = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]
  const ACTION_STATUS_OPTS = [{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'closed', label: 'Closed' }]

  const today = new Date().toISOString().slice(0, 10)

  const isOverdue = (a: MeetingActionType) => a.status !== 'closed' && !!a.dueDate && a.dueDate < today

  const openCreateMeeting = () => {
    setMModal({ open: true, mode: 'create', item: {} })
    setMForm({ meetingType: 'site', title: '', meetingDate: today, location: '', chairperson: '', attendees: '', agenda: '', distributionList: '' })
  }
  const openEditMeeting = (m: MeetingType) => {
    setMModal({ open: true, mode: 'edit', item: m })
    setMForm({ meetingType: m.meetingType, title: m.title, meetingDate: m.meetingDate, location: m.location ?? '', chairperson: m.chairperson ?? '', attendees: m.attendees ?? '', agenda: m.agenda ?? '', distributionList: m.distributionList ?? '' })
  }
  const openCreateAction = (meetingId: string) => {
    setAModal({ open: true, mode: 'create', meetingId, item: {} })
    setAForm({ description: '', responsiblePerson: '', dueDate: '', priority: 'medium', status: 'open', remarks: '' })
  }
  const openEditAction = (a: MeetingActionType) => {
    setAModal({ open: true, mode: 'edit', meetingId: a.meetingId, item: a })
    setAForm({ description: a.description, responsiblePerson: a.responsiblePerson ?? '', dueDate: a.dueDate ?? '', priority: a.priority, status: a.status, remarks: a.remarks ?? '' })
  }

  const toggleM = (id: string) => setExpandedM(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Analysis ──────────────────────────────────────────────────────────────
  const renderAnalysis = () => {
    const allActions = meetings.flatMap(m => m.actions)
    const open       = allActions.filter(a => a.status === 'open')
    const inProg     = allActions.filter(a => a.status === 'in_progress')
    const closed     = allActions.filter(a => a.status === 'closed')
    const overdue    = allActions.filter(isOverdue)
    const byType     = MEETING_TYPE_OPTS.map(o => ({ label: o.label, count: meetings.filter(m => m.meetingType === o.value).length })).filter(r => r.count > 0)
    const byPerson   = Object.entries(allActions.filter(a => a.responsiblePerson).reduce((acc, a) => { const k = a.responsiblePerson!; acc[k] = (acc[k] ?? 0) + 1; return acc }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Total Meetings', value: String(meetings.length), color: th.textPrimary },
            { label: 'Open Actions', value: String(open.length), color: '#f59e0b' },
            { label: 'In Progress', value: String(inProg.length), color: '#3b82f6' },
            { label: 'Closed', value: String(closed.length), color: '#22c55e' },
            { label: 'Overdue', value: String(overdue.length), color: overdue.length > 0 ? '#ef4444' : th.textPrimary },
          ].map(t => (
            <div key={t.label} style={{ ...card, marginBottom: 0, textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{t.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: t.color }}>{t.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={card}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px' }}>Meetings by Type</div>
            {byType.map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${th.border}`, fontSize: '12px' }}>
                <span style={{ color: th.textSecondary }}>{row.label}</span>
                <span style={{ color: th.textPrimary, fontWeight: 600 }}>{row.count}</span>
              </div>
            ))}
            {byType.length === 0 && <div style={{ color: th.textSecondary, fontSize: '12px' }}>No meetings yet.</div>}
          </div>
          <div style={card}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: th.textPrimary, marginBottom: '8px' }}>Actions by Responsible</div>
            {byPerson.slice(0, 8).map(([name, count]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${th.border}`, fontSize: '12px' }}>
                <span style={{ color: th.textSecondary }}>{name}</span>
                <span style={{ color: th.textPrimary, fontWeight: 600 }}>{count}</span>
              </div>
            ))}
            {byPerson.length === 0 && <div style={{ color: th.textSecondary, fontSize: '12px' }}>No action items yet.</div>}
          </div>
        </div>
      </div>
    )
  }

  // ── Action Tracker (cross-meeting flat list) ───────────────────────────────
  const renderActionTracker = () => {
    const allActions = meetings.flatMap(m => m.actions.map(a => ({ ...a, _meetingNumber: m.meetingNumber, _meetingTitle: m.title })))
    const openActions = allActions.filter(a => a.status !== 'closed').sort((a, b) => {
      if (isOverdue(a) && !isOverdue(b)) return -1
      if (!isOverdue(a) && isOverdue(b)) return 1
      const PORD: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      return (PORD[a.priority] ?? 2) - (PORD[b.priority] ?? 2)
    })
    return (
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: th.textPrimary, marginBottom: '12px' }}>
          Open Action Items — {openActions.length} pending
          {openActions.filter(isOverdue).length > 0 && <span style={{ marginLeft: '8px', fontSize: '11px', background: '#ef444415', color: '#ef4444', border: '1px solid #ef444433', borderRadius: '4px', padding: '2px 7px' }}>{openActions.filter(isOverdue).length} overdue</span>}
        </div>
        {openActions.length === 0 && <div style={{ ...card, textAlign: 'center', color: th.textSecondary, fontSize: '13px', padding: '40px' }}>All action items are closed.</div>}
        {openActions.map(a => {
          const od = isOverdue(a)
          const pc = PRIORITY_COLOR[a.priority] ?? '#94a3b8'
          const sc = ACTION_STATUS_COLOR[a.status] ?? '#94a3b8'
          return (
            <div key={a.id} style={{ ...card, borderLeft: `4px solid ${od ? '#ef4444' : pc}`, marginBottom: '8px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: th.textSecondary }}>{(a as { _meetingNumber: string })._meetingNumber}</span>
                    <span style={{ fontSize: '10px', background: `${sc}22`, color: sc, border: `1px solid ${sc}44`, borderRadius: '3px', padding: '1px 5px', textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</span>
                    <span style={{ fontSize: '10px', background: `${pc}22`, color: pc, border: `1px solid ${pc}44`, borderRadius: '3px', padding: '1px 5px', textTransform: 'capitalize' }}>{a.priority}</span>
                    {od && <span style={{ fontSize: '10px', background: '#ef444415', color: '#ef4444', border: '1px solid #ef444433', borderRadius: '3px', padding: '1px 5px' }}>OVERDUE</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: th.textPrimary, marginBottom: '4px' }}>{a.description}</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: th.textSecondary, flexWrap: 'wrap' }}>
                    {a.responsiblePerson && <span>Resp: <strong style={{ color: th.textPrimary }}>{a.responsiblePerson}</strong></span>}
                    {a.dueDate && <span style={{ color: od ? '#ef4444' : th.textSecondary }}>Due: {a.dueDate}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                  {a.status !== 'closed' && <button style={mbtn({ padding: '3px 10px', fontSize: '11px', background: '#22c55e' })} onClick={() => onUpdateAction({ id: a.id, status: 'closed' })}>Close</button>}
                  {a.status === 'open' && <button style={mbtn({ padding: '3px 10px', fontSize: '11px', background: '#3b82f6' })} onClick={() => onUpdateAction({ id: a.id, status: 'in_progress' })}>Start</button>}
                  <button style={mbtn({ padding: '3px 10px', fontSize: '11px', background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => openEditAction(a)}>Edit</button>
                  {isAdmin && <button style={mbtn({ padding: '3px 10px', fontSize: '11px', background: '#ef4444' })} onClick={() => { if (confirm('Delete action?')) onDeleteAction(a.id) }}>Del</button>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Register ──────────────────────────────────────────────────────────────
  const renderRegister = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: th.textPrimary }}>Meeting Register</div>
        <button style={mbtn()} onClick={openCreateMeeting}>+ New Meeting</button>
      </div>
      {meetings.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: th.textSecondary, fontSize: '13px', padding: '40px' }}>
          No meetings recorded yet. Click "+ New Meeting" to add the first MOM.
        </div>
      )}
      {meetings.map(m => {
        const expanded = expandedM.has(m.id)
        const sc       = STATUS_COLOR[m.status] ?? '#94a3b8'
        const openCnt  = m.actions.filter(a => a.status !== 'closed').length
        const overdueCnt = m.actions.filter(isOverdue).length
        const typeLabel  = MEETING_TYPE_OPTS.find(o => o.value === m.meetingType)?.label ?? m.meetingType
        return (
          <div key={m.id} style={{ ...card, borderLeft: `4px solid ${sc}`, marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleM(m.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: th.textPrimary }}>{m.meetingNumber}</span>
                  <span style={{ fontSize: '13px', color: th.textPrimary }}>{m.title}</span>
                  <span style={{ fontSize: '10px', background: `${sc}22`, color: sc, border: `1px solid ${sc}44`, borderRadius: '4px', padding: '2px 7px', textTransform: 'capitalize' }}>{m.status}</span>
                  <span style={{ fontSize: '11px', color: th.textSecondary }}>{typeLabel}</span>
                  <span style={{ color: th.textSecondary, fontSize: '12px' }}>{expanded ? '▾' : '▸'}</span>
                </div>
                <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '12px', color: th.textSecondary, flexWrap: 'wrap' }}>
                  <span>{m.meetingDate}</span>
                  {m.location && <span>📍 {m.location}</span>}
                  {m.chairperson && <span>Chair: {m.chairperson}</span>}
                  <span>Actions: <strong style={{ color: openCnt > 0 ? '#f59e0b' : '#22c55e' }}>{openCnt} open</strong>{overdueCnt > 0 && <span style={{ color: '#ef4444', marginLeft: '4px' }}>({overdueCnt} overdue)</span>}</span>
                  {m.issuedAt && <span>Issued: {String(m.issuedAt).slice(0, 10)}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {m.status === 'draft' && <button style={mbtn({ padding: '4px 10px', fontSize: '11px', background: '#3b82f6' })} onClick={() => onIssueMeeting(m.id)}>Issue</button>}
                {m.status === 'issued' && isAdmin && <button style={mbtn({ padding: '4px 10px', fontSize: '11px', background: '#22c55e' })} onClick={() => onCloseMeeting(m.id)}>Close</button>}
                <button style={mbtn({ padding: '4px 10px', fontSize: '11px', background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => openEditMeeting(m)}>Edit</button>
                {isAdmin && m.status === 'draft' && <button style={mbtn({ padding: '4px 10px', fontSize: '11px', background: '#ef4444' })} onClick={() => { if (confirm(`Delete ${m.meetingNumber}?`)) onDeleteMeeting(m.id) }}>Del</button>}
              </div>
            </div>

            {expanded && (
              <div style={{ marginTop: '12px', borderTop: `1px solid ${th.border}`, paddingTop: '12px' }}>
                {/* Agenda + Minutes side by side */}
                {(m.agenda || m.attendees || m.distributionList) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '8px', marginBottom: '12px' }}>
                    {m.attendees && <div style={{ background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '6px', padding: '8px' }}><div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Attendees</div><div style={{ fontSize: '12px', color: th.textPrimary, whiteSpace: 'pre-wrap' }}>{m.attendees}</div></div>}
                    {m.agenda && <div style={{ background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '6px', padding: '8px' }}><div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Agenda</div><div style={{ fontSize: '12px', color: th.textPrimary, whiteSpace: 'pre-wrap' }}>{m.agenda}</div></div>}
                    {m.distributionList && <div style={{ background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '6px', padding: '8px' }}><div style={{ fontSize: '10px', color: th.textSecondary, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Distribution</div><div style={{ fontSize: '12px', color: th.textPrimary, whiteSpace: 'pre-wrap' }}>{m.distributionList}</div></div>}
                  </div>
                )}

                {/* Minutes inline editor */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '11px', color: th.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>Minutes / Notes</div>
                    {editingMinutes !== m.id
                      ? <button style={mbtn({ padding: '3px 10px', fontSize: '11px', background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => { setEditingMinutes(m.id); setMinutesDraft(m.minutes ?? '') }}>Edit</button>
                      : <div style={{ display: 'flex', gap: '4px' }}>
                          <button style={mbtn({ padding: '3px 10px', fontSize: '11px' })} onClick={() => { onUpdateMeeting({ id: m.id, minutes: minutesDraft || null }); setEditingMinutes(null) }}>Save</button>
                          <button style={mbtn({ padding: '3px 10px', fontSize: '11px', background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => setEditingMinutes(null)}>Cancel</button>
                        </div>
                    }
                  </div>
                  {editingMinutes === m.id
                    ? <textarea style={{ ...inputSt, minHeight: '100px', fontFamily: 'system-ui,sans-serif' }} value={minutesDraft} onChange={e => setMinutesDraft(e.target.value)} placeholder="Record meeting minutes, decisions, and key points…" />
                    : m.minutes
                      ? <div style={{ background: th.bgSurface, border: `1px solid ${th.border}`, borderRadius: '6px', padding: '10px', fontSize: '13px', color: th.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m.minutes}</div>
                      : <div style={{ color: th.textSecondary, fontSize: '12px', fontStyle: 'italic' }}>No minutes recorded. Click Edit to add.</div>
                  }
                </div>

                {/* Actions */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: th.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>Action Items ({m.actions.length})</div>
                    <button style={mbtn({ padding: '3px 10px', fontSize: '11px' })} onClick={() => openCreateAction(m.id)}>+ Action</button>
                  </div>
                  {m.actions.length > 0 ? (
                    <div style={{ border: `1px solid ${th.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 90px 70px 80px 80px', padding: '6px 10px', background: th.bgSurface, fontSize: '10px', fontWeight: 600, color: th.textSecondary, textTransform: 'uppercase' }}>
                        <span>#</span><span>Action</span><span>Responsible</span><span>Due</span><span>Priority</span><span>Status</span><span />
                      </div>
                      {m.actions.map(a => {
                        const od = isOverdue(a)
                        const pc = PRIORITY_COLOR[a.priority] ?? '#94a3b8'
                        const sc2 = ACTION_STATUS_COLOR[a.status] ?? '#94a3b8'
                        return (
                          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 90px 70px 80px 80px', padding: '6px 10px', borderTop: `1px solid ${th.border}`, background: th.bgCanvas, fontSize: '12px', alignItems: 'center' }}>
                            <span style={{ color: th.textSecondary, fontSize: '10px' }}>{a.actionNumber}</span>
                            <div>
                              <div style={{ color: th.textPrimary }}>{a.description}</div>
                              {a.carryOverFrom && <div style={{ fontSize: '10px', color: '#8b5cf6' }}>↩ carried over</div>}
                              {a.remarks && <div style={{ fontSize: '10px', color: th.textSecondary }}>{a.remarks}</div>}
                            </div>
                            <span style={{ color: th.textSecondary }}>{a.responsiblePerson ?? '—'}</span>
                            <span style={{ color: od ? '#ef4444' : th.textSecondary, fontWeight: od ? 600 : 400 }}>{a.dueDate ?? '—'}{od && ' ⚠'}</span>
                            <span style={{ fontSize: '10px', background: `${pc}22`, color: pc, border: `1px solid ${pc}44`, borderRadius: '3px', padding: '1px 5px', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{a.priority}</span>
                            <span style={{ fontSize: '10px', background: `${sc2}22`, color: sc2, border: `1px solid ${sc2}44`, borderRadius: '3px', padding: '1px 5px', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{a.status.replace('_', ' ')}</span>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              {a.status !== 'closed' && <button style={mbtn({ padding: '2px 5px', fontSize: '10px', background: '#22c55e' })} onClick={() => onUpdateAction({ id: a.id, status: 'closed' })}>✓</button>}
                              <button style={mbtn({ padding: '2px 5px', fontSize: '10px', background: th.bgSurface, color: th.textSecondary, border: `1px solid ${th.border}` })} onClick={() => openEditAction(a)}>E</button>
                              {isAdmin && <button style={mbtn({ padding: '2px 5px', fontSize: '10px', background: '#ef4444' })} onClick={() => { if (confirm('Delete action?')) onDeleteAction(a.id) }}>D</button>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : <div style={{ color: th.textSecondary, fontSize: '12px' }}>No action items. Click "+ Action" to add one.</div>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: th.textPrimary }}>
      <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${th.border}`, marginBottom: '20px' }}>
        {([['register', `Register (${meetings.length})`], ['actions', 'Action Tracker'], ['analysis', 'Analysis']] as [MSection, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSection(key as MSection)}
            style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: section === key ? 600 : 400, color: section === key ? th.accent : th.textSecondary, background: 'transparent', borderBottom: `2px solid ${section === key ? th.accent : 'transparent'}` }}>
            {label}
          </button>
        ))}
      </div>

      {section === 'register' && renderRegister()}
      {section === 'actions'  && renderActionTracker()}
      {section === 'analysis' && renderAnalysis()}

      {/* Meeting Create/Edit Modal */}
      {mModal.open && (
        <div style={modalOverlay} onClick={() => setMModal(m => ({ ...m, open: false }))}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            {mHdr(mModal.mode === 'create' ? 'New Meeting (MOM)' : `Edit Meeting — ${mModal.item.meetingNumber ?? ''}`)}
            {voff('Meeting Type', vfs(mForm.meetingType, v => setMForm(f => ({ ...f, meetingType: v })), MEETING_TYPE_OPTS))}
            {voff('Title', vfi(mForm.title, v => setMForm(f => ({ ...f, title: v })), 'e.g. Weekly Site Meeting #12'))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{voff('Date', vfi(mForm.meetingDate, v => setMForm(f => ({ ...f, meetingDate: v })), '', 'date'))}</div>
              <div>{voff('Location / Link', vfi(mForm.location, v => setMForm(f => ({ ...f, location: v })), 'Site office or paste full https:// link for a Join button'))}</div>
            </div>
            {voff('Chairperson', vfi(mForm.chairperson, v => setMForm(f => ({ ...f, chairperson: v })), 'Name of meeting chair'))}
            {voff('Attendees', <textarea style={{ ...inputSt, minHeight: '60px' }} value={mForm.attendees} onChange={e => setMForm(f => ({ ...f, attendees: e.target.value }))} placeholder="One name per line or comma-separated" />)}
            {voff('Agenda', <textarea style={{ ...inputSt, minHeight: '70px' }} value={mForm.agenda} onChange={e => setMForm(f => ({ ...f, agenda: e.target.value }))} placeholder="List agenda items…" />)}
            {voff('Distribution List', <textarea style={{ ...inputSt, minHeight: '50px' }} value={mForm.distributionList} onChange={e => setMForm(f => ({ ...f, distributionList: e.target.value }))} placeholder="email@example.com, another@example.com…" />)}
            {mBtns(() => {
              const vars = { meetingType: mForm.meetingType, title: mForm.title, meetingDate: mForm.meetingDate, location: mForm.location || null, chairperson: mForm.chairperson || null, attendees: mForm.attendees || null, agenda: mForm.agenda || null, distributionList: mForm.distributionList || null }
              if (mModal.mode === 'create') onCreateMeeting({ projectId, ...vars })
              else onUpdateMeeting({ id: mModal.item.id, ...vars })
              setMModal(m => ({ ...m, open: false }))
            }, () => setMModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}

      {/* Action Create/Edit Modal */}
      {aModal.open && (
        <div style={modalOverlay} onClick={() => setAModal(m => ({ ...m, open: false }))}>
          <div style={{ ...modalBox, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            {mHdr(aModal.mode === 'create' ? 'Add Action Item' : 'Edit Action Item')}
            {voff('Description', <textarea style={{ ...inputSt, minHeight: '70px' }} value={aForm.description} onChange={e => setAForm(f => ({ ...f, description: e.target.value }))} placeholder="What needs to be done?" />)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>{voff('Responsible Person', vfi(aForm.responsiblePerson, v => setAForm(f => ({ ...f, responsiblePerson: v })), 'Name'))}</div>
              <div>{voff('Due Date', vfi(aForm.dueDate, v => setAForm(f => ({ ...f, dueDate: v })), '', 'date'))}</div>
              <div>{voff('Priority', vfs(aForm.priority, v => setAForm(f => ({ ...f, priority: v })), PRIORITY_OPTS))}</div>
              {aModal.mode === 'edit' && <div>{voff('Status', vfs(aForm.status, v => setAForm(f => ({ ...f, status: v })), ACTION_STATUS_OPTS))}</div>}
            </div>
            {voff('Remarks', <textarea style={{ ...inputSt, minHeight: '50px' }} value={aForm.remarks} onChange={e => setAForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Notes or updates on this action…" />)}
            {mBtns(() => {
              if (aModal.mode === 'create') onCreateAction({ meetingId: aModal.meetingId, description: aForm.description, responsiblePerson: aForm.responsiblePerson || null, dueDate: aForm.dueDate || null, priority: aForm.priority })
              else onUpdateAction({ id: aModal.item.id, description: aForm.description, responsiblePerson: aForm.responsiblePerson || null, dueDate: aForm.dueDate || null, priority: aForm.priority, status: aForm.status, remarks: aForm.remarks || null })
              setAModal(m => ({ ...m, open: false }))
            }, () => setAModal(m => ({ ...m, open: false })))}
          </div>
        </div>
      )}
    </div>
  )
}

