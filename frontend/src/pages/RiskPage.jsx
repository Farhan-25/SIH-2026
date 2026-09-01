import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Plot from 'react-plotly.js'
import {
  MdWarning, MdWaves, MdAnchor, MdTrendingUp,
  MdPublic, MdSecurity, MdSpeed,
  MdAccessTime, MdFilterList, MdSearch, MdOpenInNew,
  MdShield, MdInfoOutline, MdCheckCircle
} from 'react-icons/md'
import {
  getRiskAssessment,
  getMaritimeNews,
  getMarketSentiment,
  getChokepointRisks,
  getGeopoliticalAlerts
} from '../api/client'

const DEMO_RISK = {
  composite_risk_score: 42.5,
  risk_level: 'Medium',
  origin_port_congestion: {
    port_id: 'newcastle',
    port_name: 'Newcastle (AU)',
    congestion_index: 28,
    anchored_vessels_count: 6,
    estimated_waiting_days: 1.5,
  },
  destination_port_congestion: {
    port_id: 'paradip',
    port_name: 'Paradip',
    congestion_index: 55,
    anchored_vessels_count: 14,
    estimated_waiting_days: 4.8,
  },
  marine_weather_conditions: {
    wave_height_m: 2.1,
    wind_speed_kmh: 28,
    wind_direction: 'SSW',
    sea_condition: 'Moderate',
    sea_condition_risk_score: 0.35,
  },
  active_alerts: [
    { severity: 'WARNING', category: 'Port Congestion', message: 'Paradip: 14 vessels at anchorage, ~4.8 days waiting. Consider Dhamra as alternative.' },
    { severity: 'CRITICAL', category: 'Marine Weather', message: 'Cyclonic depression forming in Bay of Bengal (15°N, 88°E). Expect route delays Oct 28-31.' },
    { severity: 'INFO', category: 'Market Volatility', message: 'BDI dropped 3.2% this week. Freight rate volatility at 12.5% — above 30-day average.' },
    { severity: 'SUCCESS', category: 'Route Status', message: 'Strait of Malacca: Normal traffic flow. No piracy or weather alerts.' },
  ],
}

const DEMO_CHOKEPOINTS = {
  red_sea: {
    chokepoint_key: 'red_sea',
    name: 'Red Sea / Bab el-Mandeb',
    risk_score: 0.88,
    risk_level: 'CRITICAL',
    components: { event_severity: 0.92, news_volume_anomaly: 0.88, negative_sentiment: 0.89, recency_score: 0.95 },
    volume_stats: { current_articles_24h: 42, baseline_articles_24h: 12.0, increase_pct: 250, z_score: 3.42 },
    detected_events: ['SECURITY_ATTACK', 'VESSEL_DIVERSION'],
    matched_article_count: 4
  },
  suez_canal: {
    chokepoint_key: 'suez_canal',
    name: 'Suez Canal',
    risk_score: 0.76,
    risk_level: 'CRITICAL',
    components: { event_severity: 0.80, news_volume_anomaly: 0.72, negative_sentiment: 0.84, recency_score: 0.90 },
    volume_stats: { current_articles_24h: 28, baseline_articles_24h: 8.0, increase_pct: 250, z_score: 2.85 },
    detected_events: ['CANAL_DISRUPTION', 'INSURANCE_RISK'],
    matched_article_count: 3
  },
  malacca_strait: {
    chokepoint_key: 'malacca_strait',
    name: 'Strait of Malacca',
    risk_score: 0.32,
    risk_level: 'MODERATE',
    components: { event_severity: 0.45, news_volume_anomaly: 0.35, negative_sentiment: 0.40, recency_score: 0.75 },
    volume_stats: { current_articles_24h: 18, baseline_articles_24h: 15.0, increase_pct: 20, z_score: 0.45 },
    detected_events: ['WEATHER', 'PORT_CONGESTION'],
    matched_article_count: 2
  },
  panama_canal: {
    chokepoint_key: 'panama_canal',
    name: 'Panama Canal',
    risk_score: 0.22,
    risk_level: 'LOW',
    components: { event_severity: 0.15, news_volume_anomaly: 0.20, negative_sentiment: 0.15, recency_score: 0.60 },
    volume_stats: { current_articles_24h: 8, baseline_articles_24h: 6.0, increase_pct: 33, z_score: 0.33 },
    detected_events: ['MARKET_EXPANSION'],
    matched_article_count: 1
  }
}

