import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MdAnchor, MdDirectionsBoat, MdLocalShipping,
  MdArrowForward, MdArrowBack, MdRocketLaunch,
  MdCheckCircle, MdLocationOn, MdSpeed
} from 'react-icons/md'
import {
  ALL_DESTINATION_PORTS,
  ALL_TRADE_ROUTES,
  ALL_CARGO_TYPES,
  useUserProfile
} from '../context/UserProfileContext'

const STEPS = [
  { id: 'ports', title: 'Your Destination Ports', subtitle: 'Which Indian East Coast ports does your organization operate at?', icon: <MdAnchor size={22} /> },
  { id: 'routes', title: 'Your Trade Routes', subtitle: 'Select the shipping corridors you want to monitor', icon: <MdDirectionsBoat size={22} /> },
  { id: 'cargoes', title: 'Your Cargo Types', subtitle: 'What bulk commodities do you procure or charter for?', icon: <MdLocalShipping size={22} /> },
]

const slideVariants = {
  enter: (direction) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
}

export default function OnboardingPage({ onComplete }) {
  const { updateProfile, getRoutesForPorts } = useUserProfile()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const [selectedPorts, setSelectedPorts] = useState([])
  const [selectedRoutes, setSelectedRoutes] = useState([])
  const [selectedCargoes, setSelectedCargoes] = useState([])

  // Routes filtered by selected ports
  const availableRoutes = useMemo(() => {
    if (selectedPorts.length === 0) return ALL_TRADE_ROUTES
    return getRoutesForPorts(selectedPorts)
  }, [selectedPorts, getRoutesForPorts])

  // When ports change, prune routes that are no longer relevant
  const handlePortToggle = (portId) => {
    setSelectedPorts(prev => {
      const next = prev.includes(portId)
        ? prev.filter(p => p !== portId)
        : [...prev, portId]
      // Prune routes
      const validDestPorts = new Set(next)
      if (next.length > 0) {
        setSelectedRoutes(sr =>
          sr.filter(rId => {
            const route = ALL_TRADE_ROUTES.find(r => r.id === rId)
            return route && validDestPorts.has(route.destPort)
          })
        )
      }
      return next
    })
  }

  const handleRouteToggle = (routeId) => {
    setSelectedRoutes(prev =>
      prev.includes(routeId)
        ? prev.filter(r => r !== routeId)
        : [...prev, routeId]
    )
  }

  const handleCargoToggle = (cargo) => {
    setSelectedCargoes(prev =>
      prev.includes(cargo)
        ? prev.filter(c => c !== cargo)
        : [...prev, cargo]
    )
  }

  const handleSelectAllPorts = () => {
    if (selectedPorts.length === ALL_DESTINATION_PORTS.length) {
      setSelectedPorts([])
    } else {
      setSelectedPorts(ALL_DESTINATION_PORTS.map(p => p.id))
    }
  }

  const handleSelectAllRoutes = () => {
    if (selectedRoutes.length === availableRoutes.length) {
      setSelectedRoutes([])
    } else {
      setSelectedRoutes(availableRoutes.map(r => r.id))
    }
  }

  const handleSelectAllCargoes = () => {
    if (selectedCargoes.length === ALL_CARGO_TYPES.length) {
      setSelectedCargoes([])
    } else {
      setSelectedCargoes([...ALL_CARGO_TYPES])
    }
  }

  const canProceed = () => {
    if (step === 0) return selectedPorts.length > 0
    if (step === 1) return selectedRoutes.length > 0
    if (step === 2) return selectedCargoes.length > 0
    return false
  }

  const goNext = () => {
    if (step < 2) {
      setDirection(1)
      setStep(s => s + 1)
    } else {
      // Complete
      const profile = {
        ports: selectedPorts,
        routes: selectedRoutes,
        cargoes: selectedCargoes,
        completedAt: new Date().toISOString(),
      }
      updateProfile(profile)
      onComplete?.()
    }
  }

  const goBack = () => {
    if (step > 0) {
      setDirection(-1)
      setStep(s => s - 1)
    }
  }

  const handleSkipDemo = () => {
    const demoProfile = {
      ports: ['IN_PRT', 'IN_VTZ', 'IN_GNV'],
      routes: ['AU_NEW_TO_IN_PRT', 'AU_HAY_TO_IN_VTZ', 'AU_GLA_TO_IN_GNV', 'ID_KLT_TO_IN_PRT'],
      cargoes: ['Thermal Coal', 'Coking Coal', 'Iron Ore'],
      completedAt: new Date().toISOString(),
      isDemo: true,
    }
    updateProfile(demoProfile)
    onComplete?.()
  }

  /* ── Shared styles ─────────────────────────────────────────── */
  const cardStyle = (isSelected) => ({
    background: isSelected ? 'var(--accent-glow)' : 'var(--bg-elevated)',
    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    position: 'relative',
  })

  const checkboxStyle = (isSelected) => ({
    width: 20,
    height: 20,
    borderRadius: '5px',
    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--text-muted)'}`,
    background: isSelected ? 'var(--accent)' : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
    transition: 'all var(--transition-fast)',
  })

  const selectAllBtnStyle = {
    background: 'none',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--accent)',
    fontSize: 'var(--font-size-xs)',
    padding: '4px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all var(--transition-fast)',
  }

  /* ── Step renderers ────────────────────────────────────────── */
  const renderPorts = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={selectAllBtnStyle} onClick={handleSelectAllPorts}>
          {selectedPorts.length === ALL_DESTINATION_PORTS.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, maxHeight: '400px', overflowY: 'auto', paddingRight: 4 }}>
        {ALL_DESTINATION_PORTS.map(port => {
          const sel = selectedPorts.includes(port.id)
          return (
            <motion.div
              key={port.id}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              style={cardStyle(sel)}
              onClick={() => handlePortToggle(port.id)}
            >
              <div style={checkboxStyle(sel)}>
                {sel && <MdCheckCircle size={14} color="var(--text-inverse)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', color: 'var(--text-primary)', marginBottom: 2 }}>{port.name}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MdLocationOn size={12} /> {port.state}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MdSpeed size={12} /> {port.maxDraft}m draft</span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {port.vesselClasses.slice(0, 3).map(vc => (
                    <span key={vc} style={{
                      fontSize: '0.6rem',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-sm)',
                      background: sel ? 'hsla(192, 80%, 55%, 0.15)' : 'var(--bg-card)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}>{vc}</span>
                  ))}
                  {port.vesselClasses.length > 3 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', padding: '2px 4px' }}>
                      +{port.vesselClasses.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )

  const renderRoutes = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
          Showing {availableRoutes.length} routes for your selected ports
        </span>
        <button style={selectAllBtnStyle} onClick={handleSelectAllRoutes}>
          {selectedRoutes.length === availableRoutes.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, maxHeight: '400px', overflowY: 'auto', paddingRight: 4 }}>
        {availableRoutes.map(route => {
          const sel = selectedRoutes.includes(route.id)
          return (
            <motion.div
              key={route.id}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              style={cardStyle(sel)}
              onClick={() => handleRouteToggle(route.id)}
            >
              <div style={checkboxStyle(sel)}>
                {sel && <MdCheckCircle size={14} color="var(--text-inverse)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', marginBottom: 3 }}>
                  {route.origin} <span style={{ color: 'var(--accent)' }}>→</span> {route.destination}
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  <span>{route.cargo}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{route.distance.toLocaleString()} NM</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )

  const renderCargoes = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={selectAllBtnStyle} onClick={handleSelectAllCargoes}>
          {selectedCargoes.length === ALL_CARGO_TYPES.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {ALL_CARGO_TYPES.map(cargo => {
          const sel = selectedCargoes.includes(cargo)
          return (
            <motion.div
              key={cargo}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{
                ...cardStyle(sel),
                alignItems: 'center',
                padding: '12px 16px',
              }}
              onClick={() => handleCargoToggle(cargo)}
            >
              <div style={checkboxStyle(sel)}>
                {sel && <MdCheckCircle size={14} color="var(--text-inverse)" />}
              </div>
              <span style={{ fontWeight: 500, fontSize: 'var(--font-size-md)', color: 'var(--text-primary)' }}>{cargo}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )

  const stepContent = [renderPorts, renderRoutes, renderCargoes]

  /* ── Summary counts ────────────────────────────────────────── */
  const summaryItems = [
    { label: 'Ports', count: selectedPorts.length },
    { label: 'Routes', count: selectedRoutes.length },
    { label: 'Cargoes', count: selectedCargoes.length },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      padding: 'var(--space-lg)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decoration */}
      <div style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, background: 'var(--accent)', filter: 'blur(160px)', opacity: 0.06, borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -100, width: 300, height: 300, background: 'var(--accent-emerald)', filter: 'blur(140px)', opacity: 0.05, borderRadius: '50%' }} />

      {/* Top-left branding */}
      <div style={{ position: 'absolute', top: 'var(--space-xl)', left: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <div style={{ fontSize: '28px' }}>🚢</div>
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>FreightIQ</h2>
      </div>

      {/* Skip / Demo button */}
      <button
        onClick={handleSkipDemo}
        style={{
          position: 'absolute', top: 'var(--space-xl)', right: 'var(--space-xl)',
          background: 'none', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
          padding: '8px 18px', fontSize: 'var(--font-size-sm)', cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        Skip — Use Demo Profile
      </button>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--glass-shadow)',
          padding: 'var(--space-xl) var(--space-xl) var(--space-lg)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 120, height: 120,
          background: 'var(--accent)', filter: 'blur(60px)', opacity: 0.12, borderRadius: '50%',
        }} />

        {/* ── Progress Steps ──────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 0, marginBottom: 'var(--space-xl)', position: 'relative',
        }}>
          {STEPS.map((s, i) => {
            const isActive = i === step
            const isDone = i < step
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 'var(--radius-full)',
                  background: isActive ? 'var(--accent-glow)' : isDone ? 'hsla(155, 70%, 45%, 0.1)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent)' : isDone ? 'var(--accent-emerald)' : 'var(--border-subtle)'}`,
                  transition: 'all var(--transition-base)',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--font-size-sm)', fontWeight: 700,
                    background: isActive ? 'var(--accent)' : isDone ? 'var(--accent-emerald)' : 'var(--bg-elevated)',
                    color: isActive || isDone ? 'var(--text-inverse)' : 'var(--text-muted)',
                    transition: 'all var(--transition-base)',
                  }}>
                    {isDone ? <MdCheckCircle size={16} /> : i + 1}
                  </div>
                  <span style={{
                    fontSize: 'var(--font-size-xs)', fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--accent)' : isDone ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  }}>{s.title.replace('Your ', '')}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: 30, height: 2,
                    background: isDone ? 'var(--accent-emerald)' : 'var(--border-subtle)',
                    transition: 'background var(--transition-base)',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Step Header ─────────────────────────────────────── */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xl)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--accent)' }}>{STEPS[step].icon}</span>
            {STEPS[step].title}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {STEPS[step].subtitle}
          </p>
        </div>

        {/* ── Step Content (animated) ─────────────────────────── */}
        <div style={{ minHeight: 320, position: 'relative' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {stepContent[step]()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Footer: Summary + Navigation ────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 'var(--space-lg)', paddingTop: 'var(--space-md)',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 10 }}>
            {summaryItems.map(s => (
              <div key={s.label} style={{
                fontSize: 'var(--font-size-xs)', color: s.count > 0 ? 'var(--accent)' : 'var(--text-muted)',
                padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                background: s.count > 0 ? 'var(--accent-glow)' : 'var(--bg-elevated)',
                border: `1px solid ${s.count > 0 ? 'var(--accent)' : 'var(--border-subtle)'}`,
                fontWeight: 600,
              }}>
                {s.count} {s.label}
              </div>
            ))}
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            {step > 0 && (
              <button
                onClick={goBack}
                style={{
                  background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                  padding: '10px 20px', fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  fontWeight: 500, transition: 'all var(--transition-fast)',
                }}
              >
                <MdArrowBack size={16} /> Back
              </button>
            )}
            <button
              onClick={goNext}
              disabled={!canProceed()}
              style={{
                background: canProceed() ? 'var(--accent)' : 'var(--bg-elevated)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: canProceed() ? 'var(--text-inverse)' : 'var(--text-muted)',
                padding: '10px 24px', fontSize: 'var(--font-size-sm)',
                cursor: canProceed() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
                fontWeight: 600, transition: 'all var(--transition-fast)',
                opacity: canProceed() ? 1 : 0.6,
              }}
            >
              {step === 2 ? (
                <>Launch Dashboard <MdRocketLaunch size={16} /></>
              ) : (
                <>Next <MdArrowForward size={16} /></>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
