import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

const USERS_KEY = 'freightiq_users'
const SESSION_KEY = 'freightiq_session'

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.email) return { email: parsed.email, name: parsed.name || parsed.email }
    return null
  } catch {
    return null
  }
}

function persistSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  localStorage.setItem('freightiq_token', `demo-${user.email}`)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => loadSession())

  const startSession = useCallback((user) => {
    persistSession(user)
    setCurrentUser(user)
  }, [])

  const signup = useCallback(({ name, email, password }) => {
    const cleanEmail = normalizeEmail(email)
    const cleanName = String(name || '').trim()
    const cleanPassword = String(password || '')
    if (!cleanName) throw new Error('Please enter your name.')
    if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Please enter a valid email.')
    if (cleanPassword.length < 4) throw new Error('Password must be at least 4 characters.')

    const users = loadUsers()
    if (users.some((u) => u.email === cleanEmail)) {
      throw new Error('An account with this email already exists. Sign in instead.')
    }

    const user = {
      name: cleanName,
      email: cleanEmail,
      password: cleanPassword,
      createdAt: new Date().toISOString(),
    }
    saveUsers([...users, user])
    startSession({ name: user.name, email: user.email })
    return { isNewUser: true }
  }, [startSession])

  const login = useCallback(({ email, password }) => {
    const cleanEmail = normalizeEmail(email)
    const cleanPassword = String(password || '')
    if (!cleanEmail || !cleanPassword) throw new Error('Please enter your credentials.')

    const users = loadUsers()
    const user = users.find((u) => u.email === cleanEmail)
    if (!user) throw new Error('No account found. Create one to get started.')
    if (user.password !== cleanPassword) throw new Error('Incorrect password.')

    startSession({ name: user.name, email: user.email })
    return { isNewUser: false }
  }, [startSession])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem('freightiq_token')
    setCurrentUser(null)
  }, [])

  const value = useMemo(() => ({
    currentUser,
    isAuthenticated: !!currentUser,
    signup,
    login,
    logout,
  }), [currentUser, signup, login, logout])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
