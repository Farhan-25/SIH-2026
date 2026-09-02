import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Plot from 'react-plotly.js'
import {
  MdTrendingUp, MdTrendingDown, MdDirectionsBoat,
  MdWaterDrop, MdWarning, MdCheckCircle, MdLocalGasStation,
  MdAttachMoney, MdOpenInNew, MdPublic, MdNewspaper,
  MdMap, MdSpeed, MdFilterList, MdRefresh, MdFullscreen,
  MdShield, MdNavigation, MdShowChart, MdOutlineTimeline,
  MdSensors, MdLayers, MdSwapVert, MdGpsFixed
} from 'react-icons/md'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  getDashboard,
  getMapIntelligence,
  getMarketSentiment,
  getChokepointRisks,
  getGeopoliticalAlerts,
  getMaritimeNews,
  getCopilotOverview
} from '../api/client'
import { usePreferences } from '../context/PreferencesContext'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''


/* ────────────────────────────────────────────────────────────
   Bloomberg-Style Amber / Matrix / Dark Theme Helpers
   ──────────────────────────────────────────────────────────── */
function formatNumber(val, decimals = 2) {
  if (val === undefined || val === null || isNaN(val)) return '—'
  return Number(val).toFixed(decimals)
}

function getChokepointColor(risk) {
  if (risk >= 0.75) return '#ff3b30' // Bloomberg Alert Red
  if (risk >= 0.50) return '#ff9500' // Amber
  return '#30d158' // Terminal Green
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { axisCurrencyPrefix, formatMoney } = usePreferences()

  // State
  const [data, setData] = useState(null)
  const [mapIntel, setMapIntel] = useState(null)
  const [sentiment, setSentiment] = useState(null)
  const [chokepoints, setChokepoints] = useState({})
  const [geoAlerts, setGeoAlerts] = useState([])
  const [newsArticles, setNewsArticles] = useState([])
  const [copilotBriefing, setCopilotBriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedVessel, setSelectedVessel] = useState(null)
  const [activeWorkspace, setActiveWorkspace] = useState('ALL_MARKETS') // 'ALL_MARKETS', 'CORRIDORS', 'CHOKEPOINTS'
  const [clock, setClock] = useState(new Date().toUTCString())

  // Map reference
  const mapContainer = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date().toUTCString()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Ingest data streams
  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      getDashboard(),
      getMapIntelligence(),
      getMarketSentiment(),
      getChokepointRisks(),
      getGeopoliticalAlerts(),
      getMaritimeNews(20),
      getCopilotOverview()
    ]).then(([dashRes, mapRes, sentRes, chkRes, alertRes, newsRes, copilotRes]) => {
      if (dashRes.status === 'fulfilled') setData(dashRes.value)
      if (mapRes.status === 'fulfilled') setMapIntel(mapRes.value)
      if (sentRes.status === 'fulfilled') setSentiment(sentRes.value)
      if (chkRes.status === 'fulfilled') setChokepoints(chkRes.value)
      if (alertRes.status === 'fulfilled') setGeoAlerts(alertRes.value?.alerts || [])
      if (newsRes.status === 'fulfilled') setNewsArticles(newsRes.value?.articles || [])
      if (copilotRes.status === 'fulfilled') setCopilotBriefing(copilotRes.value)
      setLoading(false)
    })
  }, [])

  // Initialize Mapbox Terminal Radar
  useEffect(() => {
    if (!mapContainer.current) return
    if (mapInstance.current) return

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [85.0, 16.0],
      zoom: 3.8,
      pitch: 0,
      bearing: 0,
      projection: 'mercator',
      attributionControl: false
    })

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right')

    m.on('load', () => {
      // Add trade corridor tracks
      const tradeCorridorsGeoJSON = {
        type: 'FeatureCollection',
        features: [
          // Australia to Paradip / Vizag
          {
            type: 'Feature',
            properties: { color: '#00e5ff', name: 'Australia -> India East Coast' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [151.8, -32.9], [140.0, -20.0], [120.0, -10.0], [105.0, -5.0],
                [95.0, 5.0], [88.0, 12.0], [86.67, 20.26]
              ]
            }
          },
          // Indonesia (Kalimantan) to Dhamra
          {
            type: 'Feature',
            properties: { color: '#a78bfa', name: 'Indonesia -> Dhamra' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [116.0, -3.5], [106.0, 0.0], [98.0, 5.5], [92.0, 10.0], [86.9, 20.8]
              ]
            }
          },
          // Mozambique (Beira) to Gopalpur / Vizag
          {
            type: 'Feature',
            properties: { color: '#fb923c', name: 'Mozambique -> Vizag / Gopalpur' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [34.8, -19.8], [45.0, -15.0], [60.0, -5.0], [75.0, 3.0], [80.5, 8.0], [83.3, 17.7]
              ]
            }
          },
          // Russia (Vostochny) to Paradip
          {
            type: 'Feature',
            properties: { color: '#4ade80', name: 'Russia Far East -> Paradip' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [133.0, 42.7], [122.0, 25.0], [104.5, 1.5], [95.5, 5.8], [86.67, 20.26]
              ]
            }
          }
        ]
      }

      m.addSource('dashboard-corridors', {
        type: 'geojson',
        data: tradeCorridorsGeoJSON
      })

      m.addLayer({
        id: 'corridor-glow',
        type: 'line',
        source: 'dashboard-corridors',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.25,
          'line-blur': 2
        }
      })

      m.addLayer({
        id: 'corridor-core',
        type: 'line',
        source: 'dashboard-corridors',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.7,
          'line-dasharray': [3, 3]
        }
      })
    })

    mapInstance.current = m

    return () => {
      m.remove()
      mapInstance.current = null
    }
  }, [])

  // Render Map Vessels & Route Hubs
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapIntel) return

    const renderLayers = () => {
      // Clear previous markers
      markersRef.current.forEach(mk => mk.remove())
      markersRef.current = []

      const vessels = mapIntel.vessels || []
      const indianPorts = mapIntel.ports?.indian || []

      // 1. Plot Live Vessels with distinct directional pulse
      vessels.forEach((v) => {
        if (!v.lat || !v.lon) return

        const isSelected = selectedVessel?.id === v.id
        const isAnchor = v.status === 'At Anchor'
        const color = isAnchor ? '#ff9500' : '#00e5ff'

        const el = document.createElement('div')
        el.className = 'bb-vessel-marker'
        el.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease;
        `
        el.innerHTML = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="
              width: ${isSelected ? '22px' : '16px'};
              height: ${isSelected ? '22px' : '16px'};
              border-radius: 50%;
              background: ${color};
              border: 2px solid #ffffff;
              box-shadow: 0 0 ${isSelected ? '16px' : '8px'} ${color};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 9px;
            ">🚢</div>
          </div>
        `

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelectedVessel(v)
          map.flyTo({ center: [v.lon, v.lat], zoom: 5.5, duration: 800 })
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.lon, v.lat])
          .addTo(map)

        markersRef.current.push(marker)
      })

      // 2. Plot Key Port Terminals
      indianPorts.forEach((p) => {
        if (!p.lat || !p.lon) return
        const isHighWait = (p.waiting_days || 0) > 3.5
        const pColor = isHighWait ? '#ff3b30' : '#30d158'

        const pEl = document.createElement('div')
        pEl.style.cssText = `
          padding: 3px 6px;
          border-radius: 4px;
          background: rgba(13, 17, 23, 0.92);
          border: 1px solid ${pColor};
          color: #f0f6fc;
          font-family: monospace;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,0.6);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
        `
        pEl.innerHTML = `<span style="color:${pColor}; font-size:11px;">⚓</span><span>${p.name?.split(' ')[0]}</span><span style="color:${pColor};">(${p.anchored_vessels || 0})</span>`

        const portMarker = new mapboxgl.Marker({ element: pEl, anchor: 'bottom' })
          .setLngLat([p.lon, p.lat])
          .addTo(map)

        markersRef.current.push(portMarker)
      })
    }

    if (map.isStyleLoaded()) renderLayers()
    else map.once('load', renderLayers)
  }, [mapIntel, selectedVessel])

  const kpis = data?.kpis || {}
  const forecasts = data?.recent_forecasts || []
  const alerts = data?.alerts || []

  // Bloomberg Ticker Strip Data
  const tickerItems = [
    { code: 'BRENT', val: formatMoney(kpis.brent_crude?.value || 82.40), chg: kpis.brent_crude?.trend || '+1.2%', up: kpis.brent_crude?.trend_dir === 'up' },
    { code: 'USD/INR', val: `${kpis.usd_inr?.value || '85.20'}`, chg: kpis.usd_inr?.trend || '+0.15%', up: true },
    { code: 'NEWCASTLE COAL', val: formatMoney(kpis.coal_price?.value || 130.00), chg: '+2.4%', up: true },
    { code: 'BDI INDEX', val: '1,842', chg: '-1.8%', up: false },
    { code: 'CAPESIZE 5TC', val: formatMoney(24150, { decimals: 0, suffix: '/d' }), chg: '+5.6%', up: true },
    { code: 'PANAMAX 4TC', val: formatMoney(14820, { decimals: 0, suffix: '/d' }), chg: '-0.8%', up: false },
    { code: 'RED SEA RISK', val: '0.88 CRIT', chg: '+285% VOL', up: false },
    { code: 'SUEZ TRANSIT', val: '-58% YOY', chg: 'SURCHARGE', up: false },
  ]

  return (
    <div className="bloomberg-terminal-container" style={{
      fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
      background: '#07090e',
      color: '#e6edf3',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '8px 12px 24px 12px'
    }}>
      {/* ─── 1. BLOOMBERG TERMINAL TOP COMMAND BAR ─── */}
      <div style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: '6px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: '#ff9500',
            color: '#000',
            fontWeight: 900,
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: 3,
            letterSpacing: '0.5px'
          }}>
            FREIGHT-IQ TERMINAL
          </div>
          <span style={{ color: '#00e5ff', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>
            CORR &lt;GO&gt; | MARITIME COMMAND CENTER
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['ALL_MARKETS', 'CORRIDORS', 'CHOKEPOINTS'].map(ws => (
              <button
                key={ws}
                onClick={() => setActiveWorkspace(ws)}
                style={{
                  background: activeWorkspace === ws ? '#1f6feb' : '#161b22',
                  border: `1px solid ${activeWorkspace === ws ? '#58a6ff' : '#30363d'}`,
                  color: activeWorkspace === ws ? '#fff' : '#8b949e',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {ws}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '11px', fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#30d158', display: 'inline-block', boxShadow: '0 0 8px #30d158' }}></span>
            <span style={{ color: '#30d158', fontWeight: 600 }}>FEED: LIVE OGD + AIS + GFW</span>
          </div>
          <span style={{ color: '#8b949e' }}>UTC: {clock}</span>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'transparent', border: 'none', color: '#ff9500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <MdRefresh size={14} /> REFRESH
          </button>
        </div>
      </div>

      {/* ─── 2. RUNNING REAL-TIME TICKER TAPE ─── */}
      <div style={{
        background: '#090d13',
        border: '1px solid #21262d',
        borderRadius: 4,
        padding: '4px 10px',
        display: 'flex',
        overflowX: 'auto',
        gap: 20,
        alignItems: 'center',
        scrollbarWidth: 'none'
      }}>
        {tickerItems.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: '11px', fontFamily: 'monospace' }}>
            <span style={{ color: '#8b949e', fontWeight: 600 }}>{item.code}</span>
            <span style={{ color: '#f0f6fc', fontWeight: 700 }}>{item.val}</span>
            <span style={{ color: item.up ? '#30d158' : '#ff453a', fontWeight: 700 }}>
              {item.up ? '▲' : '▼'} {item.chg}
            </span>
            {idx < tickerItems.length - 1 && <span style={{ color: '#30363d' }}>|</span>}
          </div>
        ))}
      </div>

      {/* ─── 2.5 BLOOMBERG AI COPILOT REASONING & EXECUTIVE SUMMARY CONSOLE ─── */}
      <div style={{
        background: 'linear-gradient(90deg, #0d1117 0%, rgba(31, 111, 235, 0.08) 50%, #0d1117 100%)',
        border: '1px solid #30363d',
        borderLeft: '4px solid #58a6ff',
        borderRadius: 4,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'monospace'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: '300px' }}>
            <span style={{ background: '#1f6feb', color: '#fff', padding: '2px 6px', borderRadius: 3, fontSize: '10px', fontWeight: 800 }}>
              AI &lt;BRIEF&gt;
            </span>
            <span style={{ color: '#f0f6fc', fontSize: '11px', fontWeight: 600 }}>
              EXECUTIVE INTELLIGENCE BRIEFING:
            </span>
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: 3,
              background: (copilotBriefing?.sentiment_score || -0.42) < 0 ? 'rgba(255, 59, 48, 0.2)' : 'rgba(48, 209, 88, 0.2)',
              color: (copilotBriefing?.sentiment_score || -0.42) < 0 ? '#ff453a' : '#30d158',
              fontWeight: 700
            }}>
              SENTIMENT: {copilotBriefing?.sentiment_label?.toUpperCase() || 'NEGATIVE'} ({copilotBriefing?.sentiment_score || -0.42})
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => navigate('/copilot')}
              style={{
                background: '#238636',
                border: '1px solid #2ea043',
                color: '#ffffff',
                borderRadius: 3,
                fontSize: '10px',
                fontWeight: 700,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              🤖 LAUNCH FULL COPILOT CHAT &gt;
            </button>
          </div>
        </div>

        {/* Dynamic Key Insight Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '10.5px' }}>
          {(copilotBriefing?.key_insights || [
            "FinBERT Sentiment: Negative (-0.42)",
            "Red Sea Disruption Index: 0.88 (CRITICAL)",
            `VLSFO Bunker Cost: ~${formatMoney(612, { decimals: 0, suffix: '/MT' })} (Brent ${formatMoney(82.4)})`,
            "Odisha Port Turnaround: 4.8 days average wait"
          ]).map((insight, idx) => (
            <div key={idx} style={{
              background: '#161b22',
              border: '1px solid #21262d',
              padding: '3px 8px',
              borderRadius: 3,
              color: '#c9d1d9',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}>
              <span style={{ color: '#58a6ff' }}>▸</span>
              <span>{insight}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3. CORE BLOOMBERG 4-QUADRANT COMMAND GRID ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)',
        gridTemplateRows: 'auto auto',
        gap: 10
      }}>

        {/* ─── QUADRANT 1: INTEGRATED MARITIME RADAR & VESSEL FLEET MAP ─── */}
        <div style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '440px',
          position: 'relative'
        }}>
          {/* Panel Header */}
          <div style={{
            background: '#161b22',
            padding: '6px 12px',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', fontWeight: 700, color: '#58a6ff', fontFamily: 'monospace' }}>
              <MdMap size={15} />
              <span>MAP &lt;NAV&gt; — LIVE EAST COAST CORRIDORS & VESSEL TRACKER</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'monospace' }}>
                ACTIVE FLEET: {mapIntel?.vessels?.length || 15} SHIPS
              </span>
              <button
                onClick={() => navigate('/routes')}
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#f0f6fc',
                  borderRadius: 3,
                  fontSize: '9px',
                  padding: '2px 6px',
                  cursor: 'pointer'
                }}
              >
                FULL SCREEN ROUTE MAP →
              </button>
            </div>
          </div>

          {/* Map Canvas */}
          <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: '380px' }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

            {/* Floating Vessel Telemetry Overlay */}
            {selectedVessel && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  background: 'rgba(13, 17, 23, 0.95)',
                  border: '1px solid #00e5ff',
                  borderRadius: 6,
                  padding: '10px 14px',
                  zIndex: 20,
                  maxWidth: '320px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ color: '#00e5ff', fontSize: '12px' }}>{selectedVessel.name}</strong>
                  <button
                    onClick={() => setSelectedVessel(null)}
                    style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, color: '#c9d1d9' }}>
                  <div>Class: <span style={{ color: '#fff' }}>{selectedVessel.class}</span></div>
                  <div>Status: <span style={{ color: selectedVessel.status === 'At Anchor' ? '#ff9500' : '#30d158' }}>{selectedVessel.status}</span></div>
                  <div>Dest: <span style={{ color: '#fff' }}>{selectedVessel.dest}</span></div>
                  <div>Cargo: <span style={{ color: '#fff' }}>{selectedVessel.cargo?.split(' ')[0]}</span></div>
                  <div>Speed: <span style={{ color: '#fff' }}>{selectedVessel.speed} kn</span></div>
                  <div>Draft: <span style={{ color: '#fff' }}>{selectedVessel.draft_m} m</span></div>
                </div>
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #30363d', display: 'flex', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => navigate('/vessels')}
                    style={{ background: '#1f6feb', border: 'none', color: '#fff', padding: '3px 8px', borderRadius: 3, fontSize: '9px', cursor: 'pointer' }}
                  >
                    OPTIMIZE CHARTER &gt;
                  </button>
                  <span style={{ color: '#8b949e', fontSize: '9px' }}>ETA: {selectedVessel.eta_days ? `${selectedVessel.eta_days}d` : 'In Port'}</span>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* ─── QUADRANT 2: SPOT & FORWARD CORRIDOR RATES (BLOOMBERG QUOTE BOARD) ─── */}
        <div style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            background: '#161b22',
            padding: '6px 12px',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', fontWeight: 700, color: '#ff9500', fontFamily: 'monospace' }}>
              <MdShowChart size={15} />
              <span>FRT &lt;RATE&gt; — DRY BULK FREIGHT MATRIX ({axisCurrencyPrefix}/MT)</span>
            </div>
            <button
              onClick={() => navigate('/forecast')}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#f0f6fc',
                borderRadius: 3,
                fontSize: '9px',
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              ML FORECASTER &gt;
            </button>
          </div>

          <div style={{ padding: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>CORRIDOR</th>
                  <th style={{ padding: '6px 8px' }}>CARGO</th>
                  <th style={{ padding: '6px 8px' }}>VESSEL</th>
                  <th style={{ padding: '6px 8px' }}>SPOT</th>
                  <th style={{ padding: '6px 8px' }}>FWD 4W</th>
                  <th style={{ padding: '6px 8px' }}>CONG</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f, i) => {
                  const rateVal = parseFloat(f.rate?.replace('$', '').replace('/MT', '') || 15.0)
                  const fwdVal = (rateVal * 1.04).toFixed(2)
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #161b22', transition: 'background 0.15s' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 700, color: '#f0f6fc' }}>{f.route}</td>
                      <td style={{ padding: '7px 8px', color: '#8b949e' }}>{f.cargo}</td>
                      <td style={{ padding: '7px 8px', color: '#58a6ff' }}>{f.vessel}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 700, color: '#00e5ff' }}>{formatMoney(rateVal, { suffix: '/MT' })}</td>
                      <td style={{ padding: '7px 8px', color: '#30d158' }}>{formatMoney(fwdVal, { suffix: '/MT' })}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 3,
                          fontSize: '10px',
                          background: f.congestion > 50 ? 'rgba(255, 59, 48, 0.2)' : 'rgba(48, 209, 88, 0.2)',
                          color: f.congestion > 50 ? '#ff453a' : '#30d158',
                          fontWeight: 700
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

          {/* Quick Macro & Fuel Indicator Footprint */}
          <div style={{
            margin: '8px',
            padding: '10px',
            background: '#161b22',
            borderRadius: 4,
            border: '1px solid #21262d',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 8,
            fontSize: '10px',
            fontFamily: 'monospace'
          }}>
            <div>
              <div style={{ color: '#8b949e' }}>VLSFO BUNKER</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ff9500' }}>{formatMoney(612, { decimals: 0, suffix: '/MT' })}</div>
            </div>
            <div>
              <div style={{ color: '#8b949e' }}>DEMURRAGE AVG</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f0f6fc' }}>{formatMoney(22500, { compact: true, decimals: 1, suffix: '/d' })}</div>
            </div>
            <div>
              <div style={{ color: '#8b949e' }}>ODISHA TURNAROUND</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#30d158' }}>3.8 Days</div>
            </div>
            <div>
              <div style={{ color: '#8b949e' }}>FIX STRATEGY</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#00e5ff' }}>LOCK FWD</div>
            </div>
          </div>
        </div>

        {/* ─── QUADRANT 3: GEOPOLITICAL CHOKEPOINTS & FINBERT SENTIMENT INTELLIGENCE ─── */}
        <div style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            background: '#161b22',
            padding: '6px 12px',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', fontWeight: 700, color: '#ff3b30', fontFamily: 'monospace' }}>
              <MdShield size={15} />
              <span>GEO &lt;SHOCK&gt; — CHOKEPOINT DISRUPTION & SENTIMENT ENGINE</span>
            </div>
            <button
              onClick={() => navigate('/risk')}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#f0f6fc',
                borderRadius: 3,
                fontSize: '9px',
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              RISK MONITOR &gt;
            </button>
          </div>

          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Chokepoint Disruption Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              {Object.entries(chokepoints).slice(0, 4).map(([k, item]) => {
                const isCrit = item.risk_level === 'CRITICAL'
                const isHigh = item.risk_level === 'HIGH'
                const cColor = isCrit ? '#ff453a' : isHigh ? '#ff9500' : '#30d158'
                return (
                  <div key={k} style={{
                    background: '#161b22',
                    border: `1px solid ${cColor}55`,
                    borderLeft: `3px solid ${cColor}`,
                    padding: '8px 10px',
                    borderRadius: 4,
                    fontFamily: 'monospace'
                  }}>
                    <div style={{ fontSize: '10px', color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name?.split(' / ')[0]}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: cColor, margin: '2px 0' }}>
                      {item.risk_score}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#8b949e' }}>
                      <span>{item.risk_level}</span>
                      <span>+{item.volume_stats?.increase_pct || 0}%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* FinBERT Sentiment Indicator Bar */}
            <div style={{
              background: '#161b22',
              padding: '10px',
              borderRadius: 4,
              border: '1px solid #21262d',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'monospace'
            }}>
              <div>
                <span style={{ fontSize: '10px', color: '#8b949e' }}>FinBERT NLP SENTIMENT: </span>
                <strong style={{ fontSize: '12px', color: (sentiment?.current_score || -0.42) < 0 ? '#ff453a' : '#30d158' }}>
                  {sentiment?.current_score || -0.42} ({sentiment?.sentiment_label || 'NEGATIVE'})
                </strong>
              </div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>
                NEG: <strong style={{ color: '#ff453a' }}>{sentiment?.negative_pct || 60}%</strong> |
                NEU: <strong style={{ color: '#f0f6fc' }}>{sentiment?.neutral_pct || 22}%</strong> |
                POS: <strong style={{ color: '#30d158' }}>{sentiment?.positive_pct || 18}%</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ─── QUADRANT 4: LIVE DISRUPTION ALERTS & MARKET TELETYPE FEED ─── */}
        <div style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            background: '#161b22',
            padding: '6px 12px',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', fontWeight: 700, color: '#30d158', fontFamily: 'monospace' }}>
              <MdNewspaper size={15} />
              <span>NEWS &lt;WIRE&gt; — REAL-TIME INTELLIGENCE & DISRUPTION ALERTS</span>
            </div>
            <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'monospace' }}>
              FEED: AUTO-UPDATE
            </span>
          </div>

          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '310px', overflowY: 'auto' }}>
            {/* Geopolitical Shock Alerts first */}
            {geoAlerts.map((ga, i) => (
              <div key={`geo-${i}`} style={{
                background: 'rgba(255, 59, 48, 0.12)',
                borderLeft: '3px solid #ff453a',
                padding: '6px 10px',
                borderRadius: 3,
                fontSize: '11px',
                fontFamily: 'monospace'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <strong style={{ color: '#ff453a' }}>{ga.title}</strong>
                  <span style={{ color: '#8b949e', fontSize: '9px' }}>SHOCK ACTIVE</span>
                </div>
                <div style={{ color: '#c9d1d9', fontSize: '10px', lineHeight: 1.4 }}>
                  {ga.message}
                </div>
              </div>
            ))}

            {/* Live Maritime Articles Stream */}
            {newsArticles.map((art, i) => {
              const isNeg = art.sentiment === 'negative'
              const isPos = art.sentiment === 'positive'
              const sColor = isNeg ? '#ff453a' : isPos ? '#30d158' : '#8b949e'
              return (
                <div key={`art-${i}`} style={{
                  background: '#161b22',
                  borderLeft: `3px solid ${sColor}`,
                  padding: '6px 10px',
                  borderRadius: 3,
                  fontSize: '11px',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                    <a
                      href={art.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#f0f6fc', fontWeight: 600, textDecoration: 'none', lineHeight: 1.3 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#00e5ff'}
                      onMouseLeave={e => e.currentTarget.style.color = '#f0f6fc'}
                    >
                      {art.title}
                    </a>
                    <span style={{
                      fontSize: '9px',
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: isNeg ? 'rgba(255,59,48,0.2)' : isPos ? 'rgba(48,209,88,0.2)' : 'rgba(139,148,158,0.2)',
                      color: sColor,
                      whiteSpace: 'nowrap',
                      fontWeight: 700
                    }}>
                      {art.sentiment?.toUpperCase()} {art.sentiment_score ? `(${art.sentiment_score})` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#8b949e', marginTop: 3 }}>
                    <span>{art.source} • {art.primary_chokepoint || 'Global'}</span>
                    <span>{art.published_at?.split(' ').slice(0, 4).join(' ') || 'Live'}</span>
                  </div>
                </div>
              )
            })}

            {/* General Operation & Weather Alerts */}
            {alerts.slice(0, 2).map((al, i) => (
              <div key={`al-${i}`} style={{
                background: '#161b22',
                borderLeft: `3px solid ${al.severity === 'critical' ? '#ff453a' : al.severity === 'warning' ? '#ff9500' : '#30d158'}`,
                padding: '6px 10px',
                borderRadius: 3,
                fontSize: '11px',
                fontFamily: 'monospace'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <strong style={{ color: '#f0f6fc' }}>{al.title}</strong>
                  <span style={{ color: '#8b949e', fontSize: '9px' }}>{al.time}</span>
                </div>
                <div style={{ color: '#8b949e', fontSize: '10px', lineHeight: 1.4 }}>
                  {al.message}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ─── 4. TERMINAL FOOTER STATUS STRIP ─── */}
      <div style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 4,
        padding: '6px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '10px',
        fontFamily: 'monospace',
        color: '#8b949e',
        flexWrap: 'wrap',
        gap: 8
      }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>ML FORECASTER: <strong style={{ color: '#30d158' }}>ONLINE (MAPE 4.1%)</strong></span>
          <span>DEEP BiLSTM: <strong style={{ color: '#58a6ff' }}>ACTIVE</strong></span>
          <span>AIS STREAM: <strong style={{ color: '#30d158' }}>CONNECTED</strong></span>
          <span>GFW SATELLITE: <strong style={{ color: '#30d158' }}>LIVE</strong></span>
          <span>FRED API: <strong style={{ color: '#30d158' }}>SYNCED</strong></span>
        </div>
        <div>
          <span>SIH26006 FREIGHT-IQ v2.0 | PROPRIETARY TERMINAL MODE</span>
        </div>
      </div>
    </div>
  )
}