const DEMO_SENTIMENT = {
  current_score: -0.42,
  sentiment_label: 'Negative',
  trend: 'down',
  positive_pct: 18,
  neutral_pct: 22,
  negative_pct: 60,
  total_articles_analyzed: 12,
  historical_timeline: Array.from({ length: 14 }, (_, i) => ({
    date: `Day ${i + 1}`,
    sentiment_score: -0.15 - (i * 0.02) + (Math.sin(i) * 0.05),
    news_volume: 12 + Math.floor(Math.random() * 20)
  }))
}

function riskColor(score) {
  if (score >= 60 || score >= 0.6) return 'var(--accent-rose)'
  if (score >= 35 || score >= 0.35) return 'var(--accent-amber)'
  return 'var(--accent-emerald)'
}

function getChokepointBadge(level) {
  if (level === 'CRITICAL') return 'badge-danger'
  if (level === 'HIGH') return 'badge-warning'
  if (level === 'MODERATE') return 'badge-info'
  return 'badge-success'
}

export default function RiskPage() {
  const [activeTab, setActiveTab] = useState('geopolitical') // 'geopolitical' | 'operational' | 'news'
  const [risk, setRisk] = useState(DEMO_RISK)
  const [chokepoints, setChokepoints] = useState(DEMO_CHOKEPOINTS)
  const [sentiment, setSentiment] = useState(DEMO_SENTIMENT)
  const [geoAlerts, setGeoAlerts] = useState([])
  const [articles, setArticles] = useState([])
  const [newsFilter, setNewsFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Operational Corridor Risk
    getRiskAssessment({
      origin_port_id: 'newcastle',
      dest_port_id: 'paradip',
      dest_lat: 20.2649,
      dest_lon: 86.6286,
    })
      .then(data => { if (data?.composite_risk_score !== undefined) setRisk(data) })
      .catch(() => {})

    // 2. Chokepoints Risk & Anomaly
    getChokepointRisks()
      .then(data => { if (data && Object.keys(data).length > 0) setChokepoints(data) })
      .catch(() => {})

    // 3. FinBERT Sentiment Summary
    getMarketSentiment()
      .then(data => { if (data?.current_score !== undefined) setSentiment(data) })
      .catch(() => {})

    // 4. Geopolitical Shock Alerts
    getGeopoliticalAlerts()
      .then(data => { if (data?.alerts) setGeoAlerts(data.alerts) })
      .catch(() => {})

    // 5. Maritime News Stream
    getMaritimeNews(50)
      .then(data => {
        if (data?.articles) setArticles(data.articles)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Filtered news items
  const filteredArticles = articles.filter(a => {
    const matchesFilter =
      newsFilter === 'all' ? true :
      newsFilter === 'critical' ? (a.event_severity >= 0.75 || a.sentiment === 'negative') :
      newsFilter === 'diversions' ? (a.event_type === 'VESSEL_DIVERSION' || a.event_type === 'SECURITY_ATTACK') :
      newsFilter === 'congestion' ? (a.event_type === 'PORT_CONGESTION' || a.event_type === 'PORT_CLOSURE') : true

    const matchesSearch = searchQuery === '' ? true :
      (a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       a.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       a.primary_chokepoint?.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesFilter && matchesSearch
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/*  Header & Navigation Tabs  */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.4rem' }}></span>
            <h1 style={{ margin: 0 }}>Maritime Market Intelligence & Geopolitical Risk Engine</h1>
          </div>
          <p>NLP-driven FinBERT sentiment analysis, chokepoint anomaly tracking, and operational corridor risk</p>
        </div>

        <div style={{ display: 'flex', background: 'var(--bg-card)', padding: 4, borderRadius: 10, border: '1px solid var(--border-color)', gap: 4 }}>
          <button
            className={`btn ${activeTab === 'geopolitical' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('geopolitical')}
            style={{ fontSize: '0.85rem', padding: '6px 14px' }}
          >
            <MdPublic style={{ marginRight: 6 }} /> Chokepoints & Geopolitics
          </button>
          <button
            className={`btn ${activeTab === 'sentiment' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('sentiment')}
            style={{ fontSize: '0.85rem', padding: '6px 14px' }}
          >
            <MdSpeed style={{ marginRight: 6 }} /> FinBERT Sentiment
          </button>
          <button
            className={`btn ${activeTab === 'news' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('news')}
            style={{ fontSize: '0.85rem', padding: '6px 14px' }}
          >
            <MdShield style={{ marginRight: 6 }} /> Live News Feed ({articles.length})
          </button>
          <button
            className={`btn ${activeTab === 'operational' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('operational')}
            style={{ fontSize: '0.85rem', padding: '6px 14px' }}
          >
            <MdAnchor style={{ marginRight: 6 }} /> Corridor & Weather
          </button>
        </div>
      </div>

      {/*  TAB 1: GEOPOLITICAL RISK & CHOKEPOINTS  */}
      {activeTab === 'geopolitical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Active Geopolitical Shock Alerts Banner */}
          {geoAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {geoAlerts.map((alert, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`glass-card ${alert.severity === 'CRITICAL' ? 'critical' : 'warning'}`}
                  style={{
                    borderLeft: `4px solid ${alert.severity === 'CRITICAL' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`,
                    padding: '16px 20px',
                    background: alert.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span className={`badge ${alert.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`}>
                          {alert.severity} SHOCK
                        </span>
                        <strong style={{ fontSize: '1.05rem' }}>{alert.title}</strong>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                        {alert.message}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--accent-cyan)' }}>
                        <MdInfoOutline />
                        <strong>Procurement Action:</strong> {alert.action_advice}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: 8, textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Disruption Index</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-rose)' }}>{alert.risk_score}</div>
                      </div>
                      <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: 12 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>News Surge</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-amber)' }}>{alert.news_surge}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Monitored Chokepoints Grid */}
          <div>
            <h2 style={{ fontSize: '1.15rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdPublic style={{ color: 'var(--accent-blue)' }} />
              Monitored Maritime Chokepoints — Disruption Risk Matrix
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {Object.entries(chokepoints).map(([key, item]) => {
                const isCrit = item.risk_level === 'CRITICAL'
                const isHigh = item.risk_level === 'HIGH'
                return (
                  <motion.div
                    key={key}
                    className="glass-card"
                    whileHover={{ y: -3 }}
                    style={{
                      borderTop: `3px solid ${isCrit ? 'var(--accent-rose)' : isHigh ? 'var(--accent-amber)' : 'var(--accent-emerald)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <h3 style={{ fontSize: '1.05rem', margin: '0 0 4px 0', fontWeight: 600 }}>{item.name}</h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Active Reports: {item.matched_article_count} | Vol: {item.volume_stats?.current_articles_24h || 0}/day
                          </span>
                        </div>
                        <span className={`badge ${getChokepointBadge(item.risk_level)}`}>
                          {item.risk_level}
                        </span>
                      </div>

                      {/* Disruption Score Meter */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Maritime Disruption Index</span>
                          <strong style={{ color: isCrit ? 'var(--accent-rose)' : isHigh ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                            {item.risk_score} / 1.00
                          </strong>
                        </div>
                        <div style={{ width: '100%', height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${item.risk_score * 100}%`,
                              height: '100%',
                              background: isCrit ? 'var(--accent-rose)' : isHigh ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                              borderRadius: 4,
                              transition: 'width 0.6s ease'
                            }}
                          />
                        </div>
                      </div>

                      {/* Component breakdown */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem', background: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: 6, marginBottom: 12 }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Event Severity: </span>
                          <strong>{item.components?.event_severity ?? '-'}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Volume Anomaly: </span>
                          <strong style={{ color: item.volume_stats?.increase_pct > 100 ? 'var(--accent-rose)' : 'inherit' }}>
                            +{item.volume_stats?.increase_pct || 0}%
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Neg Sentiment: </span>
                          <strong>{item.components?.negative_sentiment ?? '-'}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Anomaly Z-Score: </span>
                          <strong>{item.volume_stats?.z_score ?? '-'}</strong>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(item.detected_events || []).map((ev, i) => (
                          <span key={i} style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                            {ev.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Quick NLP Features Feed for ML */}
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdTrendingUp style={{ color: 'var(--accent-emerald)' }} />
              Structured NLP Feature Pipeline (Live Stream into ML Forecaster)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, textAlign: 'center' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>avg_sentiment</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: sentiment.current_score < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                  {sentiment.current_score}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>red_sea_risk</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                  {chokepoints.red_sea?.risk_score || 0.88}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>suez_risk</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                  {chokepoints.suez_canal?.risk_score || 0.76}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>news_volume_zscore</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                  +{chokepoints.red_sea?.volume_stats?.z_score || 3.4}
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>geopolitical_shock</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                  ACTIVE (1)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*  TAB 2: FinBERT SENTIMENT ANALYSIS  */}
      {activeTab === 'sentiment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            {/* FinBERT Score Gauge Card */}
            <div className="glass-card" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>FinBERT Macro Maritime Sentiment</div>
              <div style={{
                fontSize: '2.8rem',
                fontWeight: 800,
                color: sentiment.current_score < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                marginBottom: 4
              }}>
                {sentiment.current_score}
              </div>
              <div style={{ marginBottom: 12 }}>
                <span className={`badge ${sentiment.current_score < 0 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.85rem' }}>
                  {sentiment.sentiment_label} Sentiment
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                FinBERT NLP model confidence based on recent dry bulk shipping and trade news.
              </p>
            </div>

            {/* Distribution Ratio */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: 14 }}>Sentiment Distribution</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--accent-rose)' }}>Negative</span>
                    <strong>{sentiment.negative_pct}%</strong>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3 }}>
                    <div style={{ width: `${sentiment.negative_pct}%`, height: '100%', background: 'var(--accent-rose)', borderRadius: 3 }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Neutral</span>
                    <strong>{sentiment.neutral_pct}%</strong>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3 }}>
                    <div style={{ width: `${sentiment.neutral_pct}%`, height: '100%', background: 'var(--text-muted)', borderRadius: 3 }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--accent-emerald)' }}>Positive</span>
                    <strong>{sentiment.positive_pct}%</strong>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3 }}>
                    <div style={{ width: `${sentiment.positive_pct}%`, height: '100%', background: 'var(--accent-emerald)', borderRadius: 3 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Key Event Drivers */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Top Sentiment Triggers</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span> Red Sea Security Attacks</span>
                  <span className="badge badge-danger">Impact: -0.92</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span> Cape of Good Hope Diversions</span>
                  <span className="badge badge-danger">Impact: -0.85</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span> Bunker Fuel Price Hikes</span>
                  <span className="badge badge-warning">Impact: -0.65</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span> Dhamra Rapid Berth Expansion</span>
                  <span className="badge badge-success">Impact: +0.70</span>
                </div>
              </div>
            </div>
          </div>

          {/* Historical Sentiment Chart */}
          <div className="glass-card chart-container" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: 12, fontWeight: 600 }}>
              14-Day Maritime Sentiment Trend vs News Volume
            </h3>
            <Plot
              data={[
                {
                  x: sentiment.historical_timeline?.map(d => d.date || `Day ${d.day_offset}`),
                  y: sentiment.historical_timeline?.map(d => d.sentiment_score),
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: 'FinBERT Sentiment Score',
                  line: { color: 'hsl(0, 80%, 60%)', width: 3, shape: 'spline' },
                  marker: { size: 6 }
                },
                {
                  x: sentiment.historical_timeline?.map(d => d.date || `Day ${d.day_offset}`),
                  y: sentiment.historical_timeline?.map(d => d.news_volume),
                  type: 'bar',
                  name: 'Daily Article Volume',
                  yaxis: 'y2',
                  marker: { color: 'hsla(200, 85%, 55%, 0.25)' }
                }
              ]}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: { family: 'Inter', color: 'hsl(0, 0%, 55%)', size: 10 },
                margin: { t: 10, r: 40, b: 30, l: 40 },
                xaxis: { gridcolor: 'transparent' },
                yaxis: { gridcolor: 'hsla(0, 0%, 20%, 0.2)', title: 'Sentiment Score [-1.0 to +1.0]', range: [-1, 1] },
                yaxis2: { title: 'Article Volume', overlaying: 'y', side: 'right', gridcolor: 'transparent' },
                legend: { orientation: 'h', y: -0.15 },
                showlegend: true,
              }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: 320 }}
            />
          </div>
        </div>
      )}

      {/*  TAB 3: LIVE MARITIME INTELLIGENCE NEWS FEED  */}
      {activeTab === 'news' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Controls & Search Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['all', 'critical', 'diversions', 'congestion'].map(f => (
                <button
                  key={f}
                  className={`btn ${newsFilter === f ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setNewsFilter(f)}
                  style={{ fontSize: '0.8rem', padding: '6px 12px', textTransform: 'capitalize' }}
                >
                  {f === 'all' ? 'All Articles' : f}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: 280 }}>
              <MdSearch style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search headlines, ports, vessels..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          {/* Articles Stream */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredArticles.map((art, idx) => {
              const isNeg = art.sentiment === 'negative'
              const isPos = art.sentiment === 'positive'
              return (
                <motion.div
                  key={art.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="glass-card"
                  style={{ padding: '16px 20px', borderLeft: `3px solid ${isNeg ? 'var(--accent-rose)' : isPos ? 'var(--accent-emerald)' : 'var(--text-muted)'}` }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 600, lineHeight: 1.4 }}>
                      {art.title}
                    </h3>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <span className={`badge ${isNeg ? 'badge-danger' : isPos ? 'badge-success' : 'badge-info'}`}>
                        {art.sentiment?.toUpperCase()} {art.sentiment_score ? `(${art.sentiment_score})` : ''}
                      </span>
                      {art.event_severity >= 0.75 && (
                        <span className="badge badge-danger">SEVERITY: {art.event_severity}</span>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 10px 0' }}>
                    {art.description}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <strong>{art.source}</strong>
                      <span>•</span>
                      <span>{art.published_at}</span>
                      <span>•</span>
                      <span style={{ color: 'var(--accent-blue)' }}> {art.primary_chokepoint || 'Global'}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {art.entities?.cargo_types?.map((c, i) => (
                        <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
                           {c}
                        </span>
                      ))}
                      {art.entities?.vessel_classes?.map((v, i) => (
                        <span key={i} style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
                           {v}
                        </span>
                      ))}
                      <a
                        href={art.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 6, textDecoration: 'none' }}
                      >
                        Source <MdOpenInNew size={12} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/*  TAB 4: OPERATIONAL CORRIDOR & WEATHER (ORIGINAL INTEGRATED)  */}
      {activeTab === 'operational' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Operational Risk KPI Grid */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <motion.div
              className="glass-card"
              initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              style={{ textAlign: 'center', gridColumn: 'span 1' }}
            >
              <div style={{
                width: 90, height: 90, borderRadius: '50%', margin: '0 auto var(--space-sm)',
                background: `conic-gradient(${riskColor(risk.composite_risk_score)} ${risk.composite_risk_score}%, var(--bg-input) 0)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 25px ${riskColor(risk.composite_risk_score)}33`,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                }}>
                  <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: riskColor(risk.composite_risk_score) }}>
                    {risk.composite_risk_score}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>/100</span>
                </div>
              </div>
              <span className={`badge ${risk.risk_level === 'High' ? 'badge-danger' : risk.risk_level === 'Medium' ? 'badge-warning' : 'badge-success'}`}>
                {risk.risk_level} Corridor Risk
              </span>
            </motion.div>

            <div className="glass-card kpi-card amber">
              <div className="kpi-icon"><MdAnchor /></div>
              <div className="kpi-value">{risk.destination_port_congestion?.anchored_vessels_count || 14}</div>
              <div className="kpi-label">Vessels at Anchor ({risk.destination_port_congestion?.port_name || 'Paradip'})</div>
              <span className="kpi-trend down">~{risk.destination_port_congestion?.estimated_waiting_days || 4.8}d wait</span>
            </div>

            <div className="glass-card kpi-card ocean">
              <div className="kpi-icon"><MdWaves /></div>
              <div className="kpi-value">{risk.marine_weather_conditions?.wave_height_m || 2.1}m</div>
              <div className="kpi-label">Wave Height (Bay of Bengal)</div>
              <span className={`kpi-trend ${risk.marine_weather_conditions?.sea_condition_risk_score > 0.4 ? 'down' : 'up'}`}>
                {risk.marine_weather_conditions?.sea_condition || 'Moderate'}
              </span>
            </div>

            <div className="glass-card kpi-card ocean">
              <div className="kpi-icon"><MdTrendingUp /></div>
              <div className="kpi-value">12.5%</div>
              <div className="kpi-label">Freight Rate Volatility (30d)</div>
              <span className="kpi-trend down">Above average</span>
            </div>
          </div>

          {/* Operational Alerts */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
              <MdWarning style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-amber)' }} />
              Active Operational & Port Alerts
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(risk.active_alerts || []).map((alert, i) => (
                <div key={i} className={`alert-card ${alert.severity?.toLowerCase() || 'info'}`} style={{ padding: '12px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`badge ${
                        alert.severity === 'CRITICAL' ? 'badge-danger' :
                        alert.severity === 'WARNING' ? 'badge-warning' :
                        alert.severity === 'SUCCESS' ? 'badge-success' : 'badge-info'
                      }`}>
                        {alert.severity}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{alert.category}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {alert.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
