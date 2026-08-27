import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MdMap, MdPublic, MdDirectionsBoat, MdLocalShipping, MdWarning, MdRefresh, MdMyLocation, MdWaves, MdTrendingUp, MdCloud, MdAnchor, MdSignalWifi4Bar, MdSignalWifiOff } from 'react-icons/md'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Tube } from '@react-three/drei'
import * as THREE from 'three'
import { getMapIntelligence } from '../api/client'

/* ────────────────────────────────────────────────────────────
   Mapbox token – use env var or public demo token
   ──────────────────────────────────────────────────────────── */
mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw'

/* ────────────────────────────────────────────────────────────
   Helper utilities
   ──────────────────────────────────────────────────────────── */
function congestionColor(index) {
  if (index >= 60) return '#ef4444'
  if (index >= 35) return '#f59e0b'
  return '#22c55e'
}

function riskColor(score) {
  if (score >= 60) return '#ef4444'
  if (score >= 35) return '#f59e0b'
  return '#22c55e'
}

function weatherRiskColor(risk) {
  if (risk >= 0.5) return '#ef4444'
  if (risk >= 0.25) return '#f59e0b'
  return '#38bdf8'
}

/* Route colors by origin country pattern */
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

/* ────────────────────────────────────────────────────────────
   2-D Mapbox Map component — ALL data from API
   ──────────────────────────────────────────────────────────── */
