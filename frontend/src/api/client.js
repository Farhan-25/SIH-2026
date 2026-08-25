import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Health ───────────────────────────────────────────────
export const getHealth = () => api.get('/health')

// ─── Reference Data ───────────────────────────────────────
export const getPorts = () => api.get('/ports')
export const getRoutes = () => api.get('/routes')

// ─── Forecasting ──────────────────────────────────────────
export const getForecast = (params) =>
  api.post('/forecast', params).then(r => r.data)

// ─── Vessel Optimization ─────────────────────────────────
export const getVesselRecommendation = (params) =>
  api.post('/recommend-vessel', params).then(r => r.data)

// ─── Full Scenario Analysis ──────────────────────────────
export const analyzeScenario = (params) =>
  api.post('/scenario-analyze', params).then(r => r.data)

// ─── SHAP Explainability ─────────────────────────────────
export const getShapExplanation = (params) =>
  api.post('/shap-explain', params).then(r => r.data)

// ─── Risk Assessment ─────────────────────────────────────
export const getRiskAssessment = (params) =>
  api.post('/risk-assess', params).then(r => r.data)

// ─── Market Timing ───────────────────────────────────────
export const getMarketTiming = (params) =>
  api.post('/market-timing', params).then(r => r.data)

export default api
