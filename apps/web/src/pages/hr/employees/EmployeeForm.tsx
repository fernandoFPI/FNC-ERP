import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useLazyQuery } from '@apollo/client'
import {
  CREATE_EMPLOYEE,
  UPDATE_EMPLOYEE,
  EMPLOYEE_QUERY,
  DEPARTMENTS_QUERY,
  WORK_LOCATIONS_QUERY,
  FIND_EMPLOYEE_ACROSS_COMPANIES,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'
import type { CreateEmployeeMutation, CreateEmployeeMutationVariables, DepartmentsQuery, DepartmentsQueryVariables, EmployeeQuery, EmployeeQueryVariables, FindEmployeeAcrossCompaniesQuery, FindEmployeeAcrossCompaniesQueryVariables, UpdateEmployeeMutation, UpdateEmployeeMutationVariables, WorkLocationsQuery, WorkLocationsQueryVariables } from '../../../graphql/generated'

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', get label() { return i18n.t('hr.empForm.fullTime', { defaultValue: "Full time" }) } },
  { value: 'part_time', get label() { return i18n.t('hr.empForm.partTime', { defaultValue: "Part time" }) } },
  { value: 'contract', get label() { return i18n.t('hr.empForm.contract', { defaultValue: "Contract" }) } },
  { value: 'intern', get label() { return i18n.t('hr.empForm.intern', { defaultValue: "Intern" }) } },
  { value: 'daily', get label() { return i18n.t('hr.empForm.daily', { defaultValue: "Daily" }) } },
  { value: 'expat', get label() { return i18n.t('hr.empForm.expat', { defaultValue: "Expat" }) } },
  { value: 'contractor', get label() { return i18n.t('hr.empForm.contractor', { defaultValue: "Contractor" }) } },
]
const GENDER_OPTIONS = [
  { value: 'male', get label() { return i18n.t('hr.empForm.male', { defaultValue: "Male" }) } },
  { value: 'female', get label() { return i18n.t('hr.empForm.female', { defaultValue: "Female" }) } },
  { value: 'other', get label() { return i18n.t('hr.empForm.other', { defaultValue: "Other" }) } },
]

const emptyForm = {
  first_name: '',
  last_name: '',
  national_id: '',
  passport_number: '',
  nationality: '',
  date_of_birth: '',
  gender: '',
  employee_number: '',
  hire_date: '',
  employment_type: 'full_time',
  job_title: '',
  department_id: '',
  work_location_id: '',
  email: '',
  phone: '',
}

function SectionHeader({ title }: { title: string }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        fontSize: '13px',
        fontWeight: 600,
        color: theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        paddingBottom: '8px',
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      {title}
    </div>
  )
}

