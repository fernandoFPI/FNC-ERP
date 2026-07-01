import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_PAYROLL_RUN, PAYROLL_RUNS_QUERY } from '../../../graphql/payroll'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useToastStore } from '../../../store/toastStore'

const emptyForm = { period_name: '', start_date: '', end_date: '' }

export default function PayrollRunForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [form, setForm] = useState(emptyForm)
  const [overlapWarning, setOverlapWarning] = useState('')

  const { data: runsData } = useQuery(PAYROLL_RUNS_QUERY, { variables: {} })
  const [createRun, { loading }] = useMutation(CREATE_PAYROLL_RUN)

  function field(k: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  function checkOverlap() {
    if (!form.start_date || !form.end_date) return
    const existingRuns = runsData?.payrollRuns ?? []
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const overlapping = existingRuns.find((r: { start_date?: string; end_date?: string; status: string }) => {
      const rStart = r.start_date ? new Date(r.start_date) : null
      const rEnd = r.end_date ? new Date(r.end_date) : null
      return rStart && rEnd && start <= rEnd && end >= rStart
    })
    if (overlapping) {
      const isPosted = (overlapping as { status: string }).status === 'posted'
      setOverlapWarning(isPosted ? 'A posted payroll run exists for this period. Cannot create a new one.' : 'Warning: an overlapping payroll run exists for this period.')
    } else {
      setOverlapWarning('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overlapWarning.includes('Cannot')) return
    const periodLabel = form.start_date ? new Date(form.start_date).toLocaleString('default', { month: 'long', year: 'numeric' }) : ''
    const period_name = form.period_name || periodLabel || 'Payroll Run'
    try {
      const res = await createRun({ variables: { input: { period_name, start_date: form.start_date, end_date: form.end_date } } })
      addToast({ type: 'success', message: 'Payroll run created' })
      navigate(`/payroll/runs/${(res.data as { createPayrollRun: { id: string } }).createPayrollRun.id}`)
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '900px' }}>
      <PageHeader title="New Payroll Run" backPath="/payroll/runs" />

      <form onSubmit={handleSubmit}>
        <Card style={{ marginTop: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input label="Run name" value={form.period_name} onChange={field('period_name')} placeholder="e.g. June 2025 Payroll" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <Input label="Period start" type="date" value={form.start_date} onChange={field('start_date')} required onBlur={checkOverlap} />
            <Input label="Period end" type="date" value={form.end_date} onChange={field('end_date')} required onBlur={checkOverlap} />
          </div>

          {overlapWarning && (
            <div style={{ background: overlapWarning.includes('Cannot') ? theme.dangerBg : theme.warningBg, border: `1px solid ${overlapWarning.includes('Cannot') ? theme.dangerBorder : theme.warningBorder}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: overlapWarning.includes('Cannot') ? theme.danger : theme.warning }}>
              {overlapWarning}
            </div>
          )}

          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: theme.textMuted }}>
            FX rates will be locked at the time of processing.
          </div>
        </Card>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button variant="ghost" type="button" onClick={() => navigate('/payroll/runs')}>Cancel</Button>
          <Button variant="primary" type="submit" loading={loading} disabled={!!overlapWarning && overlapWarning.includes('Cannot')}>Create run</Button>
        </div>
      </form>
    </div>
  )
}
