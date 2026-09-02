import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import Plot from 'react-plotly.js'
import { MdTrendingUp, MdCompareArrows } from 'react-icons/md'
import { getMarketTiming, getForecast } from '../api/client'
import { usePreferences } from '../context/PreferencesContext'
import { useUserProfile } from '../context/UserProfileContext'

const SIGNAL_CONFIG = {
  ENTER_NOW_SPOT: { label: 'ENTER NOW — SPOT', color: 'var(--accent-emerald)', icon: '🟢', bgClass: 'enter' },
  ENTER_NOW_TERM_CONTRACT: { label: 'ENTER NOW — TERM CONTRACT', color: 'var(--accent-ocean)', icon: '🔵', bgClass: 'enter' },
  ENTER_NOW_TERM: { label: 'ENTER NOW — TERM CONTRACT', color: 'var(--accent-ocean)', icon: '🔵', bgClass: 'enter' },
  WAIT_4W: { label: 'WAIT 4 WEEKS', color: 'var(--accent-amber)', icon: '🟡', bgClass: 'wait' },
  DEFER: { label: 'DEFER / EXIT', color: 'var(--accent-rose)', icon: '🔴', bgClass: 'exit' },
}

const DEFAULT_TIMING = {
  signal: 'ENTER_NOW_SPOT',
  confidence: 82,
  current_spot_rate: 14.82,
  forward_3m_est: 16.10,
  term_contract_rate: 15.20,
  savings_usd: 58500,
  recommendation: 'Current spot rates are near 8-week lows. Forward forecasts project upward momentum over the next 12 weeks. Immediate spot chartering is recommended before freight rate adjustments.',
}

export default function StrategyPage() {
  const { axisCurrencyPrefix, formatMoney, convertMoney } = usePreferences()
  const { selectedRoutes } = useUserProfile()
  const defaultRoute = selectedRoutes.length > 0 ? selectedRoutes[0] : 'AU_NEW_TO_IN_PRT'
  const [timing, setTiming] = useState(DEFAULT_TIMING)
  const [curve, setCurve] = useState([])

  const signalInfo = SIGNAL_CONFIG[timing.signal] || SIGNAL_CONFIG.ENTER_NOW_SPOT

  useEffect(() => {
    Promise.all([
      getMarketTiming({ current_spot_rate: 0, vessel_class: 'Panamax', target_volume_mt: 75000 }),
      getForecast({ route_id: defaultRoute, vessel_class: 'Panamax', horizon_weeks: 24 })
    ])
      .then(([timeData, fcData]) => {
        if (timeData) {
          const spot = timeData.current_spot_usd_per_mt || 0
          const p12w = timeData.projected_12w_avg_usd_per_mt || spot * 1.05
          const termRate = timeData.term_contract_estimated_rate_usd_per_mt || spot * 0.98

          setTiming({
            signal: timeData.recommended_action || 'ENTER_NOW_SPOT',
            confidence: timeData.confidence_score_pct ?? null,
            current_spot_rate: spot,
            forward_3m_est: p12w,
            term_contract_rate: termRate,
            savings_usd: timeData.estimated_cost_savings_usd || 0,
            recommendation: timeData.detailed_strategy || timeData.headline || DEFAULT_TIMING.recommendation,
          })
        }

        if (fcData?.predictions_usd_per_mt) {
          const preds = fcData.predictions_usd_per_mt
          const spot = fcData.latest_actual_rate_usd_per_mt || preds[0] || 0
          const dynamicCurve = [{ label: 'Spot', rate: spot }]
          if (preds[3]) dynamicCurve.push({ label: '4W', rate: preds[3] })
          if (preds[7]) dynamicCurve.push({ label: '8W', rate: preds[7] })
          if (preds[11]) dynamicCurve.push({ label: '12W', rate: preds[11] })
          if (preds[15]) dynamicCurve.push({ label: '16W', rate: preds[15] })
          if (preds[23]) dynamicCurve.push({ label: '24W', rate: preds[23] })
          setCurve(dynamicCurve)
        }
      })
      .catch(() => {})
  }, [])

  // Dynamically compute contract comparisons without redundancy
  const contractComparison = useMemo(() => {
    const spot = timing.current_spot_rate
    const f3m = timing.forward_3m_est
    const term = timing.term_contract_rate || +(spot * 0.98).toFixed(2)
    const wait4w = +(spot * 1.04).toFixed(2)
    const vol = 75000

    return [
      {
        strategy: 'Spot Charter (Immediate)',
        rate: spot,
        total_cost: spot * vol,
        risk: 'Low (rate locked)',
        recommendation: timing.signal.includes('SPOT'),
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
        recommendation: timing.signal.includes('TERM'),
      },
      {
        strategy: 'Wait 4 Weeks',
        rate: wait4w,
        total_cost: wait4w * vol,
        risk: 'High (market uncertainty)',
        recommendation: timing.signal.includes('WAIT'),
      },
    ]
  }, [timing])

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
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatMoney(timing.current_spot_rate, { suffix: '/MT' })}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>3M Forward</div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-amber)' }}>{formatMoney(timing.forward_3m_est, { suffix: '/MT' })}</div>
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
              y: curve.map(() => convertMoney(timing.current_spot_rate)),
              type: 'scatter',
              mode: 'lines',
              name: 'Spot Rate',
              line: { color: 'hsl(155, 70%, 45%)', width: 1.5, dash: 'dash' },
            }]}
            layout={{
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { family: 'Inter', color: 'hsl(0, 0%, 55%)', size: 11 },
              margin: { t: 20, r: 20, b: 40, l: 50 },
              xaxis: { gridcolor: 'transparent', title: 'Forward Tenor' },
              yaxis: { gridcolor: 'hsla(0, 0%, 20%, 0.2)', tickprefix: axisCurrencyPrefix, title: `${axisCurrencyPrefix}/MT` },
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
              {timing.savings_usd > 0 ? (
                <>
                  Optimal strategy projects estimated cost savings of <strong style={{ color: 'var(--accent-emerald)' }}>{formatMoney(timing.savings_usd, { decimals: 0 })}</strong> across parcel commitment.
                </>
              ) : (
                <>
                  Current spot rate of <strong style={{ color: 'var(--accent-emerald)' }}>{formatMoney(timing.current_spot_rate, { suffix: '/MT' })}</strong> offers balanced market entry without forward commitment premium.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
