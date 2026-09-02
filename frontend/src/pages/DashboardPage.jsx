import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MdTrendingUp, MdTrendingDown, MdDirectionsBoat,
  MdLocalGasStation, MdAttachMoney, MdMap, MdRefresh,
  MdShield, MdShowChart
} from 'react-icons/md'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  getDashboard,
  getMapIntelligence,
  getChokepointRisks,
  getCopilotOverview
} from '../api/client'
import { usePreferences } from '../context/PreferencesContext'
import { useUserProfile } from '../context/UserProfileContext'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

function formatNumber(val, decimals = 2) {
  if (val === undefined || val === null || isNaN(val)) return '—'
  return Number(val).toFixed(decimals)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { axisCurrencyPrefix, formatMoney } = usePreferences()
  const { isPortSelected } = useUserProfile()

  const [data, setData] = useState(null)
  const [mapIntel, setMapIntel] = useState(null)
  const [chokepoints, setChokepoints] = useState({})
  const [copilotBriefing, setCopilotBriefing] = useState(null)
  const [loading, setLoading] = useState(true)

  // Map reference
  const mapContainer = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])

  // Ingest data streams
  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      getDashboard(),
      getMapIntelligence(),
      getChokepointRisks(),
      getCopilotOverview()
    ]).then(([dashRes, mapRes, chkRes, copilotRes]) => {
      if (dashRes.status === 'fulfilled') setData(dashRes.value)
      if (mapRes.status === 'fulfilled') setMapIntel(mapRes.value)
      if (chkRes.status === 'fulfilled') setChokepoints(chkRes.value)
      if (copilotRes.status === 'fulfilled') setCopilotBriefing(copilotRes.value)
      setLoading(false)
    })
  }, [])

  // Initialize Mapbox 
  useEffect(() => {
    if (loading) return
    if (!mapContainer.current) return
    if (mapInstance.current) return

    // Using dark-matter carto style as it does not require a mapbox token
    // and looks good in both dark and light mode as a map panel
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [85.0, 16.0],
      zoom: 3.8,
      projection: 'mercator',
      attributionControl: false
    })

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right')

    mapInstance.current = m

    return () => {
      m.remove()
      mapInstance.current = null
    }
  }, [loading])

  // Render basic vessel markers
  useEffect(() => {
    if (loading) return
    const map = mapInstance.current
    if (!map || !mapIntel) return

    const renderLayers = () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      const vessels = mapIntel?.vessels || []
      const allPorts = mapIntel?.ports?.indian || []
      const ports = allPorts.filter(p => isPortSelected(p.port_id || p.id))

      // Render ports (Emerald squares)
      ports.forEach(p => {
        if (!p.lat || !p.lon) return

        const el = document.createElement('div')
        el.style.cssText = `
          width: 14px;
          height: 14px;
          background-color: var(--accent-emerald);
          border: 2px solid var(--bg-card);
          border-radius: 4px;
          box-shadow: 0 0 8px hsla(155, 70%, 45%, 0.4);
          cursor: pointer;
        `
        el.title = p.name

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([p.lon, p.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })

      // Render vessels (Cyan circles)
      vessels.forEach(v => {
        if (!v.lat || !v.lon) return

        const el = document.createElement('div')
        el.style.cssText = `
          width: 10px;
          height: 10px;
          background-color: var(--accent);
          border: 2px solid var(--bg-card);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-glow);
          cursor: pointer;
        `
        el.title = v.name

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([v.lon, v.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })
    }

    if (map.isStyleLoaded()) renderLayers()
    else map.once('load', renderLayers)
  }, [mapIntel, loading])

  const kpis = data?.kpis || {}
  const forecasts = data?.recent_forecasts || []

  // Derive Capesize 5TC from backend avg_freight_rate KPI
  const avgFreightRate = kpis.avg_freight_rate || {}
  const freightValue = avgFreightRate.value || '—'
  const freightTrend = avgFreightRate.trend || '0%'
  const freightTrendDir = avgFreightRate.trend_dir || 'up'

  // Derive Red Sea Risk from live chokepoint data
  const redSeaData = chokepoints?.['bab_el_mandeb'] || chokepoints?.['red_sea'] || {}
  const redSeaRisk = redSeaData.risk_score != null ? redSeaData.risk_score.toFixed(2) : null
  const redSeaLevel = redSeaData.risk_level || 'UNKNOWN'
  const redSeaVolPct = redSeaData.volume_stats?.increase_pct || 0

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h2 style={{ color: 'var(--text-primary)' }}>Loading Dashboard...</h2>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
      width: '100%'
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-2xl)', color: 'var(--text-primary)', fontWeight: '700' }}>Executive Dashboard</h1>
          <p style={{ margin: 'var(--space-xs) 0 0 0', color: 'var(--text-secondary)' }}>High-level overview of maritime operations and freight intelligence.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ 
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', 
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', 
            padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            fontWeight: '500', color: 'var(--text-primary)', boxShadow: 'var(--glass-shadow)',
            fontFamily: 'var(--font-family)'
          }}
        >
          <MdRefresh size={18} /> Refresh Data
        </button>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-md)' }}>
        <KpiCard 
          title="BRENT CRUDE" 
          value={kpis.brent_crude?.value || '—'} 
          trend={kpis.brent_crude?.trend || '—'} 
          isUp={kpis.brent_crude?.trend_dir === 'up'}
          icon={<MdLocalGasStation size={20} />}
        />
        <KpiCard 
          title="NEWCASTLE COAL" 
          value={kpis.coal_price?.value || '—'} 
          trend={kpis.coal_price?.trend || '—'} 
          isUp={kpis.coal_price?.trend_dir === 'up'}
          icon={<MdAttachMoney size={20} />}
        />
        <KpiCard 
          title="AVG FREIGHT RATE" 
          value={freightValue} 
          trend={freightTrend} 
          isUp={freightTrendDir === 'up'}
          icon={<MdDirectionsBoat size={20} />}
        />
        <KpiCard 
          title="RED SEA RISK" 
          value={redSeaRisk ? `${redSeaRisk} ${redSeaLevel}` : '—'} 
          trend={redSeaVolPct ? `+${redSeaVolPct}% VOL` : '—'} 
          isUp={false}
          icon={<MdShield size={20} />}
          isDanger={redSeaLevel === 'CRITICAL' || redSeaLevel === 'HIGH'}
        />
      </div>

      {/* MAIN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        
        {/* MAP SECTION */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--glass-shadow)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '500px'
        }}>
          <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <MdMap size={20} color="var(--accent)" /> Live Vessel Tracking
            </h2>
            <button 
              onClick={() => navigate('/routes')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: '500', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)' }}
            >
              View Full Map &rarr;
            </button>
          </div>
          <div style={{ flex: 1, width: '100%', position: 'relative' }}>
            <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* SIDE PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          
          {/* AI COPILOT SUMMARY */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--glass-shadow)',
            padding: 'var(--space-lg)'
          }}>
            <h2 style={{ margin: '0 0 var(--space-md) 0', fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span>🤖</span> AI Executive Summary
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {(copilotBriefing?.key_insights || [
                "Overall market sentiment is currently cautious.",
                "Red Sea disruptions continue to drive volatility.",
                "Bunker costs remain elevated, impacting margins.",
                "Port turnaround times are slightly above average."
              ]).map((insight, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '10px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <span style={{ color: 'var(--accent)' }}>&bull;</span>
                  <span>{insight}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/copilot')}
              style={{
                marginTop: 'var(--space-lg)', width: '100%',
                background: 'var(--accent-glow)', color: 'var(--accent)',
                border: '1px solid var(--accent)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)',
                fontWeight: '500', cursor: 'pointer', fontFamily: 'var(--font-family)'
              }}
            >
              Ask AI Copilot
            </button>
          </div>

          {/* QUICK ALERTS */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--glass-shadow)',
            padding: 'var(--space-lg)'
          }}>
             <h2 style={{ margin: '0 0 var(--space-md) 0', fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <MdShield size={20} color="var(--accent-rose)" /> Active Risk Alerts
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {Object.entries(chokepoints).slice(0, 3).map(([k, item]) => (
                <div key={k} style={{ 
                  background: 'var(--bg-elevated)', borderLeft: '4px solid var(--accent-rose)', 
                  padding: 'var(--space-sm)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' 
                }}>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', marginBottom: '4px' }}>{item.name?.split(' / ')[0]}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent-rose)' }}>Risk Level: {item.risk_level} | Impact: +{item.volume_stats?.increase_pct || 0}%</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* FREIGHT MATRIX */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--glass-shadow)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <MdShowChart size={20} color="var(--accent-emerald)" /> Freight Rates Matrix
          </h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600' }}>Corridor</th>
                <th style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600' }}>Cargo</th>
                <th style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600' }}>Vessel Type</th>
                <th style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600' }}>Spot Rate</th>
                <th style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600' }}>Fwd (4W)</th>
                <th style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600' }}>Congestion</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((f, i) => {
                const rateVal = parseFloat(f.rate?.replace('$', '').replace('/MT', '') || 0)
                // Compute forward rate using the backend's actual trend percentage
                const trendPctNum = parseFloat(freightTrend?.replace('%', '').replace('+', '') || 0)
                const fwdMultiplier = 1 + (trendPctNum / 100)
                const fwdVal = (rateVal * fwdMultiplier).toFixed(2)
                const fwdIsUp = fwdMultiplier >= 1
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '500', color: 'var(--text-primary)' }}>{f.route}</td>
                    <td style={{ padding: 'var(--space-sm) var(--space-lg)', color: 'var(--text-secondary)' }}>{f.cargo}</td>
                    <td style={{ padding: 'var(--space-sm) var(--space-lg)', color: 'var(--text-secondary)' }}>{f.vessel}</td>
                    <td style={{ padding: 'var(--space-sm) var(--space-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>{formatMoney(rateVal, { suffix: '/MT' })}</td>
                    <td style={{ padding: 'var(--space-sm) var(--space-lg)', color: fwdIsUp ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{formatMoney(fwdVal, { suffix: '/MT' })}</td>
                    <td style={{ padding: 'var(--space-sm) var(--space-lg)' }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: '500',
                        background: f.congestion > 50 ? 'var(--accent-rose-dim)' : 'var(--accent-emerald-dim)',
                        color: f.congestion > 50 ? 'var(--text-primary)' : 'var(--text-primary)'
                      }}>
                        {f.congestion}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, trend, isUp, isDanger, icon }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--glass-shadow)',
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: '600', letterSpacing: '0.05em' }}>{title}</span>
        <span style={{ color: isDanger ? 'var(--accent-rose)' : 'var(--text-muted)' }}>{icon}</span>
      </div>
      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: 'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-sm)', fontWeight: '500' }}>
        {isUp ? (
          <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center' }}><MdTrendingUp /> {trend}</span>
        ) : (
          <span style={{ color: 'var(--accent-rose)', display: 'flex', alignItems: 'center' }}><MdTrendingDown /> {trend}</span>
        )}
        <span style={{ color: 'var(--text-muted)', fontWeight: '400', marginLeft: '4px' }}>vs last week</span>
      </div>
    </div>
  )
}
