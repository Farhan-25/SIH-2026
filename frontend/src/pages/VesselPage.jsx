import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import Plot from 'react-plotly.js'
import {
  MdDirectionsBoat, MdCheckCircle, MdCancel,
  MdWarning, MdPlayArrow
} from 'react-icons/md'
import { getVesselRecommendation } from '../api/client'
import { usePreferences } from '../context/PreferencesContext'

const ORIGINS = [
  { id: 'newcastle', label: 'Newcastle (AU)' },
  { id: 'hay_point', label: 'Hay Point (AU)' },
  { id: 'gladstone', label: 'Gladstone (AU)' },
  { id: 'norfolk', label: 'Norfolk (US)' },
  { id: 'kalimantan', label: 'Kalimantan (ID)' },
  { id: 'beira', label: 'Beira (MZ)' },
  { id: 'taman', label: 'Taman (RU)' },
]

const DESTINATIONS = [
  { id: 'paradip', label: 'Paradip' },
  { id: 'vizag', label: 'Visakhapatnam (Vizag)' },
  { id: 'gangavaram', label: 'Gangavaram' },
  { id: 'gopalpur', label: 'Gopalpur' },
  { id: 'dhamra', label: 'Dhamra' },
  { id: 'haldia', label: 'Haldia' },
  { id: 'sagar_sandheads', label: 'Sagar / Sandheads' },
]

const DEMO_RESULTS = {
  recommended_vessel_name: 'MV Pacific Harmony',
  recommended_vessel_class: 'Panamax',
  recommended_total_cost_usd_per_mt: 16.42,
  all_vessel_evaluations: [
    {
      vessel_name: 'MV Atlantic Runner', vessel_class: 'Handysize', operator: 'Pacific Basin', is_feasible: true, intake_capacity_mt: 35000,
      total_landed_cost_usd_per_mt: 26.80, base_freight_usd_per_mt: 24.50,
      port_charges_usd_per_mt: 1.10, lighterage_cost_usd_per_mt: 0,
      demurrage_risk_usd_per_mt: 0.85, rejection_reasons: [],
      operational_warnings: ['Cargo parcel (75,000 MT) under-utilizes Handysize capacity (35,000 MT).'],
      estimated_discharge_days: 2.1,
    },
    {
      vessel_name: 'MV Star Horizon', vessel_class: 'Supramax', operator: 'Star Bulk', is_feasible: true, intake_capacity_mt: 58000,
      total_landed_cost_usd_per_mt: 21.20, base_freight_usd_per_mt: 20.50,
      port_charges_usd_per_mt: 0.42, lighterage_cost_usd_per_mt: 0,
      demurrage_risk_usd_per_mt: 0.28, rejection_reasons: [],
      operational_warnings: [],
      estimated_discharge_days: 3.5,
    },
    {
      vessel_name: 'MV Pacific Harmony', vessel_class: 'Panamax', operator: 'Diana Shipping', is_feasible: true, intake_capacity_mt: 75000,
      total_landed_cost_usd_per_mt: 16.42, base_freight_usd_per_mt: 16.50,
      port_charges_usd_per_mt: 0.25, lighterage_cost_usd_per_mt: 0,
      demurrage_risk_usd_per_mt: 0.12, rejection_reasons: [],
      operational_warnings: [],
      estimated_discharge_days: 4.5,
    },
    {
      vessel_name: 'MV Berge Everest', vessel_class: 'Capesize', operator: 'Berge Bulk', is_feasible: false, intake_capacity_mt: 180000,
      total_landed_cost_usd_per_mt: null, base_freight_usd_per_mt: 12.80,
      port_charges_usd_per_mt: 0.18, lighterage_cost_usd_per_mt: 0,
      demurrage_risk_usd_per_mt: 0, rejection_reasons: ['Draft 18.2m exceeds Paradip max draft (14.5m)'],
      operational_warnings: [],
      estimated_discharge_days: 0,
    },
  ],
}

export default function VesselPage() {
  const { axisCurrencyPrefix, formatMoney, convertMoney } = usePreferences()
  const [origin, setOrigin] = useState('newcastle')
  const [dest, setDest] = useState('paradip')
  const [cargo, setCargo] = useState('75000')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(DEMO_RESULTS)

  const runOptimization = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getVesselRecommendation({
        cargo_parcel_mt: parseFloat(cargo),
        origin_port_id: origin,
        dest_port_id: dest,
      })
      if (data?.all_vessel_evaluations) setResults(data)
    } catch {
      setResults(DEMO_RESULTS)
    }
    setLoading(false)
  }, [origin, dest, cargo])

  useEffect(() => {
    runOptimization()
  }, [runOptimization])

  const feasible = results.all_vessel_evaluations.filter(v => v.is_feasible)
    .sort((a, b) => a.total_landed_cost_usd_per_mt - b.total_landed_cost_usd_per_mt)
  const infeasible = results.all_vessel_evaluations.filter(v => !v.is_feasible)

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
          <p>Physical constraint evaluation and landed cost ranking for specific active bulk carriers</p>
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="glass-card" style={{ marginBottom: 'var(--space-md)', display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label>Origin Port</label>
          <select className="form-control" value={origin} onChange={e => setOrigin(e.target.value)}>
            {ORIGINS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label>Destination Port</label>
          <select className="form-control" value={dest} onChange={e => setDest(e.target.value)}>
            {DESTINATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
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
          />
        </div>
        <button className="btn btn-primary" onClick={runOptimization} disabled={loading}>
          <MdPlayArrow /> {loading ? 'Optimizing...' : 'Optimize'}
        </button>
      </div>

      {/* ─── Recommendation Banner ─── */}
      {(results.recommended_vessel_name || results.recommended_vessel_class) && (
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
                      {v.vessel_class} • {v.operator || 'Unknown Operator'}
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
                    {v.rejection_reasons.length > 0
                      ? v.rejection_reasons[0]
                      : v.operational_warnings.length > 0
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
    </motion.div>
  )
}


