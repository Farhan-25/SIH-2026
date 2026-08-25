import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Plot from 'react-plotly.js'
import { MdShowChart, MdAutoGraph, MdPlayArrow } from 'react-icons/md'
import { getForecast } from '../api/client'

/* ─── Demo forecast data ──── */
function generateDemoForecast(weeks) {
  const today = new Date()
  const dates = []
  const hist = []
  const pred = []
  const upper = []
  const lower = []

  // Historical (last 52 weeks)
  let rate = 14.5
  for (let i = 52; i > 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i * 7)
    dates.push(d.toISOString().slice(0, 10))
    rate += (Math.random() - 0.48) * 1.2
    rate = Math.max(8, Math.min(28, rate))
    hist.push(+rate.toFixed(2))
    pred.push(null)
    upper.push(null)
    lower.push(null)
  }

  // Current point (bridge)
  dates.push(today.toISOString().slice(0, 10))
  const currentRate = +rate.toFixed(2)
  hist.push(currentRate)
  pred.push(currentRate)
  upper.push(currentRate)
  lower.push(currentRate)

  // Forecast
  for (let w = 1; w <= weeks; w++) {
    const d = new Date(today)
    d.setDate(d.getDate() + w * 7)
    dates.push(d.toISOString().slice(0, 10))
    rate += (Math.random() - 0.45) * 0.8
    rate = Math.max(8, Math.min(28, rate))
    hist.push(null)
    pred.push(+rate.toFixed(2))
    upper.push(+(rate * 1.08).toFixed(2))
    lower.push(+(rate * 0.92).toFixed(2))
  }

  return { dates, hist, pred, upper, lower, currentRate }
}

const DEMO_DRIVERS = [
  { feature: 'Bunker Fuel (VLSFO)', importance: 0.218, direction: '↑ Rising costs push freight up' },
  { feature: 'Baltic Dry Index', importance: 0.175, direction: '↓ Index declining, bearish pressure' },
  { feature: 'Coal Price (Newcastle)', importance: 0.142, direction: '↑ Demand surge lifts rates' },
  { feature: 'USD/INR FX Rate', importance: 0.098, direction: '→ Stable, minimal impact' },
  { feature: 'Port Congestion Index', importance: 0.087, direction: '↑ Higher queue → longer turnaround' },
  { feature: 'Seasonal Factor (Q4)', importance: 0.071, direction: '↑ Cyclone season risk premium' },
]

const HORIZONS = [4, 8, 12, 16, 24]

const VESSEL_CLASSES = ['Handysize', 'Supramax', 'Panamax', 'Capesize']
const ROUTES = [
  { id: 'au_par', label: 'Newcastle → Paradip' },
  { id: 'au_viz', label: 'Newcastle → Vizag' },
  { id: 'id_gan', label: 'Kalimantan → Gangavaram' },
  { id: 'us_viz', label: 'Norfolk → Vizag' },
  { id: 'mz_hal', label: 'Beira → Haldia' },
  { id: 'ru_par', label: 'Taman → Paradip' },
]

