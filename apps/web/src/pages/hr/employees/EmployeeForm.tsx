import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import {
  CREATE_EMPLOYEE,
  UPDATE_EMPLOYEE,
  EMPLOYEE_QUERY,
  DEPARTMENTS_QUERY,
  WORK_LOCATIONS_QUERY,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
  { value: 'daily', label: 'Daily' },
  { value: 'expat', label: 'Expat' },
  { value: 'contractor', label: 'Contractor' },
]
const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
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
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: empData } = useQuery(EMPLOYEE_QUERY, { variables: { id }, skip: !isEdit })
  const { data: deptData } = useQuery(DEPARTMENTS_QUERY)
  const { data: locData } = useQuery(WORK_LOCATIONS_QUERY, { variables: { is_active: true } })

  const [createEmployee, { loading: creating }] = useMutation(CREATE_EMPLOYEE)
  const [updateEmployee, { loading: updating }] = useMutation(UPDATE_EMPLOYEE)

  const departments = deptData?.departments ?? []
  const locations = locData?.workLocations ?? []

  useEffect(() => {
    if (isEdit && empData?.employee) {
      const e = empData.employee
      setForm({
        first_name: e.first_name ?? '',
        last_name: e.last_name ?? '',
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

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.first_name) errs.first_name = 'Required'
    if (!form.last_name) errs.last_name = 'Required'
    if (!form.hire_date) errs.hire_date = 'Required'
    if (new Date(form.hire_date) > new Date()) errs.hire_date = 'Cannot be in the future'
    if (['full_time', 'expat'].includes(form.employment_type) && !form.national_id) {
      errs.national_id = 'Required for this contract type'
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
    }
    try {
      if (isEdit && id) {
        await updateEmployee({ variables: { id, input } })
        addToast({ type: 'success', message: 'Employee updated' })
        navigate(`/hr/employees/${id}`)
      } else {
        const res = await createEmployee({ variables: { input } })
        addToast({ type: 'success', message: 'Employee created' })
        navigate(`/hr/employees/${res.data.createEmployee.id}`)
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const loading = creating || updating

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title={isEdit ? 'Edit Employee' : 'New Employee'}
        backPath={isEdit ? `/hr/employees/${id}` : '/hr/employees'}
      />

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          <div data-tour="personal-info-card">
            <Card
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <SectionHeader title="Personal information" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Input
                  label="First name"
                  value={form.first_name}
                  onChange={field('first_name')}
                  required
                  error={errors.first_name}
                />
                <Input
                  label="Last name"
                  value={form.last_name}
                  onChange={field('last_name')}
                  required
                  error={errors.last_name}
                />
                <Input
                  label="National ID"
                  value={form.national_id}
                  onChange={field('national_id')}
                  error={errors.national_id}
                />
                <Input
                  label="Passport number"
                  value={form.passport_number}
                  onChange={field('passport_number')}
                />
                <Input
                  label="Date of birth"
                  type="date"
                  value={form.date_of_birth}
                  onChange={field('date_of_birth')}
                />
                <Select
                  label="Gender"
                  value={form.gender}
                  onChange={field('gender')}
                  options={GENDER_OPTIONS}
                  placeholder="Select…"
                />
              </div>
            </Card>
          </div>

          <div data-tour="employment-card">
            <Card
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <SectionHeader title="Employment" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Input
                  label="Employee number"
                  value={form.employee_number}
                  onChange={field('employee_number')}
                  placeholder="EMP-FNC-001"
                />
                <Input
                  label="Hire date"
                  type="date"
                  value={form.hire_date}
                  onChange={field('hire_date')}
                  required
                  error={errors.hire_date}
                />
                <Select
                  label="Employment type"
                  value={form.employment_type}
                  onChange={field('employment_type')}
                  options={EMPLOYMENT_TYPE_OPTIONS}
                />
                <Input label="Job title" value={form.job_title} onChange={field('job_title')} />
                <Select
                  label="Department"
                  value={form.department_id}
                  onChange={field('department_id')}
                  placeholder="Select…"
                  options={departments.map((d: { id: string; name: string }) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
                <Select
                  label="Work location"
                  value={form.work_location_id}
                  onChange={field('work_location_id')}
                  placeholder="Select…"
                  options={locations.map((l: { id: string; name: string }) => ({
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
              <SectionHeader title="Contact" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Input label="Email" type="email" value={form.email} onChange={field('email')} />
                <Input label="Phone" value={form.phone} onChange={field('phone')} />
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
              Cancel
            </Button>
            <Button data-tour="save-employee-btn" variant="primary" type="submit" loading={loading}>
              {isEdit ? 'Save changes' : 'Create employee'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
