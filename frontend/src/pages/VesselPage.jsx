import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import Plot from 'react-plotly.js'
import {
  MdDirectionsBoat, MdCheckCircle, MdCancel,
  MdWarning, MdPlayArrow, MdRefresh
} from 'react-icons/md'
import { getVesselRecommendation, getPorts } from '../api/client'
import { usePreferences } from '../context/PreferencesContext'

const BASELINE_ORIGINS = [
  { id: 'AU_NEW', label: 'Newcastle (Australia)' },
  { id: 'AU_HAY', label: 'Hay Point (Australia)' },
  { id: 'AU_GLA', label: 'Gladstone (Australia)' },
  { id: 'ID_KLT', label: 'Kalimantan / Muara Satui (Indonesia)' },
  { id: 'ID_SMR', label: 'Samarinda (Indonesia)' },
  { id: 'US_NOR', label: 'Norfolk (USA)' },
  { id: 'US_BAL', label: 'Baltimore (USA)' },
  { id: 'MZ_BEI', label: 'Beira (Mozambique)' },
  { id: 'RU_VOS', label: 'Vostochny (Russia)' },
]

const BASELINE_DESTINATIONS = [
  { id: 'IN_PRT', label: 'Paradip Port' },
  { id: 'IN_DHM', label: 'Dhamra Port' },
  { id: 'IN_VTZ', label: 'Visakhapatnam (Vizag)' },
  { id: 'IN_GNV', label: 'Gangavaram Port' },
  { id: 'IN_HLD', label: 'Haldia Dock Complex' },
  { id: 'IN_GPL', label: 'Gopalpur Port' },
]

