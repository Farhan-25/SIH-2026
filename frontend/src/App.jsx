import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MdDashboard, MdShowChart, MdDirectionsBoat,
  MdMap, MdSecurity, MdTrendingUp, MdNotifications,
  MdSettings, MdHome
} from 'react-icons/md'

import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import ForecastPage from './pages/ForecastPage'
import VesselPage from './pages/VesselPage'
import RouteMapPage from './pages/RouteMapPage'
import RiskPage from './pages/RiskPage'
import StrategyPage from './pages/StrategyPage'

const navItems = [
  { to: '/', icon: <MdHome />, label: 'Product Landing', section: 'Overview' },
  { to: '/dashboard', icon: <MdDashboard />, label: 'Command Center', section: 'Overview' },
  { to: '/forecast', icon: <MdShowChart />, label: 'Forecast', section: 'Analytics' },
  { to: '/vessels', icon: <MdDirectionsBoat />, label: 'Vessels', section: 'Analytics' },
  { to: '/routes', icon: <MdMap />, label: 'Route Map', section: 'Analytics' },
  { to: '/risk', icon: <MdSecurity />, label: 'Risk Monitor', section: 'Operations' },
  { to: '/strategy', icon: <MdTrendingUp />, label: 'Strategy', section: 'Operations' },
]

const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: 'easeOut' },
}

const pageTitles = {
  '/': 'Product Landing Page',
  '/dashboard': 'Command Center',
  '/forecast': 'Freight Rate Forecasting',
  '/vessels': 'Vessel Optimization',
  '/routes': 'Maritime Route Intelligence',
  '/risk': 'Risk & Disruption Monitor',
  '/strategy': 'Market Timing & Strategy',
}

export default function App() {
  const location = useLocation()
  const [alertCount] = useState(3)

  const isLandingPage = location.pathname === '/'

  // Group nav items by section
  const sections = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {})

  if (isLandingPage) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key={location.pathname} {...pageTransition}>
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className="app-layout">
      {/* ──── Sidebar ──── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🚢</div>
          <div className="brand-text">
            <h2>FreightIQ</h2>
          </div>
        </div>

        <nav className="sidebar-nav">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <div className="nav-section-label">{section}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent-emerald)', display: 'inline-block',
              boxShadow: '0 0 8px var(--accent-emerald)'
            }}></span>
            System Online — v2.0
          </div>
        </div>
      </aside>

      {/* ──── Header ──── */}
      <header className="top-header">
        <div>
          <h1 className="header-title">{pageTitles[location.pathname] || 'FreightIQ'}</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" style={{ position: 'relative' }}>
            <MdNotifications size={20} />
            {alertCount > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--accent-rose)', fontSize: '0.6rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'white'
              }}>{alertCount}</span>
            )}
          </button>
          <button className="btn btn-ghost"><MdSettings size={20} /></button>
        </div>
      </header>

      {/* ──── Main Content ──── */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} {...pageTransition}>
            <Routes location={location}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/vessels" element={<VesselPage />} />
              <Route path="/routes" element={<RouteMapPage />} />
              <Route path="/risk" element={<RiskPage />} />
              <Route path="/strategy" element={<StrategyPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
