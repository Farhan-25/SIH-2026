import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import Plotly from 'plotly.js-basic-dist'
import createPlotlyComponent from 'react-plotly.js/factory'
const Plot = createPlotlyComponent(Plotly)
import { MdTrendingUp, MdCompareArrows } from 'react-icons/md'
import { getForecast, getRoutes } from '../api/client'
import { usePreferences } from '../context/PreferencesContext'
import { useUserProfile } from '../context/UserProfileContext'

const BASELINE_ROUTES = [
  { id: 'AU_NEW_TO_IN_PRT', label: 'Newcastle (Australia) → Paradip (Thermal Coal)' },
  { id: 'AU_HAY_TO_IN_VTZ', label: 'Hay Point (Australia) → Visakhapatnam (Coking Coal)' },
  { id: 'ID_KLT_TO_IN_DHM', label: 'Kalimantan (Indonesia) → Dhamra (Thermal Coal)' },
  { id: 'US_BAL_TO_IN_GNV', label: 'Baltimore (USA) → Gangavaram (Coking Coal)' },
]

function getSignalInfo(signal) {
  if (!signal) return { label: '—', color: 'var(--text-muted)', icon: '⚪', bgClass: 'wait' }
  const sig = String(signal).toUpperCase()
  if (sig.includes('WAIT')) {
    return { label: sig.replace(/_/g, ' '), color: 'var(--accent-amber)', icon: '🟡', bgClass: 'wait' }
  }
  if (sig.includes('TERM')) {
    return { label: 'ENTER NOW — TERM CONTRACT', color: 'var(--accent-ocean)', icon: '🔵', bgClass: 'enter' }
  }
  if (sig.includes('SPOT')) {
    return { label: 'ENTER NOW — SPOT', color: 'var(--accent-emerald)', icon: '🟢', bgClass: 'enter' }
  }
  return { label: sig.replace(/_/g, ' '), color: 'var(--accent-emerald)', icon: '🟢', bgClass: 'enter' }
}

