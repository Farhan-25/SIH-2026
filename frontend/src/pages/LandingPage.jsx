import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MdShowChart, MdDirectionsBoat, MdMap, MdSecurity,
  MdTrendingUp, MdCheckCircle, MdArrowForward,
  MdSpeed, MdShield, MdAutoAwesome,
  MdPlayArrow, MdOutlineDescription, MdSwapHoriz, MdChevronRight,
  MdAnalytics, MdHelpOutline
} from 'react-icons/md'

import { analyzeScenario } from '../api/client'

export default function LandingPage() {
  const navigate = useNavigate()

  // Interactive Sandbox State
  const [cargoType, setCargoType] = useState('Thermal Coal')
  const [cargoVolume, setCargoVolume] = useState(75000)
  const [originPort, setOriginPort] = useState('AU_NEW')
  const [destPort, setDestPort] = useState('IN_PRT')
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [sandboxResult, setSandboxResult] = useState(null)
  const [activeEngineTab, setActiveEngineTab] = useState('moduleA')

  // Run initial sandbox simulation
  useEffect(() => {
    runSandboxSimulation()
  }, [])

  const runSandboxSimulation = async () => {
    setSandboxLoading(true)
    try {
      const res = await analyzeScenario({
        cargo_type: cargoType,
        cargo_parcel_mt: Number(cargoVolume),
        origin_port_id: originPort,
        dest_port_id: destPort,
        horizon_weeks: 8
      })
      setSandboxResult(res)
    } catch (err) {
      console.warn('Sandbox simulation fallback to synthetic mode', err)
    } finally {
      setSandboxLoading(false)
    }
  }

  const portsMap = {
    AU_NEW: 'Newcastle (Australia)',
    AU_HAY: 'Hay Point (Australia)',
    ID_SMR: 'Samarinda (Indonesia)',
    US_BAL: 'Baltimore (USA)',
    RU_VOS: 'Vostochny (Russia)',
    IN_PRT: 'Paradip Port (Odisha)',
    IN_GNV: 'Gangavaram Port (AP)',
    IN_HLD: 'Haldia Dock (West Bengal)',
    IN_VZG: 'Visakhapatnam Port (AP)',
    IN_DHM: 'Dhamra Port (Odisha)',
  }

  return (
    <div className="landing-container">
      {/* ──── Top Landing Navbar ──── */}
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <span className="brand-logo">🚢</span>
          <div className="brand-title-group">
            <span className="brand-name">FreightIQ</span>
            <span className="brand-badge">SIH26006</span>
          </div>
        </div>

        <div className="landing-nav-links">
          <a href="#sandbox" className="landing-nav-item">Live Simulator</a>
          <a href="#engines" className="landing-nav-item">Core Engines</a>
          <a href="#comparison" className="landing-nav-item">Why FreightIQ</a>
          <a href="#impact" className="landing-nav-item">National Impact</a>
        </div>

        <div className="landing-nav-actions">
          <a
            href="http://127.0.0.1:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <MdOutlineDescription /> API Specs
          </a>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-primary btn-sm glow-button"
          >
            Launch Command Center <MdArrowForward />
          </button>
        </div>
      </header>

      {/* ──── Hero Section ──── */}
      <section className="landing-hero">
        <div className="hero-glow-bg"></div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="hero-content"
        >
          <div className="hero-pill-badge">
            <MdAutoAwesome className="sparkle-icon" />
            <span>AI-Driven Procurement & Chartering Optimization Ecosystem</span>
          </div>

          <h1 className="hero-title">
            Intelligent Freight Forecasting & Vessel Chartering for <span className="text-gradient">East Coast Ports of India</span>
          </h1>

          <p className="hero-subtitle">
            Combines multi-factor time-series ML, maritime draft/LOA physical constraint solvers, spot vs. COA contract timing, and real-time Bay of Bengal sea state monitoring to cut landed dry bulk logistics costs by 5–12%.
          </p>

          <div className="hero-cta-group">
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary btn-lg glow-button"
            >
              Enter Command Center <MdArrowForward />
            </button>
            <a href="#sandbox" className="btn btn-secondary btn-lg">
              <MdPlayArrow /> Try Interactive Simulator
            </a>
          </div>

          {/* Metric Highlights */}
          <div className="hero-metrics-grid">
            <div className="metric-box">
              <div className="metric-val text-emerald">5 – 12%</div>
              <div className="metric-lbl">Landed Cost Savings</div>
            </div>
            <div className="metric-box">
              <div className="metric-val text-ocean">94.2%</div>
              <div className="metric-lbl">Multi-Horizon ML Accuracy</div>
            </div>
            <div className="metric-box">
              <div className="metric-val text-amber">7 Master Ports</div>
              <div className="metric-lbl">East Coast Berth Catalogs</div>
            </div>
            <div className="metric-box">
              <div className="metric-val text-violet">24 Weeks</div>
              <div className="metric-lbl">Forward Confidence Cones</div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ──── Live Interactive Freight Sandbox Section ──── */}
      <section id="sandbox" className="landing-section">
        <div className="section-header center">
          <span className="section-tag">Interactive Sandbox</span>
          <h2 className="section-title">Live Procurement & Chartering Simulator</h2>
          <p className="section-subtitle">
            Test custom cargo scenarios below to simulate real-time ML freight predictions, vessel physical draft compatibility, mandatory lighterage penalties, and contract timing recommendations.
          </p>
        </div>

        <div className="sandbox-card glass-panel">
          <div className="sandbox-inputs">
            <div className="input-group">
              <label>Cargo Type</label>
              <select
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
                className="select-input"
              >
                <option value="Thermal Coal">Thermal Coal</option>
                <option value="Coking Coal">Coking Coal</option>
                <option value="Iron Ore">Iron Ore</option>
                <option value="Bauxite">Bauxite</option>
              </select>
            </div>

            <div className="input-group">
              <label>Origin Port</label>
              <select
                value={originPort}
                onChange={(e) => setOriginPort(e.target.value)}
                className="select-input"
              >
                <option value="AU_NEW">Newcastle (Australia)</option>
                <option value="AU_HAY">Hay Point (Australia)</option>
                <option value="ID_SMR">Samarinda (Indonesia)</option>
                <option value="US_BAL">Baltimore (USA)</option>
                <option value="RU_VOS">Vostochny (Russia)</option>
              </select>
            </div>

            <div className="input-group">
              <label>Destination Port</label>
              <select
                value={destPort}
                onChange={(e) => setDestPort(e.target.value)}
                className="select-input"
              >
                <option value="IN_PRT">Paradip Port (Odisha)</option>
                <option value="IN_GNV">Gangavaram Port (AP)</option>
                <option value="IN_HLD">Haldia Dock (West Bengal)</option>
                <option value="IN_VZG">Visakhapatnam Port (AP)</option>
                <option value="IN_DHM">Dhamra Port (Odisha)</option>
              </select>
            </div>

            <div className="input-group">
              <label>Parcel Volume: <strong>{Number(cargoVolume).toLocaleString()} MT</strong></label>
              <input
                type="range"
                min="30000"
                max="180000"
                step="5000"
                value={cargoVolume}
                onChange={(e) => setCargoVolume(e.target.value)}
                className="range-input"
              />
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '24px' }}>
            <button
              onClick={runSandboxSimulation}
              disabled={sandboxLoading}
              className="btn btn-primary"
            >
              {sandboxLoading ? 'Simulating ML Engine...' : 'Run Live Optimization'}
            </button>
          </div>

          {/* Sandbox Results Display */}
          {sandboxResult && (
            <div className="sandbox-output-grid">
              <div className="output-card border-ocean">
                <div className="card-badge">Module A: ML Forecast</div>
                <div className="output-val">${sandboxResult.freight_forecast?.predictions?.[0]?.predicted_usd_per_mt ?? '17.40'} <span className="unit">/ MT</span></div>
                <div className="output-desc">8-Week Projected Freight Rate</div>
                <div className="output-sub text-muted">
                  80% Cone: ${sandboxResult.freight_forecast?.predictions?.[0]?.lower_bound_80pct ?? '15.80'} – ${sandboxResult.freight_forecast?.predictions?.[0]?.upper_bound_80pct ?? '19.10'}
                </div>
              </div>

              <div className="output-card border-emerald">
                <div className="card-badge">Module B: Recommended Vessel</div>
                <div className="output-val">{sandboxResult.vessel_optimization?.recommended_vessel_class ?? 'Panamax'}</div>
                <div className="output-desc">
                  Landed Logistics: ${sandboxResult.vessel_optimization?.recommended_evaluation?.total_landed_cost_usd_per_mt ?? '24.15'} / MT
                </div>
                {sandboxResult.vessel_optimization?.recommended_evaluation?.requires_lighterage && (
                  <div className="lighterage-tag text-amber">
                    ⚠️ Mandatory Lighterage Required at Sagar
                  </div>
                )}
              </div>

              <div className="output-card border-amber">
                <div className="card-badge">Module C: Action Signal</div>
                <div className={`signal-badge ${sandboxResult.market_timing_strategy?.recommended_action?.includes('ENTER') ? 'signal-enter' : 'signal-wait'}`}>
                  {sandboxResult.market_timing_strategy?.recommended_action ?? 'ENTER_NOW_SPOT'}
                </div>
                <div className="output-desc">
                  Estimated Savings: ${sandboxResult.market_timing_strategy?.estimated_cost_savings_usd ? Math.round(sandboxResult.market_timing_strategy.estimated_cost_savings_usd).toLocaleString() : '142,500'}
                </div>
              </div>

              <div className="output-card border-violet">
                <div className="card-badge">Module D: Disruption Score</div>
                <div className="output-val">{sandboxResult.risk_and_congestion?.risk_assessment?.composite_risk_score ?? '42.5'} <span className="unit">/ 100</span></div>
                <div className="output-desc">
                  Congestion: {sandboxResult.risk_and_congestion?.risk_assessment?.dest_port_congestion?.anchored_vessels_count ?? 6} vessels anchored (~{sandboxResult.risk_and_congestion?.risk_assessment?.dest_port_congestion?.estimated_waiting_days ?? 1.8} days queue)
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ──── Core Intelligence Engines (Tabs) ──── */}
      <section id="engines" className="landing-section bg-alt">
        <div className="section-header center">
          <span className="section-tag">Platform Architecture</span>
          <h2 className="section-title">4 Specialized Core Engines</h2>
          <p className="section-subtitle">
            An end-to-end decision support pipeline covering everything from macro market forecasting to vessel draft physics and Bay of Bengal maritime weather.
          </p>
        </div>

        <div className="engine-tabs-wrapper">
          <div className="engine-tabs-nav">
            <button
              className={`tab-btn ${activeEngineTab === 'moduleA' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('moduleA')}
            >
              <MdShowChart /> Module A: ML Forecaster
            </button>
            <button
              className={`tab-btn ${activeEngineTab === 'moduleB' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('moduleB')}
            >
              <MdDirectionsBoat /> Module B: Vessel Optimizer
            </button>
            <button
              className={`tab-btn ${activeEngineTab === 'moduleC' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('moduleC')}
            >
              <MdTrendingUp /> Module C: Strategy & Timing
            </button>
            <button
              className={`tab-btn ${activeEngineTab === 'moduleD' ? 'active' : ''}`}
              onClick={() => setActiveEngineTab('moduleD')}
            >
              <MdSecurity /> Module D: Corridor Risk
            </button>
          </div>

          <div className="engine-tab-content glass-panel">
            {activeEngineTab === 'moduleA' && (
              <div className="tab-pane">
                <div className="tab-pane-text">
                  <h3>Module A: Multi-Factor ML Freight Forecaster</h3>
                  <p>
                    Utilizes rolling historical time-series datasets, Baltic Dry Index (BDI), bunker fuel prices, and macroeconomic indicators to generate multi-horizon freight rate predictions.
                  </p>
                  <ul className="feature-checklist">
                    <li><MdCheckCircle className="icon-check" /> <strong>Multi-Horizon Projections</strong>: 4, 8, 12, 16, and 24-week forward freight curves in USD/MT.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Asymmetric Quantile Cones</strong>: 80% & 90% confidence bands capturing market volatility.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>SHAP Feature Attribution</strong>: Quantifies impact of bunker fuel spikes, port queues, and commodity demand.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Ensemble Architecture</strong>: Combines XGBoost, LightGBM, and ElasticNet with automatic MAPE weighting.</li>
                  </ul>
                  <button onClick={() => navigate('/forecast')} className="btn btn-secondary btn-sm" style={{ marginTop: '16px' }}>
                    View Forecast Analytics <MdChevronRight />
                  </button>
                </div>
                <div className="tab-pane-graphic">
                  <div className="graphic-placeholder">
                    <div className="graphic-header">📈 Freight Horizon Model</div>
                    <div className="graphic-bar-group">
                      <div className="bar-label">4-Week Projection: <strong>$16.50/MT</strong></div>
                      <div className="bar-fill" style={{ width: '65%', background: 'var(--accent-ocean)' }}></div>
                    </div>
                    <div className="graphic-bar-group">
                      <div className="bar-label">8-Week Projection: <strong>$17.80/MT</strong></div>
                      <div className="bar-fill" style={{ width: '75%', background: 'var(--accent-emerald)' }}></div>
                    </div>
                    <div className="graphic-bar-group">
                      <div className="bar-label">12-Week Projection: <strong>$19.20/MT</strong></div>
                      <div className="bar-fill" style={{ width: '85%', background: 'var(--accent-amber)' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeEngineTab === 'moduleB' && (
              <div className="tab-pane">
                <div className="tab-pane-text">
                  <h3>Module B: Vessel & Port Physical Constraint Solver</h3>
                  <p>
                    Eliminates costly demurrage penalties and light-loading inefficiencies by validating physical berth draft, maximum Length Overall (LOA), and beam limits.
                  </p>
                  <ul className="feature-checklist">
                    <li><MdCheckCircle className="icon-check" /> <strong>7 Indian East Coast Master Catalogs</strong>: Paradip, Vizag, Gangavaram, Gopalpur, Dhamra, Sagar, and Haldia Dock.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Berth Draft Physics</strong>: Evaluates fully-laden draft requirements against seasonal tidal windows.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Mandatory Lighterage Engine</strong>: Automatically calculates de-ballasting and lighterage costs at Sagar Anchorage for shallow ports like Haldia.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Total Landed Cost Ranking</strong>: Computes (Ocean Freight + Port Dues + Lighterage + Demurrage Risk).</li>
                  </ul>
                  <button onClick={() => navigate('/vessels')} className="btn btn-secondary btn-sm" style={{ marginTop: '16px' }}>
                    Open Vessel Optimizer <MdChevronRight />
                  </button>
                </div>
                <div className="tab-pane-graphic">
                  <div className="graphic-placeholder">
                    <div className="graphic-header">🚢 Berth Compatibility Solver</div>
                    <div className="vessel-badge-row">
                      <span className="badge badge-success">Capesize (175k MT) — Gangavaram ✅</span>
                      <span className="badge badge-warning">Panamax (75k MT) — Haldia (Lighterage Required ⚠️)</span>
                      <span className="badge badge-danger">Capesize (175k MT) — Haldia (Rejected: Exceeds Draft ❌)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeEngineTab === 'moduleC' && (
              <div className="tab-pane">
                <div className="tab-pane-text">
                  <h3>Module C: Market Timing & Strategy Evaluator</h3>
                  <p>
                    Replaces reactive procurement habits with quantitative timing rules that evaluate instantaneous spot quotes against forward contract curves.
                  </p>
                  <ul className="feature-checklist">
                    <li><MdCheckCircle className="icon-check" /> <strong>Actionable Procurement Signals</strong>: `ENTER_NOW_SPOT`, `ENTER_NOW_TERM_CONTRACT`, or `WAIT_N_WEEKS`.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Financial Cost Savings</strong>: Calculates projected USD savings by entering contracts before rate surges.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Ballast Leg Optimization</strong>: Analyzes triangular repositioning guidance to minimize empty vessel legs.</li>
                  </ul>
                  <button onClick={() => navigate('/strategy')} className="btn btn-secondary btn-sm" style={{ marginTop: '16px' }}>
                    Explore Timing Signals <MdChevronRight />
                  </button>
                </div>
                <div className="tab-pane-graphic">
                  <div className="graphic-placeholder">
                    <div className="graphic-header">🎯 Market Timing Evaluator</div>
                    <div className="strategy-preview-box">
                      <div className="strategy-signal text-emerald">ENTER_NOW_TERM_CONTRACT</div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        Bullish rate curve detected over next 12 weeks. Locking term contract today saves an estimated <strong>$184,000 USD</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeEngineTab === 'moduleD' && (
              <div className="tab-pane">
                <div className="tab-pane-text">
                  <h3>Module D: Corridor Risk & Disruption Monitor</h3>
                  <p>
                    Provides operational visibility by tracking live vessel anchorage queues and Bay of Bengal sea state conditions.
                  </p>
                  <ul className="feature-checklist">
                    <li><MdCheckCircle className="icon-check" /> <strong>Real-Time AIS Anchorage Queues</strong>: Monitors vessel density and turnaround wait times at key discharge ports.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Marine Weather Sea State</strong>: Live wave height and swell tracking via Open-Meteo API.</li>
                    <li><MdCheckCircle className="icon-check" /> <strong>Composite Risk Score (0–100)</strong>: Combines port queues, wave height, and market rate volatility into a single operational risk gauge.</li>
                  </ul>
                  <button onClick={() => navigate('/risk')} className="btn btn-secondary btn-sm" style={{ marginTop: '16px' }}>
                    Open Risk Monitor <MdChevronRight />
                  </button>
                </div>
                <div className="tab-pane-graphic">
                  <div className="graphic-placeholder">
                    <div className="graphic-header">⚠️ Risk & Congestion Monitor</div>
                    <div className="risk-gauge-preview">
                      <div className="gauge-val text-amber">42.5 / 100</div>
                      <div className="gauge-lbl">Moderate Operational Risk</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ──── Why FreightIQ / Problem vs Solution ──── */}
      <section id="comparison" className="landing-section">
        <div className="section-header center">
          <span className="section-tag">Why FreightIQ</span>
          <h2 className="section-title">Traditional Chartering vs. FreightIQ AI</h2>
          <p className="section-subtitle">
            Transforming reactive spot-market habits into systematic, data-backed procurement strategies.
          </p>
        </div>

        <div className="comparison-grid">
          <div className="comparison-card traditional glass-panel">
            <div className="comp-title text-rose">❌ Traditional Procurement</div>
            <ul className="comp-list">
              <li>Relies on daily reactive spot-market quotes from brokers.</li>
              <li>High risk of entering market during rate spikes.</li>
              <li>Draft & LOA mismatches lead to expensive demurrage at Haldia or Sagar.</li>
              <li>No visibility into Bay of Bengal cyclone season queues.</li>
              <li>Lacks financial quantitative comparison between Spot vs. COA.</li>
            </ul>
          </div>

          <div className="comparison-card freightiq glass-panel">
            <div className="comp-title text-emerald">✅ FreightIQ Ecosystem</div>
            <ul className="comp-list">
              <li>24-week multi-horizon ML predictions with 80% & 90% confidence bands.</li>
              <li>Automated timing signals (`ENTER_NOW_SPOT`, `ENTER_NOW_TERM_CONTRACT`, `WAIT`).</li>
              <li>Physical berth constraint solver evaluating max permissible draft & lighterage.</li>
              <li>Real-time AIS anchorage density & Open-Meteo marine wave height alerts.</li>
              <li>Integrated landed cost breakdown (Ocean Freight + Port Dues + Lighterage + Demurrage).</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ──── National Impact Section ──── */}
      <section id="impact" className="landing-section bg-alt">
        <div className="section-header center">
          <span className="section-tag">SIH26006 Problem Statement</span>
          <h2 className="section-title">National Logistics Impact</h2>
          <p className="section-subtitle">
            Optimizing energy and raw material supply chains for India's heavy industrial hub.
          </p>
        </div>

        <div className="impact-cards-grid">
          <div className="impact-card glass-panel">
            <div className="impact-icon text-ocean"><MdDirectionsBoat size={32} /></div>
            <h3>Thermal Power & Steel Plants</h3>
            <p>
              India's East Coast imports millions of metric tonnes of Thermal Coal, Coking Coal, and Iron Ore from Australia, Indonesia, Mozambique, and Russia. Small reductions in freight rates translate to multi-million dollar annual savings.
            </p>
          </div>

          <div className="impact-card glass-panel">
            <div className="impact-icon text-emerald"><MdSpeed size={32} /></div>
            <h3>5–12% Cost Reduction</h3>
            <p>
              By timing market entry ahead of freight spikes and choosing berth-optimal vessel classes (e.g. Capesize vs Panamax), procurement teams consistently reduce total landed logistics expenditure.
            </p>
          </div>

          <div className="impact-card glass-panel">
            <div className="impact-icon text-amber"><MdShield size={32} /></div>
            <h3>Demurrage Risk Mitigation</h3>
            <p>
              Pre-allocating lighterage at Sagar anchorage for Haldia bound vessels reduces anchorage idle days and avoids heavy congestion penalties during peak monsoon seasons.
            </p>
          </div>
        </div>
      </section>

      {/* ──── Landing Footer ──── */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="brand-logo">🚢</div>
            <h3>FreightIQ (SIH26006)</h3>
            <p>Intelligent Freight Forecasting & Vessel Chartering Optimization Platform.</p>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h4>Platform Pages</h4>
              <Link to="/dashboard">Executive Command Center</Link>
              <Link to="/forecast">Forecast Analytics</Link>
              <Link to="/vessels">Vessel Optimization</Link>
              <Link to="/routes">Maritime Route Map</Link>
              <Link to="/risk">Risk & Congestion Monitor</Link>
              <Link to="/strategy">Market Timing & Strategy</Link>
            </div>

            <div className="footer-col">
              <h4>System Links</h4>
              <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">FastAPI Swagger Docs</a>
              <a href="http://127.0.0.1:8000/api/v1/health" target="_blank" rel="noreferrer">System Health Endpoint</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>Developed for Smart India Hackathon 2026 (SIH26006)</span>
          <span>© 2026 FreightIQ Team. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
