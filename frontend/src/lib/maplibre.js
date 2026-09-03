import * as maplibregl from 'maplibre-gl'
import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)

/** Carto basemap styles via MapLibre (no Mapbox token required) */
export const MAP_STYLES = {
  dark: {
    id: 'dark',
    label: 'Dark Matter',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
  positron: {
    id: 'positron',
    label: 'Positron',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  voyager: {
    id: 'voyager',
    label: 'Voyager',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  },
}

export const MAP_STYLE_ORDER = ['dark', 'positron', 'voyager']

export function getMapStyle(id = 'dark') {
  return MAP_STYLES[id] || MAP_STYLES.dark
}

/** Compact HTML for MapLibre vessel popups (Command Centre + Route Map). */
export function vesselPopupHTML(v = {}) {
  const name = v.name || v.mmsi || 'Vessel'
  const status = v.status || 'Underway'
  const cls = v.class || '—'
  const speed = v.speed != null && v.speed !== '' ? `${Number(v.speed).toFixed(1)} kn` : '—'
  const dest = v.dest || v.destination || '—'
  const mmsi = v.mmsi || '—'
  const src = String(v.source_label || v.source || 'Live AIS')
  const modeled = src.toLowerCase().includes('model')
  const color = modeled
    ? (status === 'At Anchor' ? '#c4b5fd' : '#a78bfa')
    : (status === 'At Anchor' ? '#f59e0b' : '#38bdf8')
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `
    <div class="ship-pop">
      <div class="ship-pop-top">
        <span class="ship-pop-dot" style="background:${color}"></span>
        <strong>${esc(name)}</strong>
      </div>
      <div class="ship-pop-grid">
        <span>Source</span><em>${esc(modeled ? src : 'Live AIS')}</em>
        <span>Status</span><em>${esc(status)}</em>
        <span>Class</span><em>${esc(cls)}</em>
        <span>Speed</span><em>${esc(speed)}</em>
        <span>Dest</span><em>${esc(dest)}</em>
        <span>MMSI</span><em>${esc(mmsi)}</em>
      </div>
    </div>
  `
}

/** Map marker color: cyan/amber = live, violet = modeled. */
export function vesselMarkerColor(v = {}) {
  const src = String(v.source_label || v.source || '')
  const modeled = src.toLowerCase().includes('model')
  if (modeled) return v.status === 'At Anchor' ? '#c4b5fd' : '#a78bfa'
  return v.status === 'At Anchor' ? '#f59e0b' : '#38bdf8'
}

export function vesselHeadingDeg(v = {}) {
  const h = Number(v.heading)
  if (!Number.isFinite(h) || h === 511) return 0
  return ((h % 360) + 360) % 360
}

export function ensureVesselArrowIcon(map) {
  if (!map || map.hasImage('vessel-arrow')) return
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.translate(size / 2, size / 2)
  ctx.beginPath()
  ctx.moveTo(0, -28)
  ctx.lineTo(18, 22)
  ctx.lineTo(0, 10)
  ctx.lineTo(-18, 22)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  map.addImage('vessel-arrow', ctx.getImageData(0, 0, size, size), { sdf: true, pixelRatio: 2 })
}

export function upsertVesselArrowLayers(map, sourceId, ids) {
  if (!map) return
  ensureVesselArrowIcon(map)
  const { glow, core, symbol, hit } = ids
  if (glow && map.getLayer(glow)) map.removeLayer(glow)
  if (core && map.getLayer(core)) map.removeLayer(core)

  if (symbol && !map.getLayer(symbol)) {
    map.addLayer({
      id: symbol,
      type: 'symbol',
      source: sourceId,
      layout: {
        'icon-image': 'vessel-arrow',
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          3, ['case', ['==', ['get', 'status'], 'At Anchor'], 0.28, 0.38],
          8, ['case', ['==', ['get', 'status'], 'At Anchor'], 0.48, 0.72],
        ],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center',
      },
      paint: {
        'icon-color': ['get', 'color'],
        'icon-halo-color': '#061018',
        'icon-halo-width': 1.15,
        'icon-opacity': 0.96,
      },
    })
  }

  if (hit && !map.getLayer(hit)) {
    map.addLayer({
      id: hit,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 14,
        'circle-opacity': 0,
        'circle-color': '#000',
      },
    })
  }
}

/** Live AIS reports dest/origin as Unknown (Live). */
export function isLiveAisVessel(v = {}) {
  const src = String(v.source_label || v.source || '').toLowerCase()
  if (src.includes('model')) return false
  if (src.includes('live') || src.includes('ais') || src.includes('openwaters') || src.includes('aisstream')) return true
  const dest = String(v.dest || v.destination || '').toLowerCase()
  const origin = String(v.origin || '').toLowerCase()
  return dest.includes('unknown') || origin.includes('unknown')
}

export function portsToFeatureCollection(indian = [], global = [], selectedIds = []) {
  const chosen = new Set((selectedIds || []).map(String))
  const features = []
  const add = (list, region) => {
    for (const p of list || []) {
      const lat = Number(p.lat)
      const lon = Number(p.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const id = String(p.port_id || p.id || p.name || '')
      features.push({
        type: 'Feature',
        properties: {
          id,
          name: p.name || id,
          nearby: p.anchored_vessels || 0,
          selected: chosen.has(id) ? 1 : 0,
          region,
        },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })
    }
  }
  add(indian, 'india')
  add(global, 'global')
  return { type: 'FeatureCollection', features }
}

export const PORT_CIRCLE_PAINT = {
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'],
    3, ['case', ['==', ['get', 'selected'], 1], 6.5, 3],
    8, ['case', ['==', ['get', 'selected'], 1], 11, 5.5],
  ],
  'circle-color': [
    'case',
    ['==', ['get', 'selected'], 1], '#f59e0b',
    ['==', ['get', 'region'], 'india'], '#10b981',
    '#38bdf8',
  ],
  'circle-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.48],
  'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2.4, 1],
  'circle-stroke-color': '#0b1220',
}

export const PORT_HALO_PAINT = {
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'],
    3, 12,
    8, 22,
  ],
  'circle-color': '#f59e0b',
  'circle-opacity': 0.22,
  'circle-blur': 0.7,
}

export default maplibregl
