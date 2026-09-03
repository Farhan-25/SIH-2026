import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  MdTrendingUp, MdTrendingDown, MdDirectionsBoat,
  MdLocalGasStation, MdMap, MdRefresh, MdShield,
  MdShowChart, MdNewspaper, MdBolt, MdOpenInNew, MdLocationOn
} from 'react-icons/md'
import mapboxgl, { getMapStyle, vesselPopupHTML, vesselMarkerColor, vesselHeadingDeg, isLiveAisVessel, portsToFeatureCollection, PORT_CIRCLE_PAINT, PORT_HALO_PAINT, upsertVesselArrowLayers } from '../lib/maplibre'
import VesselSidePanel from '../components/VesselSidePanel'
import {
  getDashboard,
  getMapIntelligence,
  getMarketSentiment,
  getChokepointRisks,
  getGeopoliticalAlerts,
  getMaritimeNews,
  getCopilotOverview,
  getForecast
} from '../api/client'
import { usePreferences } from '../context/PreferencesContext'
import { useAuth } from '../context/AuthContext'
import {
  ALL_DESTINATION_PORTS,
  ALL_TRADE_ROUTES,
  useUserProfile,
} from '../context/UserProfileContext'

function parseNum(val, fallback = 0) {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  if (val === undefined || val === null) return fallback
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''))
  return Number.isNaN(n) ? fallback : n
}

function sentimentTone(label, score) {
  const s = Number(score)
  if (label?.toLowerCase().includes('neg') || s < -0.15) return 'neg'
  if (label?.toLowerCase().includes('pos') || s > 0.15) return 'pos'
  return 'neu'
}