function MapboxMap({ indianPorts, globalPorts, routes, vessels, weatherData, selectedVessel, onVesselClick }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markersRef = useRef([])
  const weatherMarkersRef = useRef([])
  const popupRef = useRef(null)

  // Build GeoJSON for routes from API data
  const routesGeoJSON = useMemo(() => {
    const features = routes.map((route, i) => {
      const originPort = [...indianPorts, ...globalPorts].find(p => p.port_id === route.route_id?.split('_TO_')[0]?.replace(/_/g, '_'))
      const destPort = [...indianPorts, ...globalPorts].find(p => p.port_id === route.route_id?.split('_TO_')[1])

      // Find matching ports from the full port arrays
      const fromPort = globalPorts.find(p => route.origin?.toLowerCase().includes(p.name?.toLowerCase()?.split(' ')[0] || '___'))
        || globalPorts.find(p => route.route_id?.startsWith(p.port_id))
      const toPort = indianPorts.find(p => route.destination?.toLowerCase().includes(p.name?.toLowerCase()?.split(' ')[0] || '___'))
        || indianPorts.find(p => route.route_id?.endsWith(p.port_id))

      const from = fromPort || originPort
      const to = toPort || destPort
      if (!from || !to || !from.lat || !to.lat) return null

      const coords = []
      for (let t = 0; t <= 60; t++) {
        const f = t / 60
        const lon = from.lon + (to.lon - from.lon) * f
        const lat = from.lat + (to.lat - from.lat) * f
        const bulge = Math.sin(f * Math.PI) * ((Math.abs(to.lon - from.lon) + Math.abs(to.lat - from.lat)) * 0.08)
        coords.push([lon + bulge * 0.3, lat + bulge * 0.7])
      }

      const color = routeColorFromOrigin(route.origin)
      const riskScore = route.risk_score || 0
      return {
        type: 'Feature',
        properties: {
          color: rgbToHex(color),
          label: `${route.origin} → ${route.destination}`,
          risk_score: riskScore,
          risk_level: route.risk_level || 'Unknown',
          cargo: route.primary_cargo || '',
          distance_nm: route.distance_nm || 0,
          sailing_days: route.sailing_days || 0,
          opacity: Math.max(0.4, 1 - riskScore / 150),
          width: riskScore >= 60 ? 3 : riskScore >= 35 ? 2 : 1.5,
          index: i,
        },
        geometry: { type: 'LineString', coordinates: coords },
      }
    }).filter(Boolean)
    return { type: 'FeatureCollection', features }
  }, [routes, indianPorts, globalPorts])

  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [80, 10],
      zoom: 2.8,
      pitch: 0,
      bearing: 0,
      antialias: true,
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.current.addControl(new mapboxgl.FullscreenControl(), 'bottom-right')
    map.current.addControl(new mapboxgl.ScaleControl({ unit: 'nautical' }), 'bottom-left')

    map.current.on('load', () => {
      addMapLayers()
    })

    return () => {
      if (map.current) { map.current.remove(); map.current = null }
    }
  }, [])

  function addMapLayers() {
    if (!map.current || !map.current.isStyleLoaded()) return

    // ── Trade route lines ───────────────────────────────────
    if (map.current.getSource('trade-routes')) {
      map.current.getSource('trade-routes').setData(routesGeoJSON)
    } else {
      map.current.addSource('trade-routes', { type: 'geojson', data: routesGeoJSON })

      // Risk glow layer — higher risk = stronger glow
      map.current.addLayer({
        id: 'route-risk-glow',
        type: 'line',
        source: 'trade-routes',
        paint: {
          'line-color': ['case',
            ['>=', ['get', 'risk_score'], 60], '#ef4444',
            ['>=', ['get', 'risk_score'], 35], '#f59e0b',
            ['get', 'color'],
          ],
          'line-width': ['case',
            ['>=', ['get', 'risk_score'], 60], 12,
            ['>=', ['get', 'risk_score'], 35], 8,
            6,
          ],
          'line-opacity': 0.15,
          'line-blur': 6,
        },
      })

      // Core line
      map.current.addLayer({
        id: 'route-core',
        type: 'line',
        source: 'trade-routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
          'line-dasharray': [4, 5],
        },
      })

      // Route click popup
      map.current.on('click', 'route-core', e => {
        const props = e.features[0].properties
        if (popupRef.current) popupRef.current.remove()
        popupRef.current = new mapboxgl.Popup({ className: 'mapbox-dark-popup', offset: 12 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="popup-inner">
              <div class="popup-title">🚢 ${props.label}</div>
              <div class="popup-row"><span>Cargo</span><span>${props.cargo}</span></div>
              <div class="popup-row"><span>Distance</span><span>${Number(props.distance_nm).toLocaleString()} NM</span></div>
              <div class="popup-row"><span>Sailing Days</span><span>${props.sailing_days}d</span></div>
              <div class="popup-row"><span>Risk Score</span><span style="color:${riskColor(Number(props.risk_score))};font-weight:600">${props.risk_score}/100 (${props.risk_level})</span></div>
            </div>
          `)
          .addTo(map.current)
      })
      map.current.on('mouseenter', 'route-core', () => { map.current.getCanvas().style.cursor = 'pointer' })
      map.current.on('mouseleave', 'route-core', () => { map.current.getCanvas().style.cursor = '' })
    }
  }

  // Update port layers when port data changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return
    const onReady = () => updatePortLayers()
    if (map.current.isStyleLoaded()) onReady()
    else map.current.once('load', onReady)
  }, [indianPorts, globalPorts])

  function updatePortLayers() {
    if (!map.current) return

    // ── Global supply ports from API ─────────────────────────
    const globalGeoJSON = {
      type: 'FeatureCollection',
      features: globalPorts.filter(p => p.lat && p.lon).map(p => ({
        type: 'Feature',
        properties: {
          name: p.name, country: p.country,
          congestion_index: p.congestion_index || 0,
          congestion_status: p.congestion_status || 'Unknown',
          anchored: p.anchored_vessels || 0,
          waiting_days: p.waiting_days || 0,
          cargoes: (p.primary_cargoes || []).join(', '),
          colorHex: congestionColor(p.congestion_index || 0),
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    }

    if (map.current.getSource('global-ports')) {
      map.current.getSource('global-ports').setData(globalGeoJSON)
    } else {
      map.current.addSource('global-ports', { type: 'geojson', data: globalGeoJSON })
      map.current.addLayer({
        id: 'global-ports-circle',
        type: 'circle',
        source: 'global-ports',
        paint: {
          'circle-radius': 7,
          'circle-color': ['concat', 'rgba(', ['to-string', ['case', ['>=', ['get', 'congestion_index'], 60], 239, ['>=', ['get', 'congestion_index'], 35], 245, 56]], ',', ['to-string', ['case', ['>=', ['get', 'congestion_index'], 60], 68, ['>=', ['get', 'congestion_index'], 35], 158, 189]], ',', ['to-string', ['case', ['>=', ['get', 'congestion_index'], 60], 68, ['>=', ['get', 'congestion_index'], 35], 11, 248]], ',0.15)'],
          'circle-stroke-color': ['get', 'colorHex'],
          'circle-stroke-width': 1.5,
        },
      })
      map.current.on('click', 'global-ports-circle', e => {
        const props = e.features[0].properties
        const coords = e.features[0].geometry.coordinates
        if (popupRef.current) popupRef.current.remove()
        popupRef.current = new mapboxgl.Popup({ className: 'mapbox-dark-popup', offset: 12 })
          .setLngLat(coords)
          .setHTML(`
            <div class="popup-inner">
              <div class="popup-title">${props.name} (${props.country})</div>
              <div class="popup-row"><span>Type</span><span>Load Port</span></div>
              <div class="popup-row"><span>Cargoes</span><span>${props.cargoes}</span></div>
              <div class="popup-row"><span>Congestion</span><span style="color:${props.colorHex};font-weight:600">${props.congestion_status}</span></div>
              <div class="popup-row"><span>Anchored</span><span>${props.anchored} vessels</span></div>
              <div class="popup-row"><span>Wait Time</span><span>${props.waiting_days}d</span></div>
            </div>
          `)
          .addTo(map.current)
      })
      map.current.on('mouseenter', 'global-ports-circle', () => { map.current.getCanvas().style.cursor = 'pointer' })
      map.current.on('mouseleave', 'global-ports-circle', () => { map.current.getCanvas().style.cursor = '' })
    }

    // ── Indian ports from API ────────────────────────────────
    const indianGeoJSON = {
      type: 'FeatureCollection',
      features: indianPorts.filter(p => p.lat && p.lon).map(p => ({
        type: 'Feature',
        properties: {
          name: p.name, state: p.state || '',
          congestion_index: p.congestion_index || 0,
          congestion_status: p.congestion_status || 'Unknown',
          anchored: p.anchored_vessels || 0,
          waiting_days: p.waiting_days || 0,
          max_draft: p.max_draft_m || 0,
          handling_rate: p.handling_rate_mtpa || 0,
          cargoes: (p.primary_cargoes || []).join(', '),
          lighterage: p.lighterage_required ? 'Yes' : 'No',
          colorHex: congestionColor(p.congestion_index || 0),
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    }

    if (map.current.getSource('indian-ports')) {
      map.current.getSource('indian-ports').setData(indianGeoJSON)
    } else {
      map.current.addSource('indian-ports', { type: 'geojson', data: indianGeoJSON })

      // Pulse halo — size based on congestion
      map.current.addLayer({
        id: 'indian-ports-halo',
        type: 'circle',
        source: 'indian-ports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'congestion_index'], 0, 12, 50, 20, 100, 30],
          'circle-color': ['get', 'colorHex'],
          'circle-opacity': 0.08,
          'circle-blur': 1,
        },
      })
      // Core dot
      map.current.addLayer({
        id: 'indian-ports-dot',
        type: 'circle',
        source: 'indian-ports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 8, 12],
          'circle-color': ['get', 'colorHex'],
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.9,
        },
      })

      // Port click — live data popup
      map.current.on('click', 'indian-ports-dot', e => {
        const props = e.features[0].properties
        const coords = e.features[0].geometry.coordinates
        if (popupRef.current) popupRef.current.remove()
        popupRef.current = new mapboxgl.Popup({ className: 'mapbox-dark-popup', offset: 12 })
          .setLngLat(coords)
          .setHTML(`
            <div class="popup-inner">
              <div class="popup-title">🇮🇳 ${props.name}</div>
              <div class="popup-row"><span>State</span><span>${props.state}</span></div>
              <div class="popup-row"><span>Congestion</span><span style="color:${props.colorHex};font-weight:600">${props.congestion_status} (${props.congestion_index}/100)</span></div>
              <div class="popup-row"><span>Anchored</span><span>${props.anchored} vessels</span></div>
              <div class="popup-row"><span>Wait Time</span><span>${props.waiting_days}d</span></div>
              <div class="popup-row"><span>Max Draft</span><span>${props.max_draft}m</span></div>
              <div class="popup-row"><span>Capacity</span><span>${props.handling_rate} MTPA</span></div>
              <div class="popup-row"><span>Cargoes</span><span>${props.cargoes}</span></div>
              <div class="popup-row"><span>Lighterage</span><span>${props.lighterage}</span></div>
            </div>
          `)
          .addTo(map.current)
      })
      map.current.on('mouseenter', 'indian-ports-dot', () => { map.current.getCanvas().style.cursor = 'pointer' })
      map.current.on('mouseleave', 'indian-ports-dot', () => { map.current.getCanvas().style.cursor = '' })
    }
  }

  // Update route layers when route data changes
  useEffect(() => {
    if (!map.current) return
    const onReady = () => {
      if (map.current.getSource('trade-routes')) {
        map.current.getSource('trade-routes').setData(routesGeoJSON)
      } else {
        addMapLayers()
      }
    }
    if (map.current.isStyleLoaded()) onReady()
    else map.current.once('load', onReady)
  }, [routesGeoJSON])

  // Weather markers overlay
  useEffect(() => {
    if (!map.current) return
    const onReady = () => {
      weatherMarkersRef.current.forEach(m => m.remove())
      weatherMarkersRef.current = []

      weatherData.forEach(wx => {
        if (!wx.lat || !wx.lon || wx.risk_score === undefined) return
        const riskScore = wx.risk_score || 0
        if (riskScore < 0.15) return // Skip calm conditions

        const el = document.createElement('div')
        el.className = 'weather-marker'
        const color = weatherRiskColor(riskScore)
        el.style.cssText = `
          width: 32px; height: 32px; border-radius: 50%;
          background: ${color}22; border: 1.5px solid ${color}80;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; cursor: pointer; backdrop-filter: blur(4px);
          animation: weatherPulse 3s ease-in-out infinite;
        `
        el.innerHTML = riskScore >= 0.5 ? '⛈️' : riskScore >= 0.25 ? '🌊' : '🌤️'
        el.title = `${wx.port_name}: ${wx.wave_height_m}m waves — ${wx.weather_alert}`

        el.addEventListener('click', () => {
          if (popupRef.current) popupRef.current.remove()
          popupRef.current = new mapboxgl.Popup({ className: 'mapbox-dark-popup', offset: 16 })
            .setLngLat([wx.lon, wx.lat])
            .setHTML(`
              <div class="popup-inner">
                <div class="popup-title">🌊 Weather — ${wx.port_name}</div>
                <div class="popup-row"><span>Wave Height</span><span style="color:${color};font-weight:600">${wx.wave_height_m}m</span></div>
                <div class="popup-row"><span>Swell</span><span>${wx.swell_wave_height_m}m</span></div>
                <div class="popup-row"><span>Period</span><span>${wx.wave_period_s}s</span></div>
                <div class="popup-row"><span>Risk</span><span style="color:${color};font-weight:600">${(riskScore * 100).toFixed(0)}%</span></div>
                <div class="popup-row"><span>Condition</span><span>${wx.weather_alert}</span></div>
                <div class="popup-row"><span>Source</span><span>Open-Meteo Marine (${wx.status})</span></div>
              </div>
            `)
            .addTo(map.current)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([wx.lon, wx.lat])
          .addTo(map.current)
        weatherMarkersRef.current.push(marker)
      })
    }
    if (map.current.isStyleLoaded()) onReady()
    else map.current.once('load', onReady)
  }, [weatherData])

  // Update vessel markers whenever vessels change
  useEffect(() => {
    if (!map.current) return
    const ready = () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      vessels.forEach(vessel => {
        if (!vessel.lat || !vessel.lon) return
        const isAnchor = vessel.status === 'At Anchor'
        const color = isAnchor ? '#f59e0b' : '#38bdf8'
        const isSelected = selectedVessel === vessel.id

        const el = document.createElement('div')
        el.className = 'vessel-marker'
        el.style.cssText = `
          position: relative; width: 28px; height: 28px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        `

        if (false) {
          const ring = document.createElement('div')
          ring.style.cssText = `
            position: absolute; width: 28px; height: 28px; border-radius: 50%;
            border: 1.5px solid ${color}60; animation: vesselPing 2s ease-out infinite;
          `
          el.appendChild(ring)
        }

        const icon = document.createElement('div')
        icon.style.cssText = `
          width: 0; height: 0;
          border-left: 6px solid transparent; border-right: 6px solid transparent;
          border-bottom: 16px solid ${color};
          transform: rotate(${vessel.heading || 0}deg);
          filter: drop-shadow(0 0 6px ${color});
          ${isSelected ? `filter: drop-shadow(0 0 10px ${color}) brightness(1.4);` : ''}
        `
        el.appendChild(icon)

        el.addEventListener('click', () => {
          if (popupRef.current) popupRef.current.remove()
          popupRef.current = new mapboxgl.Popup({ className: 'mapbox-dark-popup', offset: 16 })
            .setLngLat([vessel.lon, vessel.lat])
            .setHTML(`
              <div class="popup-inner">
                <div class="popup-title">🚢 ${vessel.name}</div>
                <div class="popup-row"><span>Class</span><span>${vessel.class} • ${((vessel.dwt || 0) / 1000).toFixed(0)}K DWT</span></div>
                <div class="popup-row"><span>Speed</span><span>${vessel.speed || 0} kn • ${vessel.heading || 0}°</span></div>
                <div class="popup-row"><span>Cargo</span><span>${vessel.cargo || 'Unknown'}</span></div>
                <div class="popup-row"><span>Status</span><span style="color:${color};font-weight:600">${vessel.status} → ${vessel.dest || '?'}</span></div>
                <div class="popup-row"><span>Wait Time</span><span>${vessel.wait_time_hours || 0} hrs</span></div>
                <div class="popup-row"><span>Mat. Transferred</span><span>${vessel.materials_transferred ? vessel.materials_transferred.toLocaleString() : 0} MT</span></div>
                <div class="popup-row"><span>Position</span><span>${vessel.lat.toFixed(2)}°, ${vessel.lon.toFixed(2)}°</span></div>
              </div>
            `)
            .addTo(map.current)
          onVesselClick(vessel.id)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([vessel.lon, vessel.lat])
          .addTo(map.current)
        markersRef.current.push(marker)
      })
    }

    if (map.current.isStyleLoaded()) ready()
    else map.current.once('load', ready)
  }, [vessels, selectedVessel])

  const zoomToIndia = useCallback(() => {
    map.current?.flyTo({ center: [83, 20], zoom: 5, pitch: 40, duration: 1800 })
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Stat chips — live counts from API */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="map-stat-chip"><MdDirectionsBoat /> <span>{vessels.length} Vessels</span></div>
        <div className="map-stat-chip"><MdLocalShipping /> <span>{routes.length} Routes</span></div>
        <div className="map-stat-chip" style={{ color: '#ef4444' }}>
          <MdWarning /> <span>{indianPorts.filter(p => p.congestion_index >= 60).length} Congested</span>
        </div>
        <div className="map-stat-chip" style={{ color: '#38bdf8' }}>
          <MdWaves /> <span>{weatherData.filter(w => w.risk_score >= 0.25).length} Weather Alerts</span>
        </div>
      </div>

      {/* Zoom to India button */}
      <button
        onClick={zoomToIndia}
        className="map-zoom-btn"
        title="Zoom to India"
        style={{
          position: 'absolute', top: 12, right: 52, zIndex: 10,
          background: 'hsla(220,25%,10%,0.9)', border: '1px solid hsla(220,20%,30%,0.4)',
          color: '#94a3b8', borderRadius: 8, padding: '6px 10px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, backdropFilter: 'blur(8px)', transition: 'all 0.2s',
        }}
      >
        <MdMyLocation /> India
      </button>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 36, left: 12, zIndex: 10,
        display: 'flex', gap: 14, flexWrap: 'wrap',
        fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)',
        background: 'hsla(220,25%,8%,0.85)', backdropFilter: 'blur(12px)',
        padding: '6px 14px', borderRadius: 'var(--radius-full)',
        border: '1px solid hsla(220,20%,25%,0.3)',
      }}>
        {[['#22c55e', 'Low Risk'], ['#f59e0b', 'Medium'], ['#ef4444', 'High']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}`, display: 'inline-block' }} />{l}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '9px solid #38bdf8', display: 'inline-block' }} />Vessel
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>🌊 Weather</span>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   3D Globe helpers
   ──────────────────────────────────────────────────────────── */
const GLOBE_RADIUS = 2.5

function latLonToVec3(lat, lon, r = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

function buildGlobeArc(lat1, lon1, lat2, lon2, segments = 80, altitude = 0.35) {
  const start = latLonToVec3(lat1, lon1)
  const end = latLonToVec3(lat2, lon2)
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const dist = start.distanceTo(end)
  mid.normalize().multiplyScalar(GLOBE_RADIUS + altitude + dist * 0.18)
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  return new THREE.CatmullRomCurve3(curve.getPoints(segments))
}

/* Animated vessel marker on globe */
function GlobeVessel({ position, heading, color = '#38bdf8' }) {
  const ref = useRef()
  const baseY = position.y
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = baseY + Math.sin(clock.getElapsedTime() * 1.8 + heading) * 0.018
    ref.current.rotation.y += 0.008
  })
  return (
    <group ref={ref} position={[position.x, baseY, position.z]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.025, 0.12, 6]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0.025, 0.025, 0]}>
        <boxGeometry args={[0.04, 0.035, 0.04]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
      <pointLight color={color} intensity={0.8} distance={0.6} />
    </group>
  )
}

