import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Plot from 'react-plotly.js'
import {
  MdTrendingUp, MdCompareArrows, MdPlayArrow,
  MdTimer, MdLock
} from 'react-icons/md'
import { getMarketTiming } from '../api/client'

const DEMO_TIMING = {
  signal: 'ENTER_NOW_SPOT',
  confidence: 82,
  current_spot_rate: 14.82,
  forward_3m_est: 16.10,
  forward_6m_est: 15.40,
  recommendation: 'Current spot rates are near 8-week lows. XGBoost forecast projects +8.6% upward movement over the next 12 weeks. Immediate spot chartering is recommended to lock in current favorable rates before anticipated Q4 cyclone-season risk premium increases.',
  contract_comparison: [
    {
      strategy: 'Spot Charter (Immediate)',
      rate: 14.82,
      total_cost_75k: 1111500,
      risk: 'Low (rate locked)',
      flexibility: 'High (single voyage)',
      recommendation: true,
    },
    {
      strategy: 'Short-Term COA (3 months)',
      rate: 15.40,
      total_cost_75k: 1155000,
      risk: 'Medium (fixed term)',
      flexibility: 'Medium (3 voyages)',
      recommendation: false,
    },
    {
      strategy: 'Medium-Term Period Charter (6 months)',
      rate: 14.95,
      total_cost_75k: 1121250,
      risk: 'Low (hedged)',
      flexibility: 'Low (committed)',
      recommendation: false,
    },
    {
      strategy: 'Wait 4 Weeks',
      rate: 15.60,
      total_cost_75k: 1170000,
      risk: 'High (market uncertainty)',
      flexibility: 'High (uncommitted)',
      recommendation: false,
    },
  ],
}

const SIGNAL_CONFIG = {
  ENTER_NOW_SPOT: { label: 'ENTER NOW — SPOT', color: 'var(--accent-emerald)', icon: '🟢', bgClass: 'enter' },
  ENTER_NOW_TERM: { label: 'ENTER NOW — TERM CONTRACT', color: 'var(--accent-ocean)', icon: '🔵', bgClass: 'enter' },
  WAIT_4W: { label: 'WAIT 4 WEEKS', color: 'var(--accent-amber)', icon: '🟡', bgClass: 'wait' },
  DEFER: { label: 'DEFER / EXIT', color: 'var(--accent-rose)', icon: '🔴', bgClass: 'exit' },
}

/* Rate curve data for chart */
const generateRateCurve = () => {
  const points = []
  const labels = ['Spot', '1M', '2M', '3M', '4M', '5M', '6M', '9M', '12M']
  const rates = [14.82, 15.10, 15.45, 16.10, 15.80, 15.60, 15.40, 15.20, 15.00]
  labels.forEach((l, i) => points.push({ label: l, rate: rates[i] }))
  return points
}

export default function StrategyPage() {
  const [timing, setTiming] = useState(DEMO_TIMING)
  const signalInfo = SIGNAL_CONFIG[timing.signal] || SIGNAL_CONFIG.ENTER_NOW_SPOT
  const curve = generateRateCurve()

  useEffect(() => {
    getMarketTiming({
      current_spot_rate: 14.82,
      vessel_class: 'Panamax',
      target_volume_mt: 75000,
    })
      .then(data => {
        if (data?.signal) setTiming(prev => ({ ...prev, ...data }))
      })
      .catch(() => {})
  }, [])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header">
        <div>
          <h1>Market Timing & Strategy</h1>
          <p>Spot vs Term contract evaluation with forward freight curve analysis and actionable procurement signals</p>
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
          {timing.recommendation}
        </div>
        <div style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'center', gap: 'var(--space-xl)' }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confidence</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-ocean)' }}>{timing.confidence}%</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Spot</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-emerald)' }}>${timing.current_spot_rate}/MT</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>3M Forward</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-amber)' }}>${timing.forward_3m_est}/MT</div>
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
              y: curve.map(c => c.rate),
              type: 'scatter',
              mode: 'lines+markers',
              line: { color: 'hsl(200, 85%, 55%)', width: 2.5, shape: 'spline' },
              marker: { size: 8, color: 'hsl(200, 85%, 55%)', line: { color: 'white', width: 1.5 } },
              fill: 'tozeroy',
              fillcolor: 'hsla(200, 85%, 55%, 0.06)',
            }, {
              x: curve.map(c => c.label),
              y: curve.map(() => timing.current_spot_rate),
              type: 'scatter',
              mode: 'lines',
              name: 'Spot Rate',
              line: { color: 'hsl(155, 70%, 45%)', width: 1.5, dash: 'dash' },
            }]}
            layout={{
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { family: 'Inter', color: 'hsl(220, 15%, 65%)', size: 11 },
              margin: { t: 20, r: 20, b: 40, l: 50 },
              xaxis: { gridcolor: 'transparent', title: 'Forward Tenor' },
              yaxis: { gridcolor: 'hsla(220, 20%, 30%, 0.2)', tickprefix: '$', title: '$/MT' },
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
            <MdCompareArrows style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-violet)' }} />
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
              {timing.contract_comparison.map((c, i) => (
                <tr key={i} style={{
                  background: c.recommendation ? 'hsla(155, 70%, 45%, 0.06)' : 'transparent',
                }}>
                  <td style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>
                    {c.strategy}
                    {c.recommendation && <span className="badge badge-success" style={{ marginLeft: 8 }}>BEST</span>}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-ocean)' }}>${c.rate}/MT</td>
                  <td style={{ fontSize: 'var(--font-size-sm)' }}>
                    ${(c.total_cost_75k / 1000).toFixed(0)}K
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
              Spot chartering saves <strong style={{ color: 'var(--accent-emerald)' }}>$58,500</strong> vs waiting 4 weeks.
              Forward curve is in <strong>contango</strong> — rates expected to rise. Lock in now.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
