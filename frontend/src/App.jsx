import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import { useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MdDashboard, MdShowChart, MdDirectionsBoat,
  MdMap, MdSecurity, MdTrendingUp, MdNotifications,
  MdSettings, MdHome, MdMenu, MdMenuOpen, MdChevronLeft, MdChevronRight,
  MdSmartToy, MdDarkMode, MdLightMode, MdAttachMoney, MdLogout,
  MdTune
} from 'react-icons/md'

import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import { PreferencesProvider, usePreferences } from './context/PreferencesContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UserProfileProvider, useUserProfile } from './context/UserProfileContext'

// Heavy pages (MapLibre / Three / Plotly) load on demand so the shell stays snappy
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ForecastPage = lazy(() => import('./pages/ForecastPage'))
const VesselPage = lazy(() => import('./pages/VesselPage'))
const RouteMapPage = lazy(() => import('./pages/RouteMapPage'))
const RiskPage = lazy(() => import('./pages/RiskPage'))
const StrategyPage = lazy(() => import('./pages/StrategyPage'))
const CopilotPage = lazy(() => import('./pages/CopilotPage'))

function PageFallback() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '40vh', color: 'var(--text-muted)', fontSize: '0.95rem'
    }}>
      Loading…
    </div>
  )
}

const navItems = [
  { to: '/', icon: <MdHome />, label: 'Product Landing', section: 'Overview' },
  { to: '/dashboard', icon: <MdDashboard />, label: 'Command Center', section: 'Overview' },
  { to: '/copilot', icon: <MdSmartToy />, label: 'AI Copilot', section: 'Analytics' },
  { to: '/forecast', icon: <MdShowChart />, label: 'Forecast', section: 'Analytics' },
  { to: '/vessels', icon: <MdDirectionsBoat />, label: 'Vessels', section: 'Analytics' },
  { to: '/routes', icon: <MdMap />, label: 'Route Map', section: 'Analytics' },
  { to: '/risk', icon: <MdSecurity />, label: 'Risk Monitor', section: 'Operations' },
  { to: '/strategy', icon: <MdTrendingUp />, label: 'Strategy', section: 'Operations' },
]

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: 'easeOut' },
}

const pageTitles = {
  '/': 'Product Landing Page',
  '/dashboard': 'Command Center',
  '/copilot': 'AI Maritime Intelligence Copilot',
  '/forecast': 'Freight Rate Forecasting',
  '/vessels': 'Vessel Optimization',
  '/routes': 'Maritime Route Intelligence',
  '/risk': 'Risk & Disruption Monitor',
  '/strategy': 'Market Timing & Strategy',
}

