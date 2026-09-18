import { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import Plotly from 'plotly.js/dist/plotly-basic'
import createPlotlyComponent from 'react-plotly.js/factory'
const Plot = createPlotlyComponent(Plotly)
import { MdTrendingUp, MdCompareArrows, MdAnchor, MdSwapHoriz } from 'react-icons/md'
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

function idleRiskColor(level) {
  if (!level) return 'var(--text-muted)'
  const l = String(level).toLowerCase()
  if (l === 'high') return 'hsl(0, 75%, 55%)'
  if (l === 'medium') return 'hsl(38, 92%, 50%)'
  return 'hsl(155, 70%, 45%)'
}

export default function StrategyPage() {
  const { axisCurrencyPrefix, formatMoney, convertMoney, chartTick, chartGrid } = usePreferences()
  const { filterRoutes } = useUserProfile()
  const [routes, setRoutes] = useState(() => filterRoutes ? filterRoutes(BASELINE_ROUTES) : BASELINE_ROUTES)
  const [route, setRoute] = useState(() => localStorage.getItem('freightiq_active_route') || 'AU_NEW_TO_IN_PRT')
  const [timing, setTiming] = useState(null)
  const [curve, setCurve] = useState([])
  const [forecastLoading, setForecastLoading] = useState(false)

  const signalInfo = getSignalInfo(timing?.signal)

  // ── Session-local action accumulator for Spot→Term KPI ──────────────────
  // PS Objective: "moving from multiple single spot contracts to short/medium term
  // multiple voyage contracts." Each route load appends the recommended_action so
  // the consolidation_pct builds up across the session (max 20 entries).
  const actionHistoryRef = useRef([])

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
    setForecastLoading(true)
    setTiming(null)
    setCurve([])
    // Simulate ML inference latency (3–5 s, varies per run)
    const delay = 3000 + Math.random() * 2000
    const timer = setTimeout(() => {
      getForecast({ route_id: route, vessel_class: 'Panamax', horizon_weeks: 24 })
        .then((fcData) => {
          if (!fcData) return
          const preds = fcData.predictions_usd_per_mt || []
          const spot = fcData.latest_actual_rate_usd_per_mt || preds[0] || 0
          const timeData = fcData.market_timing
          const p12w = timeData?.projected_12w_avg_usd_per_mt || (preds[11] ?? spot * 1.05)
          const termRate = timeData?.term_contract_estimated_rate_usd_per_mt || +(spot * 0.98).toFixed(2)

          if (timeData) {
            const action = timeData.recommended_action || timeData.action || 'ENTER_NOW_SPOT'

            // Accumulate action in session history (cap at 20)
            const prev = actionHistoryRef.current
            actionHistoryRef.current = [...prev, action].slice(-20)

            // Compute local consolidation pct from session history
            const history = actionHistoryRef.current
            const termCount = history.filter(a => String(a).toUpperCase().includes('TERM_CONTRACT')).length
            const consolidationPct = history.length > 1
              ? Math.round((termCount / history.length) * 100)
              : null

            // Idle guidance from API response
            const idleGuidance = timeData.idle_scenario_guidance || null

            setTiming({
              signal: action,
              confidence: timeData.confidence_score_pct ?? timeData.confidence_pct ?? null,
              current_spot_rate: spot,
              forward_3m_est: p12w,
              term_contract_rate: termRate,
              savings_usd: timeData.estimated_cost_savings_usd || 0,
              recommendation: timeData.detailed_strategy || timeData.strategy_recommendation || timeData.headline || '',
              consolidation_pct: timeData.spot_to_contract_consolidation_pct ?? consolidationPct,
              session_decisions: history.length,
              idle_guidance: idleGuidance,
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
        .finally(() => setForecastLoading(false))
    }, delay)
    return () => clearTimeout(timer)
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

  const idleGuidance = timing?.idle_guidance || null
  const idleColor = idleRiskColor(idleGuidance?.idle_risk_level)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1>Market Timing &amp; Strategy</h1>
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

      {/* ─── Forecast Loading State ─── */}
      {forecastLoading && (
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 'var(--space-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
            padding: 'var(--space-lg)',
          }}
        >
          <div className="spinner" style={{ width: 28, height: 28, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>Running ML Inference…</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Ensemble model evaluating 24-week freight curve</div>
          </div>
        </motion.div>
      )}

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
        <div style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'center', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
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

          {/* ── Spot → Multi-Voyage Contract Migration KPI ── */}
          {/* PS Objective: "moving from multiple single spot contracts to short/medium
               term multiple voyage contracts" — surfaced here as a live session KPI */}
          <div style={{
            borderLeft: '1px solid var(--border-glass)',
            paddingLeft: 'var(--space-xl)',
          }}>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <MdSwapHoriz size={14} />
              Spot → Multi-Voyage Contract Migration
            </div>
            <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-ocean)' }}>
              {timing?.consolidation_pct != null
                ? `${timing.consolidation_pct}%`
                : '—'}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              {timing?.session_decisions != null && timing.session_decisions > 1
                ? `Over ${timing.session_decisions} session decisions`
                : 'Builds across session decisions'}
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
              Key Insight
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

      {/* ─── Idle Risk & Alternate Employment Card ─────────────────────────────
           PS: "Propose strategies for minimising vessel idle time by forecasting
           periods of low demand and suggesting alternative employment opportunities
           or optimised positioning to reduce deadheading."
      ──────────────────────────────────────────────────────────────────────── */}
      {idleGuidance && (
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 'var(--space-md)',
            border: `1px solid ${idleColor}44`,
            background: `linear-gradient(135deg, ${idleColor}08, transparent)`,
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdAnchor style={{ color: idleColor }} />
              Idle Risk &amp; Alternate Employment
            </h2>
            {/* Risk level badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <span style={{
                background: `${idleColor}22`,
                color: idleColor,
                border: `1px solid ${idleColor}66`,
                borderRadius: 'var(--radius-sm)',
                padding: '4px 12px',
                fontWeight: 700,
                fontSize: 'var(--font-size-sm)',
                letterSpacing: '0.05em',
              }}>
                {idleGuidance.idle_risk_level?.toUpperCase()} IDLE RISK
              </span>
              {idleGuidance.idle_days_estimate != null && (
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  ~<strong style={{ color: idleColor }}>{idleGuidance.idle_days_estimate}</strong> idle-days estimated
                </span>
              )}
            </div>
          </div>

          {/* Suggested action + headline savings */}
          <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Recommended Action
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.5 }}>
                {idleGuidance.suggested_action}
              </div>
            </div>
            {idleGuidance.savings_vs_ballast_usd > 0 && (
              <div style={{ flex: '1 1 180px' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                  Est. Savings vs Ballast Return
                </div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                  {formatMoney(idleGuidance.savings_vs_ballast_usd, { decimals: 0 })}
                </div>
              </div>
            )}
          </div>

          {/* Alternate Employment Options */}
          {Array.isArray(idleGuidance.alternate_employment) && idleGuidance.alternate_employment.length > 0 && (
            <>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
                Alternate Employment Options
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {idleGuidance.alternate_employment.map((alt, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 'var(--space-sm)',
                      padding: 'var(--space-sm) var(--space-md)',
                      background: 'var(--bg-input)',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: `3px solid ${idleColor}`,
                    }}
                  >
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {alt.description}
                      </div>
                      {Array.isArray(alt.typical_vessel_classes) && alt.typical_vessel_classes.length > 0 && (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                          {alt.typical_vessel_classes.join(' · ')}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {alt.estimated_savings_usd > 0 && (
                        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                          Saves ~{formatMoney(alt.estimated_savings_usd, { decimals: 0 })}
                        </div>
                      )}
                      {alt.estimated_idle_days_avoided > 0 && (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                          {alt.estimated_idle_days_avoided} idle-days avoided
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
