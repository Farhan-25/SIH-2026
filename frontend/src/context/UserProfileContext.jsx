import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { useAuth } from './AuthContext'

const UserProfileContext = createContext(null)

function profileKey(email) {
  if (!email) return null
  return `freightiq_user_profile:${String(email).toLowerCase()}`
}

/* ── All selectable options (derived from reference data) ────── */

export const ALL_DESTINATION_PORTS = [
  { id: 'IN_PRT', name: 'Paradip Port', state: 'Odisha', maxDraft: 14.5, vesselClasses: ['Handysize', 'Supramax', 'Panamax', 'Kamsarmax'], cargoes: ['Thermal Coal', 'Coking Coal', 'Iron Ore', 'Limestone', 'Fertilizer'] },
  { id: 'IN_VTZ', name: 'Visakhapatnam (Vizag)', state: 'Andhra Pradesh', maxDraft: 18.1, vesselClasses: ['Handysize', 'Supramax', 'Panamax', 'Kamsarmax', 'Capesize'], cargoes: ['Coking Coal', 'Thermal Coal', 'Iron Ore', 'Alumina', 'Manganese Ore'] },
  { id: 'IN_GNV', name: 'Gangavaram Port', state: 'Andhra Pradesh', maxDraft: 19.5, vesselClasses: ['Supramax', 'Panamax', 'Capesize', 'Newcastlemax'], cargoes: ['Coking Coal', 'Thermal Coal', 'Iron Ore', 'Limestone', 'Bauxite'] },
  { id: 'IN_DHM', name: 'Dhamra Port', state: 'Odisha', maxDraft: 18.0, vesselClasses: ['Supramax', 'Panamax', 'Kamsarmax', 'Capesize'], cargoes: ['Thermal Coal', 'Coking Coal', 'Iron Ore', 'Limestone'] },
  { id: 'IN_GPL', name: 'Gopalpur Port', state: 'Odisha', maxDraft: 14.5, vesselClasses: ['Handysize', 'Supramax', 'Panamax'], cargoes: ['Thermal Coal', 'Iron Ore', 'Fertilizers'] },
  { id: 'IN_HLD', name: 'Haldia Dock Complex', state: 'West Bengal', maxDraft: 8.0, vesselClasses: ['Handysize', 'Supramax (Partially Laden)'], cargoes: ['Coking Coal', 'Thermal Coal', 'Limestone', 'Manganese Ore'] },
  { id: 'IN_SGR', name: 'Sagar-Sandheads Anchorage', state: 'West Bengal', maxDraft: 15.0, vesselClasses: ['Panamax', 'Kamsarmax', 'Capesize (Transshipment)'], cargoes: ['Coking Coal', 'Thermal Coal'] },
]

export const ALL_TRADE_ROUTES = [
  { id: 'AU_NEW_TO_IN_PRT', origin: 'Newcastle (Australia)', destination: 'Paradip', destPort: 'IN_PRT', cargo: 'Thermal / Semi-soft Coal', distance: 5420 },
  { id: 'AU_HAY_TO_IN_VTZ', origin: 'Hay Point (Australia)', destination: 'Visakhapatnam', destPort: 'IN_VTZ', cargo: 'Premium Coking Coal', distance: 4860 },
  { id: 'AU_GLA_TO_IN_GNV', origin: 'Gladstone (Australia)', destination: 'Gangavaram', destPort: 'IN_GNV', cargo: 'Coking / Thermal Coal', distance: 5010 },
  { id: 'ID_KLT_TO_IN_PRT', origin: 'S. Kalimantan (Indonesia)', destination: 'Paradip', destPort: 'IN_PRT', cargo: 'Thermal Coal', distance: 2180 },
  { id: 'ID_SMR_TO_IN_HLD', origin: 'Samarinda (Indonesia)', destination: 'Haldia', destPort: 'IN_HLD', cargo: 'Thermal Coal', distance: 2350 },
  { id: 'ID_KLT_TO_IN_DHM', origin: 'S. Kalimantan (Indonesia)', destination: 'Dhamra', destPort: 'IN_DHM', cargo: 'Thermal Coal', distance: 2210 },
  { id: 'MZ_NAC_TO_IN_VTZ', origin: 'Nacala (Mozambique)', destination: 'Visakhapatnam', destPort: 'IN_VTZ', cargo: 'Coking / Thermal Coal', distance: 3650 },
  { id: 'MZ_BEI_TO_IN_GPL', origin: 'Beira (Mozambique)', destination: 'Gopalpur', destPort: 'IN_GPL', cargo: 'Thermal Coal', distance: 4120 },
  { id: 'US_NOR_TO_IN_PRT', origin: 'Norfolk (USA)', destination: 'Paradip', destPort: 'IN_PRT', cargo: 'Metallurgical Coal', distance: 8950 },
  { id: 'US_BAL_TO_IN_GNV', origin: 'Baltimore (USA)', destination: 'Gangavaram', destPort: 'IN_GNV', cargo: 'Coking Coal', distance: 8870 },
  { id: 'RU_TAM_TO_IN_VTZ', origin: 'Taman (Russia)', destination: 'Visakhapatnam', destPort: 'IN_VTZ', cargo: 'Russian Thermal / PCI Coal', distance: 4820 },
  { id: 'RU_VOS_TO_IN_PRT', origin: 'Vostochny (Russia)', destination: 'Paradip', destPort: 'IN_PRT', cargo: 'Coking Coal / Anthracite', distance: 4550 },
]

