import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MdMap, MdPublic, MdDirectionsBoat, MdWarning, MdRefresh, MdMyLocation,
  MdWaves, MdTrendingUp, MdAnchor, MdSignalWifi4Bar, MdSignalWifiOff,
  MdLocalShipping, MdCloud, MdClose, MdNavigation, MdAttachMoney,
  MdEco, MdSpeed, MdLocationOn, MdCheckCircle, MdScience,
  MdArrowForward, MdSearch, MdStraighten, MdPause, MdPlayArrow
} from 'react-icons/md'
import mapboxgl from '../lib/maplibre'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Tube } from '@react-three/drei'
import * as THREE from 'three'
import { getMapIntelligence } from '../api/client'
import { usePreferences } from '../context/PreferencesContext'

/* ────────────────────────────────────────────────────────────
   Helper utilities
   ──────────────────────────────────────────────────────────── */
function congestionColor(index) {
  if (index >= 60) return '#ef4444'
  if (index >= 35) return '#f59e0b'
  return '#22c55e'
}

function weatherRiskColor(risk) {
  if (risk >= 0.5) return '#ef4444'
  if (risk >= 0.25) return '#f59e0b'
  return '#38bdf8'
}

function routeColorFromOrigin(origin = '') {
  const o = origin.toLowerCase()
  if (o.includes('australia')) return [56, 189, 248]
  if (o.includes('indonesia')) return [167, 139, 250]
  if (o.includes('mozambique')) return [251, 146, 60]
  if (o.includes('usa') || o.includes('norfolk') || o.includes('baltimore')) return [248, 113, 113]
  if (o.includes('russia') || o.includes('taman') || o.includes('vostochny')) return [74, 222, 128]
  return [148, 163, 184]
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function getCompassHeading(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8
  return directions[index]
}

// Haversine distance in Nautical Miles
function haversineNM(lat1, lon1, lat2, lon2) {
  const R = 3440.065 // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/* ────────────────────────────────────────────────────────────
   Dynamic Maritime Sea-Lane Route Engine
   Waypoints are loaded dynamically from the backend routes intelligence API.
   ──────────────────────────────────────────────────────────── */
function getMaritimeWaypointsForCorridor(originStr = '', destPort, routes = []) {
  const o = originStr.toLowerCase()
  const dName = (destPort?.name || '').toLowerCase()

  // 1. Search for direct matching route from backend intelligence
  const match = routes.find(r => {
    const rOrig = (r.origin || '').toLowerCase()
    const rDest = (r.destination || '').toLowerCase()
    return (
      (o && (rOrig.includes(o) || o.includes(rOrig))) ||
      (dName && (rDest.includes(dName) || dName.includes(rDest)))
    ) && r.waypoints && r.waypoints.length > 0
  })

  if (match?.waypoints?.length > 0) {
    return destPort?.lon && destPort?.lat
      ? [...match.waypoints, [destPort.lon, destPort.lat]]
      : match.waypoints
  }

  // 2. Geodesic / Chokepoint sea-lane interpolation based on origin region
  let basePoints = []
  if (o.includes('australia') || o.includes('newcastle') || o.includes('hay point') || o.includes('gladstone')) {
    basePoints = [
      [151.78, -32.92], [153.5, -28.0], [152.0, -20.0], [142.5, -10.5],
      [130.0, -9.0], [120.0, -9.5], [115.7, -8.6], [105.0, -8.0],
      [95.0, 3.0], [90.0, 9.0], [87.0, 15.0]
    ]
  } else if (o.includes('indonesia') || o.includes('samarinda') || o.includes('kalimantan')) {
    basePoints = [
      [117.5, -0.5], [114.0, -3.5], [106.8, -1.0], [104.2, 1.2],
      [102.5, 2.0], [99.8, 4.2], [95.5, 5.8], [89.0, 11.5], [86.8, 16.5]
    ]
  } else if (o.includes('mozambique') || o.includes('maputo') || o.includes('nacala') || o.includes('beira') || o.includes('south africa')) {
    basePoints = [
      [32.6, -25.9], [42.0, -16.0], [52.0, -6.0], [68.0, 1.5],
      [78.0, 5.2], [80.6, 5.9], [84.0, 12.0]
    ]
  } else if (o.includes('usa') || o.includes('baltimore') || o.includes('norfolk')) {
    basePoints = [
      [-76.6, 39.2], [-65.0, 32.0], [-40.0, 15.0], [-10.0, -10.0],
      [18.4, -34.8], [45.0, -28.0], [65.0, -10.0], [80.6, 5.9], [84.5, 14.0]
    ]
  } else if (o.includes('russia') || o.includes('vostochny') || o.includes('taman')) {
    basePoints = [
      [133.0, 42.7], [129.5, 33.0], [122.0, 25.0], [112.0, 12.0],
      [104.5, 1.5], [99.8, 4.2], [95.5, 5.8], [87.0, 14.0]
    ]
  } else {
    basePoints = [[95.0, 5.0], [88.0, 10.0], [86.5, 15.0]]
  }

  if (destPort && destPort.lon && destPort.lat) {
    return [...basePoints, [destPort.lon, destPort.lat]]
  }
  return basePoints
}


/* ────────────────────────────────────────────────────────────
   2D Mapbox Map Component — FlightRadar24 Ultra
   ──────────────────────────────────────────────────────────── */
function MapboxMap({
  indianPorts,
  globalPorts,
  routes,
  vessels,
  weatherData,
  selectedVessel,
  onVesselClick,
  onPortClick,
  filterStatus,
  showWeather,
  showAnchorageZones,
  timeOffsetHours,
  rulerActive,
  rulerPoints,
  onRulerClick
}) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const vesselMarkersRef = useRef([])
  const portMarkersRef = useRef([])
  const weatherMarkersRef = useRef([])
  const animationFrameRef = useRef(null)

  // Use refs so marker rebuilds aren't triggered by callback identity churn
  const onVesselClickRef = useRef(onVesselClick)
  const onPortClickRef = useRef(onPortClick)
  useEffect(() => { onVesselClickRef.current = onVesselClick }, [onVesselClick])
  useEffect(() => { onPortClickRef.current = onPortClick }, [onPortClick])

  const activeVesselObj = useMemo(() => {
    return vessels.find(v => v.id === selectedVessel)
  }, [vessels, selectedVessel])

  // Build realistic maritime sea-lane trajectory (Past Wake + Future Projected Course)
  const activeVesselTrackGeoJSON = useMemo(() => {
    if (!activeVesselObj || !activeVesselObj.lat || !activeVesselObj.lon) {
      return { type: 'FeatureCollection', features: [] }
    }

    const allPorts = [...indianPorts, ...globalPorts]
    const destPort = allPorts.find(p => p.name?.toLowerCase().includes(activeVesselObj.dest?.toLowerCase()?.split(' ')[0] || '___'))
      || indianPorts.find(p => p.port_id === 'IN_PRT') || { lon: 86.67, lat: 20.26 }

    const waypoints = getMaritimeWaypointsForCorridor(activeVesselObj.origin, destPort, routes)
    const curPos = [activeVesselObj.lon, activeVesselObj.lat]

    let closestIndex = 0
    let minDistance = Infinity

    waypoints.forEach((pt, idx) => {
      const d = Math.hypot(pt[0] - curPos[0], pt[1] - curPos[1])
      if (d < minDistance) {
        minDistance = d
        closestIndex = idx
      }
    })

    const pastWaypoints = [...waypoints.slice(0, Math.max(1, closestIndex)), curPos]
    const futureWaypoints = [curPos, ...waypoints.slice(Math.min(waypoints.length - 1, closestIndex + 1))]

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { type: 'wake', color: '#0ea5e9' },
          geometry: { type: 'LineString', coordinates: pastWaypoints }
        },
        {
          type: 'Feature',
          properties: { type: 'projected', color: '#f59e0b' },
          geometry: { type: 'LineString', coordinates: futureWaypoints }
        }
      ]
    }
  }, [activeVesselObj, indianPorts, globalPorts, routes])

  // Ruler Distance Measure GeoJSON
  const rulerGeoJSON = useMemo(() => {
    if (rulerPoints.length < 2) return { type: 'FeatureCollection', features: [] }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { color: '#ec4899' },
          geometry: { type: 'LineString', coordinates: rulerPoints }
        }
      ]
    }
  }, [rulerPoints])

  // Initialize Mapbox
  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [83, 16],
      zoom: 4.2,
      pitch: 20,
      bearing: 0,
      antialias: true
    })

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right')
    map.current.addControl(new mapboxgl.ScaleControl({ unit: 'nautical' }), 'bottom-left')

    map.current.on('click', (e) => {
      if (rulerActive) {
        onRulerClick([e.lngLat.lng, e.lngLat.lat])
      }
    })

    map.current.on('load', () => {
      // 1. Ambient trade routes
      map.current.addSource('trade-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.current.addLayer({
        id: 'route-core',
        type: 'line',
        source: 'trade-routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.35,
          'line-dasharray': [3, 4]
        }
      })

      // 2. Active Vessel Track Sources & Layers
      map.current.addSource('vessel-active-track', { type: 'geojson', data: activeVesselTrackGeoJSON })
      map.current.addLayer({
        id: 'vessel-track-glow',
        type: 'line',
        source: 'vessel-active-track',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
          'line-opacity': 0.35,
          'line-blur': 4
        }
      })
      map.current.addLayer({
        id: 'vessel-track-core',
        type: 'line',
        source: 'vessel-active-track',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.95,
          'line-dasharray': ['case', ['==', ['get', 'type'], 'projected'], ['literal', [2, 2]], ['literal', [1, 0]]]
        }
      })

      // 3. Ruler Measure Layer
      map.current.addSource('ruler-line-src', { type: 'geojson', data: rulerGeoJSON })
      map.current.addLayer({
        id: 'ruler-line-layer',
        type: 'line',
        source: 'ruler-line-src',
        paint: {
          'line-color': '#ec4899',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      })

      // 4. Port Anchorage Zones (Heatmap Halos)
      map.current.addSource('anchorage-zones-src', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: indianPorts.map(p => ({
            type: 'Feature',
            properties: {
              congestion: p.congestion_index || 0,
              color: congestionColor(p.congestion_index || 0)
            },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
          }))
        }
      })

      map.current.addLayer({
        id: 'anchorage-zones-layer',
        type: 'circle',
        source: 'anchorage-zones-src',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'congestion'], 0, 20, 100, 65],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.12,
          'circle-blur': 0.8
        }
      })
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Update ambient trade routes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !map.current.getSource('trade-routes')) return
    const routeFeatures = routes
      .filter(r => r.waypoints && r.waypoints.length > 0)
      .map(r => ({
        type: 'Feature',
        properties: {
          color: rgbToHex(routeColorFromOrigin(r.origin || ''))
        },
        geometry: {
          type: 'LineString',
          coordinates: r.waypoints
        }
      }))
    map.current.getSource('trade-routes').setData({
      type: 'FeatureCollection',
      features: routeFeatures
    })
  }, [routes])

  // Update ruler line
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !map.current.getSource('ruler-line-src')) return
    map.current.getSource('ruler-line-src').setData(rulerGeoJSON)
  }, [rulerGeoJSON])

  // Update anchorage zones visibility
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !map.current.getLayer('anchorage-zones-layer')) return
    map.current.setLayoutProperty(
      'anchorage-zones-layer',
      'visibility',
      showAnchorageZones ? 'visible' : 'none'
    )
  }, [showAnchorageZones])

  // Update Active Vessel Track & flyTo camera
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !map.current.getSource('vessel-active-track')) return
    map.current.getSource('vessel-active-track').setData(activeVesselTrackGeoJSON)

    if (activeVesselObj && activeVesselObj.lat && activeVesselObj.lon) {
      map.current.flyTo({
        center: [activeVesselObj.lon, activeVesselObj.lat],
        zoom: 5.8,
        pitch: 30,
        speed: 1.2,
        curve: 1.4,
        essential: true
      })
    }
  }, [activeVesselTrackGeoJSON, activeVesselObj])

  // Country flag helper
  const getPortFlag = (country = '') => {
    const c = country.toLowerCase()
    if (c.includes('india')) return '🇮🇳'
    if (c.includes('australia')) return '🇦🇺'
    if (c.includes('indonesia')) return '🇮🇩'
    if (c.includes('mozambique')) return '🇲🇿'
    if (c.includes('south africa')) return '🇿🇦'
    if (c.includes('usa') || c.includes('united states')) return '🇺🇸'
    if (c.includes('russia')) return '🇷🇺'
    return '🌐'
  }

  // Render High-Visibility Location Pins for ALL Global & Indian Ports
  useEffect(() => {
    if (!map.current) return
    const ready = () => {
      portMarkersRef.current.forEach(m => m.remove())
      portMarkersRef.current = []

      const allPorts = [
        ...indianPorts.map(p => ({ ...p, isTargetIndia: true, country: 'India' })),
        ...globalPorts.map(p => ({ ...p, isTargetIndia: false }))
      ]

      allPorts.forEach(port => {
        if (!port.lat || !port.lon) return
        const el = document.createElement('div')
        el.className = `port-location-pin ${port.isTargetIndia ? 'india-port' : 'global-port'}`
        const color = port.isTargetIndia ? congestionColor(port.congestion_index || 0) : '#38bdf8'
        const flag = getPortFlag(port.country || '')

        const displayName = port.name.replace('Port of ', '').replace(' (DBCT / HPX)', '').replace(' (RGT / WICET)', '').split(' (')[0].split(' / ')[0]

        el.innerHTML = `
          <div class="port-pin-wrapper">
            <div class="port-pin-icon ${port.isTargetIndia ? 'pin-india' : 'pin-global'}" style="background: ${color}; box-shadow: 0 0 20px ${color}99;">
              <span class="pin-symbol">${port.isTargetIndia ? '⚓' : '🚢'}</span>
            </div>
            <div class="port-pin-badge" style="border-color: ${color}77;">
              <span class="port-flag">${flag}</span>
              <span class="port-name">${displayName}</span>
              ${port.isTargetIndia
                ? `<span class="port-wait" style="color:${color}">${port.anchored_vessels || 0} Ships</span>`
                : `<span class="port-wait text-ocean">${port.waiting_days || port.avg_queue_days || 3}d Queue</span>`
              }
            </div>
          </div>
        `

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          if (onPortClickRef.current) onPortClickRef.current(port)
          map.current?.flyTo({ center: [port.lon, port.lat], zoom: 6.5, pitch: 25, duration: 1000 })
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([port.lon, port.lat])
          .addTo(map.current)

        portMarkersRef.current.push(marker)
      })
    }

    if (map.current.isStyleLoaded()) ready()
    else map.current.once('load', ready)
  }, [indianPorts, globalPorts])

  // Render FlightRadar24 Interactive Vessel Markers (with Time Scrubbing Interpolation)
  useEffect(() => {
    if (!map.current) return
    const ready = () => {
      vesselMarkersRef.current.forEach(m => m.remove())
      vesselMarkersRef.current = []

      const visibleVessels = vessels.filter(v => {
        if (filterStatus === 'underway') return v.status !== 'At Anchor'
        if (filterStatus === 'anchor') return v.status === 'At Anchor'
        return true
      })

      visibleVessels.forEach(vessel => {
        if (!vessel.lat || !vessel.lon) return

        // Compute scrubbed future position based on speed and heading
        const speedKnots = vessel.speed || 12.0
        const distanceNMTravelled = (speedKnots * timeOffsetHours)
        const headingRad = (vessel.heading || 315) * Math.PI / 180

        // Approximate 1 deg lat = 60 NM
        const latOffset = (distanceNMTravelled * Math.cos(headingRad)) / 60
        const lonOffset = (distanceNMTravelled * Math.sin(headingRad)) / (60 * Math.cos(vessel.lat * Math.PI / 180))

        const projectedLat = vessel.status === 'At Anchor' ? vessel.lat : vessel.lat + latOffset
        const projectedLon = vessel.status === 'At Anchor' ? vessel.lon : vessel.lon + lonOffset

        const isAnchor = vessel.status === 'At Anchor'
        const color = isAnchor ? '#f59e0b' : '#38bdf8'
        const isSelected = selectedVessel === vessel.id

        const el = document.createElement('div')
        el.className = `fr24-vessel-marker ${isSelected ? 'selected' : ''}`

        el.innerHTML = `
          <div class="fr24-vessel-container">
            ${isSelected ? `<div class="fr24-pulse-ring" style="border-color:${color};"></div>` : ''}
            <div class="fr24-ship-icon" style="transform: rotate(${vessel.heading || 0}deg); filter: drop-shadow(0 0 ${isSelected ? '12px' : '4px'} ${color});">
              <svg viewBox="0 0 24 24" width="${isSelected ? '30' : '22'}" height="${isSelected ? '30' : '22'}" fill="${color}">
                <path d="M12 2L4 19L12 16L20 19L12 2Z" />
              </svg>
            </div>
            <div class="fr24-vessel-label ${isSelected ? 'show' : ''}">${vessel.name.split(' ')[0]}</div>
          </div>
        `

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onVesselClickRef.current?.(vessel.id)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([projectedLon, projectedLat])
          .addTo(map.current)

        vesselMarkersRef.current.push(marker)
      })
    }

    if (map.current.isStyleLoaded()) ready()
    else map.current.once('load', ready)
  }, [vessels, selectedVessel, filterStatus, timeOffsetHours])

  // Marine Weather Layer
  useEffect(() => {
    if (!map.current) return
    const ready = () => {
      weatherMarkersRef.current.forEach(m => m.remove())
      weatherMarkersRef.current = []
      if (!showWeather) return

      weatherData.forEach(wx => {
        if (!wx.lat || !wx.lon || (wx.risk_score || 0) < 0.2) return
        const color = weatherRiskColor(wx.risk_score || 0)
        const el = document.createElement('div')
        el.className = 'fr24-weather-chip'
        el.style.cssText = `
          padding: 4px 8px; border-radius: 99px; font-size: 11px; font-weight: 600;
          background: rgba(15, 23, 42, 0.85); border: 1px solid ${color}88; color: ${color};
          display: flex; align-items: center; gap: 4px; backdrop-filter: blur(8px);
          cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        `
        el.innerHTML = `<span>🌊</span><span>${wx.wave_height_m}m</span>`

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([wx.lon, wx.lat])
          .addTo(map.current)

        weatherMarkersRef.current.push(marker)
      })
    }

    if (map.current.isStyleLoaded()) ready()
    else map.current.once('load', ready)
  }, [weatherData, showWeather])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', cursor: rulerActive ? 'crosshair' : 'grab' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   FlightRadar24 Pop-up Side Card Drawer Component (All Features)
   ──────────────────────────────────────────────────────────── */