/* Port beacon */
function PortBeacon({ position, color, size = 0.055 }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.12 * Math.sin(clock.getElapsedTime() * 3))
  })
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh ref={ref}>
        <octahedronGeometry args={[size]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} metalness={0.3} />
      </mesh>
      <pointLight color={color} intensity={0.5} distance={0.8} />
    </group>
  )
}

/* Full 3D globe scene — uses API data */
function GlobeScene({ indianPorts, globalPorts, routes, vessels }) {
  const groupRef = useRef()
  const earthTex = useMemo(() => new THREE.TextureLoader().load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/planets/earth_atmos_2048.jpg'), [])
  const normalTex = useMemo(() => new THREE.TextureLoader().load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/planets/earth_normal_2048.jpg'), [])
  const specularTex = useMemo(() => new THREE.TextureLoader().load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/planets/earth_specular_2048.jpg'), [])

  const allPorts = useMemo(() => [...indianPorts, ...globalPorts], [indianPorts, globalPorts])

  // Build globe arcs from API route data
  const routeArcs = useMemo(() => {
    return routes.map(route => {
      const fromPort = globalPorts.find(p => route.route_id?.startsWith(p.port_id))
      const toPort = indianPorts.find(p => route.route_id?.endsWith(p.port_id))
      if (!fromPort || !toPort || !fromPort.lat || !toPort.lat) return null
      const curve = buildGlobeArc(fromPort.lat, fromPort.lon, toPort.lat, toPort.lon)
      const color = rgbToHex(routeColorFromOrigin(route.origin))
      return { curve, color, risk_score: route.risk_score || 0 }
    }).filter(Boolean)
  }, [routes, indianPorts, globalPorts])

  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y += 0.0005
  })

  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 4, 6]} intensity={1.1} castShadow />
      <pointLight position={[-8, -4, -6]} intensity={0.15} color="#3b82f6" />

      <group ref={groupRef}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
          <meshPhongMaterial map={earthTex} normalMap={normalTex} specularMap={specularTex} specular={new THREE.Color(0x444444)} shininess={18} />
        </mesh>
        <mesh scale={1.045}>
          <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
          <meshBasicMaterial color={0x4488cc} side={THREE.BackSide} transparent opacity={0.18} />
        </mesh>
        <mesh scale={1.012}>
          <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
          <meshBasicMaterial color={0xffffff} transparent opacity={0.04} />
        </mesh>

        {/* Trade route arcs from API */}
        {routeArcs.map((arc, i) => (
          <Tube key={i} args={[arc.curve, 80, 0.012, 8, false]}>
            <meshStandardMaterial color={arc.color} emissive={arc.color} emissiveIntensity={0.6} transparent opacity={Math.max(0.4, 1 - arc.risk_score / 150)} />
          </Tube>
        ))}

        {/* Port beacons from API data */}
        {allPorts.filter(p => p.lat && p.lon).map(port => {
          const pos = latLonToVec3(port.lat, port.lon, GLOBE_RADIUS + 0.04)
          const isIN = indianPorts.some(p => p.port_id === port.port_id)
          const color = isIN ? congestionColor(port.congestion_index || 0) : '#38bdf8'
          return <PortBeacon key={port.port_id} position={pos} color={color} size={isIN ? 0.06 : 0.04} />
        })}

        {/* Animated vessels from API */}
        {vessels.filter(v => v.lat && v.lon).map(v => {
          const pos = latLonToVec3(v.lat, v.lon, GLOBE_RADIUS + 0.12)
          const color = v.status === 'At Anchor' ? '#f59e0b' : '#38bdf8'
          return (
             <group key={v.id} position={[pos.x, pos.y, pos.z]}>
                <mesh rotation={[0, v.heading ? v.heading * Math.PI / 180 : 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.015, 0.025, 0.12, 6]} />
                  <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} emissive={color} emissiveIntensity={0.4} />
                </mesh>
                <pointLight color={color} intensity={0.8} distance={0.6} />
             </group>
          )
        })}
      </group>

      <Stars />
    </>
  )
}