export const ALL_CARGO_TYPES = [
  'Thermal Coal',
  'Coking Coal',
  'Iron Ore',
  'Bauxite',
  'Limestone',
  'Manganese Ore',
  'Alumina',
  'Fertilizer',
  'PCI Coal',
]

/* ── Helpers ─────────────────────────────────────────────────── */

function loadProfile(email) {
  const key = profileKey(email)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.ports && parsed.routes && parsed.cargoes) return parsed
    return null
  } catch {
    return null
  }
}

function saveProfile(email, profile) {
  const key = profileKey(email)
  if (!key) return
  localStorage.setItem(key, JSON.stringify(profile))
}

/* ── Provider ────────────────────────────────────────────────── */

export function UserProfileProvider({ children }) {
  const { currentUser } = useAuth()
  const email = currentUser?.email || ''
  const [profile, setProfile] = useState(() => loadProfile(email))

  useEffect(() => {
    setProfile(loadProfile(email))
  }, [email])

  const isOnboarded = !!profile

  const updateProfile = useCallback((newProfile) => {
    setProfile(newProfile)
    saveProfile(email, newProfile)
  }, [email])

  const resetProfile = useCallback(() => {
    setProfile(null)
    const key = profileKey(email)
    if (key) localStorage.removeItem(key)
  }, [email])

  const value = useMemo(() => {
    const selectedPorts = profile?.ports || []
    const selectedRoutes = profile?.routes || []
    const selectedCargoes = profile?.cargoes || []

    // Filter helpers — if profile is empty, show all (fallback)
    const isPortSelected = (portId) =>
      selectedPorts.length === 0 || selectedPorts.includes(portId)

    const isRouteSelected = (routeId) =>
      selectedRoutes.length === 0 || selectedRoutes.includes(routeId)

    const isCargoSelected = (cargo) => {
      if (selectedCargoes.length === 0) return true
      const lc = cargo.toLowerCase()
      return selectedCargoes.some(c => lc.includes(c.toLowerCase()))
    }

    // Filter an array of route objects (works with both reference data and BASELINE_ROUTES format)
    const filterRoutes = (routes) => {
      if (selectedRoutes.length === 0) return routes
      return routes.filter(r => {
        const id = r.route_id || r.id
        return selectedRoutes.includes(id)
      })
    }

    // Get routes available for the selected ports
    const getRoutesForPorts = (portIds) => {
      return ALL_TRADE_ROUTES.filter(r => portIds.includes(r.destPort))
    }

    return {
      profile,
      isOnboarded,
      selectedPorts,
      selectedRoutes,
      selectedCargoes,
      updateProfile,
      resetProfile,
      isPortSelected,
      isRouteSelected,
      isCargoSelected,
      filterRoutes,
      getRoutesForPorts,
    }
  }, [profile, isOnboarded, updateProfile, resetProfile])

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile() {
  const context = useContext(UserProfileContext)
  if (!context) {
    throw new Error('useUserProfile must be used inside UserProfileProvider')
  }
  return context
}
