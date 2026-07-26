import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'

interface ReturnItem {
  id: string
  description: string
  quantity_returned: string
  original_unit_price: string
  assessed_unit_price: string
  line_total: string
  damage_notes: string | null
}

interface DamagePhoto {
  id: string
  file_id: string
  original_filename: string
  mime_type: string
  download_url: string | null
}

interface POReturn {
  id: string
  return_number: string
  return_type: 'full_refund' | 'damage'
  status: 'draft' | 'submitted' | 'approved' | 'credited'
  notes: string | null
  damage_description: string | null
  total_returned_value: string
  currency_code: string
  po_number: string
  vendor_name: string
  created_by_email: string | null
  approved_by_email: string | null
  submitted_at: string | null
  approved_at: string | null
  credited_at: string | null
  credit_note_reference: string | null
  created_at: string
  items: ReturnItem[]
  // employee deduction fields
  responsible_employee_id: string | null
  responsible_employee_name: string | null
  responsible_employee_number: string | null
  deduct_from_salary: boolean
  deduction_amount: string | null
  deduction_request_id: string | null
  deduction_status: 'pending' | 'applied' | 'cancelled' | null
  deduction_applied_at: string | null
}

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: '#f9fafb', text: '#6b7280', border: '#d1d5db' },
  submitted: { bg: '#fffbeb', text: '#d97706', border: '#fcd34d' },
  approved: { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
  credited: { bg: '#eff6ff', text: '#2563eb', border: '#93c5fd' },
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  credited: 'Credited',
}

