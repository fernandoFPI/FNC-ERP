import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { COMPANIES_QUERY, CREATE_COMPANY } from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'

interface Company {
  id: string
  name: string
  legalName?: string
  city?: string
  countryCode?: string
  currencyCode: string
  isActive: boolean
  setupCompleted: boolean
  intercoTransferPricingMethod?: string
  configuration?: { defaultCurrency?: string; fiscalYearStartMonth?: number }
}

export default function CompaniesPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    currencyCode: 'USD',
    countryCode: '',
  })

  const { data, loading, refetch } = useQuery(COMPANIES_QUERY, { fetchPolicy: 'cache-and-network' })
  const [createCompany, { loading: creating }] = useMutation(CREATE_COMPANY, {
    onCompleted: (res) => {
      setShowCreateModal(false)
      setForm({ name: '', legalName: '', currencyCode: 'USD', countryCode: '' })
      void refetch()
      navigate(`/admin/companies/${res.createCompany.id}`)
    },
  })

  const companies: Company[] = data?.companies ?? []

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowCreateModal(true)
            }}
          >
            New company
          </Button>
        }
      />

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted }}>Loading…</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginTop: '24px',
        }}
      >
        {companies.map((c) => (
          <div
            key={c.id}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              navigate(`/admin/companies/${c.id}`)
            }}
          >
            <Card style={{ padding: '20px', transition: 'border-color 0.15s' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>
                  {c.name}
                </div>
                <Badge variant={c.isActive ? 'success' : 'neutral'}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {c.legalName && c.legalName !== c.name && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '6px' }}>
                  {c.legalName}
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
                    {c.currencyCode}
                  </span>{' '}
                  · {c.countryCode ?? '—'}
                </div>
                {c.city && <div style={{ fontSize: '11px', color: theme.textMuted }}>{c.city}</div>}
              </div>
              <div style={{ marginTop: '10px' }}>
                {!c.setupCompleted && <Badge variant="warning">Setup incomplete</Badge>}
              </div>
            </Card>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <Modal
          open={showCreateModal}
          title="New Company"
          onClose={() => {
            setShowCreateModal(false)
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '380px' }}>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Company name *
              </label>
              <input
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                }}
                placeholder="e.g. Farage Printing Industries"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Legal name
              </label>
              <input
                value={form.legalName}
                onChange={(e) => {
                  setForm({ ...form, legalName: e.target.value })
                }}
                placeholder="Optional — defaults to company name"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgSurface,
                  color: theme.textPrimary,
                  fontSize: '13px',
                }}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Currency *
                </label>
                <input
                  value={form.currencyCode}
                  onChange={(e) => {
                    setForm({ ...form, currencyCode: e.target.value.toUpperCase() })
                  }}
                  placeholder="USD"
                  maxLength={3}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    background: theme.bgSurface,
                    color: theme.textPrimary,
                    fontSize: '13px',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Country code
                </label>
                <input
                  value={form.countryCode}
                  onChange={(e) => {
                    setForm({ ...form, countryCode: e.target.value.toUpperCase() })
                  }}
                  placeholder="IQ"
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    background: theme.bgSurface,
                    color: theme.textPrimary,
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateModal(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={creating}
                disabled={!form.name || !form.currencyCode}
                onClick={() =>
                  void createCompany({
                    variables: {
                      input: {
                        name: form.name,
                        legalName: form.legalName || undefined,
                        currencyCode: form.currencyCode,
                        countryCode: form.countryCode || undefined,
                      },
                    },
                  })
                }
              >
                Create
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
