import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  EMPLOYEE_QUERY,
  TERMINATE_EMPLOYEE,
  EMPLOYEE_SALARY_CONFIG_QUERY,
  LINK_EMPLOYEE_USER,
  SHIFT_CONFIGS_QUERY,
  EMPLOYEE_CURRENT_SHIFT_QUERY,
  ASSIGN_SHIFT,
  UNASSIGN_SHIFT,
} from '../../../graphql/hr'
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
import type { AssignShiftMutation, AssignShiftMutationVariables, CompanyUsersQuery, CompanyUsersQueryVariables, EmployeeCurrentShiftQuery, EmployeeCurrentShiftQueryVariables, EmployeeQuery, EmployeeQueryVariables, EmployeeSalaryConfigQuery, EmployeeSalaryConfigQueryVariables, LinkEmployeeUserMutation, LinkEmployeeUserMutationVariables, ShiftConfigsQuery, ShiftConfigsQueryVariables, TerminateEmployeeMutation, TerminateEmployeeMutationVariables, UnassignShiftMutation, UnassignShiftMutationVariables } from '../../../graphql/generated'

const TABS = [
  { key: 'overview', get label() { return i18n.t('hr.empDetail.overview', { defaultValue: "Overview" }) } },
  { key: 'salary', get label() { return i18n.t('hr.empDetail.salary', { defaultValue: "Salary" }) } },
  { key: 'attendance', get label() { return i18n.t('hr.empDetail.attendance', { defaultValue: "Attendance" }) } },
  { key: 'leave', get label() { return i18n.t('hr.empDetail.leave', { defaultValue: "Leave" }) } },
  { key: 'documents', get label() { return i18n.t('hr.empDetail.documents', { defaultValue: "Documents" }) } },
  { key: 'activity', get label() { return i18n.t('hr.empDetail.activity', { defaultValue: "Activity" }) } },
]

