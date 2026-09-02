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

export default maplibregl
