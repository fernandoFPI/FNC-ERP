import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  VENDOR_QUERY,
  VENDORS_QUERY,
  CREATE_VENDOR,
  UPDATE_VENDOR,
} from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Checkbox } from '../../../components/ui/Checkbox'
import { useToastStore } from '../../../store/toastStore'

const CURRENCIES = ['IQD', 'USD', 'EUR', 'TRY', 'AED', 'SAR']

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({
  label,
  theme,
}: {
  label: string
  theme: { border: string; textMuted: string }
}) {
  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '6px',
        marginBottom: '4px',
        fontSize: '12px',
        fontWeight: 600,
        color: theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </div>
  )
}

export default function VendorForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    name: '',
    legal_name: '',
    tax_id: '',
    currency_code: 'IQD',
    payment_terms_days: '30',
    country_code: '',
    city: '',
    address: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    bank_name: '',
    is_active: true,
  })

  const { data: vendorData } = useQuery(VENDOR_QUERY, {
    variables: { id },
    skip: !isEdit,
  })

  useEffect(() => {
    const v = vendorData?.vendor
    if (!v) return
    setForm({
      name: v.name ?? '',
      legal_name: v.legal_name ?? '',
      tax_id: v.tax_id ?? '',
      currency_code: v.currency_code ?? 'IQD',
      payment_terms_days: String(v.payment_terms_days ?? 30),
      country_code: v.country_code ?? '',
      city: v.city ?? '',
      address: v.address ?? '',
      contact_name: v.contact_name ?? '',
      contact_email: v.contact_email ?? '',
      contact_phone: v.contact_phone ?? '',
      bank_name: v.bank_name ?? '',
      is_active: v.is_active ?? true,
    })
  }, [vendorData])

  const [createVendor, { loading: creating }] = useMutation(CREATE_VENDOR)
  const [updateVendor, { loading: updating }] = useMutation(UPDATE_VENDOR)

  const field =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const rawCC = form.country_code.trim().toUpperCase().slice(0, 2)
      const input = {
        ...form,
        payment_terms_days: parseInt(form.payment_terms_days),
        country_code: rawCC || null,
      }
      if (isEdit) {
        await updateVendor({ variables: { id, input } })
        addToast({ type: 'success', message: 'Vendor updated' })
      } else {
        await createVendor({
          variables: { input },
          refetchQueries: [{ query: VENDORS_QUERY, variables: {} }],
        })
        addToast({ type: 'success', message: 'Vendor created' })
      }
      navigate('/procurement/vendors')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const loading = creating || updating

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '900px' }}>
      <PageHeader
        title={isEdit ? 'Edit Vendor' : 'New Vendor'}
        subtitle={isEdit ? 'Update vendor details' : 'Add a new vendor'}
        backPath="/procurement/vendors"
      />

      <form onSubmit={handleSubmit}>
        <Card
          style={{
            marginTop: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <SectionTitle theme={theme} label="Basic Info" />
          <Row>
            <Input label="Vendor Name" value={form.name} onChange={field('name')} required />
            <Input label="Legal Name" value={form.legal_name} onChange={field('legal_name')} />
          </Row>
          <Row>
            <Input label="Tax ID" value={form.tax_id} onChange={field('tax_id')} />
            <Select label="Currency" value={form.currency_code} onChange={field('currency_code')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Row>
          <Row>
            <Input
              label="Payment Terms (days)"
              type="number"
              min="0"
              value={form.payment_terms_days}
              onChange={field('payment_terms_days')}
            />
          </Row>

          <SectionTitle theme={theme} label="Address" />
          <Row>
            <Input
              label="Country Code"
              value={form.country_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase().slice(0, 2) }))
              }}
              placeholder="IQ"
              maxLength={2}
            />
            <Input label="City" value={form.city} onChange={field('city')} />
          </Row>
          <Input label="Address" value={form.address} onChange={field('address')} />

          <SectionTitle theme={theme} label="Contact" />
          <Row>
            <Input
              label="Contact Name"
              value={form.contact_name}
              onChange={field('contact_name')}
            />
            <Input
              label="Contact Email"
              type="email"
              value={form.contact_email}
              onChange={field('contact_email')}
            />
          </Row>
          <Row>
            <Input
              label="Contact Phone"
              value={form.contact_phone}
              onChange={field('contact_phone')}
            />
            <Input label="Bank Name" value={form.bank_name} onChange={field('bank_name')} />
          </Row>

          <Checkbox
            label="Active"
            checked={form.is_active}
            onChange={(checked) => {
              setForm((f) => ({ ...f, is_active: checked }))
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              borderTop: `1px solid ${theme.border}`,
              paddingTop: '16px',
            }}
          >
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigate('/procurement/vendors')
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={loading}>
              {isEdit ? 'Save Changes' : 'Create Vendor'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