export default function StrategyPage() {
  const { axisCurrencyPrefix, formatMoney, convertMoney, chartTick, chartGrid } = usePreferences()
  const { filterRoutes } = useUserProfile()
  const [routes, setRoutes] = useState(() => filterRoutes ? filterRoutes(BASELINE_ROUTES) : BASELINE_ROUTES)
  const [route, setRoute] = useState(() => localStorage.getItem('freightiq_active_route') || 'AU_NEW_TO_IN_PRT')
  const [timing, setTiming] = useState(null)
  const [curve, setCurve] = useState([])

  const signalInfo = getSignalInfo(timing?.signal)

  useEffect(() => {
    let isMounted = true
    getRoutes()
      .then((data) => {
        if (!isMounted) return
        const list = Array.isArray(data) ? data : (data?.trade_routes || [])
        if (list.length > 0) {
          const parsed = list.map((r) => ({
            id: r.route_id,
            label: `${r.origin_name || r.origin_port} → ${r.destination_name || r.destination_port} (${r.primary_cargo || 'Bulk'})`,
          }))
          const filtered = filterRoutes ? filterRoutes(parsed) : parsed
          setRoutes(filtered.length > 0 ? filtered : parsed)
        }
      })
      .catch(() => {})
    return () => { isMounted = false }
  }, [filterRoutes])

  useEffect(() => {
    localStorage.setItem('freightiq_active_route', route)
    getForecast({ route_id: route, vessel_class: 'Panamax', horizon_weeks: 24 })
      .then((fcData) => {
        if (!fcData) return
        const preds = fcData.predictions_usd_per_mt || []
        const spot = fcData.latest_actual_rate_usd_per_mt || preds[0] || 0
        const timeData = fcData.market_timing
        const p12w = timeData?.projected_12w_avg_usd_per_mt || (preds[11] ?? spot * 1.05)
        const termRate = timeData?.term_contract_estimated_rate_usd_per_mt || +(spot * 0.98).toFixed(2)

        if (timeData) {
          setTiming({
            signal: timeData.recommended_action || timeData.action || 'ENTER_NOW_SPOT',
            confidence: timeData.confidence_score_pct ?? timeData.confidence_pct ?? null,
            current_spot_rate: spot,
            forward_3m_est: p12w,
            term_contract_rate: termRate,
            savings_usd: timeData.estimated_cost_savings_usd || 0,
            recommendation: timeData.detailed_strategy || timeData.strategy_recommendation || timeData.headline || '',
          })
        }

        const dynamicCurve = [{ label: 'Spot', rate: spot }]
        if (preds[3]) dynamicCurve.push({ label: '4W', rate: preds[3] })
        if (preds[7]) dynamicCurve.push({ label: '8W', rate: preds[7] })
        if (preds[11]) dynamicCurve.push({ label: '12W', rate: preds[11] })
        if (preds[15]) dynamicCurve.push({ label: '16W', rate: preds[15] })
        if (preds[23]) dynamicCurve.push({ label: '24W', rate: preds[23] })
        setCurve(dynamicCurve)
      })
      .catch((err) => console.error('Strategy load error:', err))
  }, [route])

  // Dynamically compute contract comparisons without redundancy
  const contractComparison = useMemo(() => {
    const spot = timing?.current_spot_rate || 0
    const f3m = timing?.forward_3m_est || 0
    const term = timing?.term_contract_rate || +(spot * 0.98).toFixed(2)
    const wait4w = +(spot * 1.04).toFixed(2)
    const vol = 75000
    const sig = timing?.signal || ''

    return [
      {
        strategy: 'Spot Charter (Immediate)',
        rate: spot,
        total_cost: spot * vol,
        risk: 'Low (rate locked)',
        recommendation: Boolean(sig.includes('SPOT')),
      },
      {
        strategy: 'Short-Term COA (3 months)',
        rate: f3m,
        total_cost: f3m * vol,
        risk: 'Medium (fixed term)',
        recommendation: false,
      },
      {
        strategy: 'Medium-Term Period Contract (COA)',
        rate: term,
        total_cost: term * vol,
        risk: 'Low (hedged)',
        recommendation: Boolean(sig.includes('TERM')),
      },
      {
        strategy: sig.includes('WAIT') ? sig.replace(/_/g, ' ') : 'Wait for Softening Window',
        rate: sig.includes('WAIT') ? Math.min(spot, f3m) : wait4w,
        total_cost: (sig.includes('WAIT') ? Math.min(spot, f3m) : wait4w) * vol,
        risk: 'Market Softening / Capture Dip',
        recommendation: Boolean(sig.includes('WAIT')),
      },
    ]
  }, [timing])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1>Market Timing & Strategy</h1>
          <p>Spot vs Term contract evaluation with forward freight curve analysis and actionable procurement signals</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trade Corridor:</label>
          <select
            className="input-select"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 500,
              minWidth: 260
            }}
          >
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Signal Card ─── */}
      <motion.div
        className="glass-card signal-card"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        style={{
          marginBottom: 'var(--space-md)',
          background: 'linear-gradient(135deg, hsla(155, 70%, 45%, 0.06), hsla(200, 85%, 55%, 0.06))',
          border: `1px solid ${signalInfo.color}33`,
        }}
      >
        <div className={`signal-indicator ${signalInfo.bgClass}`}>
          <span style={{ fontSize: '2.5rem' }}>{signalInfo.icon}</span>
        </div>
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: signalInfo.color, marginBottom: 4 }}>
          {signalInfo.label}
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
          {timing?.recommendation || 'Evaluating market entry timing and charter commitments...'}
        </div>
        <div style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'center', gap: 'var(--space-xl)' }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confidence</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-ocean)' }}>
              {timing?.confidence != null ? `${Number(timing.confidence).toFixed(0)}%` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Spot</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-emerald)' }}>
              {timing?.current_spot_rate ? formatMoney(timing.current_spot_rate, { suffix: '/MT' }) : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>3M Forward</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-amber)' }}>
              {timing?.forward_3m_est ? formatMoney(timing.forward_3m_est, { suffix: '/MT' }) : '—'}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ─── Forward Freight Curve ─── */}
        <div className="glass-card chart-container" style={{ padding: 'var(--space-md)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>
            <MdTrendingUp style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
            Forward Freight Curve
          </h2>
          <Plot
            data={[{
              x: curve.map(c => c.label),
              y: curve.map(c => convertMoney(c.rate)),
              type: 'scatter',
              mode: 'lines+markers',
              line: { color: 'hsl(200, 85%, 55%)', width: 2.5, shape: 'spline' },
              marker: { size: 8, color: 'hsl(200, 85%, 55%)', line: { color: 'white', width: 1.5 } },
              fill: 'tozeroy',
              fillcolor: 'hsla(200, 85%, 55%, 0.06)',
            }, {
              x: curve.map(c => c.label),
              y: curve.map(() => convertMoney(timing?.current_spot_rate || (curve[0]?.rate ?? 0))),
              type: 'scatter',
              mode: 'lines',
              name: 'Spot Rate',
              line: { color: 'hsl(155, 70%, 45%)', width: 1.5, dash: 'dash' },
            }]}
            layout={{
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { family: 'Inter', color: chartTick, size: 11 },
              margin: { t: 20, r: 20, b: 40, l: 50 },
              xaxis: { gridcolor: 'transparent', title: 'Forward Tenor' },
              yaxis: { gridcolor: chartGrid, tickprefix: axisCurrencyPrefix, title: `${axisCurrencyPrefix}/MT` },
              legend: { orientation: 'h', y: -0.2, font: { size: 10 } },
              showlegend: true,
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: 320 }}
          />
        </div>

        {/* ─── Strategy Comparison Table ─── */}
        <div className="glass-card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdCompareArrows style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent)' }} />
            Strategy Comparison (75,000 MT)
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Rate</th>
                <th>Total Cost</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {contractComparison.map((c, i) => (
                <tr key={i} style={{
                  background: c.recommendation ? 'hsla(155, 70%, 45%, 0.06)' : 'transparent',
                }}>
                  <td style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>
                    {c.strategy}
                    {c.recommendation && <span className="badge badge-success" style={{ marginLeft: 8 }}>BEST</span>}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-ocean)' }}>{formatMoney(c.rate, { suffix: '/MT' })}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)' }}>
                    {formatMoney(c.total_cost, { compact: true, decimals: 1 })}
                  </td>
                  <td>
                    <span className={`badge ${
                      c.risk.startsWith('Low') ? 'badge-success' :
                      c.risk.startsWith('Medium') ? 'badge-warning' : 'badge-danger'
                    }`} style={{ textTransform: 'none' }}>
                      {c.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
              💡 Key Insight
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {timing?.savings_usd > 0 ? (
                <>
                  Optimal strategy projects estimated cost savings of <strong style={{ color: 'var(--accent-emerald)' }}>{formatMoney(timing.savings_usd, { decimals: 0 })}</strong> across parcel commitment.
                </>
              ) : (
                <>
                  Current spot rate of <strong style={{ color: 'var(--accent-emerald)' }}>{timing?.current_spot_rate ? formatMoney(timing.current_spot_rate, { suffix: '/MT' }) : '—'}</strong> offers balanced market entry without forward commitment premium.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
