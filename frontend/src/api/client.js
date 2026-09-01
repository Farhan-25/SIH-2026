import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

//  Health 
export const getHealth = () => api.get('/health')

// ─── Reference Data ───────────────────────────────────────
export const getPorts = () => api.get('/ports').then(r => r.data)
export const getRoutes = () => api.get('/routes').then(r => r.data)

//  Forecasting 
export const getForecast = (params) =>
  api.post('/forecast', params).then(r => r.data)

//  Vessel Optimization 
export const getVesselRecommendation = (params) =>
  api.post('/recommend-vessel', params).then(r => r.data)

//  Full Scenario Analysis 
export const analyzeScenario = (params) =>
  api.post('/scenario-analyze', params).then(r => r.data)

//  SHAP Explainability 
export const getShapExplanation = (params) =>
  api.post('/shap-explain', params).then(r => r.data)

//  Risk Assessment 
export const getRiskAssessment = (params) =>
  api.post('/risk-assess', params).then(r => r.data)

//  Market Timing 
export const getMarketTiming = (params) =>
  api.post('/market-timing', params).then(r => r.data)

//  Dashboard (Live Aggregated Data) 
export const getDashboard = () =>
  api.get('/dashboard').then(r => r.data)

// ─── Dynamic Commodity & Bunker Prices ───────────────────
export const getCommodities = () =>
  api.get('/commodities').then(r => r.data)

// ─── Map Intelligence (GFW + AIS + Weather + FRED) ───────
export const getMapIntelligence = () =>
  api.get('/map-intelligence').then(r => r.data)

//  Maritime Market Intelligence & Geopolitical Risk 
export const getMaritimeNews = (limit = 50) =>
  api.get(`/news?limit=${limit}`).then(r => r.data)

export const getMarketSentiment = () =>
  api.get('/sentiment').then(r => r.data)

export const getChokepointRisks = () =>
  api.get('/chokepoint-risk').then(r => r.data)

export const getGeopoliticalAlerts = () =>
  api.get('/geopolitical-alerts').then(r => r.data)

export const getNLPForecastFeatures = () =>
  api.get('/forecast/features').then(r => r.data)

//  AI Maritime Intelligence Copilot 
export const getCopilotOverview = () =>
  api.get('/copilot/overview').then(r => r.data)

export const askCopilot = (message, context = null) =>
  api.post('/copilot/chat', { message, context }).then(r => r.data)

export default api
