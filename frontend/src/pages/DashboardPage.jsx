import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  MdTrendingUp, MdTrendingDown, MdDirectionsBoat,
  MdWaterDrop, MdWarning, MdCheckCircle, MdLocalGasStation,
  MdAttachMoney, MdOpenInNew, MdNewspaper, MdPublic
} from 'react-icons/md'
import { getDashboard } from '../api/client'

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.08 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  },
}

const severityIcon = {
  critical: <MdWarning style={{ color: 'var(--accent-rose)' }} />,
  warning: <MdWarning style={{ color: 'var(--accent-amber)' }} />,
  success: <MdCheckCircle style={{ color: 'var(--accent-emerald)' }} />,
  info: <MdTrendingUp style={{ color: 'var(--accent-ocean)' }} />,
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    getDashboard()
      .then(res => { setData(res); setError(null) })
      .catch(() => setError('Failed to load dashboard data'))
      .finally(() => setLoading(false))
  }, [])

  const kpis = data?.kpis || {}
  const alerts = data?.alerts || []
  const forecasts = data?.recent_forecasts || []
  const sysStatus = data?.system_status || {}
  const newsSources = data?.market_news_sources || []

  const kpiCards = [
    {
      label: 'Avg Freight Rate',
      value: kpis.avg_freight_rate?.value || '—',
      trend: kpis.avg_freight_rate?.trend || '',
      trendDir: kpis.avg_freight_rate?.trend_dir || 'up',
      icon: <MdTrendingUp />,
      accent: 'ocean',
    },
    {
      label: 'Brent Crude ($/bbl)',
      value: kpis.brent_crude?.value || '—',
      trend: kpis.brent_crude?.trend || '',
      trendDir: kpis.brent_crude?.trend_dir || 'up',
      icon: <MdLocalGasStation />,
      accent: 'amber',
      subtitle: kpis.brent_crude?.as_of ? `As of ${kpis.brent_crude.as_of}` : '',
    },
    {
      label: 'USD / INR',
      value: kpis.usd_inr?.value || '—',
      trend: kpis.usd_inr?.trend || '',
      trendDir: kpis.usd_inr?.trend_dir || 'up',
      icon: <MdAttachMoney />,
      accent: 'emerald',
      subtitle: kpis.usd_inr?.as_of ? `As of ${kpis.usd_inr.as_of}` : '',
    },
    {
      label: 'Avg Port Wait (Days)',
      value: kpis.avg_port_wait?.value || '—',
      trend: kpis.avg_port_wait?.trend || '',
      trendDir: kpis.avg_port_wait?.trend_dir || 'down',
      icon: <MdWaterDrop />,
      accent: 'violet',
    },
    {
      label: 'Newcastle Coal ($/MT)',
      value: kpis.coal_price?.value || '—',
      trend: kpis.coal_price?.trend || '',
      trendDir: kpis.coal_price?.trend_dir || 'up',
      icon: <MdDirectionsBoat />,
      accent: 'ocean',
    },
    {
      label: 'Iron Ore CFR ($/MT)',
      value: kpis.iron_ore?.value || '—',
      trend: kpis.iron_ore?.trend || '',
      trendDir: kpis.iron_ore?.trend_dir || 'up',
      icon: <MdTrendingUp />,
      accent: 'amber',
    },
  ]

  return (
    <motion.div variants={stagger.container} initial="initial" animate="animate">
      {/* ─── Page Header ─── */}
      <div className="section-header" style={{ marginBottom: '8px' }}>
        <div>
          <h1>Command Center</h1>
          <p>Live freight intelligence for East Coast India bulk cargo procurement</p>
        </div>
        {data?.timestamp && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Updated: {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Loading live data from FRED, model pipeline, and OGD port stats...
        </div>
      )}

      {error && (
        <div className="alert-card warning" style={{ marginBottom: 'var(--space-md)' }}>
          <MdWarning /> {error} — showing cached fallback
        </div>
      )}

      {/* ─── KPI Grid (6 cards) ─── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {kpiCards.map((kpi) => (
          <motion.div
            key={kpi.label}
            className={`glass-card kpi-card ${kpi.accent}`}
            variants={stagger.item}
          >
            <div className="kpi-icon">{kpi.icon}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
            {kpi.trend && (
              <span className={`kpi-trend ${kpi.trendDir === 'up' ? 'up' : 'down'}`}>
                {kpi.trendDir === 'up' ? <MdTrendingUp size={12}/> : <MdTrendingDown size={12}/>}
                {kpi.trend}
              </span>
            )}
            {kpi.subtitle && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{kpi.subtitle}</div>
            )}
          </motion.div>
        ))}
      </div>

      {/* ─── Two Column: Alerts + Recent Corridors ─── */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Active Alerts */}
        <motion.div className="glass-card" variants={stagger.item}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdWarning style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-amber)' }} />
            Live Alerts & Advisories
          </h2>
          {alerts.length === 0 && !loading && (
            <div style={{ color: 'var(--text-muted)', padding: '1rem' }}>No active alerts</div>
          )}
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${alert.severity}`}>
              <div style={{ marginRight: 8, fontSize: '1.2rem' }}>{severityIcon[alert.severity?.toLowerCase()] || severityIcon.info}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginBottom: 4 }}>
                  {alert.title}
                  {alert.category && (
                    <span className="badge badge-info" style={{ marginLeft: 8, fontSize: '0.6rem' }}>{alert.category}</span>
                  )}
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

        {/* Recent Corridor Rates */}
        <motion.div className="glass-card" variants={stagger.item}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            <MdCheckCircle style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
            Latest Corridor Rates
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Cargo</th>
                <th>Vessel</th>
                <th>Rate</th>
                <th>Congestion</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{s.route}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{s.cargo}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)' }}>{s.vessel}</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-ocean)' }}>{s.rate}</td>
                  <td>
                    <span className={`badge ${
                      s.congestion > 50 ? 'badge-danger' :
                      s.congestion > 30 ? 'badge-warning' : 'badge-success'
                    }`}>
                      {s.congestion}%
                    </span>
                  </td>
                </tr>
              ))}
              {forecasts.length === 0 && !loading && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </motion.div>
      </div>

      {/* ─── Maritime News & Market Intelligence ─── */}
      <motion.div className="glass-card" variants={stagger.item} style={{ marginTop: 'var(--space-md)' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
          <MdNewspaper style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-ocean)' }} />
          Maritime News & Market Intelligence
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-sm)' }}>
          {newsSources.map((src) => (
            <a
              key={src.name}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                padding: 'var(--space-sm) var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                textDecoration: 'none', color: 'var(--text-primary)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'var(--accent-ocean)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
            >
              <MdPublic style={{ fontSize: '1.2rem', color: 'var(--accent-ocean)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                  {src.name}
                  <MdOpenInNew size={10} style={{ marginLeft: 4, opacity: 0.5 }} />
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{src.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </motion.div>

      {/* ─── System Status Bar ─── */}
      <motion.div
        className="glass-card"
        variants={stagger.item}
        style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-md) var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-xl)', fontSize: 'var(--font-size-sm)', flexWrap: 'wrap' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>ML Model:</span>{' '}
            <span className="badge badge-success">{sysStatus.ml_model || 'Loading...'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Deep Model:</span>{' '}
            <span className="badge badge-info">{sysStatus.deep_model || 'Loading...'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>FRED API:</span>{' '}
            <span className={`badge ${sysStatus.fred_api === 'Connected' ? 'badge-success' : 'badge-warning'}`}>
              {sysStatus.fred_api || '...'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>AIS Stream:</span>{' '}
            <span className={`badge ${sysStatus.ais_stream === 'Configured' ? 'badge-success' : 'badge-warning'}`}>
              {sysStatus.ais_stream || '...'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Data:</span>{' '}
            <span className="badge badge-info">{sysStatus.dataset_date || '...'}</span>
          </div>
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
          {data?.timestamp ? `Updated: ${new Date(data.timestamp).toLocaleTimeString()}` : ''}
        </div>
      </motion.div>
    </motion.div>
  )
}
