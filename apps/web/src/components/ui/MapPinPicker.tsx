import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from './Modal'
import { Button } from './Button'

// Leaflet is loaded dynamically to avoid SSR issues and bundle bloat
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any
  }
}

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (lat: number, lng: number) => void
  initialLat?: number
  initialLng?: number
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = LEAFLET_JS
      script.onload = () => resolve()
      document.head.appendChild(script)
    } else {
      resolve()
    }
  })
}

export function MapPinPicker({ open, onClose, onConfirm, initialLat, initialLng }: Props) {
  const { theme } = useTheme()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  )
  const [leafletReady, setLeafletReady] = useState(!!window.L)

  // Load Leaflet when the modal opens
  useEffect(() => {
    if (!open) return
    if (window.L) { setLeafletReady(true); return }
    loadLeaflet().then(() => setLeafletReady(true))
  }, [open])

  // Initialise / update the map whenever the modal is open and Leaflet is ready
  useEffect(() => {
    if (!open || !leafletReady || !mapContainerRef.current) return
    const L = window.L

    if (!mapRef.current) {
      const defaultLat = initialLat ?? 33.3152
      const defaultLng = initialLng ?? 44.3661
      const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([defaultLat, defaultLng], 13)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Custom red marker icon (avoids missing image issue with bundlers)
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50% 50% 50% 0;
          background:#e53e3e;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,.35);
          transform:rotate(-45deg);
          position:relative;top:-14px;left:-14px;
        "></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      })

      if (initialLat != null && initialLng != null) {
        markerRef.current = L.marker([initialLat, initialLng], { icon, draggable: true }).addTo(map)
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current.getLatLng()
          setPin({ lat: parseFloat(pos.lat.toFixed(7)), lng: parseFloat(pos.lng.toFixed(7)) })
        })
        setPin({ lat: initialLat, lng: initialLng })
      }

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const lat = parseFloat(e.latlng.lat.toFixed(7))
        const lng = parseFloat(e.latlng.lng.toFixed(7))
        setPin({ lat, lng })
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map)
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current.getLatLng()
            setPin({ lat: parseFloat(pos.lat.toFixed(7)), lng: parseFloat(pos.lng.toFixed(7)) })
          })
        }
      })

      mapRef.current = map
    }

    // Invalidate size after modal animation settles
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 150)
    return () => clearTimeout(t)
  }, [open, leafletReady, initialLat, initialLng])

  // Destroy map when modal closes
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [open])

  function handleConfirm() {
    if (!pin) return
    onConfirm(pin.lat, pin.lng)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Drop a pin"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!pin}>
            {pin ? `Use (${pin.lat}, ${pin.lng})` : 'Click map to place pin'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!leafletReady && (
          <div style={{ textAlign: 'center', color: theme.textMuted, padding: '20px' }}>Loading map…</div>
        )}
        {/* Map container — always rendered so the ref is stable */}
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '400px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: `1px solid ${theme.border}`,
            opacity: leafletReady ? 1 : 0,
          }}
        />
        <div style={{ fontSize: '12px', color: theme.textMuted }}>
          Click anywhere on the map to place a pin. Drag the pin to adjust. You can also use the search box built into OpenStreetMap tiles.
        </div>
        {pin && (
          <div style={{ fontSize: '12px', fontFamily: 'monospace', color: theme.textSecondary, background: theme.bgSurface, padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
            Lat: {pin.lat} · Lng: {pin.lng}
          </div>
        )}
      </div>
    </Modal>
  )
}