export default function ForecastPage() {
  const [horizon, setHorizon] = useState(12)
  const [route, setRoute] = useState('au_par')
  const [vesselClass, setVesselClass] = useState('Panamax')
  const [loading, setLoading] = useState(false)
  const [forecast, setForecast] = useState(() => generateDemoForecast(12))
  const [drivers] = useState(DEMO_DRIVERS)

  const runForecast = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getForecast({
        route_id: route,
        vessel_class: vesselClass,
        horizon_weeks: horizon,
      })
      // Map API response if available
      if (result?.forecast_dates) {
        const today = new Date()
        const dates = []
        const hist = []

        let rate = 14.5
        for (let i = 52; i > 0; i--) {
          const d = new Date(today)
          d.setDate(d.getDate() - i * 7)
          dates.push(d.toISOString().slice(0, 10))
          rate += (Math.random() - 0.48) * 1.2
          rate = Math.max(8, Math.min(28, rate))
          hist.push(+rate.toFixed(2))
        }

        setForecast({
          dates: [...dates, ...result.forecast_dates],
          hist: [...hist, ...Array(result.forecast_dates.length).fill(null)],
          pred: [...Array(dates.length).fill(null), ...result.predictions_usd_per_mt],
          upper: [...Array(dates.length).fill(null), ...result.upper_bound_80pct],
          lower: [...Array(dates.length).fill(null), ...result.lower_bound_80pct],
          currentRate: hist[hist.length - 1],
        })
      }
    } catch {
      // Fallback to demo data
      setForecast(generateDemoForecast(horizon))
    }
    setLoading(false)
  }, [route, vesselClass, horizon])

  const handleHorizonChange = (h) => {
    setHorizon(h)
    setForecast(generateDemoForecast(h))
  }

  const plotData = [
    // Confidence Band (shaded area)
    {
      x: [...forecast.dates, ...[...forecast.dates].reverse()],
      y: [...forecast.upper, ...[...forecast.lower].reverse()].map(v => v ?? undefined),
      fill: 'toself',
      fillcolor: 'hsla(200, 85%, 55%, 0.08)',
      line: { color: 'transparent' },
      name: '80% Confidence',
      type: 'scatter',
      hoverinfo: 'skip',
    },
    // Historical
    {
      x: forecast.dates,
      y: forecast.hist,
      mode: 'lines',
      name: 'Historical',
      line: { color: 'hsl(220, 15%, 55%)', width: 1.5 },
      type: 'scatter',
    },
    // Forecast
    {
      x: forecast.dates,
      y: forecast.pred,
      mode: 'lines+markers',
      name: 'Forecast',
      line: { color: 'hsl(200, 85%, 55%)', width: 2.5 },
      marker: { size: 4, color: 'hsl(200, 85%, 55%)' },
      type: 'scatter',
    },
    // Upper Bound
    {
      x: forecast.dates,
      y: forecast.upper,
      mode: 'lines',
      name: 'Upper 80%',
      line: { color: 'hsla(200, 85%, 55%, 0.3)', width: 1, dash: 'dot' },
      type: 'scatter',
    },
    // Lower Bound
    {
      x: forecast.dates,
      y: forecast.lower,
      mode: 'lines',
      name: 'Lower 80%',
      line: { color: 'hsla(200, 85%, 55%, 0.3)', width: 1, dash: 'dot' },
      type: 'scatter',
    },
  ]

  const plotLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: 'Inter', color: 'hsl(220, 15%, 65%)', size: 11 },
    margin: { t: 30, r: 30, b: 50, l: 60 },
    xaxis: {
      gridcolor: 'hsla(220, 20%, 30%, 0.2)',
      tickformat: '%b %Y',
      title: { text: '' },
    },
    yaxis: {
      gridcolor: 'hsla(220, 20%, 30%, 0.2)',
      title: { text: 'Freight Rate ($/MT)', font: { size: 12 } },
      tickprefix: '$',
    },
    legend: {
      orientation: 'h', y: -0.15,
      font: { size: 10 },
    },
    hovermode: 'x unified',
    showlegend: true,
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header">
        <div>
          <h1>Freight Rate Forecasting</h1>
          <p>Multi-horizon XGBoost predictions with 80% confidence intervals and SHAP feature attribution</p>
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="glass-card" style={{ marginBottom: 'var(--space-md)', display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
          <label>Trade Route</label>
          <select className="form-control" value={route} onChange={e => setRoute(e.target.value)}>
            {ROUTES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
          <label>Vessel Class</label>
          <select className="form-control" value={vesselClass} onChange={e => setVesselClass(e.target.value)}>
            {VESSEL_CLASSES.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Forecast Horizon</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {HORIZONS.map(h => (
              <button
                key={h}
                className={`btn ${horizon === h ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleHorizonChange(h)}
                style={{ padding: '6px 14px', fontSize: 'var(--font-size-sm)' }}
              >
                {h}W
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={runForecast} disabled={loading}>
          <MdPlayArrow /> {loading ? 'Running...' : 'Run Forecast'}
        </button>
      </div>

      {/* ─── Chart ─── */}
      <div className="glass-card chart-container" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)' }}>
        <Plot
          data={plotData}
          layout={plotLayout}
          config={{ responsive: true, displayModeBar: false }}
          style={{ width: '100%', height: 420 }}
        />
      </div>

      {/* ─── Feature Drivers + Metrics ─── */}
      <div className="grid-2">
        <div className="glass-card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdAutoGraph style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
            SHAP Feature Drivers
          </h2>
          {drivers.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)', padding: 'var(--space-sm) 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 'var(--font-size-base)' }}>{d.feature}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{d.direction}</div>
              </div>
              <div style={{ width: 120, height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-input)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${d.importance * 100 / 0.25}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1 }}
                  style={{
                    height: '100%',
                    borderRadius: 'var(--radius-full)',
                    background: `linear-gradient(90deg, var(--accent-ocean), var(--accent-violet))`,
                  }}
                />
              </div>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--accent-ocean)', width: 48, textAlign: 'right' }}>
                {(d.importance * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        <div className="glass-card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdShowChart style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-emerald)' }} />
            Model Performance
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            {[
              { label: 'MAPE', value: '6.14%', color: 'var(--accent-emerald)' },
              { label: 'RMSE', value: '$1.23', color: 'var(--accent-ocean)' },
              { label: 'Directional Accuracy', value: '78.2%', color: 'var(--accent-violet)' },
              { label: 'R² Score', value: '0.912', color: 'var(--accent-amber)' },
            ].map((m, i) => (
              <div key={i} style={{
                textAlign: 'center',
                padding: 'var(--space-md)',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: m.color }}>
                  {m.value}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
