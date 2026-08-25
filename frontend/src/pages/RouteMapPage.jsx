import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet'
import { MdMap, MdCircle } from 'react-icons/md'
import L from 'leaflet'

/* Fix default Leaflet marker icons in bundled apps */
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/* ─── Port Coordinates ──── */
const INDIAN_PORTS = [
  { id: 'paradip', name: 'Paradip', lat: 20.2649, lon: 86.6286, congestion: 'Medium', vessels: 8 },
  { id: 'vizag', name: 'Visakhapatnam', lat: 17.6868, lon: 83.2185, congestion: 'Low', vessels: 4 },
  { id: 'gangavaram', name: 'Gangavaram', lat: 17.6200, lon: 83.2200, congestion: 'Low', vessels: 3 },
  { id: 'gopalpur', name: 'Gopalpur', lat: 19.2590, lon: 84.9054, congestion: 'Low', vessels: 1 },
  { id: 'dhamra', name: 'Dhamra', lat: 20.7800, lon: 86.9500, congestion: 'Low', vessels: 5 },
  { id: 'haldia', name: 'Haldia', lat: 22.0667, lon: 88.1083, congestion: 'High', vessels: 14 },
  { id: 'sagar', name: 'Sagar Roads', lat: 21.6500, lon: 88.0500, congestion: 'Medium', vessels: 6 },
]

const GLOBAL_PORTS = [
  { id: 'newcastle', name: 'Newcastle', lat: -32.9283, lon: 151.7817, country: 'AU' },
  { id: 'hay_point', name: 'Hay Point', lat: -21.2750, lon: 149.3000, country: 'AU' },
  { id: 'gladstone', name: 'Gladstone', lat: -23.8427, lon: 151.2650, country: 'AU' },
  { id: 'norfolk', name: 'Norfolk', lat: 36.8508, lon: -76.2859, country: 'US' },
  { id: 'kalimantan', name: 'Kalimantan', lat: -1.2500, lon: 116.8300, country: 'ID' },
  { id: 'beira', name: 'Beira', lat: -19.8436, lon: 34.8710, country: 'MZ' },
  { id: 'taman', name: 'Taman', lat: 45.2100, lon: 36.7200, country: 'RU' },
  { id: 'vostochny', name: 'Vostochny', lat: 42.7500, lon: 133.0700, country: 'RU' },
]

const TRADE_ROUTES = [
  { from: 'newcastle', to: 'paradip', color: '#38bdf8', label: 'AU → Paradip', nm: 5640 },
  { from: 'newcastle', to: 'vizag', color: '#38bdf8', label: 'AU → Vizag', nm: 5520 },
  { from: 'kalimantan', to: 'gangavaram', color: '#a78bfa', label: 'ID → Gangavaram', nm: 2680 },
  { from: 'beira', to: 'haldia', color: '#fb923c', label: 'MZ → Haldia', nm: 3950 },
  { from: 'norfolk', to: 'vizag', color: '#f87171', label: 'US → Vizag', nm: 9200 },
  { from: 'taman', to: 'paradip', color: '#4ade80', label: 'RU → Paradip', nm: 5100 },
]

const allPorts = [...INDIAN_PORTS, ...GLOBAL_PORTS]

function getPortCoords(portId) {
  const p = allPorts.find(p => p.id === portId)
  return p ? [p.lat, p.lon] : [0, 0]
}

function congestionColor(level) {
  if (level === 'High') return '#f87171'
  if (level === 'Medium') return '#fbbf24'
  return '#4ade80'
}

export default function RouteMapPage() {
  const [selectedRoute, setSelectedRoute] = useState(null)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header">
        <div>
          <h1>Maritime Route Intelligence</h1>
          <p>Interactive trade lane map with port congestion overlay and route analysis</p>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
        {/* ─── Map ─── */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', height: 560 }}>
          <MapContainer
            center={[8, 75]}
            zoom={3}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com">CARTO</a>'
            />

            {/* Trade Routes */}
            {TRADE_ROUTES.map((route, i) => (
              <Polyline
                key={i}
                positions={[getPortCoords(route.from), getPortCoords(route.to)]}
                pathOptions={{
                  color: route.color,
                  weight: selectedRoute === i ? 3.5 : 1.8,
                  opacity: selectedRoute === null || selectedRoute === i ? 0.8 : 0.25,
                  dashArray: '8, 6',
                }}
                eventHandlers={{ click: () => setSelectedRoute(selectedRoute === i ? null : i) }}
              >
                <Popup>
                  <div style={{ fontSize: 13, minWidth: 160 }}>
                    <strong>{route.label}</strong><br/>
                    Distance: {route.nm.toLocaleString()} NM
                  </div>
                </Popup>
              </Polyline>
            ))}

            {/* Indian Ports (with congestion) */}
            {INDIAN_PORTS.map(port => (
              <CircleMarker
                key={port.id}
                center={[port.lat, port.lon]}
                radius={8 + port.vessels * 0.5}
                pathOptions={{
                  fillColor: congestionColor(port.congestion),
                  fillOpacity: 0.7,
                  color: congestionColor(port.congestion),
                  weight: 2,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 13 }}>
                    <strong>🇮🇳 {port.name}</strong><br/>
                    Congestion: <span style={{ fontWeight: 600, color: congestionColor(port.congestion) }}>{port.congestion}</span><br/>
                    Vessels at anchor: {port.vessels}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Global Ports */}
            {GLOBAL_PORTS.map(port => (
              <CircleMarker
                key={port.id}
                center={[port.lat, port.lon]}
                radius={6}
                pathOptions={{
                  fillColor: '#38bdf8',
                  fillOpacity: 0.6,
                  color: '#38bdf8',
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 13 }}>
                    <strong>{port.name} ({port.country})</strong><br/>
                    Load Port
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* ─── Route Panel ─── */}
        <div className="glass-card" style={{ maxHeight: 560, overflowY: 'auto' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdMap style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
            Trade Lanes
          </h2>
          {TRADE_ROUTES.map((route, i) => (
            <div
              key={i}
              onClick={() => setSelectedRoute(selectedRoute === i ? null : i)}
              style={{
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-sm)',
                borderRadius: 'var(--radius-md)',
                background: selectedRoute === i ? 'hsla(200, 85%, 55%, 0.1)' : 'var(--bg-input)',
                border: selectedRoute === i ? '1px solid var(--border-active)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: route.color, display: 'inline-block' }}></span>
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>{route.label}</span>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  {route.nm.toLocaleString()} NM
                </span>
              </div>
            </div>
          ))}

          {/* ─── Port Congestion Legend ─── */}
          <h3 style={{ fontSize: 'var(--font-size-base)', marginTop: 'var(--space-lg)', marginBottom: 'var(--space-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            East Coast Port Status
          </h3>
          {INDIAN_PORTS.map(port => (
            <div key={port.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: 'var(--space-sm) 0',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 'var(--font-size-sm)',
            }}>
              <span>{port.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  {port.vessels} vessels
                </span>
                <span className={`badge ${
                  port.congestion === 'High' ? 'badge-danger' :
                  port.congestion === 'Medium' ? 'badge-warning' : 'badge-success'
                }`}>
                  {port.congestion}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
