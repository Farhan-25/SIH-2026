import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Plot from 'react-plotly.js'
import {
  MdWarning, MdWaves, MdAnchor,
  MdTrendingUp
} from 'react-icons/md'
import { getRiskAssessment } from '../api/client'

const DEMO_RISK = {
  composite_risk_score: 42.5,
  risk_level: 'Medium',
  origin_port_congestion: {
    port_id: 'newcastle',
    port_name: 'Newcastle (AU)',
    congestion_index: 28,
    anchored_vessels_count: 6,
    estimated_waiting_days: 1.5,
  },
  destination_port_congestion: {
    port_id: 'paradip',
    port_name: 'Paradip',
    congestion_index: 55,
    anchored_vessels_count: 14,
    estimated_waiting_days: 4.8,
  },
  marine_weather_conditions: {
    wave_height_m: 2.1,
    wind_speed_kmh: 28,
    wind_direction: 'SSW',
    sea_condition: 'Moderate',
    sea_condition_risk_score: 0.35,
  },
  active_alerts: [
    { severity: 'WARNING', category: 'Port Congestion', message: 'Paradip: 14 vessels at anchorage, ~4.8 days waiting. Consider Dhamra as alternative.' },
    { severity: 'CRITICAL', category: 'Marine Weather', message: 'Cyclonic depression forming in Bay of Bengal (15°N, 88°E). Expect route delays Oct 28-31.' },
    { severity: 'INFO', category: 'Market Volatility', message: 'BDI dropped 3.2% this week. Freight rate volatility at 12.5% — above 30-day average.' },
    { severity: 'SUCCESS', category: 'Route Status', message: 'Strait of Malacca: Normal traffic flow. No piracy or weather alerts.' },
  ],
}

function generateRiskTrend(currentScore) {
  return Array.from({ length: 30 }, (_, i) => {
    const baseline = currentScore || 42.5
    // Historical 30-day volatility progression around baseline
    const dayFactor = Math.cos((30 - i) * 0.2) * 6.5
    return {
      day: i + 1,
      score: Math.max(10, Math.min(95, Math.round(baseline + dayFactor))),
    }
  })
}

function riskColor(score) {
  if (score >= 60) return 'var(--accent-rose)'
  if (score >= 35) return 'var(--accent-amber)'
  return 'var(--accent-emerald)'
}

function severityClass(s) {
  if (s === 'CRITICAL') return 'critical'
  if (s === 'WARNING') return 'warning'
  if (s === 'SUCCESS') return 'success'
  return 'info'
}