export default function POReturnDetail() {
  const { id, returnId } = useParams<{ id: string; returnId: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const { can } = usePermission()

  const [ret, setRet] = useState<POReturn | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [creditRef, setCreditRef] = useState('')
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [photos, setPhotos] = useState<DamagePhoto[]>([])

  // Approver: employee assignment state (shown on submitted damage returns)
  const [hasResponsibleEmployee, setHasResponsibleEmployee] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employeeResults, setEmployeeResults] = useState<
    {
      id: string
      first_name: string
      last_name: string
      employee_number: string
      job_title?: string
    }[]
  >([])
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<{
    id: string
    first_name: string
    last_name: string
    employee_number: string
    job_title?: string
  } | null>(null)
  const [deductionAmount, setDeductionAmount] = useState('')

  const load = useCallback(async () => {
    if (!id || !returnId) return
    try {
      const r = await api.get<POReturn>(`/procurement/purchase-orders/${id}/returns/${returnId}`)
      setRet(r.data)
      // Load damage photos if damage return
      if (r.data.return_type === 'damage') {
        const p = await api
          .get<DamagePhoto[]>(`/files/attachments?entityType=po_return&entityId=${r.data.id}`)
          .catch(() => ({ data: [] as DamagePhoto[] }))
        setPhotos(p.data)
      }
    } catch (e) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Failed to load return') })
    } finally {
      setLoading(false)
    }
  }, [id, returnId, addToast])

  useEffect(() => {
    void load()
  }, [load])

  // Employee search for approver
  useEffect(() => {
    if (!employeeSearch || employeeSearch.length < 2) {
      setEmployeeResults([])
      return
    }
    const t = setTimeout(() => {
      api
        .get<typeof employeeResults>(
          `/hr/employees?search=${encodeURIComponent(employeeSearch)}&status=active&limit=10`,
        )
        .then((r) => {
          setEmployeeResults(Array.isArray(r.data) ? r.data : [])
        })
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(t)
    }
  }, [employeeSearch])

  // Auto-fill deduction amount when employee is toggled on
  useEffect(() => {
    if (!hasResponsibleEmployee || !ret) return
    const totalLoss = ret.items.reduce((sum, it) => {
      const qty = parseFloat(it.quantity_returned) || 0
      const loss = parseFloat(it.original_unit_price) - parseFloat(it.assessed_unit_price)
      return sum + qty * loss
    }, 0)
    if (totalLoss > 0) setDeductionAmount(String(parseFloat(totalLoss.toFixed(2))))
  }, [hasResponsibleEmployee, ret])

  async function doApprove() {
    if (!id || !returnId) return
    if (hasResponsibleEmployee && !selectedEmployee) {
      addToast({ type: 'error', message: 'Select the responsible employee' })
      return
    }
    if (
      hasResponsibleEmployee &&
      (!parseFloat(deductionAmount) || parseFloat(deductionAmount) <= 0)
    ) {
      addToast({ type: 'error', message: 'Enter a valid deduction amount' })
      return
    }

    setActionLoading(true)
    try {
      await api.post(`/procurement/purchase-orders/${id}/returns/${returnId}/approve`, {
        responsible_employee_id:
          hasResponsibleEmployee && selectedEmployee ? selectedEmployee.id : undefined,
        deduct_from_salary: hasResponsibleEmployee && selectedEmployee ? true : false,
        deduction_amount:
          hasResponsibleEmployee && selectedEmployee ? parseFloat(deductionAmount) : undefined,
      })
      addToast({ type: 'success', message: 'Return approved' })
      await load()
    } catch (e) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Failed to approve') })
    } finally {
      setActionLoading(false)
    }
  }

  async function doSubmit() {
    if (!id || !returnId) return
    setActionLoading(true)
    try {
      await api.post(`/procurement/purchase-orders/${id}/returns/${returnId}/submit`)
      addToast({ type: 'success', message: 'Return submitted successfully' })
      await load()
    } catch (e) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Failed to submit') })
    } finally {
      setActionLoading(false)
    }
  }

  async function doCredit() {
    if (!id || !returnId) return
    setActionLoading(true)
    try {
      await api.post(`/procurement/purchase-orders/${id}/returns/${returnId}/credit`, {
        credit_note_reference: creditRef || undefined,
      })
      addToast({ type: 'success', message: 'Return marked as credited' })
      setShowCreditModal(false)
      await load()
    } catch (e) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Failed to mark as credited') })
    } finally {
      setActionLoading(false)
    }
  }

  async function doDeleteFn() {
    // keep separate from doSubmit/doApprove
    if (!id || !returnId || !confirm('Delete this draft return? This cannot be undone.')) return
    try {
      await api.delete(`/procurement/purchase-orders/${id}/returns/${returnId}`)
      addToast({ type: 'success', message: 'Return deleted' })
      navigate(`/procurement/purchase-orders/${id}`)
    } catch (e) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Failed to delete return') })
    }
  }

  if (loading)
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading…</div>
    )
  if (!ret)
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.danger }}>
        Return not found.
      </div>
    )

  const sc = STATUS_COLOR[ret.status] ?? STATUS_COLOR.draft
  const fmtNum = (n: string | number) =>
    parseFloat(String(n)).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—')

  const cardStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '16px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }

  const loss = ret.items.reduce((sum, it) => {
    const diff =
      (parseFloat(it.original_unit_price) - parseFloat(it.assessed_unit_price)) *
      parseFloat(it.quantity_returned)
    return sum + diff
  }, 0)

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <PageHeader
        title={ret.return_number}
        subtitle={`${ret.po_number} · ${ret.vendor_name}`}
        backPath={`/procurement/purchase-orders/${id}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ret.status === 'draft' && can('procurement.po.edit', 'edit') && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigate(`/procurement/purchase-orders/${id}/returns/${returnId}/edit`)
                  }}
                >
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => void doDeleteFn()}>
                  Delete
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={actionLoading}
                  onClick={() => void doSubmit()}
                >
                  Submit for Approval
                </Button>
              </>
            )}
            {ret.status === 'submitted' && can('procurement.po.approve', 'approve') && (
              <Button
                variant="primary"
                size="sm"
                loading={actionLoading}
                onClick={() => void doApprove()}
              >
                Approve Return
              </Button>
            )}
            {ret.status === 'approved' && can('finance.ap.edit', 'edit') && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowCreditModal(true)
                }}
              >
                Mark as Credited
              </Button>
            )}
          </div>
        }
      />

      {/* Status + summary */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              background: sc.bg,
              color: sc.text,
              border: `1px solid ${sc.border}`,
            }}
          >
            {STATUS_LABEL[ret.status]}
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              background: ret.return_type === 'damage' ? '#fff7ed' : '#f0fdf4',
              color: ret.return_type === 'damage' ? '#c2410c' : '#15803d',
              border: `1px solid ${ret.return_type === 'damage' ? '#fed7aa' : '#bbf7d0'}`,
            }}
          >
            {ret.return_type === 'damage' ? '⚠ Damage Return' : '↩ Full Refund'}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>Total Return Value</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: theme.accent }}>
              {ret.currency_code} {fmtNum(ret.total_returned_value)}
            </div>
            {ret.return_type === 'damage' && loss > 0 && (
              <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px' }}>
                Loss: {ret.currency_code} {fmtNum(loss)} (not recoverable)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Created', value: fmtDate(ret.created_at), by: ret.created_by_email },
            { label: 'Submitted', value: fmtDate(ret.submitted_at), by: null },
            { label: 'Approved', value: fmtDate(ret.approved_at), by: ret.approved_by_email },
            {
              label: 'Credited',
              value: fmtDate(ret.credited_at),
              by: ret.credit_note_reference ? `Ref: ${ret.credit_note_reference}` : null,
            },
          ].map(({ label, value, by }) => (
            <div key={label}>
              <div style={labelStyle}>{label}</div>
              <div
                style={{
                  fontSize: '13px',
                  color: value === '—' ? theme.textMuted : theme.textPrimary,
                  marginTop: '4px',
                }}
              >
                {value}
              </div>
              {by && (
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                  {by}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Damage description */}
      {ret.return_type === 'damage' && ret.damage_description && (
        <div style={{ ...cardStyle, background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div style={{ ...labelStyle, color: '#c2410c', marginBottom: '8px' }}>Damage Report</div>
          <div style={{ fontSize: '13px', color: '#7c2d12', whiteSpace: 'pre-wrap' }}>
            {ret.damage_description}
          </div>
        </div>
      )}

      {/* Damage photos */}
      {ret.return_type === 'damage' && photos.length > 0 && (
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '12px' }}>Damage Photos ({photos.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.download_url ?? '#'}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block',
                  width: '100px',
                  height: '100px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgCanvas,
                  textDecoration: 'none',
                }}
              >
                {photo.download_url ? (
                  <img
                    src={photo.download_url}
                    alt={photo.original_filename}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: theme.textMuted,
                      padding: '6px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>🖼</div>
                    {photo.original_filename}
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Responsible employee & deduction */}
      {/* Approver: assign responsible employee (visible on submitted damage returns to finance/HR/admin) */}
      {ret.return_type === 'damage' &&
        ret.status === 'submitted' &&
        can('procurement.po.approve', 'approve') && (
          <div
            style={{
              ...cardStyle,
              border: `2px solid ${theme.accent}`,
              background: theme.accentBg,
            }}
          >
            <div style={{ ...labelStyle, color: theme.accent, marginBottom: '12px' }}>
              Responsible Employee (optional — Finance / HR Decision)
            </div>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}
            >
              <input
                type="checkbox"
                id="approverHasResponsible"
                checked={hasResponsibleEmployee}
                onChange={(e) => {
                  setHasResponsibleEmployee(e.target.checked)
                  if (!e.target.checked) {
                    setSelectedEmployee(null)
                    setEmployeeSearch('')
                    setDeductionAmount('')
                  }
                }}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: theme.accent,
                  cursor: 'pointer',
                }}
              />
              <label
                htmlFor="approverHasResponsible"
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: theme.textPrimary,
                  cursor: 'pointer',
                }}
              >
                An employee is responsible for this damage
              </label>
            </div>

            {hasResponsibleEmployee && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Employee search */}
                <div>
                  <div style={{ ...labelStyle, marginBottom: '6px' }}>Responsible Employee *</div>
                  {selectedEmployee ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${theme.accent}`,
                        background: theme.bgSurface,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}
                        >
                          {selectedEmployee.first_name} {selectedEmployee.last_name}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>
                          {selectedEmployee.employee_number}
                          {selectedEmployee.job_title ? ` · ${selectedEmployee.job_title}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployee(null)
                          setEmployeeSearch('')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: theme.textMuted,
                          fontSize: '16px',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        value={employeeSearch}
                        onChange={(e) => {
                          setEmployeeSearch(e.target.value)
                          setEmployeeDropdownOpen(true)
                        }}
                        onFocus={() => {
                          setEmployeeDropdownOpen(true)
                        }}
                        placeholder="Search by name or employee number…"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${theme.border}`,
                          background: theme.bgCanvas,
                          color: theme.textPrimary,
                          fontSize: '13px',
                          fontFamily: 'inherit',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      {employeeDropdownOpen && employeeResults.length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            zIndex: 50,
                            background: theme.bgSurface,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            marginTop: '2px',
                          }}
                        >
                          {employeeResults.map((emp) => (
                            <div
                              key={emp.id}
                              onClick={() => {
                                setSelectedEmployee(emp)
                                setEmployeeSearch('')
                                setEmployeeDropdownOpen(false)
                                setEmployeeResults([])
                              }}
                              style={{
                                padding: '10px 14px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                borderBottom: `1px solid ${theme.border}`,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = theme.accentBg)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background = 'transparent')
                              }
                            >
                              <div style={{ fontWeight: 500, color: theme.textPrimary }}>
                                {emp.first_name} {emp.last_name}
                              </div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                {emp.employee_number}
                                {emp.job_title ? ` · ${emp.job_title}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Deduction amount */}
                <div>
                  <div style={{ ...labelStyle, marginBottom: '6px' }}>
                    Salary Deduction Amount ({ret.currency_code}) *
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={deductionAmount}
                    onChange={(e) => {
                      setDeductionAmount(e.target.value)
                    }}
                    placeholder="Auto-filled from assessed loss"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgCanvas,
                      color: theme.textPrimary,
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                    Auto-filled from total assessed loss · will apply on next payroll run
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      {/* Approved: read-only employee deduction card */}
      {ret.return_type === 'damage' && ret.responsible_employee_name && (
        <div
          style={{
            ...cardStyle,
            background:
              ret.deduction_status === 'applied'
                ? '#f0fdf4'
                : ret.deduction_status === 'cancelled'
                  ? theme.bgSurface
                  : '#fffbeb',
            border: `1px solid ${ret.deduction_status === 'applied' ? '#86efac' : ret.deduction_status === 'cancelled' ? theme.border : '#fcd34d'}`,
          }}
        >
          <div style={{ ...labelStyle, color: '#92400e', marginBottom: '10px' }}>
            Employee Deduction
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <div style={labelStyle}>Responsible Employee</div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: theme.textPrimary,
                  marginTop: '4px',
                }}
              >
                {ret.responsible_employee_name}
              </div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                {ret.responsible_employee_number}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Deduction Amount</div>
              <div
                style={{ fontSize: '15px', fontWeight: 700, color: '#b45309', marginTop: '4px' }}
              >
                {ret.currency_code} {ret.deduction_amount ? fmtNum(ret.deduction_amount) : '—'}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Deduction Status</div>
              <div style={{ marginTop: '4px' }}>
                {ret.deduction_status ? (
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background:
                        ret.deduction_status === 'applied'
                          ? '#f0fdf4'
                          : ret.deduction_status === 'cancelled'
                            ? '#f9fafb'
                            : '#fffbeb',
                      color:
                        ret.deduction_status === 'applied'
                          ? '#16a34a'
                          : ret.deduction_status === 'cancelled'
                            ? '#6b7280'
                            : '#d97706',
                      border: `1px solid ${ret.deduction_status === 'applied' ? '#86efac' : ret.deduction_status === 'cancelled' ? '#d1d5db' : '#fcd34d'}`,
                    }}
                  >
                    {ret.deduction_status === 'applied'
                      ? 'Applied'
                      : ret.deduction_status === 'cancelled'
                        ? 'Cancelled'
                        : 'Pending — will apply on next payroll run'}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>No deduction</span>
                )}
                {ret.deduction_status === 'applied' && ret.deduction_applied_at && (
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                    Applied {new Date(ret.deduction_applied_at).toLocaleDateString('en-GB')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {ret.notes && (
        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: '6px' }}>Notes</div>
          <div style={{ fontSize: '13px', color: theme.textSecondary }}>{ret.notes}</div>
        </div>
      )}

      {/* Items table */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: '12px' }}>Return Items</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: theme.bgCanvas }}>
                {(
                  [
                    { label: 'Description', align: 'left' },
                    { label: 'Qty Returned', align: 'right' },
                    { label: 'Original Price', align: 'right' },
                    { label: 'Assessed Price', align: 'right' },
                    { label: 'Line Total', align: 'right' },
                    ...(ret.return_type === 'damage'
                      ? [{ label: 'Damage Notes', align: 'left' }]
                      : []),
                  ] as { label: string; align: 'left' | 'right' }[]
                ).map((h) => (
                  <th
                    key={h.label}
                    style={{
                      padding: '8px 10px',
                      textAlign: h.align,
                      borderBottom: `1px solid ${theme.border}`,
                      color: theme.textMuted,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ret.items.map((item) => {
                const itemLoss =
                  (parseFloat(item.original_unit_price) - parseFloat(item.assessed_unit_price)) *
                  parseFloat(item.quantity_returned)
                return (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px', color: theme.textPrimary }}>
                      {item.description}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        color: theme.textPrimary,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {parseFloat(item.quantity_returned).toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        color: theme.textPrimary,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtNum(item.original_unit_price)}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color:
                          parseFloat(item.assessed_unit_price) <
                          parseFloat(item.original_unit_price)
                            ? '#ef4444'
                            : theme.textPrimary,
                      }}
                    >
                      {fmtNum(item.assessed_unit_price)}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: theme.accent,
                      }}
                    >
                      {ret.currency_code} {fmtNum(item.line_total)}
                      {ret.return_type === 'damage' && itemLoss > 0 && (
                        <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 400 }}>
                          −{fmtNum(itemLoss)} loss
                        </div>
                      )}
                    </td>
                    {ret.return_type === 'damage' && (
                      <td style={{ padding: '10px', color: theme.textMuted, fontSize: '11px' }}>
                        {item.damage_notes ?? '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: theme.bgCanvas, fontWeight: 700 }}>
                <td
                  colSpan={ret.return_type === 'damage' ? 4 : 3}
                  style={{
                    padding: '10px',
                    textAlign: 'right',
                    color: theme.textMuted,
                    fontSize: '12px',
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    padding: '10px',
                    textAlign: 'right',
                    color: theme.accent,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {ret.currency_code} {fmtNum(ret.total_returned_value)}
                </td>
                {ret.return_type === 'damage' && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Credit modal */}
      {showCreditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9200,
            background: 'rgba(8,14,32,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: theme.bgSurface,
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              border: `1px solid ${theme.border}`,
              boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: theme.textPrimary,
                marginBottom: '8px',
              }}
            >
              Mark as Credited
            </div>
            <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
              Confirm that the vendor has issued a credit note for{' '}
              <strong>
                {ret.currency_code} {fmtNum(ret.total_returned_value)}
              </strong>
              .
            </div>
            <label style={{ ...labelStyle, marginBottom: '6px', display: 'block' }}>
              Vendor Credit Note Reference (optional)
            </label>
            <input
              value={creditRef}
              onChange={(e) => {
                setCreditRef(e.target.value)
              }}
              placeholder="e.g. CN-2024-001"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                background: theme.bgCanvas,
                color: theme.textPrimary,
                fontSize: '13px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '20px',
                justifyContent: 'flex-end',
              }}
            >
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreditModal(false)
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" loading={actionLoading} onClick={() => void doCredit()}>
                Confirm Credit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