export default function EmployeeDetail() {
  const { t } = useTranslation()
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
  const [shiftEffectiveFrom, setShiftEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0],
  )

  const { data, loading, refetch } = useQuery<EmployeeQuery, EmployeeQueryVariables>(EMPLOYEE_QUERY, {
    variables: { id: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const { data: scData } = useQuery<EmployeeSalaryConfigQuery, EmployeeSalaryConfigQueryVariables>(EMPLOYEE_SALARY_CONFIG_QUERY, {
    variables: { employee_id: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const { data: usersData } = useQuery<CompanyUsersQuery, CompanyUsersQueryVariables>(COMPANY_USERS_QUERY, {
    variables: { companyId: currentCompanyId },
    skip: !linkUserOpen,
  })
  const { data: shiftData, refetch: refetchShift } = useQuery<EmployeeCurrentShiftQuery, EmployeeCurrentShiftQueryVariables>(EMPLOYEE_CURRENT_SHIFT_QUERY, {
    variables: { employee_id: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const { data: allShiftsData } = useQuery<ShiftConfigsQuery, ShiftConfigsQueryVariables>(SHIFT_CONFIGS_QUERY, { skip: !shiftModalOpen })
  const [terminateEmployee, { loading: terminating }] = useMutation<TerminateEmployeeMutation, TerminateEmployeeMutationVariables>(TERMINATE_EMPLOYEE)
  const [linkEmployeeUser, { loading: linking }] = useMutation<LinkEmployeeUserMutation, LinkEmployeeUserMutationVariables>(LINK_EMPLOYEE_USER)
  const [assignShift, { loading: assigning }] = useMutation<AssignShiftMutation, AssignShiftMutationVariables>(ASSIGN_SHIFT)
  const [unassignShift, { loading: unassigning }] = useMutation<UnassignShiftMutation, UnassignShiftMutationVariables>(UNASSIGN_SHIFT)

  const emp = data?.employee
  const sc = scData?.employeeSalaryConfig
  const currentShift = shiftData?.employeeCurrentShift

  async function handleTerminate() {
    if (!terminationDate || !terminationReason) return
    try {
      await terminateEmployee({ variables: { id: id ?? '', terminationDate, reason: terminationReason } })
      addToast({ type: 'success', message: t('hr.empDetail.employeeTerminated') })
      setTerminateOpen(false)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleLinkUser(overrideUserId?: string) {
    const targetUserId = overrideUserId ?? selectedUserId
    try {
      await linkEmployeeUser({ variables: { employee_id: id ?? '', user_id: targetUserId || null } })
      addToast({
        type: 'success',
        message: targetUserId ? t('hr.empDetail.userLinkedToEmployee') : t('hr.empDetail.userUnlinkedFromEmployee'),
      })
      setLinkUserOpen(false)
      void refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleAssignShift() {
    if (!selectedShiftId || !shiftEffectiveFrom) return
    try {
      await assignShift({
        variables: {
          employee_id: id ?? '',
          shift_id: selectedShiftId,
          effective_from: shiftEffectiveFrom,
        },
      })
      addToast({ type: 'success', message: t('hr.empDetail.shiftAssigned') })
      setShiftModalOpen(false)
      void refetchShift()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleUnassignShift() {
    try {
      await unassignShift({ variables: { employee_id: id ?? '' } })
      addToast({ type: 'success', message: t('hr.empDetail.shiftRemoved') })
      void refetchShift()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  if (loading && !emp)
    return <div style={{ padding: '24px', color: theme.textMuted }}>{t('hr.empDetail.loading')}</div>
  if (!emp) return <div style={{ padding: '24px', color: theme.textMuted }}>{t('hr.empDetail.employeeNotFound')}</div>

  const basePay = sc ? parseFloat(sc.base_salary) : 0
  const salaryAllowances = sc
    ? [
        ...(sc.housing_allowance && parseFloat(sc.housing_allowance) > 0
          ? [
              {
                name: t('hr.empDetail.housingAllowance'),
                amount: parseFloat(sc.housing_allowance),
                currency: sc.currency_code,
              },
            ]
          : []),
        ...(sc.transport_allowance && parseFloat(sc.transport_allowance) > 0
          ? [
              {
                name: t('hr.empDetail.transportAllowance'),
                amount: parseFloat(sc.transport_allowance),
                currency: sc.currency_code,
              },
            ]
          : []),
        ...(sc.other_allowances && parseFloat(sc.other_allowances) > 0
          ? [
              {
                name: t('hr.empDetail.otherAllowances'),
                amount: parseFloat(sc.other_allowances),
                currency: sc.currency_code,
              },
            ]
          : []),
      ]
    : []
  const salaryDeductions = sc
    ? [
        ...(sc.income_tax_pct && parseFloat(sc.income_tax_pct) > 0
          ? [
              {
                name: t('hr.empDetail.incomeTaxPct', { pct: sc.income_tax_pct }),
                amount: (basePay * parseFloat(sc.income_tax_pct)) / 100,
                type: 'tax',
              },
            ]
          : []),
        ...(sc.social_security_pct && parseFloat(sc.social_security_pct) > 0
          ? [
              {
                name: t('hr.empDetail.socialSecurityPct', { pct: sc.social_security_pct }),
                amount: (basePay * parseFloat(sc.social_security_pct)) / 100,
                type: 'social',
              },
            ]
          : []),
      ]
    : []

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
        <EmployeeAvatar
          firstName={emp.first_name}
          lastName={emp.last_name}
          size="xl"
          photoUrl={emp.photo_url ?? undefined}
          status={emp.status === 'active' ? 'active' : 'inactive'}
        />
        <div style={{ flex: 1 }}>
          <PageHeader
            title={`${emp.first_name} ${emp.last_name}`}
            subtitle={emp.employee_number ?? undefined}
            status={
              <Badge variant={emp.status === 'active' ? 'success' : 'neutral'}>
                {emp.status === 'active'
                  ? t('hr.empDetail.active')
                  : emp.status === 'terminated'
                    ? t('hr.empDetail.terminated')
                    : t('hr.empDetail.inactive')}
              </Badge>
            }
            actions={
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigate(`/hr/employees/${id}/edit`)
                  }}
                >
                  {t('hr.empDetail.edit')}
                </Button>
                <PermissionGate permission="hr.employees.delete" minLevel="approve">
                  {emp.status === 'active' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setTerminateOpen(true)
                      }}
                    >
                      {t('hr.empDetail.terminate')}
                    </Button>
                  )}
                </PermissionGate>
              </div>
            }
          />
        </div>
      </div>

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        {[
          { label: t('hr.empDetail.hireDate'), value: emp.hire_date ?? '—' },
          { label: t('hr.empDetail.contract'), value: emp.employment_type?.replace(/_/g, ' ') ?? '—' },
          { label: t('hr.empDetail.department'), value: emp.department_name ?? '—' },
          { label: t('hr.empDetail.location'), value: emp.work_location_id ?? '—' },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: theme.textPrimary,
                marginTop: '4px',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: '16px' }}>
        {activeTab === 'overview' && (
          <>
            <Card style={{ padding: '20px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '8px',
                }}
              >
                {[
                  [t('hr.empDetail.jobTitle'), emp.job_title],
                  [t('hr.empDetail.email'), emp.email],
                  [t('hr.empDetail.phone'), emp.phone],
                  [t('hr.empDetail.nationalId'), emp.national_id],
                  [t('hr.empDetail.nationality'), emp.nationality],
                  [t('hr.empDetail.gender'), emp.gender],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      padding: '12px',
                      background: theme.bgSurface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textPrimary }}>{value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </Card>
            {/* Linked system user */}
            <Card style={{ padding: '16px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                    {t('hr.empDetail.systemUserAccount')}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: emp.user_id ? theme.textPrimary : theme.textMuted,
                    }}
                  >
                    {emp.linked_user_email ??
                      (emp.user_id ? emp.user_id : t('hr.empDetail.notLinkedToUser'))}
                  </div>
                </div>
                <PermissionGate permission="hr.employees.edit" minLevel="edit">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedUserId(emp.user_id ?? '')
                      setLinkUserOpen(true)
                    }}
                  >
                    {emp.user_id ? t('hr.empDetail.change') : t('hr.empDetail.linkUser')}
                  </Button>
                </PermissionGate>
              </div>
            </Card>

            {emp.advance_control_account_id && (
              <Card style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                  {t('hr.empDetail.advanceControlAccount')}
                </div>
                <div style={{ fontSize: '13px', color: theme.textPrimary }}>
                  {emp.advance_control_account_code} · {emp.advance_control_account_name}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                  {t('hr.empDetail.autoCreatedTracksThisEmployeeS')}
                </div>
              </Card>
            )}

            {/* Shift assignment */}
            <Card style={{ padding: '16px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                    {t('hr.empDetail.assignedShift')}
                  </div>
                  {currentShift ? (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                        {currentShift.shift_name}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{t('hr.empDetail.minBreakOtAfterH', { start_time: currentShift.start_time, end_time: currentShift.end_time, break_minutes: currentShift.break_minutes, overtime_threshold_hours: currentShift.overtime_threshold_hours })}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>{t('hr.empDetail.from', { effective_from: currentShift.effective_from, value: currentShift.effective_to ? ` to ${currentShift.effective_to}` : '' })}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {t('hr.empDetail.noShiftAssigned')}
                    </div>
                  )}
                </div>
                <PermissionGate permission="hr.employees.edit" minLevel="edit">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {currentShift && (
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: theme.danger }}
                        loading={unassigning}
                        onClick={(...args: Parameters<typeof handleUnassignShift>) => void handleUnassignShift(...args)}
                      >
                        {t('hr.empDetail.remove')}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedShiftId(currentShift?.shift_id ?? '')
                        setShiftModalOpen(true)
                      }}
                    >
                      {currentShift ? t('hr.empDetail.change') : t('hr.empDetail.assignShift')}
                    </Button>
                  </div>
                </PermissionGate>
              </div>
            </Card>

            <BankDetailsForm employeeId={id ?? ''} />
          </>
        )}

        {activeTab === 'salary' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: 600, color: theme.textPrimary }}>{t('hr.empDetail.currentSalaryConfig')}</div>
              <PermissionGate permission="hr.employees.manage_salary" minLevel="edit">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigate(`/hr/employees/${id}/salary`)
                  }}
                >
                  {t('hr.empDetail.updateSalary')}
                </Button>
              </PermissionGate>
            </div>
            {sc ? (
              <SalaryBreakdown
                basePay={basePay}
                allowances={salaryAllowances}
                deductions={salaryDeductions}
                currency={sc.currency_code}
                payType="monthly"
              />
            ) : (
              <div
                style={{
                  color: theme.textMuted,
                  fontSize: '13px',
                  textAlign: 'center',
                  padding: '24px 0',
                }}
              >
                {t('hr.empDetail.noSalaryConfiguredYet')}{' '}
                <PermissionGate permission="hr.employees.manage_salary" minLevel="edit">
                  <button
                    onClick={() => {
                      navigate(`/hr/employees/${id}/salary`)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.accent,
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: '13px',
                    }}
                  >
                    {t('hr.empDetail.setUpSalary')}
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

        {activeTab === 'activity' && id && <ActivityLog recordId={id} tableName="employee" />}

        {activeTab === 'leave' && id && <EmployeeLeaveTab employeeId={id} />}

        {activeTab === 'documents' && id && <EmployeeDocumentsTab employeeId={id} />}
      </div>

      {/* Assign Shift Modal */}
      <Modal
        open={shiftModalOpen}
        onClose={() => {
          setShiftModalOpen(false)
        }}
        title={t('hr.empDetail.assignShift')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShiftModalOpen(false)
              }}
            >
              {t('hr.empDetail.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={(...args: Parameters<typeof handleAssignShift>) => void handleAssignShift(...args)}
              loading={assigning}
              disabled={!selectedShiftId}
            >
              {t('hr.empDetail.assign')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <SearchableSelect
              label={t('hr.empDetail.shift')}
              value={selectedShiftId}
              onChange={(v) => {
                setSelectedShiftId(v)
              }}
              placeholder={t('hr.empDetail.selectAShift')}
              options={(allShiftsData?.shiftConfigs ?? []).filter((v): v is NonNullable<typeof v> => v !== null)
                .filter((s) => s.is_active)
                .map((s) => ({
                  value: s.id,
                  label: s.name + (s.start_time ? ` (${s.start_time}–${s.end_time})` : ''),
                }))}
            />
          </div>
          <Input
            label={t('hr.empDetail.effectiveFrom')}
            type="date"
            value={shiftEffectiveFrom}
            onChange={(e) => {
              setShiftEffectiveFrom(e.target.value)
            }}
          />
        </div>
      </Modal>

      {/* Link User Modal */}
      <Modal
        open={linkUserOpen}
        onClose={() => {
          setLinkUserOpen(false)
        }}
        title={t('hr.empDetail.linkSystemUser')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLinkUserOpen(false)
              }}
            >
              {t('hr.empDetail.cancel')}
            </Button>
            {emp.user_id && (
              <Button
                variant="ghost"
                style={{ color: theme.danger }}
                onClick={() => {
                  setSelectedUserId('')
                  void handleLinkUser('')
                }}
                loading={linking}
              >
                {t('hr.empDetail.unlink')}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                void handleLinkUser()
              }}
              loading={linking}
              disabled={!selectedUserId}
            >
              {t('hr.empDetail.link')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: theme.textSecondary }}>
            {t('hr.empDetail.linkingAUserAllowsThemTo')}
          </p>
          <div>
            <SearchableSelect
              label={t('hr.empDetail.systemUser')}
              value={selectedUserId}
              onChange={(v) => {
                setSelectedUserId(v)
              }}
              placeholder={t('hr.empDetail.selectAUser')}
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
        onClose={() => {
          setTerminateOpen(false)
        }}
        title={t('hr.empDetail.terminateEmployee')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTerminateOpen(false)
              }}
            >
              {t('hr.empDetail.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={(...args: Parameters<typeof handleTerminate>) => void handleTerminate(...args)}
              loading={terminating}
              disabled={!terminationDate || !terminationReason}
            >
              {t('hr.empDetail.terminate')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: theme.textSecondary, margin: 0 }}>{t('hr.empDetail.thisWillDeactivateSAccountThis', { first_name: emp.first_name, last_name: emp.last_name })}</p>
          <Input
            label={t('hr.empDetail.terminationDate')}
            type="date"
            value={terminationDate}
            onChange={(e) => {
              setTerminationDate(e.target.value)
            }}
            min={new Date().toISOString().split('T')[0]}
            required
          />
          <Textarea
            label={t('hr.empDetail.reason')}
            value={terminationReason}
            onChange={(e) => {
              setTerminationReason(e.target.value)
            }}
            placeholder={t('hr.empDetail.reasonForTermination')}
            required
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}