function AppShell() {
  const location = useLocation()
  const [alertCount] = useState(3)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const { currentUser, isAuthenticated, logout } = useAuth()
  const { isOnboarded, resetProfile, selectedPorts, selectedRoutes, selectedCargoes } = useUserProfile()
  const {
    currency,
    currencySymbol,
    isLightMode,
    toggleTheme,
    toggleCurrency,
  } = usePreferences()

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    )
  }

  if (!isAuthenticated) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="login" {...pageTransition}>
          <LoginPage />
        </motion.div>
      </AnimatePresence>
    )
  }

  if (!isOnboarded) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="onboarding" {...pageTransition}>
          <OnboardingPage />
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ──── Sidebar ──── */}
      <aside className="sidebar">
        <div className="sidebar-brand" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <img src="/frieght_iq_logo.jpg" alt="FreightIQ Logo" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }} />
            <div className="brand-text">
              <h2>FreightIQ</h2>
            </div>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="btn btn-ghost"
            title="Collapse Sidebar"
            style={{ padding: '6px', minWidth: 'auto', color: 'var(--text-muted)' }}
          >
            <MdChevronLeft size={22} />
          </button>
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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Cascade Drop/Toggle Sidebar Button */}
          <button
            className="cascade-sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand Sidebar" : "Cascade / Drop Sidebar"}
          >
            {sidebarCollapsed ? <MdMenu size={20} /> : <MdMenuOpen size={20} />}
          </button>

          <h1 className="header-title">{pageTitles[location.pathname] || 'FreightIQ'}</h1>
        </div>
        <div className="header-actions">
          <div className="preference-toggle-group" aria-label="Display preferences">
            <button
              className="preference-toggle"
              onClick={toggleTheme}
              title={isLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              aria-label={isLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {isLightMode ? <MdDarkMode size={18} /> : <MdLightMode size={18} />}
              <span>{isLightMode ? 'Dark' : 'Light'}</span>
            </button>
            <button
              className="preference-toggle"
              onClick={toggleCurrency}
              title={`Switch to ${currency === 'USD' ? 'Rupee' : 'Dollar'} Display`}
              aria-label={`Switch to ${currency === 'USD' ? 'Rupee' : 'Dollar'} Display`}
            >
              {currency === 'USD' ? <MdAttachMoney size={18} /> : <span className="currency-icon">₹</span>}
              <span>{currencySymbol} {currency}</span>
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setShowNotifications(!showNotifications)}>
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
            {showNotifications && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 'var(--space-xs)',
                width: '300px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--glass-shadow)', padding: 'var(--space-md)',
                zIndex: 100
              }}>
                <h3 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-base)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-xs)' }}>Notifications</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-sm)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-rose)' }}>
                    High congestion at Singapore Port
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-sm)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-amber)' }}>
                    Weather warning near Cape of Good Hope
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-sm)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-emerald)' }}>
                    Forecast updated successfully
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setShowSettings(!showSettings)}>
              <MdSettings size={20} />
            </button>
            {showSettings && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 'var(--space-xs)',
                width: '280px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--glass-shadow)', padding: 'var(--space-md)',
                zIndex: 100
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', paddingBottom: 'var(--space-sm)', borderBottom: '1px solid var(--border-subtle)', marginBottom: 'var(--space-sm)' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--text-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' }}>
                    {(currentUser?.name || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', color: 'var(--text-primary)' }}>{currentUser?.name || 'User'}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{currentUser?.email}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {selectedPorts.length} ports · {selectedRoutes.length} routes · {selectedCargoes.length} cargoes
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-muted)', margin: 'var(--space-xs) 0 4px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preferences</div>
                  
                  <button onClick={toggleTheme} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', padding: '8px', display: 'flex', gap: '12px', alignItems: 'center', borderRadius: '4px' }} onMouseOver={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ background: 'var(--bg-elevated)', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                      {isLightMode ? <MdDarkMode size={16} color="var(--accent)" /> : <MdLightMode size={16} color="var(--accent-amber)" />}
                    </div>
                    <span>{isLightMode ? 'Dark Mode' : 'Light Mode'}</span>
                  </button>
                  
                  <button onClick={toggleCurrency} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', padding: '8px', display: 'flex', gap: '12px', alignItems: 'center', borderRadius: '4px' }} onMouseOver={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ background: 'var(--bg-elevated)', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                       <MdAttachMoney size={16} color="var(--accent-emerald)" />
                    </div>
                    <span>Currency ({currency})</span>
                  </button>

                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-muted)', margin: 'var(--space-sm) 0 4px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System</div>
                  
                  <button onClick={() => { resetProfile(); setShowSettings(false) }} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', padding: '8px', display: 'flex', gap: '12px', alignItems: 'center', borderRadius: '4px', width: '100%' }} onMouseOver={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ background: 'var(--bg-elevated)', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                       <MdTune size={16} color="var(--accent)" />
                    </div>
                    <span>Reconfigure Profile</span>
                  </button>

                  <button style={{ background: 'none', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', padding: '8px', display: 'flex', gap: '12px', alignItems: 'center', borderRadius: '4px' }} onMouseOver={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                    <div style={{ background: 'var(--bg-elevated)', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                       <MdSecurity size={16} color="var(--accent-rose)" />
                    </div>
                    <span>API Integrations</span>
                  </button>
                  
                </div>
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={logout} title="Logout">
            <MdLogout size={20} />
          </button>
        </div>
      </header>

      {/* ──── Main Content ──── */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} {...pageTransition}>
            <Suspense fallback={<PageFallback />}>
              <Routes location={location}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/copilot" element={<CopilotPage />} />
                <Route path="/forecast" element={<ForecastPage />} />
                <Route path="/vessels" element={<VesselPage />} />
                <Route path="/routes" element={<RouteMapPage />} />
                <Route path="/risk" element={<RiskPage />} />
                <Route path="/strategy" element={<StrategyPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <UserProfileProvider>
          <AppShell />
        </UserProfileProvider>
      </AuthProvider>
    </PreferencesProvider>
  )
}

