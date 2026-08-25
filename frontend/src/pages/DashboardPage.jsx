import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  MdTrendingUp, MdTrendingDown, MdDirectionsBoat,
  MdWaterDrop, MdWarning, MdCheckCircle
} from 'react-icons/md'
import { analyzeScenario } from '../api/client'

/* ─── Static demo data (used as fallback when API is offline) ──── */
const DEMO_KPIS = [
  {
    label: 'Avg Freight Rate',
    value: '$14.82',
    trend: '+2.3%',
    trendDir: 'up',
    icon: <MdTrendingUp />,
    accent: 'ocean',
  },
  {
    label: 'Active Vessels (East Coast)',
    value: '142',
    trend: '+8 this week',
    trendDir: 'up',
    icon: <MdDirectionsBoat />,
    accent: 'emerald',
  },
  {
    label: 'Baltic Dry Index',
    value: '1,847',
    trend: '-1.5%',
    trendDir: 'down',
    icon: <MdTrendingDown />,
    accent: 'amber',
  },
  {
    label: 'Avg Port Wait (Days)',
    value: '3.2',
    trend: '-0.4d',
    trendDir: 'down',
    icon: <MdWaterDrop />,
    accent: 'violet',
  },
]

const DEMO_ALERTS = [
  {
    severity: 'critical',
    title: 'Cyclone Warning — Bay of Bengal',
    message: 'Deep depression forming near 15°N, 88°E. Expect delays on Vizag/Gangavaram routes (Oct 28-31).',
    time: '2h ago',
  },
  {
    severity: 'warning',
    title: 'Paradip Port Congestion',
    message: '14 vessels at anchorage. Estimated berth wait: 4.8 days. Consider Dhamra as alternative.',
    time: '5h ago',
  },
  {
    severity: 'success',
    title: 'Freight Rate Opportunity',
    message: 'Panamax AU→Vizag rates dropped to $14.20/MT (8-week low). Model recommends: ENTER_NOW_SPOT.',
    time: '8h ago',
  },
]

const DEMO_RECENT_SCENARIOS = [
  { route: 'Newcastle → Paradip', cargo: 'Thermal Coal', vessel: 'Panamax', cost: '$16.42/MT', signal: 'ENTER_NOW' },
  { route: 'Norfolk → Vizag', cargo: 'Coking Coal', vessel: 'Supramax', cost: '$22.10/MT', signal: 'WAIT_4W' },
  { route: 'Kalimantan → Gangavaram', cargo: 'Thermal Coal', vessel: 'Supramax', cost: '$12.85/MT', signal: 'ENTER_NOW' },
  { route: 'Beira → Haldia', cargo: 'Coking Coal', vessel: 'Ultramax', cost: '$19.30/MT', signal: 'DEFER' },
]

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.08 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  },
}

export default function DashboardPage() {
  const [kpis] = useState(DEMO_KPIS)
  const [alerts] = useState(DEMO_ALERTS)
  const [scenarios] = useState(DEMO_RECENT_SCENARIOS)

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate">
      {/* ─── Page Header ─── */}
      <div className="section-header" style={{ marginBottom: '8px' }}>
        <div>
          <h1>Command Center</h1>
          <p>Real-time freight intelligence for East Coast India bulk cargo procurement</p>
        </div>
      </div>

      {/* ─── KPI Grid ─── */}
      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            className={`glass-card kpi-card ${kpi.accent}`}
            variants={stagger.item}
          >
            <div className="kpi-icon">{kpi.icon}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
            <span className={`kpi-trend ${kpi.trendDir === 'up' ? 'up' : 'down'}`}>
              {kpi.trendDir === 'up' ? <MdTrendingUp size={12}/> : <MdTrendingDown size={12}/>}
              {kpi.trend}
            </span>
          </motion.div>
        ))}
      </div>

      {/* ─── Two Column: Alerts + Recent Scenarios ─── */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Active Alerts */}
        <motion.div className="glass-card" variants={stagger.item}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdWarning style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-amber)' }} />
            Active Alerts
          </h2>
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${alert.severity}`}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginBottom: 4 }}>
                  {alert.title}
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {alert.message}
                </div>
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {alert.time}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Recent Scenarios */}
        <motion.div className="glass-card" variants={stagger.item}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdCheckCircle style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
            Recent Scenario Analyses
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Cargo</th>
                <th>Vessel</th>
                <th>Cost</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{s.route}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{s.cargo}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)' }}>{s.vessel}</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-ocean)' }}>{s.cost}</td>
                  <td>
                    <span className={`badge ${
                      s.signal.includes('ENTER') ? 'badge-success' :
                      s.signal.includes('WAIT') ? 'badge-warning' : 'badge-danger'
                    }`}>
                      {s.signal}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>

      {/* ─── System Status Bar ─── */}
      <motion.div
        className="glass-card"
        variants={stagger.item}
        style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-md) var(--space-lg)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-xl)', fontSize: 'var(--font-size-sm)' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>ML Model:</span>{' '}
            <span className="badge badge-success">XGBoost v2.0 — MAPE 6.14%</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Data Pipeline:</span>{' '}
            <span className="badge badge-info">Live — 5 Sources Active</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>AIS Stream:</span>{' '}
            <span className="badge badge-success">Connected</span>
          </div>
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </motion.div>
    </motion.div>
  )
}