function FlightRadarSideCard({ vessel, onClose, onCenter, allPorts }) {
  const navigate = useNavigate()
  const { formatMoney } = usePreferences()
  const [activeTab, setActiveTab] = useState('telemetry') // 'telemetry', 'financial', 'green', 'berth'

  if (!vessel) return null

  const isAnchor = vessel.status === 'At Anchor'
  const statusColor = isAnchor ? 'var(--accent-amber)' : 'var(--accent-emerald)'
  const statusBg = isAnchor ? 'hsla(35, 95%, 60%, 0.15)' : 'hsla(155, 70%, 45%, 0.15)'

  const originName = vessel.origin || 'Newcastle (AU)'
  const destName = vessel.dest || 'Paradip (IN)'
  const progressPct = vessel.progress_pct || 68

  // Computed Financial & Demurrage Metrics
  const dailyDemurrageRate = vessel.class?.includes('Cape') ? 28500 : vessel.class?.includes('Panamax') ? 21000 : 16500
  const waitHours = vessel.wait_time_hours || (isAnchor ? 36 : 18)
  const totalDemurrageRisk = Math.round((waitHours / 24) * dailyDemurrageRate)
  const landedLogisticsCostUSD = (23.40 + (waitHours * 0.12)).toFixed(2)

  // Computed Environmental & CII Metrics
  const estimatedFuelBurnMT = Math.round(((vessel.dwt || 75000) / 1000) * 4.8)
  const carbonEmissionsMT = Math.round(estimatedFuelBurnMT * 3.114) // 3.114 MT CO2 per MT VLSFO
  const ciiRating = carbonEmissionsMT < 1200 ? 'A' : carbonEmissionsMT < 1600 ? 'B' : 'C'
  const ciiBadgeColor = ciiRating === 'A' ? 'var(--accent-emerald)' : ciiRating === 'B' ? 'var(--accent-ocean)' : 'var(--accent-amber)'

  // Draft Feasibility Check
  const vesselDraft = vessel.draft_m || 14.2
  const destPortObj = allPorts.find(p => p.name?.toLowerCase().includes(destName.toLowerCase().split(' ')[0])) || { max_draft_m: 14.5 }
  const isDraftFeasible = (destPortObj.max_draft_m || 14.5) >= vesselDraft
  const isHaldiaLighterage = destName.toLowerCase().includes('haldia')

  // Jump to Vessel Optimizer
  const handleOptimizeInEngine = () => {
    navigate('/vessels')
  }

  return (
    <motion.div
      initial={{ x: -420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -420, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      className="fr24-side-drawer glass-panel"
    >
      {/* ── Top Header with Ship Badge & Close ── */}
      <div className="fr24-card-header">
        <div className="fr24-vessel-avatar">
          <MdDirectionsBoat size={28} />
        </div>
        <div className="fr24-vessel-meta">
          <div className="fr24-callsign-row">
            <span className="fr24-badge-class">{vessel.class || 'CAPESIZE'}</span>
            <span className="fr24-mmsi">IMO: {vessel.mmsi || '9847120'}</span>
          </div>
          <h2 className="fr24-vessel-name">{vessel.name}</h2>
          <div className="fr24-flag-row">
            <span className="fr24-flag">⚓ {vessel.operator || 'Bulk Carrier Live Fleet'}</span>
          </div>
        </div>
        <button onClick={onClose} className="fr24-btn-close" title="Close Vessel Card">
          <MdClose size={20} />
        </button>
      </div>

      {/* ── FlightRadar24 Route Corridor & Progress Bar ── */}
      <div className="fr24-route-box">
        <div className="fr24-route-endpoints">
          <div className="endpoint-col left">
            <span className="port-code">{originName.substring(0, 3).toUpperCase()}</span>
            <span className="port-full-name">{originName}</span>
          </div>

          <div className="route-airplane-indicator">
            <div className="route-line"></div>
            <div className="route-ship-pin" style={{ left: `${progressPct}%` }}>
              <MdDirectionsBoat size={18} style={{ color: 'var(--accent-ocean)' }} />
            </div>
          </div>

          <div className="endpoint-col right">
            <span className="port-code">{destName.substring(0, 3).toUpperCase()}</span>
            <span className="port-full-name">{destName}</span>
          </div>
        </div>

        <div className="fr24-progress-stats">
          <span>Progress: <strong>{progressPct}%</strong></span>
          <span style={{ color: statusColor, background: statusBg, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
            {vessel.status || 'UNDERWAY'}
          </span>
          <span>ETA: <strong>{vessel.eta_days || 3.4} Days</strong></span>
        </div>
      </div>

      {/* ── Feature Tabs ── */}
      <div className="fr24-tab-nav">
        <button
          className={`tab-pill ${activeTab === 'telemetry' ? 'active' : ''}`}
          onClick={() => setActiveTab('telemetry')}
        >
          <MdNavigation /> Telemetry
        </button>
        <button
          className={`tab-pill ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
        >
          <MdAttachMoney /> Demurrage
        </button>
        <button
          className={`tab-pill ${activeTab === 'green' ? 'active' : ''}`}
          onClick={() => setActiveTab('green')}
        >
          <MdEco /> Carbon
        </button>
        <button
          className={`tab-pill ${activeTab === 'berth' ? 'active' : ''}`}
          onClick={() => setActiveTab('berth')}
        >
          <MdAnchor /> Berth Draft
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="fr24-tab-body">
        {/* 1. Telemetry Tab */}
        {activeTab === 'telemetry' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="fr24-telemetry-grid">
              <div className="telemetry-cell">
                <span className="cell-lbl"><MdSpeed /> Speed</span>
                <span className="cell-val text-ocean">{vessel.speed || 12.4} <span className="unit">kn</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl"><MdNavigation /> Heading</span>
                <span className="cell-val">{vessel.heading || 315}° <span className="unit">{getCompassHeading(vessel.heading || 315)}</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl"><MdLocationOn /> Coordinates</span>
                <span className="cell-val mono">{vessel.lat?.toFixed(2)}°N, {vessel.lon?.toFixed(2)}°E</span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl"><MdAnchor /> Draft / DWT</span>
                <span className="cell-val">{vesselDraft}m <span className="unit">/ {((vessel.dwt || 75000) / 1000).toFixed(0)}k</span></span>
              </div>
            </div>

            <div className="fr24-cargo-box">
              <div className="cargo-header">
                <span className="cargo-title">📦 Cargo Consignment</span>
                <span className="cargo-amount">{vessel.materials_transferred ? Number(vessel.materials_transferred).toLocaleString() : '107,062'} MT</span>
              </div>
              <p className="cargo-desc">{vessel.cargo || 'Manganese Ore & Premium Hard Coking Coal'}</p>
            </div>
          </motion.div>
        )}

        {/* 2. Financial & Demurrage Tab */}
        {activeTab === 'financial' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="fr24-telemetry-grid">
              <div className="telemetry-cell">
                <span className="cell-lbl">Demurrage Rate</span>
                <span className="cell-val text-amber">{formatMoney(dailyDemurrageRate, { decimals: 0 })} <span className="unit">/ day</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Queue Risk Exposure</span>
                <span className="cell-val text-rose">{formatMoney(totalDemurrageRisk, { decimals: 0 })}</span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Estimated Landed Cost</span>
                <span className="cell-val text-ocean">{formatMoney(landedLogisticsCostUSD)} <span className="unit">/ MT</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Anchorage Queue</span>
                <span className="cell-val">{waitHours} <span className="unit">hrs queue</span></span>
              </div>
            </div>

            <div className="queue-alert-box" style={{ marginTop: 12 }}>
              <MdWarning className="text-amber" />
              <span><strong>{formatMoney(totalDemurrageRisk, { decimals: 0, showCode: true })}</strong> estimated idle cost penalty at {destName.split(' ')[0]}</span>
            </div>
          </motion.div>
        )}

        {/* 3. Green Maritime & Carbon CII Tab */}
        {activeTab === 'green' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="fr24-telemetry-grid">
              <div className="telemetry-cell">
                <span className="cell-lbl">IMO CII Rating</span>
                <span className="cell-val" style={{ color: ciiBadgeColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Rating {ciiRating} <span className="unit">(IMO Compliant)</span>
                </span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Voyage Fuel Burn</span>
                <span className="cell-val text-emerald">{estimatedFuelBurnMT} <span className="unit">MT VLSFO</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Total CO₂e Footprint</span>
                <span className="cell-val">{carbonEmissionsMT.toLocaleString()} <span className="unit">MT CO₂</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Eco Speed Rating</span>
                <span className="cell-val text-ocean">12.4 <span className="unit">/ 13.0 kn</span></span>
              </div>
            </div>
          </motion.div>
        )}

        {/* 4. Port Berth & Draft Feasibility Tab */}
        {activeTab === 'berth' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="fr24-telemetry-grid">
              <div className="telemetry-cell">
                <span className="cell-lbl">Vessel Laden Draft</span>
                <span className="cell-val">{vesselDraft} <span className="unit">meters</span></span>
              </div>
              <div className="telemetry-cell">
                <span className="cell-lbl">Port Max Draft</span>
                <span className="cell-val text-emerald">{destPortObj.max_draft_m || 14.5} <span className="unit">meters</span></span>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: isDraftFeasible ? 'hsla(155, 70%, 45%, 0.1)' : 'hsla(0, 80%, 60%, 0.1)', border: `1px solid ${isDraftFeasible ? 'var(--accent-emerald)' : 'var(--accent-rose)'}` }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isDraftFeasible ? 'var(--accent-emerald)' : 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {isDraftFeasible ? <MdCheckCircle /> : <MdWarning />}
                {isDraftFeasible ? 'Direct Berth Permitted' : 'Exceeds Port Max Draft'}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {isHaldiaLighterage
                  ? '⚠️ Mandatory lighterage transfer required at Sagar Anchorage before entering Haldia dock basin.'
                  : isDraftFeasible
                  ? `Vessel draft of ${vesselDraft}m satisfies the tidal draft clearance at ${destName}.`
                  : `Vessel requires partial deballasting or lightering.`}
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Bottom Action Controls ── */}
      <div className="fr24-card-actions">
        <button onClick={onCenter} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
          <MdMyLocation /> Center Vessel
        </button>
        <button onClick={handleOptimizeInEngine} className="btn btn-secondary btn-sm glow-button" title="Import this cargo parcel to Vessel Optimization Engine">
          <MdScience /> Optimize <MdArrowForward />
        </button>
      </div>
    </motion.div>
  )
}

/* ────────────────────────────────────────────────────────────
   Selected Port Info Drawer Component
   ──────────────────────────────────────────────────────────── */
function PortInfoDrawer({ port, onClose }) {
  if (!port) return null
  const color = congestionColor(port.congestion_index || 0)

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      className="fr24-port-drawer glass-panel"
    >
      <div className="fr24-card-header">
        <div className="fr24-port-avatar" style={{ background: color }}>
          ⚓
        </div>
        <div className="fr24-vessel-meta">
          <span className="fr24-badge-class" style={{ color }}>{port.congestion_status || 'MODERATE QUEUE'}</span>
          <h2 className="fr24-vessel-name">{port.name}</h2>
          <span className="fr24-flag">{port.state ? `${port.state}, India` : port.country}</span>
        </div>
        <button onClick={onClose} className="fr24-btn-close">
          <MdClose size={20} />
        </button>
      </div>

      <div className="fr24-telemetry-grid" style={{ marginTop: 16 }}>
        <div className="telemetry-cell">
          <span className="cell-lbl">Anchored Vessels</span>
          <span className="cell-val text-amber">{port.anchored_vessels || 0} <span className="unit">ships in queue</span></span>
        </div>
        <div className="telemetry-cell">
          <span className="cell-lbl">Queue Wait Time</span>
          <span className="cell-val">{port.waiting_days || 1.8} <span className="unit">days</span></span>
        </div>
        <div className="telemetry-cell">
          <span className="cell-lbl">Permissible Draft</span>
          <span className="cell-val text-emerald">{port.max_draft_m || 14.5} <span className="unit">m</span></span>
        </div>
        <div className="telemetry-cell">
          <span className="cell-lbl">Handling Capacity</span>
          <span className="cell-val">{port.handling_rate_mtpa || 120} <span className="unit">MTPA</span></span>
        </div>
      </div>

      <div className="fr24-cargo-box" style={{ marginTop: 14 }}>
        <div className="cargo-header">
          <span className="cargo-title">🚢 Primary Cargo Handled</span>
        </div>
        <p className="cargo-desc">{(port.primary_cargoes || ['Thermal Coal', 'Coking Coal', 'Iron Ore']).join(', ')}</p>
        {port.lighterage_required && (
          <div className="queue-alert-box" style={{ marginTop: 10 }}>
            <MdWarning className="text-amber" />
            <span>Mandatory Lighterage required at Sagar Anchorage</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ────────────────────────────────────────────────────────────
   3D Globe Component
   ──────────────────────────────────────────────────────────── */
const GLOBE_RADIUS = 2.5

function latLonToVec3(lat, lon, r = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

function buildGlobeArc(lat1, lon1, lat2, lon2, segments = 60, altitude = 0.3) {
  const start = latLonToVec3(lat1, lon1)
  const end = latLonToVec3(lat2, lon2)
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const dist = start.distanceTo(end)
  mid.normalize().multiplyScalar(GLOBE_RADIUS + altitude + dist * 0.15)
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  return new THREE.CatmullRomCurve3(curve.getPoints(segments))
}

function GlobeScene({ indianPorts, globalPorts, routes, vessels }) {
  const allPorts = useMemo(() => [...indianPorts, ...globalPorts], [indianPorts, globalPorts])

  const routeArcs = useMemo(() => {
    return routes.map(r => {
      const from = allPorts.find(p => r.origin?.toLowerCase().includes(p.name?.toLowerCase()?.split(' ')[0] || '___') || r.route_id?.startsWith(p.port_id))
      const to = allPorts.find(p => r.destination?.toLowerCase().includes(p.name?.toLowerCase()?.split(' ')[0] || '___') || r.route_id?.endsWith(p.port_id))
      if (!from || !to || !from.lat || !to.lat) return null
      return { curve: buildGlobeArc(from.lat, from.lon, to.lat, to.lon), color: rgbToHex(routeColorFromOrigin(r.origin)) }
    }).filter(Boolean)
  }, [routes, allPorts])

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} />
      <pointLight position={[-10, -10, -5]} color="#38bdf8" intensity={0.4} />

      <group rotation={[0.2, 0.4, 0]}>
        <mesh>
          <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
          <meshStandardMaterial color="#081026" roughness={0.7} metalness={0.2} />
        </mesh>
        <mesh scale={1.015}>
          <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.05} />
        </mesh>

        {routeArcs.map((arc, i) => (
          <Tube key={i} args={[arc.curve, 60, 0.012, 6, false]}>
            <meshStandardMaterial color={arc.color} emissive={arc.color} emissiveIntensity={0.6} transparent opacity={0.6} />
          </Tube>
        ))}

        {allPorts.filter(p => p.lat && p.lon).map(p => {
          const pos = latLonToVec3(p.lat, p.lon, GLOBE_RADIUS + 0.04)
          return (
            <mesh key={p.port_id} position={[pos.x, pos.y, pos.z]}>
              <sphereGeometry args={[0.04, 16, 16]} />
              <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.8} />
            </mesh>
          )
        })}

        {vessels.filter(v => v.lat && v.lon).map(v => {
          const pos = latLonToVec3(v.lat, v.lon, GLOBE_RADIUS + 0.08)
          return (
            <mesh key={v.id} position={[pos.x, pos.y, pos.z]}>
              <cylinderGeometry args={[0.02, 0.03, 0.08, 6]} />
              <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

/* ────────────────────────────────────────────────────────────
   Main RouteMapPage Component
   ──────────────────────────────────────────────────────────── */
export default function RouteMapPage() {
  const [viewMode, setViewMode] = useState('map')
  const [selectedVessel, setSelectedVessel] = useState(null)
  const [selectedPort, setSelectedPort] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showWeather, setShowWeather] = useState(true)
  const [showAnchorageZones, setShowAnchorageZones] = useState(true)
  const [timeOffsetHours, setTimeOffsetHours] = useState(0) // Time Scrubbing Slider (+0h, +24h, +48h, +72h)
  const [isPlayingScrubber, setIsPlayingScrubber] = useState(false)
  const [rulerActive, setRulerActive] = useState(false)
  const [rulerPoints, setRulerPoints] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)

  // API State
  const [vessels, setVessels] = useState([])
  const [indianPorts, setIndianPorts] = useState([])
  const [globalPorts, setGlobalPorts] = useState([])
  const [routes, setRoutes] = useState([])
  const [weatherData, setWeatherData] = useState([])
  const [apiStatus, setApiStatus] = useState({})

  const fetchMapIntelligence = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const data = await getMapIntelligence()
      if (data?.vessels?.length) setVessels(data.vessels)
      if (data?.ports?.indian?.length) setIndianPorts(data.ports.indian)
      if (data?.ports?.global?.length) setGlobalPorts(data.ports.global)
      if (data?.route_risks?.length) setRoutes(data.route_risks)
      if (data?.marine_weather?.length) setWeatherData(data.marine_weather)
      if (data?.api_status) setApiStatus(data.api_status)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Map intelligence fetch error:', err)
      setLastUpdated(new Date().toLocaleTimeString() + ' (cached)')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMapIntelligence(true)
    const id = setInterval(() => fetchMapIntelligence(false), 90000)
    return () => clearInterval(id)
  }, [fetchMapIntelligence])

  // Time scrubber auto-play loop
  useEffect(() => {
    let interval = null
    if (isPlayingScrubber) {
      interval = setInterval(() => {
        setTimeOffsetHours(prev => (prev >= 72 ? 0 : prev + 6))
      }, 1200)
    }
    return () => clearInterval(interval)
  }, [isPlayingScrubber])

  // Handle Ruler Point Click
  const handleRulerClick = useCallback((coord) => {
    setRulerPoints(prev => (prev.length >= 2 ? [coord] : [...prev, coord]))
  }, [])

  const handleVesselClick = useCallback((id) => {
    setSelectedVessel(prev => (prev === id ? null : id))
    setSelectedPort(null)
  }, [])

  const handlePortClick = useCallback((port) => {
    setSelectedPort(port)
  }, [])

  // Ruler Distance Calculation
  const rulerDistanceNM = useMemo(() => {
    if (rulerPoints.length < 2) return null
    return haversineNM(rulerPoints[0][1], rulerPoints[0][0], rulerPoints[1][1], rulerPoints[1][0])
  }, [rulerPoints])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return vessels.filter(v =>
      v.name?.toLowerCase().includes(q) ||
      v.dest?.toLowerCase().includes(q) ||
      v.cargo?.toLowerCase().includes(q) ||
      v.class?.toLowerCase().includes(q)
    ).slice(0, 5)
  }, [searchQuery, vessels])

  const activeVesselData = useMemo(() => {
    return vessels.find(v => v.id === selectedVessel)
  }, [vessels, selectedVessel])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fr24-map-container">
      {/* ──── Full-Bleed Map Viewport ──── */}
      <div className="fr24-map-stage">
        {viewMode === 'map' ? (
          <MapboxMap
            indianPorts={indianPorts}
            globalPorts={globalPorts}
            routes={routes}
            vessels={vessels}
            weatherData={weatherData}
            selectedVessel={selectedVessel}
            onVesselClick={handleVesselClick}
            onPortClick={handlePortClick}
            filterStatus={filterStatus}
            showWeather={showWeather}
            showAnchorageZones={showAnchorageZones}
            timeOffsetHours={timeOffsetHours}
            rulerActive={rulerActive}
            rulerPoints={rulerPoints}
            onRulerClick={handleRulerClick}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#030a18' }}>
            <Canvas camera={{ position: [0, 2, 7], fov: 42 }}>
              <GlobeScene
                indianPorts={indianPorts}
                globalPorts={globalPorts}
                routes={routes}
                vessels={vessels}
              />
              <OrbitControls enablePan={false} enableZoom minDistance={3.8} maxDistance={14} />
            </Canvas>
          </div>
        )}

        {/* ──── Top-Left HUD: Live Search Bar & Active Stats ──── */}
        <div className="fr24-top-left-hud">
          <div className="fr24-search-box">
            <MdSearch className="search-icon" size={20} />
            <input
              type="text"
              placeholder="Search vessel, cargo, or port..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="fr24-search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="btn-clear-search">
                <MdClose size={16} />
              </button>
            )}

            {searchResults.length > 0 && (
              <div className="fr24-search-dropdown glass-panel">
                {searchResults.map(v => (
                  <div
                    key={v.id}
                    onClick={() => {
                      setSelectedVessel(v.id)
                      setSearchQuery('')
                    }}
                    className="dropdown-item"
                  >
                    <div className="item-title">🚢 {v.name}</div>
                    <div className="item-sub">{v.class} • {v.cargo} → {v.dest}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="fr24-stats-pill-group">
            <div className="hud-pill" onClick={() => setFilterStatus('all')}>
              <MdDirectionsBoat /> <span><strong>{vessels.length}</strong> Vessels</span>
            </div>
            <div className="hud-pill text-emerald" onClick={() => setFilterStatus('underway')}>
              <MdCheckCircle /> <span><strong>{vessels.filter(v => v.status !== 'At Anchor').length}</strong> Underway</span>
            </div>
            <div className="hud-pill text-amber" onClick={() => setFilterStatus('anchor')}>
              <MdAnchor /> <span><strong>{vessels.filter(v => v.status === 'At Anchor').length}</strong> At Anchor</span>
            </div>
            <div className="hud-pill text-rose">
              <MdWarning /> <span><strong>{indianPorts.filter(p => p.congestion_index >= 60).length}</strong> Congested Ports</span>
            </div>
          </div>
        </div>

        {/* ──── Top-Right HUD: Layers & Controls ──── */}
        <div className="fr24-top-right-hud">
          <div className="fr24-control-group glass-panel">
            <button
              onClick={() => setViewMode(m => m === 'map' ? '3d' : 'map')}
              className={`hud-btn ${viewMode === '3d' ? 'active' : ''}`}
              title="Toggle 2D Map / 3D Globe"
            >
              {viewMode === 'map' ? <MdPublic size={18} /> : <MdMap size={18} />}
              <span>{viewMode === 'map' ? '3D Globe' : '2D Map'}</span>
            </button>

            <button
              onClick={() => setShowAnchorageZones(z => !z)}
              className={`hud-btn ${showAnchorageZones ? 'active' : ''}`}
              title="Toggle Port Anchorage Heatmap Zones"
            >
              <MdAnchor size={18} />
              <span>Anchor Zones</span>
            </button>

            <button
              onClick={() => setShowWeather(w => !w)}
              className={`hud-btn ${showWeather ? 'active' : ''}`}
              title="Toggle Marine Weather Sea State"
            >
              <MdWaves size={18} />
              <span>Weather</span>
            </button>

            <button
              onClick={() => {
                setRulerActive(r => !r)
                setRulerPoints([])
              }}
              className={`hud-btn ${rulerActive ? 'active' : ''}`}
              title="Measure Nautical Distance on Map"
            >
              <MdStraighten size={18} />
              <span>Measure</span>
            </button>

            <button
              onClick={() => fetchMapIntelligence(false)}
              disabled={loading}
              className="hud-btn"
              title={`Last Updated: ${lastUpdated || 'Loading...'}`}
            >
              <MdRefresh size={18} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* ──── Active Ruler Measurement Tool Floating Chip ──── */}
        {rulerActive && (
          <div className="fr24-ruler-hud glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdStraighten className="text-ocean" size={20} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  {rulerPoints.length === 0 && 'Click first point on map...'}
                  {rulerPoints.length === 1 && 'Click second point on map...'}
                  {rulerPoints.length === 2 && `${rulerDistanceNM?.toLocaleString()} Nautical Miles`}
                </div>
                {rulerDistanceNM && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    ~{(rulerDistanceNM / (12.5 * 24)).toFixed(1)} sailing days @ 12.5 kn • ~{Math.round(rulerDistanceNM * 0.075)} MT VLSFO
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setRulerPoints([])} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 11 }}>
              Reset
            </button>
          </div>
        )}

        {/* ──── FlightRadar24 Slide-in Pop-up Vessel Side Card ──── */}
        <AnimatePresence>
          {activeVesselData && (
            <FlightRadarSideCard
              vessel={activeVesselData}
              onClose={() => setSelectedVessel(null)}
              onCenter={() => setSelectedVessel(activeVesselData.id)}
              allPorts={[...indianPorts, ...globalPorts]}
            />
          )}
        </AnimatePresence>

        {/* ──── Slide-in Port Info Drawer ──── */}
        <AnimatePresence>
          {selectedPort && (
            <PortInfoDrawer
              port={selectedPort}
              onClose={() => setSelectedPort(null)}
            />
          )}
        </AnimatePresence>

        {/* ──── FlightRadar24 Voyage Time Scrubber Bar ──── */}
        <div className="fr24-scrubber-bar glass-panel">
          <button
            onClick={() => setIsPlayingScrubber(p => !p)}
            className="scrubber-play-btn"
            title={isPlayingScrubber ? 'Pause Scrubber' : 'Play Future Voyage Projection'}
          >
            {isPlayingScrubber ? <MdPause size={18} /> : <MdPlayArrow size={18} />}
          </button>
          <div className="scrubber-label">
            <span>Projection:</span>
            <strong>{timeOffsetHours === 0 ? 'Live Real-Time' : `+${timeOffsetHours}h Future Position`}</strong>
          </div>
          <input
            type="range"
            min="0"
            max="72"
            step="6"
            value={timeOffsetHours}
            onChange={(e) => setTimeOffsetHours(Number(e.target.value))}
            className="scrubber-slider"
          />
          <div className="scrubber-ticks">
            <span className={timeOffsetHours === 0 ? 'active' : ''} onClick={() => setTimeOffsetHours(0)}>Now</span>
            <span className={timeOffsetHours === 24 ? 'active' : ''} onClick={() => setTimeOffsetHours(24)}>+24h</span>
            <span className={timeOffsetHours === 48 ? 'active' : ''} onClick={() => setTimeOffsetHours(48)}>+48h</span>
            <span className={timeOffsetHours === 72 ? 'active' : ''} onClick={() => setTimeOffsetHours(72)}>+72h</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