function vesselsToFeatureCollection(list) {
  return {
    type: 'FeatureCollection',
    features: (list || []).flatMap((v) => {
      const lat = Number(v.lat)
      const lon = Number(v.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
      return [{
        type: 'Feature',
        properties: {
          id: String(v.id || v.mmsi || ''),
          name: v.name || v.mmsi || 'Vessel',
          status: v.status || 'Underway',
          class: v.class || '',
          speed: v.speed ?? 0,
          dest: v.dest || v.destination || '',
          mmsi: v.mmsi || '',
          heading: vesselHeadingDeg(v),
          source: v.source_label || v.source || 'Live AIS',
          color: vesselMarkerColor(v),
        },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      }]
    }),
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { formatMoney } = usePreferences()
  const { currentUser } = useAuth()
  const {
    selectedPorts,
    selectedRoutes,
    selectedCargoes,
    isCargoSelected,
  } = useUserProfile()

  const primaryRoute = useMemo(() => {
    return ALL_TRADE_ROUTES.find((r) => selectedRoutes.includes(r.id)) || ALL_TRADE_ROUTES[0]
  }, [selectedRoutes])

  const selectedPortNames = useMemo(
    () => ALL_DESTINATION_PORTS.filter((p) => selectedPorts.includes(p.id)).map((p) => p.name),
    [selectedPorts]
  )

  const [data, setData] = useState(null)
  const [mapIntel, setMapIntel] = useState(null)
  const [sentiment, setSentiment] = useState(null)
  const [chokepoints, setChokepoints] = useState({})
  const [geoAlerts, setGeoAlerts] = useState([])
  const [newsArticles, setNewsArticles] = useState([])
  const [copilotBriefing, setCopilotBriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(() => new Date())
  const [selectedVessel, setSelectedVessel] = useState(null)
  const [forecast, setForecast] = useState(null)

  const mapContainer = useRef(null)
  const mapInstance = useRef(null)
  const popupRef = useRef(null)
  const vesselsByIdRef = useRef({})

  const loadAll = useCallback(() => {
    setLoading(true)
    getDashboard()
      .then((dash) => {
        setData(dash)
        setLoading(false)
        setLastRefresh(new Date())
      })
      .catch(() => setLoading(false))

    Promise.allSettled([
      getMapIntelligence(),
      getMarketSentiment(),
      getChokepointRisks(),
      getGeopoliticalAlerts(),
      getMaritimeNews(8),
      getCopilotOverview()
    ]).then(([mapRes, sentRes, chkRes, alertRes, newsRes, copilotRes]) => {
      if (mapRes.status === 'fulfilled') setMapIntel(mapRes.value)
      if (sentRes.status === 'fulfilled') setSentiment(sentRes.value)
      if (chkRes.status === 'fulfilled') setChokepoints(chkRes.value)
      if (alertRes.status === 'fulfilled') setGeoAlerts(alertRes.value?.alerts || [])
      if (newsRes.status === 'fulfilled') setNewsArticles(newsRes.value?.articles || [])
      if (copilotRes.status === 'fulfilled') setCopilotBriefing(copilotRes.value)
    })
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Primary corridor forecast for Command Centre — uses this user's first selected route
  useEffect(() => {
    let cancelled = false
    getForecast({ route_id: primaryRoute.id, vessel_class: 'Panamax', horizon_weeks: 8 })
      .then((res) => { if (!cancelled) setForecast(res) })
      .catch(() => { if (!cancelled) setForecast(null) })
    return () => { cancelled = true }
  }, [primaryRoute.id])

  // Keep vessel lookup fresh for popup clicks
  useEffect(() => {
    const map = {}
    for (const v of mapIntel?.vessels || []) {
      if (v.id) map[String(v.id)] = v
      if (v.mmsi) map[String(v.mmsi)] = v
    }
    vesselsByIdRef.current = map
  }, [mapIntel])

  // Init map once container is mounted (do not wait for API)
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: getMapStyle('dark').url,
      center: [85.0, 16.0],
      zoom: 4.2,
      attributionControl: false,
    })
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right')
    mapInstance.current = m
    popupRef.current = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 14,
      className: 'mapbox-dark-popup',
      maxWidth: '280px',
    })

    const bump = () => {
      try { m.resize() } catch { /* ignore */ }
    }
    const ro = new ResizeObserver(() => bump())
    ro.observe(mapContainer.current)
    m.on('load', bump)
    m.on('idle', bump)
    // Flex layout often settles after first paint
    const t1 = setTimeout(bump, 50)
    const t2 = setTimeout(bump, 250)
    const t3 = setTimeout(bump, 600)

    const openVessel = (e) => {
      const f = e.features?.[0]
      if (!f) return
      e.originalEvent?.stopPropagation?.()
      const props = f.properties || {}
      const id = String(props.id || '')
      const vessel = vesselsByIdRef.current[id] || {
        id,
        name: props.name,
        status: props.status,
        class: props.class,
        speed: props.speed,
        dest: props.dest,
        mmsi: props.mmsi,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      }
      setSelectedVessel(vessel)
      popupRef.current
        ?.setLngLat(f.geometry.coordinates)
        .setHTML(vesselPopupHTML(vessel))
        .addTo(m)
    }
    m.on('click', 'cc-vessels-hit', openVessel)
    m.on('click', 'cc-vessels-arrow', openVessel)
    m.on('mouseenter', 'cc-vessels-hit', () => { m.getCanvas().style.cursor = 'pointer' })
    m.on('mouseleave', 'cc-vessels-hit', () => { m.getCanvas().style.cursor = '' })
    m.on('mouseenter', 'cc-vessels-arrow', () => { m.getCanvas().style.cursor = 'pointer' })
    m.on('mouseleave', 'cc-vessels-arrow', () => { m.getCanvas().style.cursor = '' })

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      ro.disconnect()
      popupRef.current?.remove()
      popupRef.current = null
      m.remove()
      mapInstance.current = null
    }
  }, [])

  // Paint routes / ports / vessels when intel arrives
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapIntel) return

    const paint = () => {
      map.resize()
      const allVessels = mapIntel.vessels || []
      const vessels = [
        ...allVessels.filter(isLiveAisVessel),
        ...allVessels.filter((v) => !isLiveAisVessel(v)),
      ]
      const indian = mapIntel.ports?.indian || []
      const global = mapIntel.ports?.global || []
      const routes = mapIntel.route_risks || []

      const routeFc = {
        type: 'FeatureCollection',
        features: routes
          .filter((r) => Array.isArray(r.waypoints) && r.waypoints.length >= 2)
          .map((r) => ({
            type: 'Feature',
            properties: {
              id: r.route_id,
              selected: selectedRoutes.includes(r.route_id) || selectedRoutes.includes(r.id) ? 1 : 0,
            },
            geometry: {
              type: 'LineString',
              coordinates: r.waypoints.map((w) => [w[0], w[1]]),
            },
          })),
      }
      if (map.getSource('cc-routes')) {
        map.getSource('cc-routes').setData(routeFc)
      } else {
        map.addSource('cc-routes', { type: 'geojson', data: routeFc })
        map.addLayer({
          id: 'cc-routes-line',
          type: 'line',
          source: 'cc-routes',
          paint: {
            'line-color': '#38bdf8',
            'line-width': ['case', ['==', ['get', 'selected'], 1], 2.4, 1],
            'line-opacity': ['case', ['==', ['get', 'selected'], 1], 0.7, 0.22],
          },
        })
      }

      const portFc = portsToFeatureCollection(indian, global, selectedPorts)
      if (map.getSource('cc-ports')) {
        map.getSource('cc-ports').setData(portFc)
      } else {
        map.addSource('cc-ports', { type: 'geojson', data: portFc })
        map.addLayer({
          id: 'cc-ports-halo',
          type: 'circle',
          source: 'cc-ports',
          filter: ['==', ['get', 'selected'], 1],
          paint: PORT_HALO_PAINT,
        })
        map.addLayer({
          id: 'cc-ports-core',
          type: 'circle',
          source: 'cc-ports',
          paint: PORT_CIRCLE_PAINT,
        })
      }

      const vesselFc = vesselsToFeatureCollection(vessels)
      if (map.getSource('cc-vessels')) {
        map.getSource('cc-vessels').setData(vesselFc)
        upsertVesselArrowLayers(map, 'cc-vessels', {
          glow: 'cc-vessels-glow',
          core: 'cc-vessels-core',
          symbol: 'cc-vessels-arrow',
          hit: 'cc-vessels-hit',
        })
      } else {
        map.addSource('cc-vessels', { type: 'geojson', data: vesselFc })
        upsertVesselArrowLayers(map, 'cc-vessels', {
          glow: 'cc-vessels-glow',
          core: 'cc-vessels-core',
          symbol: 'cc-vessels-arrow',
          hit: 'cc-vessels-hit',
        })
      }
    }

    if (map.isStyleLoaded()) paint()
    else map.once('load', paint)
  }, [mapIntel, selectedPorts, selectedRoutes])

  const kpis = data?.kpis || {}
  const forecasts = (data?.recent_forecasts || []).filter((f) => {
    const cargoOk = !f.cargo || isCargoSelected(f.cargo)
    const routeText = `${f.route || ''} ${f.route_id || ''}`.toLowerCase()
    const routeOk = selectedRoutes.length === 0 || selectedRoutes.some((id) => {
      const meta = ALL_TRADE_ROUTES.find((r) => r.id === id)
      if (!meta) return false
      return routeText.includes(meta.destination.toLowerCase()) || routeText.includes(id.toLowerCase())
    })
    return cargoOk && routeOk
  })
  const visibleVessels = mapIntel?.vessels || []
  const fleetCount = visibleVessels.length
  const apiStatus = mapIntel?.api_status || {}

  const sentScore = copilotBriefing?.sentiment_score ?? sentiment?.current_score ?? -0.15
  const sentLabel = copilotBriefing?.sentiment_label || sentiment?.sentiment_label || 'Neutral'
  const sentTone = sentimentTone(sentLabel, sentScore)

  const insights = useMemo(() => {
    const fromCopilot = copilotBriefing?.key_insights
    if (Array.isArray(fromCopilot) && fromCopilot.length) return fromCopilot.slice(0, 4)
    return [
      `Market tone is ${sentLabel.toLowerCase()} (${Number(sentScore).toFixed(2)}).`,
      selectedPortNames.length
        ? `Watching ${selectedPortNames.slice(0, 3).join(', ')}${selectedPortNames.length > 3 ? ` +${selectedPortNames.length - 3}` : ''}.`
        : `East-coast average port wait is ${kpis.avg_port_wait?.value || '—'}.`,
      Object.keys(chokepoints).length
        ? `${Object.keys(chokepoints).length} chokepoints under watch — check Red Sea / Suez exposure.`
        : 'Monitoring key chokepoints for transit disruption.',
      fleetCount
        ? `${fleetCount} vessels currently on the India corridor map.`
        : 'Live AIS feed warming up for the Bay of Bengal.',
    ]
  }, [copilotBriefing, sentLabel, sentScore, kpis, chokepoints, fleetCount, selectedPortNames])

  const tickerItems = [
    { key: 'brent', label: 'Brent', value: formatMoney(parseNum(kpis.brent_crude?.value, 82.4)), trend: kpis.brent_crude?.trend, up: kpis.brent_crude?.trend_dir === 'up', icon: <MdLocalGasStation /> },
    { key: 'inr', label: 'USD/INR', value: kpis.usd_inr?.value || '₹85.2', trend: kpis.usd_inr?.trend, up: kpis.usd_inr?.trend_dir === 'up' },
    { key: 'freight', label: 'Avg Freight', value: formatMoney(parseNum(kpis.avg_freight_rate?.value, 14.82), { suffix: '/MT' }), trend: kpis.avg_freight_rate?.trend, up: kpis.avg_freight_rate?.trend_dir === 'up', icon: <MdDirectionsBoat /> },
    { key: 'wait', label: 'Port Wait', value: kpis.avg_port_wait?.value || '3.8d', trend: kpis.avg_port_wait?.trend, up: kpis.avg_port_wait?.trend_dir === 'up' },
  ]

  if (selectedCargoes.length === 0 || selectedCargoes.some((c) => c.toLowerCase().includes('coal'))) {
    tickerItems.splice(2, 0, { key: 'coal', label: 'Newcastle Coal', value: formatMoney(parseNum(kpis.coal_price?.value, 130)), trend: kpis.coal_price?.trend, up: kpis.coal_price?.trend_dir === 'up' })
  }
  if (selectedCargoes.length === 0 || isCargoSelected('Iron Ore')) {
    tickerItems.push({ key: 'iron', label: 'Iron Ore', value: formatMoney(parseNum(kpis.iron_ore?.value, 110)), trend: kpis.iron_ore?.trend, up: kpis.iron_ore?.trend_dir === 'up' })
  }

  const topChoke = Object.values(chokepoints)[0]
  if (topChoke) {
    tickerItems.push({
      key: 'risk',
      label: (topChoke.name || 'Chokepoint').split(' / ')[0],
      value: String(topChoke.risk_level || 'Watch'),
      trend: topChoke.volume_stats?.increase_pct != null ? `+${topChoke.volume_stats.increase_pct}%` : undefined,
      up: false,
      danger: true,
      icon: <MdShield />,
    })
  }

  const negPct = sentiment?.negative_pct ?? 60
  const neuPct = sentiment?.neutral_pct ?? 22
  const posPct = sentiment?.positive_pct ?? 18

  const indianPorts = mapIntel?.ports?.indian || []
  const chosenDeskPorts = indianPorts.filter((p) => selectedPorts.includes(p.port_id || p.id))

  const corridorFallback = selectedRoutes.map((id) => {
    const r = ALL_TRADE_ROUTES.find((route) => route.id === id)
    if (!r) return null
    return { route: `${r.origin} → ${r.destination}`, cargo: r.cargo, vessel: 'Panamax', rate: 14.82, congestion: 42 }
  }).filter(Boolean)
  const avgCong = indianPorts.length
    ? Math.round(indianPorts.reduce((s, p) => s + (p.congestion_index || 0), 0) / indianPorts.length)
    : null

  const spotRate = forecast?.latest_actual_rate_usd_per_mt
  const preds = forecast?.predictions_usd_per_mt || []
  const fwd4 = preds.length >= 4 ? preds[3] : preds[preds.length - 1]
  const fwdChange = spotRate && fwd4 != null ? ((fwd4 - spotRate) / spotRate) * 100 : null
  const timingLabel = forecast?.market_timing?.recommended_action
    || forecast?.market_timing?.strategy
    || forecast?.market_timing?.action
    || null
  const spark = preds.slice(0, 8)

  return (
    <div className="cc-page">
      <AnimatePresence>
        {selectedVessel && (
          <VesselSidePanel
            vessel={selectedVessel}
            ports={indianPorts}
            compact
            onClose={() => {
              setSelectedVessel(null)
              popupRef.current?.remove()
            }}
          />
        )}
      </AnimatePresence>
      <header className="cc-header">
        <div>
          <h1>Command Centre</h1>
          <p className="cc-profile-line">
            Built for {currentUser?.name || 'your desk'} · {selectedPorts.length} ports · {selectedRoutes.length} corridors · {selectedCargoes.slice(0, 3).join(', ') || 'cargo mix'}
          </p>
        </div>
        <div className="cc-header-actions">
          <div className="cc-feed-pill">
            <span className={`cc-dot ${apiStatus.ais === 'connected' ? 'on' : ''}`} />
            {loading && !data ? 'Loading…' : 'Live feed'}
          </div>
          <span className="cc-utc">
            {lastRefresh.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
          </span>
          <button type="button" className="cc-btn" onClick={loadAll}>
            <MdRefresh size={16} /> Refresh
          </button>
        </div>
      </header>

      <div className="cc-ticker" role="list">
        {tickerItems.map((item) => (
          <div key={item.key} className={`cc-tick ${item.danger ? 'danger' : ''}`} role="listitem">
            <span className="cc-tick-label">{item.icon}{item.label}</span>
            <span className="cc-tick-value">{item.value}</span>
            {item.trend != null && item.trend !== '' && (
              <span className={`cc-tick-trend ${item.up ? 'up' : 'down'}`}>
                {item.up ? <MdTrendingUp /> : <MdTrendingDown />}
                {item.trend}
              </span>
            )}
          </div>
        ))}
      </div>

      <section className={`cc-brief tone-${sentTone}`}>
        <div className="cc-brief-main">
          <div className="cc-brief-top">
            <span className="cc-brief-tag"><MdBolt size={14} /> Intelligence brief</span>
            <span className={`cc-sent-badge ${sentTone}`}>
              Sentiment · {sentLabel} ({Number(sentScore).toFixed(2)})
            </span>
          </div>
          <ul className="cc-brief-list">
            {insights.map((line, i) => (
              <li key={i}>{typeof line === 'string' ? line.replace(/^\s*[•\-*]\s*/, '').replace(/\*\*/g, '') : line}</li>
            ))}
          </ul>
        </div>
        <button type="button" className="cc-brief-cta" onClick={() => navigate('/copilot')}>
          Open Copilot
        </button>
      </section>

      <div className="cc-split">
        <section className="cc-panel cc-map-panel">
          <div className="cc-panel-head">
            <h2><MdMap size={18} /> Live East Coast map</h2>
            <div className="cc-panel-meta">
              <span>{fleetCount} vessels</span>
              <button type="button" className="cc-link" onClick={() => navigate('/routes')}>
                Full route map <MdOpenInNew size={14} />
              </button>
            </div>
          </div>
          <div className="cc-map-wrap">
            <div ref={mapContainer} className="cc-map-el" />
            {chosenDeskPorts.length > 0 && (
              <div className="cc-port-picker" aria-label="Your selected ports">
                {chosenDeskPorts.map((p) => (
                  <button
                    key={p.port_id || p.id}
                    type="button"
                    className="cc-port-chip"
                    title={`Fly to ${p.name}`}
                    onClick={() => {
                      if (!p.lon || !p.lat || !mapInstance.current) return
                      mapInstance.current.flyTo({ center: [p.lon, p.lat], zoom: 6.4, duration: 900 })
                    }}
                  >
                    <MdLocationOn size={14} />
                    {(p.name || '').replace('Port', '').split('(')[0].trim()}
                  </button>
                ))}
              </div>
            )}
            <div className="cc-map-legend">
              <span><i className="cc-leg ship" /> Live AIS</span>
              <span><i className="cc-leg modeled" /> Modeled</span>
              <span><i className="cc-leg anchor" /> At anchor</span>
              <span><i className="cc-leg port" /> Port</span>
              <span><i className="cc-leg desk" /> Your desk</span>
            </div>
          </div>
        </section>

        <section className="cc-panel cc-rates-panel">
          <div className="cc-panel-head">
            <h2><MdShowChart size={18} /> Dry bulk rates</h2>
            <button type="button" className="cc-link" onClick={() => navigate('/forecast')}>
              ML forecaster <MdOpenInNew size={14} />
            </button>
          </div>

          <div className="cc-forecast-strip">
            <div className="cc-forecast-head">
              <strong>{primaryRoute.origin} → {primaryRoute.destination} · Panamax</strong>
              <button type="button" className="cc-link" onClick={() => navigate('/forecast')}>Details</button>
            </div>
            <div className="cc-forecast-metrics">
              <div>
                <span className="lbl">Spot</span>
                <strong>{spotRate != null ? formatMoney(spotRate, { suffix: '/MT' }) : '—'}</strong>
              </div>
              <div>
                <span className="lbl">Fwd +4W</span>
                <strong className={fwdChange != null && fwdChange >= 0 ? 'up' : 'down'}>
                  {fwd4 != null ? formatMoney(fwd4, { suffix: '/MT' }) : '—'}
                </strong>
              </div>
              <div>
                <span className="lbl">Δ 4W</span>
                <strong className={fwdChange != null && fwdChange >= 0 ? 'up' : 'down'}>
                  {fwdChange != null ? `${fwdChange >= 0 ? '+' : ''}${fwdChange.toFixed(1)}%` : '—'}
                </strong>
              </div>
            </div>
            {spark.length > 0 && (
              <div className="cc-spark" title="8-week forecast path">
                {spark.map((v, i) => {
                  const min = Math.min(...spark)
                  const max = Math.max(...spark)
                  const h = max === min ? 40 : 18 + ((v - min) / (max - min)) * 70
                  return <i key={i} style={{ height: `${h}%` }} />
                })}
              </div>
            )}
            {timingLabel && (
              <div className="cc-timing">Strategy · {String(timingLabel).replace(/_/g, ' ')}</div>
            )}
          </div>

          <div className="cc-rate-stats">
            <div>
              <span className="lbl">Port wait</span>
              <strong>{kpis.avg_port_wait?.value || '—'}</strong>
            </div>
            <div>
              <span className="lbl">Avg congestion</span>
              <strong>{avgCong != null ? `${avgCong}` : '—'}</strong>
            </div>
            <div>
              <span className="lbl">Alerts</span>
              <strong>{geoAlerts.length || Object.keys(chokepoints).length || 0}</strong>
            </div>
          </div>

          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Corridor</th>
                  <th>Cargo</th>
                  <th>Vessel</th>
                  <th>Spot</th>
                  <th>Fwd 4W</th>
                  <th>Cong.</th>
                </tr>
              </thead>
              <tbody>
                {(forecasts.length ? forecasts : corridorFallback.length ? corridorFallback : [
                  { route: `${primaryRoute.origin} → ${primaryRoute.destination}`, cargo: primaryRoute.cargo, vessel: 'Panamax', rate: '$14.82/MT', congestion: 42 },
                ]).slice(0, 4).map((f, i) => {
                  const rateVal = parseNum(f.rate, 15)
                  const fwdVal = (i === 0 && fwd4 != null) ? fwd4 : (rateVal * 1.04)
                  const cong = Number(f.congestion) || 0
                  return (
                    <tr key={i}>
                      <td className="route">{f.route}</td>
                      <td>{f.cargo}</td>
                      <td>{f.vessel}</td>
                      <td className="num">{formatMoney(rateVal, { suffix: '/MT' })}</td>
                      <td className="num fwd">{formatMoney(fwdVal, { suffix: '/MT' })}</td>
                      <td>
                        <span className={`cc-cong ${cong > 50 ? 'high' : 'ok'}`}>{cong}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="cc-risk-mini">
            <h3><MdShield size={16} /> Watchlist</h3>
            <div className="cc-risk-list">
              {(Object.entries(chokepoints).slice(0, 2).length
                ? Object.entries(chokepoints).slice(0, 2)
                : [['red_sea', { name: 'Red Sea / Bab el-Mandeb', risk_level: 'Elevated' }]]
              ).map(([k, item]) => (
                <button
                  type="button"
                  key={k}
                  className="cc-risk-row"
                  onClick={() => navigate('/risk')}
                >
                  <span className="name">{item.name?.split(' / ')[0]}</span>
                  <span className="lvl">{item.risk_level}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="cc-lower">
        <section className="cc-panel">
          <div className="cc-panel-head">
            <h2>Market sentiment</h2>
            <button type="button" className="cc-link" onClick={() => navigate('/risk')}>Risk desk</button>
          </div>
          <div className="cc-sent-score">
            <div className={`big ${sentTone}`}>{Number(sentScore).toFixed(2)}</div>
            <div>
              <strong>{sentLabel}</strong>
              <p>From FinBERT on live maritime headlines</p>
            </div>
          </div>
          <div className="cc-sent-bars">
            <div className="bar-row">
              <span>Negative</span>
              <div className="track"><i style={{ width: `${negPct}%` }} className="neg" /></div>
              <em>{negPct}%</em>
            </div>
            <div className="bar-row">
              <span>Neutral</span>
              <div className="track"><i style={{ width: `${neuPct}%` }} className="neu" /></div>
              <em>{neuPct}%</em>
            </div>
            <div className="bar-row">
              <span>Positive</span>
              <div className="track"><i style={{ width: `${posPct}%` }} className="pos" /></div>
              <em>{posPct}%</em>
            </div>
          </div>
        </section>

        <section className="cc-panel">
          <div className="cc-panel-head">
            <h2><MdNewspaper size={18} /> Intelligence wire</h2>
            <button type="button" className="cc-link" onClick={() => navigate('/risk')}>All alerts</button>
          </div>
          <div className="cc-news-list">
            {(newsArticles.length ? newsArticles : geoAlerts).slice(0, 6).map((a, i) => {
              const title = a.title || a.message || a.headline || 'Market update'
              const meta = a.source || a.category || a.severity || 'Wire'
              const tone = (a.sentiment || a.severity || '').toLowerCase()
              return (
                <article key={a.id || i} className="cc-news-item">
                  <span className={`cc-news-dot ${tone.includes('neg') || tone.includes('crit') || tone.includes('warn') ? 'neg' : tone.includes('pos') ? 'pos' : ''}`} />
                  <div>
                    <h4>{title}</h4>
                    <p>{meta}{a.published_at ? ` · ${String(a.published_at).slice(0, 10)}` : ''}</p>
                  </div>
                </article>
              )
            })}
            {!newsArticles.length && !geoAlerts.length && (
              <p className="cc-empty">News feed will populate as sources sync.</p>
            )}
          </div>
        </section>
      </div>

      <footer className="cc-status">
        <StatusChip label="AIS" ok={apiStatus.ais === 'connected'} detail={apiStatus.ais || '—'} />
        <StatusChip label="Weather" ok={apiStatus.weather === 'connected'} detail={apiStatus.weather || '—'} />
        <StatusChip label="Markets" ok={apiStatus.fred === 'connected'} detail={apiStatus.fred || '—'} />
        <StatusChip label="Fleet" ok={fleetCount > 0} detail={`${fleetCount} ships`} />
        <span className="cc-status-spacer" />
        <span className="cc-ver">FreightIQ Command Centre</span>
      </footer>
    </div>
  )
}

function StatusChip({ label, ok, detail }) {
  return (
    <span className={`cc-status-chip ${ok ? 'ok' : ''}`} title={detail}>
      <span className="cc-dot" />
      {label}
    </span>
  )
}