export default function EmployeeForm() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [searchEmail, setSearchEmail] = useState('')
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null)
  const [matchApplied, setMatchApplied] = useState(false)

  const { data: empData } = useQuery<EmployeeQuery, EmployeeQueryVariables>(EMPLOYEE_QUERY, { variables: { id: id ?? '' }, skip: !isEdit })
  const { data: deptData } = useQuery<DepartmentsQuery, DepartmentsQueryVariables>(DEPARTMENTS_QUERY)
  const { data: locData } = useQuery<WorkLocationsQuery, WorkLocationsQueryVariables>(WORK_LOCATIONS_QUERY, { variables: { is_active: true } })

  const [createEmployee, { loading: creating }] = useMutation<CreateEmployeeMutation, CreateEmployeeMutationVariables>(CREATE_EMPLOYEE)
  const [updateEmployee, { loading: updating }] = useMutation<UpdateEmployeeMutation, UpdateEmployeeMutationVariables>(UPDATE_EMPLOYEE)
  const [searchMatch, { data: matchData, loading: searching }] = useLazyQuery<FindEmployeeAcrossCompaniesQuery, FindEmployeeAcrossCompaniesQueryVariables>(
    FIND_EMPLOYEE_ACROSS_COMPANIES,
    { fetchPolicy: 'network-only' },
  )
  const match = matchData?.findEmployeeAcrossCompanies as
    | {
        first_name: string
        last_name: string
        email?: string | null
        phone?: string | null
        national_id?: string | null
        passport_number?: string | null
        nationality?: string | null
        date_of_birth?: string | null
        gender?: string | null
        job_title?: string | null
        employment_type?: string | null
        user_id?: string | null
        companyName: string
      }
    | null
    | undefined

  const departments = deptData?.departments ?? []
  const locations = locData?.workLocations ?? []

  useEffect(() => {
    if (isEdit && empData?.employee) {
      const e = empData.employee
      setForm({
        first_name: e.first_name,
        last_name: e.last_name,
        national_id: e.national_id ?? '',
        passport_number: e.passport_number ?? '',
        nationality: e.nationality ?? '',
        date_of_birth: e.date_of_birth?.slice(0, 10) ?? '',
        gender: e.gender ?? '',
        employee_number: e.employee_number ?? '',
        hire_date: e.hire_date?.slice(0, 10) ?? '',
        employment_type: e.employment_type ?? 'full_time',
        job_title: e.job_title ?? '',
        department_id: e.department_id ?? '',
        work_location_id: e.work_location_id ?? '',
        email: e.email ?? '',
        phone: e.phone ?? '',
      })
    }
  }, [empData, isEdit])

  function field(key: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  function handleSearchMatch() {
    if (!searchEmail.trim()) return
    setMatchApplied(false)
    setLinkedUserId(null)
    void searchMatch({ variables: { email: searchEmail.trim() } })
  }

  function applyMatch() {
    if (!match) return
    setForm((f) => ({
      ...f,
      first_name: match.first_name || f.first_name,
      last_name: match.last_name || f.last_name,
      national_id: match.national_id || f.national_id,
      passport_number: match.passport_number || f.passport_number,
      nationality: match.nationality || f.nationality,
      date_of_birth: match.date_of_birth?.slice(0, 10) || f.date_of_birth,
      gender: match.gender || f.gender,
      job_title: match.job_title || f.job_title,
      employment_type: match.employment_type || f.employment_type,
      email: match.email || searchEmail.trim(),
      phone: match.phone || f.phone,
    }))
    setLinkedUserId(match.user_id ?? null)
    setMatchApplied(true)
    addToast({ type: 'success', message: t('hr.empForm.preFilledFrom', { companyName: match.companyName }) })
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.first_name) errs.first_name = t('hr.empForm.required')
    if (!form.last_name) errs.last_name = t('hr.empForm.required')
    if (!form.hire_date) errs.hire_date = t('hr.empForm.required')
    if (new Date(form.hire_date) > new Date()) errs.hire_date = t('hr.empForm.cannotBeInTheFuture')
    if (['full_time', 'expat'].includes(form.employment_type) && !form.national_id) {
      errs.national_id = t('hr.empForm.requiredForThisContractType')
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const input = {
      employee_number: form.employee_number || undefined,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      national_id: form.national_id || undefined,
      passport_number: form.passport_number || undefined,
      nationality: form.nationality || undefined,
      date_of_birth: form.date_of_birth || undefined,
      gender: form.gender || undefined,
      job_title: form.job_title || undefined,
      department_id: form.department_id || undefined,
      work_location_id: form.work_location_id || undefined,
      employment_type: form.employment_type || undefined,
      hire_date: form.hire_date || undefined,
      ...(!isEdit && linkedUserId ? { user_id: linkedUserId } : {}),
    }
    try {
      if (isEdit && id) {
        await updateEmployee({ variables: { id, input } })
        addToast({ type: 'success', message: t('hr.empForm.employeeUpdated') })
        navigate(`/hr/employees/${id}`)
      } else {
        const res = await createEmployee({ variables: { input } })
        addToast({ type: 'success', message: t('hr.empForm.employeeCreated') })
        if (res.data?.createEmployee) {
          navigate(`/hr/employees/${res.data.createEmployee.id}`)
        } else {
          navigate('/hr/employees')
        }
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const loading = creating || updating

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title={isEdit ? t('hr.empForm.editEmployee') : t('hr.empForm.newEmployee')}
        backPath={isEdit ? `/hr/employees/${id}` : '/hr/employees'}
      />

      <form onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          {!isEdit && (
            <Card
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <SectionHeader title={t('hr.empForm.addExistingPersonOptional')} />
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
                {t('hr.empForm.alreadyAnEmployeeInOneOf')}
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Input
                    label={t('hr.empForm.email')}
                    type="email"
                    value={searchEmail}
                    onChange={(e) => {
                      setSearchEmail(e.target.value)
                      setMatchApplied(false)
                    }}
                    placeholder={t('hr.empForm.personExampleCom')}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  loading={searching}
                  disabled={!searchEmail.trim()}
                  onClick={handleSearchMatch}
                >
                  {t('hr.empForm.search')}
                </Button>
              </div>
              {matchData !== undefined && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: match ? theme.accentBg : theme.bgSurface,
                    border: `1px solid ${match ? theme.accent : theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  {match ? (
                    <>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: theme.accent }}>{t('hr.empForm.found', { first_name: match.first_name, last_name: match.last_name, value: match.job_title ? ` — ${match.job_title}` : '' })}</div>
                        <div
                          style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '2px' }}
                        >{t('hr.empForm.alreadyAnEmployeeIn', { companyName: match.companyName, value: match.user_id ? t('hr.empForm.willLinkTheirExistingAccountOnce') : '' })}</div>
                      </div>
                      <Button
                        type="button"
                        variant={matchApplied ? 'ghost' : 'primary'}
                        size="sm"
                        onClick={applyMatch}
                        disabled={matchApplied}
                      >
                        {matchApplied ? t('hr.empForm.applied') : t('hr.empForm.useThisInfo')}
                      </Button>
                    </>
                  ) : (
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {t('hr.empForm.noMatchFoundInYourOther')}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          <div data-tour="personal-info-card">
            <Card
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <SectionHeader title={t('hr.empForm.personalInformation')} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Input
                  label={t('hr.empForm.firstName')}
                  value={form.first_name}
                  onChange={field('first_name')}
                  required
                  error={errors.first_name}
                />
                <Input
                  label={t('hr.empForm.lastName')}
                  value={form.last_name}
                  onChange={field('last_name')}
                  required
                  error={errors.last_name}
                />
                <Input
                  label={t('hr.empForm.nationalId')}
                  value={form.national_id}
                  onChange={field('national_id')}
                  error={errors.national_id}
                />
                <Input
                  label={t('hr.empForm.passportNumber')}
                  value={form.passport_number}
                  onChange={field('passport_number')}
                />
                <Input
                  label={t('hr.empForm.dateOfBirth')}
                  type="date"
                  value={form.date_of_birth}
                  onChange={field('date_of_birth')}
                />
                <Select
                  label={t('hr.empForm.gender')}
                  value={form.gender}
                  onChange={field('gender')}
                  options={GENDER_OPTIONS}
                  placeholder={t('hr.empForm.select')}
                />
              </div>
            </Card>
          </div>

          <div data-tour="employment-card">
            <Card
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <SectionHeader title={t('hr.empForm.employment')} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Input
                  label={t('hr.empForm.employeeNumber')}
                  value={form.employee_number}
                  onChange={field('employee_number')}
                  placeholder={t('hr.empForm.empFnc001')}
                />
                <Input
                  label={t('hr.empForm.hireDate')}
                  type="date"
                  value={form.hire_date}
                  onChange={field('hire_date')}
                  required
                  error={errors.hire_date}
                />
                <Select
                  label={t('hr.empForm.employmentType')}
                  value={form.employment_type}
                  onChange={field('employment_type')}
                  options={EMPLOYMENT_TYPE_OPTIONS}
                />
                <Input label={t('hr.empForm.jobTitle')} value={form.job_title} onChange={field('job_title')} />
                <Select
                  label={t('hr.empForm.department')}
                  value={form.department_id}
                  onChange={field('department_id')}
                  placeholder={t('hr.empForm.select')}
                  options={departments.filter((v): v is NonNullable<typeof v> => v !== null).map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
                <Select
                  label={t('hr.empForm.workLocation')}
                  value={form.work_location_id}
                  onChange={field('work_location_id')}
                  placeholder={t('hr.empForm.select')}
                  options={locations.filter((v): v is NonNullable<typeof v> => v !== null).map((l) => ({
                    value: l.id,
                    label: l.name,
                  }))}
                />
              </div>
            </Card>
          </div>

          <div data-tour="contact-card">
            <Card
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <SectionHeader title={t('hr.empForm.contact')} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Input label={t('hr.empForm.email')} type="email" value={form.email} onChange={field('email')} />
                <Input label={t('hr.empForm.phone')} value={form.phone} onChange={field('phone')} />
              </div>
            </Card>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate(-1)
              }}
            >
              {t('hr.empForm.cancel')}
            </Button>
            <Button data-tour="save-employee-btn" variant="primary" type="submit" loading={loading}>
              {isEdit ? t('hr.empForm.saveChanges') : t('hr.empForm.createEmployee')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