/* Simple star-field */
function Stars() {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < 2000; i++) {
      const r = 50
      const phi = Math.random() * Math.PI * 2
      const th = Math.acos(Math.random() * 2 - 1)
      pts.push(r * Math.sin(th) * Math.cos(phi), r * Math.cos(th), r * Math.sin(th) * Math.sin(phi))
    }
    return new Float32Array(pts)
  }, [])
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#ffffff" transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}

/* ────────────────────────────────────────────────────────────
   Sidebar components
   ──────────────────────────────────────────────────────────── */
function ApiStatusBadge({ apiStatus }) {
  const statuses = apiStatus || {}
  const sources = [
    { key: 'gfw', label: 'GFW', icon: '🚢' },
    { key: 'ais', label: 'AIS', icon: '📡' },
    { key: 'weather', label: 'Weather', icon: '🌊' },
    { key: 'fred', label: 'FRED', icon: '📊' },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {sources.map(s => {
        const st = statuses[s.key] || 'offline'
        const connected = st === 'connected'
        return (
          <span
            key={s.key}
            className={`badge ${connected ? 'badge-success' : 'badge-warning'}`}
            style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}
            title={`${s.label}: ${st}`}
          >
            {connected ? <MdSignalWifi4Bar style={{ fontSize: 10 }} /> : <MdSignalWifiOff style={{ fontSize: 10 }} />}
            {s.label}
          </span>
        )
      })}
    </div>
  )
}

