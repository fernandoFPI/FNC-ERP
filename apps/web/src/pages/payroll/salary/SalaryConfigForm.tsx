import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { EMPLOYEE_SALARY_CONFIG_QUERY } from '../../../graphql/payroll'
import { UPDATE_SALARY_CONFIG, EMPLOYEE_QUERY } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'

const CURRENCIES = [
  { value: 'IQD', label: 'IQD' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
]

const emptyForm = {
  base_salary: '0',
  currency_code: 'IQD',
  housing_allowance: '0',
  transport_allowance: '0',
  other_allowances: '0',
  income_tax_pct: '0',
  social_security_pct: '0',
  effective_from: new Date().toISOString().split('T')[0],
}

export default function SalaryConfigForm() {
  const { id: employeeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState(emptyForm)

  const { data: empData } = useQuery(EMPLOYEE_QUERY, {
    variables: { id: employeeId },
    skip: !employeeId,
  })
  const { data: salaryData } = useQuery(EMPLOYEE_SALARY_CONFIG_QUERY, {
    variables: { employee_id: employeeId },
    skip: !employeeId,
  })
  const [updateSalary, { loading }] = useMutation(UPDATE_SALARY_CONFIG)

  useEffect(() => {
    const s = salaryData?.employeeSalaryConfig
    if (s) {
      setForm({
        base_salary: s.base_salary ?? '0',
        currency_code: s.currency_code ?? 'IQD',
        housing_allowance: s.housing_allowance ?? '0',
        transport_allowance: s.transport_allowance ?? '0',
        other_allowances: s.other_allowances ?? '0',
        income_tax_pct: s.income_tax_pct ?? '0',
        social_security_pct: s.social_security_pct ?? '0',
        effective_from: s.effective_from?.slice(0, 10) ?? new Date().toISOString().split('T')[0],
      })
    }
  }, [salaryData])

  const emp = empData?.employee

  const gross =
    parseFloat(form.base_salary) +
    parseFloat(form.housing_allowance) +
    parseFloat(form.transport_allowance) +
    parseFloat(form.other_allowances)
  const taxAmount = gross * (parseFloat(form.income_tax_pct) / 100)
  const ssAmount = gross * (parseFloat(form.social_security_pct) / 100)
  const net = gross - taxAmount - ssAmount

  function field(k: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateSalary({
        variables: {
          employee_id: employeeId,
          input: {
            base_salary: parseFloat(form.base_salary),
            currency_code: form.currency_code,
            housing_allowance: parseFloat(form.housing_allowance) || undefined,
            transport_allowance: parseFloat(form.transport_allowance) || undefined,
            other_allowances: parseFloat(form.other_allowances) || undefined,
            income_tax_pct: parseFloat(form.income_tax_pct) || undefined,
            social_security_pct: parseFloat(form.social_security_pct) || undefined,
            effective_from: form.effective_from,
          },
        },
      })
      addToast({ type: 'success', message: `Salary updated effective ${form.effective_from}` })
      navigate(`/hr/employees/${employeeId}`)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '900px' }}>
      <PageHeader
        title={`Update Salary${emp ? ` — ${emp.first_name} ${emp.last_name}` : ''}`}
        backPath={`/hr/employees/${employeeId}`}
      />

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
          <Card style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
              Base Salary
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              <Input
                label="Base salary"
                type="number"
                min="0"
                value={form.base_salary}
                onChange={field('base_salary')}
                required
              />
              <Select
                label="Currency"
                value={form.currency_code}
                onChange={field('currency_code')}
                options={CURRENCIES}
              />
              <Input
                label="Effective from"
                type="date"
                value={form.effective_from}
                onChange={field('effective_from')}
                required
              />
            </div>
          </Card>

          <Card style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
              Allowances
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <Input
                label="Housing allowance"
                type="number"
                min="0"
                value={form.housing_allowance}
                onChange={field('housing_allowance')}
              />
              <Input
                label="Transport allowance"
                type="number"
                min="0"
                value={form.transport_allowance}
                onChange={field('transport_allowance')}
              />
              <Input
                label="Other allowances"
                type="number"
                min="0"
                value={form.other_allowances}
                onChange={field('other_allowances')}
              />
            </div>
          </Card>

          <Card style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
              Deductions (%)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <Input
                label="Income tax %"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.income_tax_pct}
                onChange={field('income_tax_pct')}
              />
              <Input
                label="Social security %"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.social_security_pct}
                onChange={field('social_security_pct')}
              />
            </div>
          </Card>

          <Card style={{ padding: '20px', background: theme.bgSurface }}>
            <div style={{ fontWeight: 600, color: theme.textPrimary, marginBottom: '12px' }}>
              Estimated net pay
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Gross pay', value: gross, bold: false },
                { label: `Income tax (${form.income_tax_pct}%)`, value: -taxAmount, bold: false },
                {
                  label: `Social security (${form.social_security_pct}%)`,
                  value: -ssAmount,
                  bold: false,
                },
                { label: 'Net pay', value: net, bold: true },
              ].map(({ label, value, bold }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: bold ? '14px' : '13px',
                    fontWeight: bold ? 700 : 400,
                    color: bold ? theme.textPrimary : theme.textSecondary,
                    borderTop: bold ? `1px solid ${theme.border}` : undefined,
                    paddingTop: bold ? '8px' : undefined,
                    marginTop: bold ? '4px' : undefined,
                  }}
                >
                  <span>{label}</span>
                  <span
                    style={{ fontFamily: 'monospace', color: value < 0 ? theme.danger : undefined }}
                  >
                    {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                    {form.currency_code}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate(`/hr/employees/${employeeId}`)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              Update salary
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
