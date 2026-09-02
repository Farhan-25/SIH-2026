import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MdDirectionsBoat, MdClose, MdNavigation, MdAttachMoney,
  MdEco, MdSpeed, MdLocationOn, MdAnchor, MdShowChart
} from 'react-icons/md'
import { usePreferences } from '../context/PreferencesContext'

function compass(heading) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((Number(heading) || 0) % 360) / 45) % 8]
}

/**
 * Shared vessel detail drawer for Command Centre + Route Map clicks.
 */
export default function VesselSidePanel({ vessel, onClose, ports = [], compact = false }) {
  const navigate = useNavigate()
  const { formatMoney } = usePreferences()
  const [tab, setTab] = useState('telemetry')

  if (!vessel) return null

  const isAnchor = vessel.status === 'At Anchor'
  const statusColor = isAnchor ? 'var(--accent-amber)' : 'var(--accent-emerald)'
  const statusBg = isAnchor ? 'hsla(35, 95%, 60%, 0.15)' : 'hsla(155, 70%, 45%, 0.15)'
  const originName = vessel.origin || 'Load port'
  const destName = vessel.dest || vessel.destination || 'East Coast India'
  const progressPct = vessel.progress_pct ?? 50
  const dailyDemurrage = vessel.class?.includes('Cape') ? 28500 : vessel.class?.includes('Panamax') ? 21000 : 16500
  const waitHours = vessel.wait_time_hours || (isAnchor ? 36 : 18)
  const demurrageRisk = Math.round((waitHours / 24) * dailyDemurrage)
  const draft = vessel.draft_m || 14.2
  const dwt = vessel.dwt || 75000
  const fuelMT = Math.round((dwt / 1000) * 4.8)
  const co2 = Math.round(fuelMT * 3.114)
  const cii = co2 < 1200 ? 'A' : co2 < 1600 ? 'B' : 'C'
  const destPort = ports.find((p) =>
    (p.name || '').toLowerCase().includes(String(destName).toLowerCase().split(' ')[0])
  )
  const maxDraft = destPort?.max_draft_m || destPort?.max_permissible_draft_m || 14.5
  const draftOk = maxDraft >= draft

  return (
    <motion.aside
      initial={{ x: -28, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -28, opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 240 }}
      className={`vessel-side-panel ${compact ? 'compact' : ''}`}
      role="dialog"
      aria-label="Vessel details"
    >
      <div className="fr24-card-header">
        <div className="fr24-vessel-avatar">
          <MdDirectionsBoat size={26} />
        </div>
        <div className="fr24-vessel-meta">
          <div className="fr24-callsign-row">
            <span className="fr24-badge-class">{vessel.class || 'Bulk'}</span>
            <span className="fr24-mmsi">MMSI {vessel.mmsi || '—'}</span>
          </div>
          <h2 className="fr24-vessel-name">{vessel.name || 'Unknown vessel'}</h2>
          <div className="fr24-flag-row">
            <span className="fr24-flag">{vessel.operator || vessel.source || 'Live AIS fleet'}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="fr24-btn-close" title="Close">
          <MdClose size={20} />
        </button>
      </div>

      <div className="fr24-route-box">
        <div className="fr24-route-endpoints">
          <div className="endpoint-col left">
            <span className="port-code">{String(originName).slice(0, 3).toUpperCase()}</span>
            <span className="port-full-name">{originName}</span>
          </div>
          <div className="route-airplane-indicator">
            <div className="route-line" />
            <div className="route-ship-pin" style={{ left: `${Math.min(92, Math.max(8, progressPct))}%` }}>
              <MdDirectionsBoat size={16} style={{ color: 'var(--accent)' }} />
            </div>
          </div>
          <div className="endpoint-col right">
            <span className="port-code">{String(destName).slice(0, 3).toUpperCase()}</span>
            <span className="port-full-name">{destName}</span>
          </div>
        </div>
        <div className="fr24-progress-stats">
          <span>Progress <strong>{progressPct}%</strong></span>
          <span style={{ color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: 99, fontWeight: 600, fontSize: '0.7rem' }}>
            {vessel.status || 'UNDERWAY'}
          </span>
          <span>ETA <strong>{vessel.eta_days ?? '—'}d</strong></span>
        </div>
      </div>

      <div className="fr24-tab-nav">
        <button type="button" className={`tab-pill ${tab === 'telemetry' ? 'active' : ''}`} onClick={() => setTab('telemetry')}>
          <MdNavigation /> Telemetry
        </button>
        <button type="button" className={`tab-pill ${tab === 'financial' ? 'active' : ''}`} onClick={() => setTab('financial')}>
          <MdAttachMoney /> Cost
        </button>
        <button type="button" className={`tab-pill ${tab === 'green' ? 'active' : ''}`} onClick={() => setTab('green')}>
          <MdEco /> Carbon
        </button>
        <button type="button" className={`tab-pill ${tab === 'berth' ? 'active' : ''}`} onClick={() => setTab('berth')}>
          <MdAnchor /> Berth
        </button>
      </div>

      <div className="fr24-tab-body">
        {tab === 'telemetry' && (
          <div className="fr24-telemetry-grid">
            <div className="telemetry-cell">
              <span className="cell-lbl"><MdSpeed /> Speed</span>
              <span className="cell-val text-ocean">{vessel.speed != null ? Number(vessel.speed).toFixed(1) : '—'} <span className="unit">kn</span></span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl"><MdNavigation /> Heading</span>
              <span className="cell-val">{vessel.heading != null ? `${Math.round(vessel.heading)}°` : '—'} <span className="unit">{compass(vessel.heading)}</span></span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl"><MdLocationOn /> Position</span>
              <span className="cell-val mono">
                {vessel.lat != null ? `${Number(vessel.lat).toFixed(2)}°N` : '—'},{' '}
                {vessel.lon != null ? `${Number(vessel.lon).toFixed(2)}°E` : '—'}
              </span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl"><MdAnchor /> Draft / DWT</span>
              <span className="cell-val">{draft}m <span className="unit">/ {(dwt / 1000).toFixed(0)}k</span></span>
            </div>
          </div>
        )}

        {tab === 'financial' && (
          <div className="fr24-telemetry-grid">
            <div className="telemetry-cell">
              <span className="cell-lbl">Demurrage / day</span>
              <span className="cell-val">{formatMoney(dailyDemurrage, { decimals: 0 })}</span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl">Wait exposure</span>
              <span className="cell-val">{waitHours}h</span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl">Demurrage risk</span>
              <span className="cell-val text-rose">{formatMoney(demurrageRisk, { decimals: 0 })}</span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl">Cargo</span>
              <span className="cell-val">{vessel.cargo || 'Bulk'}</span>
            </div>
          </div>
        )}

        {tab === 'green' && (
          <div className="fr24-telemetry-grid">
            <div className="telemetry-cell">
              <span className="cell-lbl">Est. fuel</span>
              <span className="cell-val">{fuelMT} <span className="unit">MT</span></span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl">CO₂</span>
              <span className="cell-val">{co2} <span className="unit">MT</span></span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl">CII band</span>
              <span className="cell-val">{cii}</span>
            </div>
          </div>
        )}

        {tab === 'berth' && (
          <div className="fr24-telemetry-grid">
            <div className="telemetry-cell">
              <span className="cell-lbl">Vessel draft</span>
              <span className="cell-val">{draft}m</span>
            </div>
            <div className="telemetry-cell">
              <span className="cell-lbl">Port limit</span>
              <span className="cell-val">{maxDraft}m</span>
            </div>
            <div className="telemetry-cell" style={{ gridColumn: '1 / -1' }}>
              <span className="cell-lbl">Feasibility</span>
              <span className="cell-val" style={{ color: draftOk ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                {draftOk ? 'Within berth draft' : 'Draft constrained — check lighterage'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="vessel-side-actions">
        <button type="button" className="cc-brief-cta" onClick={() => navigate('/vessels')}>
          Optimize vessel
        </button>
        <button type="button" className="cc-btn" onClick={() => navigate('/routes')}>
          <MdShowChart size={14} /> Route map
        </button>
      </div>
    </motion.aside>
  )
}