function VesselSidebar({ vessels, selectedVessel, onSelect, onRefresh, lastUpdated, apiStatus }) {
  return (
    <div className="glass-card" style={{ maxHeight: 540, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MdDirectionsBoat style={{ color: 'var(--accent-ocean)' }} /> Active Fleet
        </h2>
        <button
          onClick={onRefresh}
          title="Refresh all data"
          style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
        >
          <MdRefresh /> Refresh
        </button>
      </div>
      <ApiStatusBadge apiStatus={apiStatus} />
      {lastUpdated && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
          Last updated: {lastUpdated}
        </div>
      )}
      {vessels.map(vessel => (
        <motion.div
          key={vessel.id}
          layout
          onClick={() => onSelect(vessel.id)}
          style={{
            padding: 'var(--space-md)', marginBottom: 'var(--space-sm)',
            borderRadius: 'var(--radius-md)',
            background: selectedVessel === vessel.id ? 'hsla(200,85%,55%,0.12)' : 'var(--bg-input)',
            border: selectedVessel === vessel.id ? '1px solid var(--border-active)' : '1px solid transparent',
            cursor: 'pointer', transition: 'background 0.25s, border 0.25s',
          }}
          whileHover={{ borderColor: 'hsla(200,85%,55%,0.3)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{vessel.name}</span>
            <span className={`badge ${vessel.status === 'At Anchor' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: 10 }}>
              {vessel.status}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>Class: {vessel.class}</span>
            <span>DWT: {((vessel.dwt || 0) / 1000).toFixed(0)}K</span>
            <span>Speed: {vessel.speed || 0} kn</span>
            <span>→ {vessel.dest || '?'}</span>
          </div>
          <AnimatePresence>
            {selectedVessel === vessel.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ marginTop: 'var(--space-sm)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-muted)' }}
              >
                <div>Cargo: {vessel.cargo || 'Unknown'} | Heading: {vessel.heading || 0}°</div>
                <div>Position: {(vessel.lat || 0).toFixed(2)}°, {(vessel.lon || 0).toFixed(2)}°</div>
                <div>Wait Time: {vessel.wait_time_hours || 0} hrs | Mat. Transferred: {vessel.materials_transferred ? vessel.materials_transferred.toLocaleString() : 0} MT</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  )
}

function RoutesSidebar({ routes, selectedRoute, onSelect }) {
  return (
    <div className="glass-card" style={{ maxHeight: 320, overflowY: 'auto' }}>
      <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <MdMap style={{ color: 'var(--accent-ocean)' }} /> Trade Lanes
      </h3>
      {routes.map((route, i) => {
        const color = rgbToHex(routeColorFromOrigin(route.origin))
        const riskScore = route.risk_score || 0
        return (
          <div
            key={route.route_id || i}
            onClick={() => onSelect(selectedRoute === i ? null : i)}
            style={{
              padding: '10px 12px', marginBottom: 'var(--space-xs)',
              borderRadius: 'var(--radius-md)',
              background: selectedRoute === i ? `${color}18` : 'transparent',
              border: selectedRoute === i ? `1px solid ${color}50` : '1px solid transparent',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}80`, display: 'inline-block' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    {route.origin?.split('(')[0]?.trim()} → {route.destination?.split('(')[0]?.trim()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{route.primary_cargo}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(route.distance_nm || 0).toLocaleString()} NM</div>
                <span className={`badge ${riskScore >= 60 ? 'badge-danger' : riskScore >= 35 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: 9 }}>
                  Risk {riskScore}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* Market indicators sidebar panel */
function MarketSidebar({ marketData }) {
  const indicators = [
    { key: 'brent_crude', label: 'Brent Crude', unit: '$/bbl', icon: '🛢️' },
    { key: 'coal_price', label: 'Coal (Newcastle)', unit: '$/MT', icon: '⛏️' },
    { key: 'iron_ore', label: 'Iron Ore', unit: '$/MT', icon: '🔩' },
    { key: 'usd_inr', label: 'USD/INR', unit: '₹', icon: '💱' },
  ]

  if (!marketData || Object.keys(marketData).length === 0) return null

  return (
    <div className="glass-card">
      <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <MdTrendingUp style={{ color: 'var(--accent-ocean)' }} /> Market Indicators
        <span className="badge badge-success" style={{ fontSize: 9 }}>FRED API</span>
      </h3>
      {indicators.map(ind => {
        const data = marketData[ind.key]
        if (!data) return null
        const isUp = data.change_pct > 0
        return (
          <div key={ind.key} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{ind.icon}</span>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{ind.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{data.date}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                {ind.key === 'usd_inr' ? '₹' : '$'}{data.value}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: isUp ? 'var(--accent-emerald)' : 'var(--accent-rose)',
              }}>
                {isUp ? '▲' : '▼'} {Math.abs(data.change_pct)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* Weather summary sidebar */
function WeatherSidebar({ weatherData }) {
  if (!weatherData || weatherData.length === 0) return null
  const activeAlerts = weatherData.filter(w => w.risk_score >= 0.25)

  return (
    <div className="glass-card">
      <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <MdCloud style={{ color: 'var(--accent-ocean)' }} /> Marine Weather
        <span className="badge badge-success" style={{ fontSize: 9 }}>Open-Meteo</span>
      </h3>
      {weatherData.map(wx => {
        const color = weatherRiskColor(wx.risk_score || 0)
        return (
          <div key={wx.port_id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 0', borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{wx.port_name?.split(' Port')[0] || wx.port_id}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                Swell: {wx.swell_wave_height_m}m • Period: {wx.wave_period_s}s
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color }}>
                {wx.wave_height_m}m
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {wx.risk_score >= 0.5 ? '⛈️ Severe' : wx.risk_score >= 0.25 ? '🌊 Rough' : '🌤️ Calm'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Main page — ALL data from /api/v1/map-intelligence
   ──────────────────────────────────────────────────────────── */
export default function RouteMapPage() {
  const [viewMode, setViewMode] = useState('map')
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [selectedVessel, setSelectedVessel] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(true)

  // ALL state from API — no hardcoded data
  const [vessels, setVessels] = useState([])
  const [indianPorts, setIndianPorts] = useState([])
  const [globalPorts, setGlobalPorts] = useState([])
  const [routes, setRoutes] = useState([])
  const [weatherData, setWeatherData] = useState([])
  const [marketData, setMarketData] = useState({})
  const [apiStatus, setApiStatus] = useState({})

  const fetchMapIntelligence = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getMapIntelligence()

      if (data?.vessels?.length) setVessels(data.vessels)
      if (data?.ports?.indian?.length) setIndianPorts(data.ports.indian)
      if (data?.ports?.global?.length) setGlobalPorts(data.ports.global)
      if (data?.route_risks?.length) setRoutes(data.route_risks)
      if (data?.marine_weather?.length) setWeatherData(data.marine_weather)
      if (data?.market_indicators) setMarketData(data.market_indicators)
      if (data?.api_status) setApiStatus(data.api_status)

      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Map intelligence fetch error:', err)
      setLastUpdated(new Date().toLocaleTimeString() + ' (error)')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh every 12 hours (720,000ms) for weather, 30s for vessels
  useEffect(() => {
    fetchMapIntelligence()
    // Full refresh every 1 hour (3600_000 ms)
    const id = setInterval(fetchMapIntelligence, 3600_000)
    return () => clearInterval(id)
  }, [fetchMapIntelligence])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="route-map-page">
      {/* Page header */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1>Maritime Route Intelligence</h1>
          <p>Live trade lane map with GFW vessel tracking, AIS port congestion, Open-Meteo weather &amp; FRED market data</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${viewMode === 'map' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('map')}>
            <MdMap style={{ marginRight: 4 }} /> Map View
          </button>
          <button className={`btn ${viewMode === '3d' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('3d')}>
            <MdPublic style={{ marginRight: 4 }} /> 3D Globe
          </button>
        </div>
      </div>

      {loading && vessels.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🌐</div>
          <div>Loading live data from GFW, AIS, Open-Meteo &amp; FRED APIs...</div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {viewMode === '3d' ? (
          <motion.div
            key="3d"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
          >
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 360px', gap: 'var(--space-lg)', alignItems: 'start' }}>
              {/* Globe canvas */}
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden', height: 580, borderRadius: 'var(--radius-lg)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
                  <div className="map-stat-chip"><MdPublic /> <span>3D Globe — drag to rotate • scroll to zoom</span></div>
                </div>
                <Canvas camera={{ position: [0, 2, 7], fov: 42 }} gl={{ antialias: true, alpha: false }}>
                  <color attach="background" args={['#030a18']} />
                  <GlobeScene indianPorts={indianPorts} globalPorts={globalPorts} routes={routes} vessels={vessels} />
                  <OrbitControls
                    enablePan={false} enableZoom={true} autoRotate={false}
                    minDistance={3.8} maxDistance={14}
                    minPolarAngle={0.2} maxPolarAngle={Math.PI - 0.2}
                  />
                </Canvas>

                {/* Route colour legend */}
                <div style={{
                  position: 'absolute', bottom: 12, left: 12, zIndex: 10,
                  display: 'flex', flexWrap: 'wrap', gap: 10,
                  background: 'hsla(220,25%,8%,0.85)', backdropFilter: 'blur(12px)',
                  padding: '6px 14px', borderRadius: 'var(--radius-full)',
                  border: '1px solid hsla(220,20%,25%,0.3)', fontSize: 11, color: 'var(--text-muted)',
                }}>
                  {[['#38bdf8', 'Australia'], ['#a78bfa', 'Indonesia'], ['#fb923c', 'Mozambique'], ['#f87171', 'USA'], ['#4ade80', 'Russia']].map(([c, l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}`, display: 'inline-block' }} />{l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sidebars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <VesselSidebar
                  vessels={vessels}
                  selectedVessel={selectedVessel}
                  onSelect={v => setSelectedVessel(prev => prev === v ? null : v)}
                  onRefresh={fetchMapIntelligence}
                  lastUpdated={lastUpdated}
                  apiStatus={apiStatus}
                />
                <MarketSidebar marketData={marketData} />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="map"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
          >
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 360px', gap: 'var(--space-lg)', alignItems: 'start' }}>
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden', height: 580, borderRadius: 'var(--radius-lg)' }}>
                <MapboxMap
                  indianPorts={indianPorts}
                  globalPorts={globalPorts}
                  routes={routes}
                  vessels={vessels}
                  weatherData={weatherData}
                  selectedVessel={selectedVessel}
                  onVesselClick={v => setSelectedVessel(prev => prev === v ? null : v)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <VesselSidebar
                  vessels={vessels}
                  selectedVessel={selectedVessel}
                  onSelect={v => setSelectedVessel(prev => prev === v ? null : v)}
                  onRefresh={fetchMapIntelligence}
                  lastUpdated={lastUpdated}
                  apiStatus={apiStatus}
                />
                <RoutesSidebar routes={routes} selectedRoute={selectedRoute} onSelect={setSelectedRoute} />
                <WeatherSidebar weatherData={weatherData} />
                <MarketSidebar marketData={marketData} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        /* Vessel marker ping animation */
        @keyframes vesselPing {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        /* Weather marker pulse */
        @keyframes weatherPulse {
          0%   { transform: scale(1); opacity: 0.8; }
          50%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }

        /* Mapbox stat chips */
        .map-stat-chip {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 12px;
          background: hsla(220,25%,10%,0.88);
          backdrop-filter: blur(12px);
          border: 1px solid hsla(220,20%,30%,0.3);
          border-radius: var(--radius-full);
          font-size: var(--font-size-xs);
          font-weight: 500;
          color: var(--text-secondary);
        }

        /* Dark Mapbox popup */
        .mapbox-dark-popup .mapboxgl-popup-content {
          background: hsla(222,30%,9%,0.97) !important;
          border: 1px solid hsla(200,60%,40%,0.3) !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.55) !important;
          padding: 0 !important;
        }
        .mapbox-dark-popup .mapboxgl-popup-close-button {
          color: #64748b !important;
          font-size: 18px !important;
          right: 8px !important;
          top: 6px !important;
          background: transparent !important;
        }
        .mapbox-dark-popup .mapboxgl-popup-close-button:hover { color: #e2e8f0 !important; }
        .mapbox-dark-popup .mapboxgl-popup-tip { border-top-color: hsla(222,30%,9%,0.97) !important; }

        .popup-inner { padding: 12px 16px; min-width: 180px; }
        .popup-title { font-weight: 700; font-size: 13px; color: #e2e8f0; margin-bottom: 8px; }
        .popup-row {
          display: flex; justify-content: space-between; gap: 12px;
          font-size: 11px; color: #94a3b8; padding: 3px 0;
          border-bottom: 1px solid hsla(220,20%,25%,0.3);
        }
        .popup-row:last-child { border-bottom: none; }
        .popup-row span:last-child { color: #cbd5e1; text-align: right; }

        /* Mapbox controls dark theme */
        .mapboxgl-ctrl-group {
          background: hsla(220,25%,12%,0.92) !important;
          border: 1px solid hsla(220,20%,28%,0.4) !important;
          border-radius: 10px !important;
        }
        .mapboxgl-ctrl-group button { background: transparent !important; }
        .mapboxgl-ctrl-group button + button { border-top: 1px solid hsla(220,20%,28%,0.4) !important; }
        .mapboxgl-ctrl-icon { filter: invert(0.7) !important; }
        .mapboxgl-ctrl-scale {
          background: hsla(220,25%,12%,0.85) !important;
          border-color: hsla(220,20%,30%,0.5) !important;
          color: #94a3b8 !important;
          font-size: 10px !important;
        }
        .mapboxgl-ctrl-attrib { display: none !important; }
      `}</style>
    </motion.div>
  )
}
