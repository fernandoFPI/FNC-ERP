import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { EMPLOYEE_QUERY, TERMINATE_EMPLOYEE, EMPLOYEE_SALARY_CONFIG_QUERY, LINK_EMPLOYEE_USER, SHIFT_CONFIGS_QUERY, EMPLOYEE_CURRENT_SHIFT_QUERY, ASSIGN_SHIFT, UNASSIGN_SHIFT } from '../../../graphql/hr'
import { COMPANY_USERS_QUERY } from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { TabBar } from '../../../components/ui/TabBar'
import { EmployeeAvatar } from '../../../components/ui/EmployeeAvatar'
import { SalaryBreakdown } from '../../../components/ui/SalaryBreakdown'
import { AttendanceCalendar } from '../../../components/ui/AttendanceCalendar'
import { ActivityLog } from '../../../components/ui/ActivityLog'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { PermissionGate } from '../../../components/ui/PermissionGate'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'
import { BankDetailsForm } from './BankDetailsForm'
import { EmployeeLeaveTab } from './EmployeeLeaveTab'
import { EmployeeDocumentsTab } from './EmployeeDocumentsTab'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'salary', label: 'Salary' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'documents', label: 'Documents' },
  { key: 'activity', label: 'Activity' },
]

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const currentCompanyId = useAuthStore((s) => s.user?.companyId ?? '')

  const [activeTab, setActiveTab] = useState('overview')
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [terminationDate, setTerminationDate] = useState('')
  const [terminationReason, setTerminationReason] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [linkUserOpen, setLinkUserOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [shiftEffectiveFrom, setShiftEffectiveFrom] = useState(new Date().toISOString().split('T')[0])

  const { data, loading, refetch } = useQuery(EMPLOYEE_QUERY, { variables: { id }, skip: !id, fetchPolicy: 'cache-and-network' })
  const { data: scData } = useQuery(EMPLOYEE_SALARY_CONFIG_QUERY, { variables: { employee_id: id }, skip: !id, fetchPolicy: 'cache-and-network' })
  const { data: usersData } = useQuery(COMPANY_USERS_QUERY, { variables: { companyId: currentCompanyId }, skip: !linkUserOpen })
  const { data: shiftData, refetch: refetchShift } = useQuery(EMPLOYEE_CURRENT_SHIFT_QUERY, { variables: { employee_id: id }, skip: !id, fetchPolicy: 'cache-and-network' })
  const { data: allShiftsData } = useQuery(SHIFT_CONFIGS_QUERY, { skip: !shiftModalOpen })
  const [terminateEmployee, { loading: terminating }] = useMutation(TERMINATE_EMPLOYEE)
  const [linkEmployeeUser, { loading: linking }] = useMutation(LINK_EMPLOYEE_USER)
  const [assignShift, { loading: assigning }] = useMutation(ASSIGN_SHIFT)
  const [unassignShift, { loading: unassigning }] = useMutation(UNASSIGN_SHIFT)

  const emp = data?.employee
  const sc = scData?.employeeSalaryConfig
  const currentShift = shiftData?.employeeCurrentShift

  async function handleTerminate() {
    if (!terminationDate || !terminationReason) return
    try {
      await terminateEmployee({ variables: { id, terminationDate, reason: terminationReason } })
      addToast({ type: 'success', message: 'Employee terminated' })
      setTerminateOpen(false); refetch()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  async function handleLinkUser() {
    try {
      await linkEmployeeUser({ variables: { employee_id: id, user_id: selectedUserId || null } })
      addToast({ type: 'success', message: selectedUserId ? 'User linked to employee' : 'User unlinked from employee' })
      setLinkUserOpen(false); refetch()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  async function handleAssignShift() {
    if (!selectedShiftId || !shiftEffectiveFrom) return
    try {
      await assignShift({ variables: { employee_id: id, shift_id: selectedShiftId, effective_from: shiftEffectiveFrom } })
      addToast({ type: 'success', message: 'Shift assigned' })
      setShiftModalOpen(false)
      refetchShift()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  async function handleUnassignShift() {
    try {
      await unassignShift({ variables: { employee_id: id } })
      addToast({ type: 'success', message: 'Shift removed' })
      refetchShift()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  if (loading && !emp) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!emp) return <div style={{ padding: '24px', color: theme.textMuted }}>Employee not found</div>

  const basePay = sc ? parseFloat(sc.base_salary ?? '0') : 0
  const salaryAllowances = sc ? [
    ...(sc.housing_allowance && parseFloat(sc.housing_allowance) > 0 ? [{ name: 'Housing allowance', amount: parseFloat(sc.housing_allowance), currency: sc.currency_code }] : []),
    ...(sc.transport_allowance && parseFloat(sc.transport_allowance) > 0 ? [{ name: 'Transport allowance', amount: parseFloat(sc.transport_allowance), currency: sc.currency_code }] : []),
    ...(sc.other_allowances && parseFloat(sc.other_allowances) > 0 ? [{ name: 'Other allowances', amount: parseFloat(sc.other_allowances), currency: sc.currency_code }] : []),
  ] : []
  const salaryDeductions = sc ? [
    ...(sc.income_tax_pct && parseFloat(sc.income_tax_pct) > 0 ? [{ name: `Income tax (${sc.income_tax_pct}%)`, amount: basePay * parseFloat(sc.income_tax_pct) / 100, type: 'tax' }] : []),
    ...(sc.social_security_pct && parseFloat(sc.social_security_pct) > 0 ? [{ name: `Social security (${sc.social_security_pct}%)`, amount: basePay * parseFloat(sc.social_security_pct) / 100, type: 'social' }] : []),
  ] : []

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
        <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="xl" photoUrl={emp.photo_url ?? undefined} status={emp.status === 'active' ? 'active' : 'inactive'} />
        <div style={{ flex: 1 }}>
          <PageHeader
            title={`${emp.first_name} ${emp.last_name}`}
            subtitle={emp.employee_number}
            status={<Badge variant={emp.status === 'active' ? 'success' : 'neutral'}>{emp.status === 'active' ? 'Active' : emp.status === 'terminated' ? 'Terminated' : 'Inactive'}</Badge>}
            actions={
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/hr/employees/${id}/edit`)}>Edit</Button>
                <PermissionGate permission="hr.employees.delete" minLevel="approve">
                  {emp.status === 'active' && (
                    <Button variant="danger" size="sm" onClick={() => setTerminateOpen(true)}>Terminate</Button>
                  )}
                </PermissionGate>
              </div>
            }
          />
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '20px' }}>
        {[
          { label: 'Hire date', value: emp.hire_date ?? '—' },
          { label: 'Contract', value: emp.employment_type?.replace(/_/g, ' ') ?? '—' },
          { label: 'Department', value: emp.department_name ?? '—' },
          { label: 'Location', value: emp.work_location_name ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: theme.textPrimary, marginTop: '4px' }}>{value}</div>
          </div>
        ))}
      </div>

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: '16px' }}>
        {activeTab === 'overview' && (
          <>
            <Card style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                {[
                  ['Job title', emp.job_title],
                  ['Email', emp.email],
                  ['Phone', emp.phone],
                  ['National ID', emp.national_id],
                  ['Nationality', emp.nationality],
                  ['Gender', emp.gender],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '12px', background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '13px', color: theme.textPrimary }}>{value || '—'}</div>
                  </div>
                ))}
              </div>
            </Card>
            {/* Linked system user */}
            <Card style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>System user account</div>
                  <div style={{ fontSize: '13px', color: emp.user_id ? theme.textPrimary : theme.textMuted }}>
                    {emp.linked_user_email ?? (emp.user_id ? emp.user_id : 'Not linked to any user account')}
                  </div>
                </div>
                <PermissionGate permission="hr.employees.edit" minLevel="edit">
                  <Button variant="secondary" size="sm" onClick={() => { setSelectedUserId(emp.user_id ?? ''); setLinkUserOpen(true) }}>
                    {emp.user_id ? 'Change' : 'Link user'}
                  </Button>
                </PermissionGate>
              </div>
            </Card>

            {/* Shift assignment */}
            <Card style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Assigned shift</div>
                  {currentShift ? (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{currentShift.shift_name}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        {currentShift.start_time} – {currentShift.end_time} · {currentShift.break_minutes} min break · OT after {currentShift.overtime_threshold_hours}h
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                        From {currentShift.effective_from}{currentShift.effective_to ? ` to ${currentShift.effective_to}` : ''}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>No shift assigned</div>
                  )}
                </div>
                <PermissionGate permission="hr.employees.edit" minLevel="edit">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {currentShift && (
                      <Button variant="ghost" size="sm" style={{ color: theme.danger }} loading={unassigning} onClick={handleUnassignShift}>Remove</Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedShiftId(currentShift?.shift_id ?? ''); setShiftModalOpen(true) }}>
                      {currentShift ? 'Change' : 'Assign shift'}
                    </Button>
                  </div>
                </PermissionGate>
              </div>
            </Card>

            <BankDetailsForm employeeId={id!} />
          </>
        )}

        {activeTab === 'salary' && (
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: 600, color: theme.textPrimary }}>Current salary config</div>
              <PermissionGate permission="hr.employees.manage_salary" minLevel="edit">
                <Button variant="secondary" size="sm" onClick={() => navigate(`/hr/employees/${id}/salary`)}>Update salary</Button>
              </PermissionGate>
            </div>
            {sc ? (
              <SalaryBreakdown
                basePay={basePay}
                allowances={salaryAllowances}
                deductions={salaryDeductions}
                currency={sc.currency_code ?? 'IQD'}
                payType="monthly"
              />
            ) : (
              <div style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                No salary configured yet.{' '}
                <PermissionGate permission="hr.employees.manage_salary" minLevel="edit">
                  <button onClick={() => navigate(`/hr/employees/${id}/salary`)}
                    style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>
                    Set up salary →
                  </button>
                </PermissionGate>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'attendance' && (
          <Card style={{ padding: '20px' }}>
            <AttendanceCalendar
              month={calendarMonth}
              days={[]}
              onDayClick={() => undefined}
              onMonthChange={setCalendarMonth}
            />
          </Card>
        )}

        {activeTab === 'activity' && id && (
          <ActivityLog recordId={id} tableName="employee" />
        )}

        {activeTab === 'leave' && id && <EmployeeLeaveTab employeeId={id} />}

        {activeTab === 'documents' && id && <EmployeeDocumentsTab employeeId={id} />}
      </div>

      {/* Assign Shift Modal */}
      <Modal open={shiftModalOpen} onClose={() => setShiftModalOpen(false)} title="Assign shift" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShiftModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAssignShift} loading={assigning} disabled={!selectedShiftId}>Assign</Button>
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <SearchableSelect
              label="Shift"
              value={selectedShiftId}
              onChange={(v) => setSelectedShiftId(v)}
              placeholder="— Select a shift —"
              options={(allShiftsData?.shiftConfigs ?? [])
                .filter((s: { is_active: boolean }) => s.is_active)
                .map((s: { id: string; name: string; start_time?: string; end_time?: string }) => ({
                  value: s.id,
                  label: s.name + (s.start_time ? ` (${s.start_time}–${s.end_time})` : ''),
                }))}
            />
          </div>
          <Input label="Effective from" type="date" value={shiftEffectiveFrom}
            onChange={(e) => setShiftEffectiveFrom(e.target.value)} />
        </div>
      </Modal>

      {/* Link User Modal */}
      <Modal open={linkUserOpen} onClose={() => setLinkUserOpen(false)} title="Link system user" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkUserOpen(false)}>Cancel</Button>
            {emp?.user_id && <Button variant="ghost" style={{ color: theme.danger }} onClick={() => { setSelectedUserId(''); handleLinkUser() }} loading={linking}>Unlink</Button>}
            <Button variant="primary" onClick={handleLinkUser} loading={linking} disabled={!selectedUserId}>Link</Button>
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: theme.textSecondary }}>
            Linking a user allows them to log in and see their own HR data (payslips, leave, attendance).
          </p>
          <div>
            <SearchableSelect
              label="System user"
              value={selectedUserId}
              onChange={(v) => setSelectedUserId(v)}
              placeholder="— Select a user —"
              options={(usersData?.companyUsers ?? []).map((u: { id: string; email: string }) => ({
                value: u.id,
                label: u.email,
              }))}
            />
          </div>
        </div>
      </Modal>

      {/* Terminate Modal */}
      <Modal
        open={terminateOpen}
        onClose={() => setTerminateOpen(false)}
        title="Terminate Employee"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTerminateOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={handleTerminate}
              loading={terminating}
              disabled={!terminationDate || !terminationReason}
            >
              Terminate
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: theme.textSecondary, margin: 0 }}>
            This will deactivate {emp.first_name} {emp.last_name}'s account. This action can be reversed by an admin.
          </p>
          <Input
            label="Termination date"
            type="date"
            value={terminationDate}
            onChange={(e) => setTerminationDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            required
          />
          <Textarea
            label="Reason"
            value={terminationReason}
            onChange={(e) => setTerminationReason(e.target.value)}
            placeholder="Reason for termination…"
            required
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}