export default function VesselPage() {
  const { axisCurrencyPrefix, formatMoney, convertMoney } = usePreferences()
  const [origins, setOrigins] = useState(BASELINE_ORIGINS)
  const [destinations, setDestinations] = useState(BASELINE_DESTINATIONS)
  const [origin, setOrigin] = useState('AU_NEW')
  const [dest, setDest] = useState('IN_PRT')
  const [cargo, setCargo] = useState('75000')
  const [loading, setLoading] = useState(false)
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  // ─── Load Dynamic Ports Master ───
  useEffect(() => {
    let isMounted = true
    async function loadPortData() {
      try {
        setLoadingPorts(true)
        const data = await getPorts()
        if (!isMounted) return

        const globalPorts = data?.global_load_ports || {}
        const indianPorts = data?.indian_east_coast_ports || {}

        const parsedOrigins = Object.entries(globalPorts).map(([id, p]) => ({
          id: p.port_id || id,
          label: `${p.port_name || id}${p.country ? ` (${p.country})` : ''}`,
        }))

        const parsedDestinations = Object.entries(indianPorts).map(([id, p]) => ({
          id: p.port_id || id,
          label: p.port_name || id,
        }))

        if (parsedOrigins.length > 0) {
          setOrigins(parsedOrigins)
          setOrigin(prev => parsedOrigins.some(o => o.id === prev) ? prev : parsedOrigins[0].id)
        }

        if (parsedDestinations.length > 0) {
          setDestinations(parsedDestinations)
          setDest(prev => parsedDestinations.some(d => d.id === prev) ? prev : parsedDestinations[0].id)
        }
      } catch (err) {
        console.warn('Port master dynamic load notice (using verified baselines):', err)
      } finally {
        if (isMounted) setLoadingPorts(false)
      }
    }
    loadPortData()
    return () => { isMounted = false }
  }, [])

  // ─── Live Vessel Optimization ───
  const runOptimization = useCallback(async () => {
    if (!origin || !dest || !cargo) return
    setLoading(true)
    setError(null)
    try {
      const data = await getVesselRecommendation({
        cargo_parcel_mt: parseFloat(cargo),
        origin_port_id: origin,
        dest_port_id: dest,
      })
      if (data?.all_vessel_evaluations) {
        setResults(data)
      } else {
        setError('No vessel evaluations returned for the selected corridor.')
      }
    } catch (err) {
      console.error('Vessel optimization error:', err)
      setError(err?.response?.data?.detail || err.message || 'Failed to compute vessel optimization.')
    } finally {
      setLoading(false)
    }
  }, [origin, dest, cargo])

  // Trigger initial calculation once ports are loaded
  useEffect(() => {
    if (origins.length > 0 && destinations.length > 0 && !results && !loading) {
      runOptimization()
    }
  }, [origins, destinations, runOptimization, results, loading])

  const evaluations = results?.all_vessel_evaluations || []
  const feasible = evaluations
    .filter(v => v.is_feasible)
    .sort((a, b) => (a.total_landed_cost_usd_per_mt || 0) - (b.total_landed_cost_usd_per_mt || 0))
  const infeasible = evaluations.filter(v => !v.is_feasible)

  // Cost breakdown chart
  const costData = feasible.map(v => ({
    vessel: v.vessel_name,
    freight: convertMoney(v.base_freight_usd_per_mt),
    port: convertMoney(v.port_charges_usd_per_mt),
    lighterage: convertMoney(v.lighterage_cost_usd_per_mt),
    demurrage: convertMoney(v.demurrage_risk_usd_per_mt),
  }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header">
        <div>
          <h1>Vessel Optimization</h1>
          <p>Physical constraint evaluation and landed cost ranking for active bulk carrier fleet</p>
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="glass-card" style={{ marginBottom: 'var(--space-md)', display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label>Origin Port</label>
          <select
            className="form-control"
            value={origin}
            onChange={e => setOrigin(e.target.value)}
            disabled={loadingPorts}
          >
            {loadingPorts ? (
              <option value="">Loading ports...</option>
            ) : (
              origins.map(o => <option key={o.id} value={o.id}>{o.label}</option>)
            )}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label>Destination Port</label>
          <select
            className="form-control"
            value={dest}
            onChange={e => setDest(e.target.value)}
            disabled={loadingPorts}
          >
            {loadingPorts ? (
              <option value="">Loading ports...</option>
            ) : (
              destinations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)
            )}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
          <label>Cargo Parcel (MT)</label>
          <input
            type="number"
            className="form-control"
            value={cargo}
            onChange={e => setCargo(e.target.value)}
            min="5000"
            step="5000"
            disabled={loadingPorts}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={runOptimization}
          disabled={loading || loadingPorts}
        >
          {loading ? <MdRefresh className="spin" /> : <MdPlayArrow />} {loading ? 'Optimizing...' : 'Optimize'}
        </button>
      </div>

      {/* ─── Error Alert ─── */}
      {error && (
        <div
          className="glass-card"
          style={{
            marginBottom: 'var(--space-md)',
            borderLeft: '4px solid var(--accent-rose)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <MdWarning size={22} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
            <div>
              <strong>Optimization Error:</strong> {error}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={runOptimization} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
            <MdRefresh /> Retry
          </button>
        </div>
      )}

      {/* ─── Loading Skeleton ─── */}
      {loading && !results && (
        <div className="glass-card" style={{ padding: 'var(--space-xl)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-ocean)', marginBottom: 8 }}>
            Running Physical Feasibility & Landed Cost Optimization...
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Evaluating vessel drafts, LOA, beam, queue wait times, and freight landed costs across the active fleet.
          </p>
        </div>
      )}

      {/* ─── Recommendation Banner ─── */}
      {results && (results.recommended_vessel_name || results.recommended_vessel_class) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card"
          style={{
            marginBottom: 'var(--space-md)',
            background: 'linear-gradient(135deg, hsla(155, 70%, 45%, 0.08), hsla(200, 85%, 55%, 0.08))',
            border: '1px solid hsla(155, 70%, 45%, 0.25)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              ✦ Recommended Vessel
            </div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 4 }}>
              {results.recommended_vessel_name || results.recommended_vessel_class}
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
              {results.recommended_vessel_class} Class
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lowest Landed Cost</div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--accent-ocean)' }}>
              {formatMoney(results.recommended_total_cost_usd_per_mt, { suffix: '/MT' })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Results Matrix & Visual Breakdown ─── */}
      {results && evaluations.length > 0 && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* ─── Feasibility Matrix ─── */}
          <div className="glass-card">
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
              <MdDirectionsBoat style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
              Vessel Feasibility Matrix
            </h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vessel</th>
                  <th>Status</th>
                  <th>Cost/MT</th>
                  <th>Discharge</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {[...feasible, ...infeasible].map((v, i) => (
                  <tr key={i} style={{ opacity: v.is_feasible ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {v.vessel_name}
                        {(v.vessel_name === results.recommended_vessel_name || v.vessel_class === results.recommended_vessel_class) && (
                          <span className="badge badge-success">BEST</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: 4 }}>
                        {v.vessel_class} • {v.operator || 'Fleet Bulk Carrier'}
                      </div>
                    </td>
                    <td>
                      {v.is_feasible ? (
                        <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MdCheckCircle /> Feasible
                        </span>
                      ) : (
                        <span style={{ color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MdCancel /> Rejected
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: v.is_feasible ? 'var(--accent-ocean)' : 'var(--text-muted)' }}>
                      {v.is_feasible ? formatMoney(v.total_landed_cost_usd_per_mt) : '—'}
                    </td>
                    <td style={{ fontSize: 'var(--font-size-sm)' }}>
                      {v.is_feasible ? `${v.estimated_discharge_days}d` : '—'}
                    </td>
                    <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', maxWidth: 200 }}>
                      {v.rejection_reasons?.length > 0
                        ? v.rejection_reasons[0]
                        : v.operational_warnings?.length > 0
                          ? v.operational_warnings[0]
                          : 'All constraints satisfied'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Cost Breakdown Chart ─── */}
          <div className="glass-card chart-container" style={{ padding: 'var(--space-md)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>
              Landed Cost Breakdown ({axisCurrencyPrefix}/MT)
            </h2>
            <Plot
              data={[
                { x: costData.map(d => d.vessel), y: costData.map(d => d.freight), name: 'Freight', type: 'bar', marker: { color: 'hsl(192, 80%, 55%)' } },
                { x: costData.map(d => d.vessel), y: costData.map(d => d.port), name: 'Port Charges', type: 'bar', marker: { color: 'hsl(155, 70%, 45%)' } },
                { x: costData.map(d => d.vessel), y: costData.map(d => d.lighterage), name: 'Lighterage', type: 'bar', marker: { color: 'hsl(35, 95%, 60%)' } },
                { x: costData.map(d => d.vessel), y: costData.map(d => d.demurrage), name: 'Demurrage Risk', type: 'bar', marker: { color: 'hsl(0, 80%, 60%)' } },
              ]}
              layout={{
                barmode: 'stack',
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: { family: 'Inter', color: 'hsl(0, 0%, 55%)', size: 11 },
                margin: { t: 20, r: 20, b: 40, l: 50 },
                xaxis: { gridcolor: 'transparent' },
                yaxis: { gridcolor: 'hsla(0, 0%, 20%, 0.2)', tickprefix: axisCurrencyPrefix, title: '' },
                legend: { orientation: 'h', y: -0.2, font: { size: 10 } },
              }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: 350 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}