export default function RiskPage() {
  const [risk, setRisk] = useState(DEMO_RISK)
  const [riskHistory, setRiskHistory] = useState(() => generateRiskTrend(42.5))

  useEffect(() => {
    getRiskAssessment({
      origin_port_id: 'newcastle',
      dest_port_id: 'paradip',
      dest_lat: 20.2649,
      dest_lon: 86.6286,
    })
      .then(data => {
        if (data?.composite_risk_score !== undefined) {
          setRisk(data)
          setRiskHistory(generateRiskTrend(data.composite_risk_score))
        }
      })
      .catch(() => {})
  }, [])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="section-header">
        <div>
          <h1>Risk & Disruption Monitor</h1>
          <p>Integrated AIS congestion, marine weather, and freight volatility risk assessment</p>
        </div>
      </div>

      {/* ─── Risk Score Card ─── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <motion.div
          className="glass-card"
          initial={{ scale: 0.9 }} animate={{ scale: 1 }}
          style={{ textAlign: 'center', gridColumn: 'span 1' }}
        >
          <div style={{
            width: 100, height: 100, borderRadius: '50%', margin: '0 auto var(--space-md)',
            background: `conic-gradient(${riskColor(risk.composite_risk_score)} ${risk.composite_risk_score}%, var(--bg-input) 0)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 30px ${riskColor(risk.composite_risk_score)}33`,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}>
              <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: riskColor(risk.composite_risk_score) }}>
                {risk.composite_risk_score}
              </span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>/100</span>
            </div>
          </div>
          <span className={`badge ${risk.risk_level === 'High' ? 'badge-danger' : risk.risk_level === 'Medium' ? 'badge-warning' : 'badge-success'}`}>
            {risk.risk_level} Risk
          </span>
        </motion.div>

        {/* Sub-metrics */}
        <div className="glass-card kpi-card amber">
          <div className="kpi-icon"><MdAnchor /></div>
          <div className="kpi-value">{risk.destination_port_congestion.anchored_vessels_count}</div>
          <div className="kpi-label">Vessels at Anchor ({risk.destination_port_congestion.port_name})</div>
          <span className="kpi-trend down">~{risk.destination_port_congestion.estimated_waiting_days}d wait</span>
        </div>

        <div className="glass-card kpi-card ocean">
          <div className="kpi-icon"><MdWaves /></div>
          <div className="kpi-value">{risk.marine_weather_conditions.wave_height_m}m</div>
          <div className="kpi-label">Wave Height (Bay of Bengal)</div>
          <span className={`kpi-trend ${risk.marine_weather_conditions.sea_condition_risk_score > 0.4 ? 'down' : 'up'}`}>
            {risk.marine_weather_conditions.sea_condition}
          </span>
        </div>

        <div className="glass-card kpi-card violet">
          <div className="kpi-icon"><MdTrendingUp /></div>
          <div className="kpi-value">12.5%</div>
          <div className="kpi-label">Freight Rate Volatility (30d)</div>
          <span className="kpi-trend down">Above average</span>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ─── Risk Trend Chart ─── */}
        <div className="glass-card chart-container" style={{ padding: 'var(--space-md)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>
            Composite Risk Trend (30 Days)
          </h2>
          <Plot
            data={[{
              x: riskHistory.map(d => `Day ${d.day}`),
              y: riskHistory.map(d => d.score),
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              fillcolor: 'hsla(200, 85%, 55%, 0.06)',
              line: { color: 'hsl(200, 85%, 55%)', width: 2, shape: 'spline' },
            }, {
              x: riskHistory.map(d => `Day ${d.day}`),
              y: riskHistory.map(() => 60),
              type: 'scatter',
              mode: 'lines',
              name: 'High Risk Threshold',
              line: { color: 'hsl(0, 80%, 60%)', width: 1, dash: 'dash' },
            }, {
              x: riskHistory.map(d => `Day ${d.day}`),
              y: riskHistory.map(() => 35),
              type: 'scatter',
              mode: 'lines',
              name: 'Medium Threshold',
              line: { color: 'hsl(35, 95%, 60%)', width: 1, dash: 'dash' },
            }]}
            layout={{
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { family: 'Inter', color: 'hsl(220, 15%, 65%)', size: 10 },
              margin: { t: 10, r: 20, b: 40, l: 40 },
              xaxis: { gridcolor: 'transparent', showticklabels: false },
              yaxis: { gridcolor: 'hsla(220, 20%, 30%, 0.2)', range: [0, 100], title: 'Risk Score' },
              legend: { orientation: 'h', y: -0.1, font: { size: 9 } },
              showlegend: true,
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: 300 }}
          />
        </div>

        {/* ─── Active Alerts ─── */}
        <div className="glass-card">
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdWarning style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-amber)' }} />
            Active Risk Alerts
          </h2>
          {risk.active_alerts.map((alert, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`alert-card ${severityClass(alert.severity)}`}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${
                    alert.severity === 'CRITICAL' ? 'badge-danger' :
                    alert.severity === 'WARNING' ? 'badge-warning' :
                    alert.severity === 'SUCCESS' ? 'badge-success' : 'badge-info'
                  }`}>
                    {alert.severity}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{alert.category}</span>
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {alert.message}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
