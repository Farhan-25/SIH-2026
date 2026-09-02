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

export default maplibregl
