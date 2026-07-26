import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  WORK_LOCATIONS_QUERY,
  CREATE_WORK_LOCATION,
  UPDATE_WORK_LOCATION,
} from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { MapPinPicker } from '../../../components/ui/MapPinPicker'
import { useToastStore } from '../../../store/toastStore'

interface WorkLocation {
  id: string
  name: string
  address?: string
  latitude?: string
  longitude?: string
  geofence_radius_m?: number
  is_active: boolean
}

const emptyForm = { name: '', address: '', latitude: '', longitude: '', geofence_radius_m: '' }

export default function WorkLocationsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [geoError, setGeoError] = useState('')

  const { data, loading, refetch } = useQuery(WORK_LOCATIONS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const [createLoc, { loading: creating }] = useMutation(CREATE_WORK_LOCATION)
  const [updateLoc, { loading: updating }] = useMutation(UPDATE_WORK_LOCATION)

  const locations: WorkLocation[] = data?.workLocations ?? []

  function openCreate() {
    setForm(emptyForm)
    setEditId(null)
    setGeoError('')
    setModalOpen(true)
  }
  function openEdit(l: WorkLocation) {
    setForm({
      name: l.name,
      address: l.address ?? '',
      latitude: l.latitude ?? '',
      longitude: l.longitude ?? '',
      geofence_radius_m: l.geofence_radius_m?.toString() ?? '',
    })
    setEditId(l.id)
    setGeoError('')
    setModalOpen(true)
  }

  function validateGeo(): boolean {
    const hasLat = form.latitude.trim() !== ''
    const hasLng = form.longitude.trim() !== ''
    const hasRadius = form.geofence_radius_m.trim() !== ''
    if ((hasLat || hasLng) && !hasRadius) {
      setGeoError('Radius is required when coordinates are set')
      return false
    }
    if (hasRadius && (!hasLat || !hasLng)) {
      setGeoError('Coordinates are required when radius is set')
      return false
    }
    setGeoError('')
    return true
  }

  async function handleSubmit() {
    if (!validateGeo()) return
    const input = {
      name: form.name,
      address: form.address || undefined,
      latitude: form.latitude ? parseFloat(form.latitude) : undefined,
      longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      geofence_radius_m: form.geofence_radius_m ? parseInt(form.geofence_radius_m) : undefined,
    }
    try {
      if (editId) {
        await updateLoc({ variables: { id: editId, input } })
        addToast({ type: 'success', message: 'Location updated' })
      } else {
        await createLoc({ variables: { input } })
        addToast({ type: 'success', message: 'Location created' })
      }
      setModalOpen(false)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const columns: Column<WorkLocation>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (l) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.name}</span>,
    },
    {
      key: 'address',
      header: 'Address',
      render: (l) => (
        <span style={{ fontSize: '12px', color: theme.textSecondary }}>{l.address ?? '—'}</span>
      ),
    },
    {
      key: 'geofence_radius_m',
      header: 'Geofence',
      render: (l) =>
        l.geofence_radius_m ? (
          <span style={{ color: theme.textSecondary, fontSize: '12px' }}>
            {l.geofence_radius_m}m radius
          </span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '12px' }}>Not set</span>
        ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (l) => (
        <Badge variant={l.is_active ? 'success' : 'neutral'}>
          {l.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'id',
      header: '',
      render: (l) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            openEdit(l)
          }}
        >
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Work Locations"
        subtitle={`${locations.length} locations`}
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            New Location
          </Button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={locations} loading={loading} rowKey="id" />
      </Card>

      <MapPinPicker
        open={mapOpen}
        onClose={() => {
          setMapOpen(false)
        }}
        onConfirm={(lat, lng) => {
          setForm((f) => ({
            ...f,
            latitude: lat.toString(),
            longitude: lng.toString(),
            geofence_radius_m: f.geofence_radius_m || '200',
          }))
        }}
        initialLat={form.latitude ? parseFloat(form.latitude) : undefined}
        initialLng={form.longitude ? parseFloat(form.longitude) : undefined}
      />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={editId ? 'Edit Location' : 'New Location'}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setModalOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={creating || updating}>
              Save
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }))
            }}
            required
          />
          <Textarea
            label="Address"
            value={form.address}
            onChange={(e) => {
              setForm((f) => ({ ...f, address: e.target.value }))
            }}
            rows={2}
          />
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '14px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: theme.textSecondary,
                marginBottom: '10px',
              }}
            >
              Geofence (optional)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
              }}
            >
              <Input
                label="Latitude"
                type="number"
                step="0.000001"
                value={form.latitude}
                onChange={(e) => {
                  setForm((f) => ({ ...f, latitude: e.target.value }))
                }}
              />
              <Input
                label="Longitude"
                type="number"
                step="0.000001"
                value={form.longitude}
                onChange={(e) => {
                  setForm((f) => ({ ...f, longitude: e.target.value }))
                }}
              />
              <Input
                label="Radius (m)"
                type="number"
                min="1"
                value={form.geofence_radius_m}
                onChange={(e) => {
                  setForm((f) => ({ ...f, geofence_radius_m: e.target.value }))
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setMapOpen(true)
              }}
              style={{
                marginTop: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                color: theme.accent,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📍 Drop pin on map
            </button>
            {geoError && (
              <div style={{ fontSize: '12px', color: theme.danger, marginTop: '6px' }}>
                {geoError}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
