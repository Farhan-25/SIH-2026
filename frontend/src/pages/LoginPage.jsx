import { useState } from 'react'
import { motion } from 'framer-motion'
import { MdLogin, MdEmail, MdLock } from 'react-icons/md'
import { loginUser } from '../api/client'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (!email || !password) {
        throw new Error("Please enter your credentials.")
      }
      const data = await loginUser({ email, password })
      onLogin(data) // pass data back to App
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError(err.message || 'Authentication failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      padding: 'var(--space-lg)',
      position: 'relative'
    }}>
      
      {/* Top Left Branding */}
      <div style={{ 
        position: 'absolute', 
        top: 'var(--space-xl)', 
        left: 'var(--space-xl)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 'var(--space-sm)' 
      }}>
        <img src="/frieght_iq_logo.jpg" alt="FreightIQ Logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }} />
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: '700', color: 'var(--text-primary)' }}>FreightIQ</h2>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--glass-shadow)',
          padding: 'var(--space-2xl) var(--space-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-lg)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Decorative background glow */}
        <div style={{
          position: 'absolute', top: -50, right: -50, width: 150, height: 150,
          background: 'var(--accent)', filter: 'blur(80px)', opacity: 0.15, borderRadius: '50%'
        }} />

        <div style={{ textAlign: 'center', marginBottom: 'var(--space-sm)' }}>
          <h1 style={{ margin: '0 0 var(--space-xs) 0', fontSize: 'var(--font-size-2xl)', fontWeight: '700' }}>
            Welcome Back
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Sign in to access your account
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--accent-rose-dim)',
            border: '1px solid var(--accent-rose)',
            color: 'var(--text-primary)',
            padding: 'var(--space-sm) var(--space-md)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-sm)',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: '500' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <MdEmail style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={20} />
              <input
                type="text"
                placeholder="admin@freightiq.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 48px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-md)',
                  outline: 'none',
                  transition: 'border-color var(--transition-fast)'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', fontWeight: '500' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <MdLock style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={20} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 48px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-md)',
                  outline: 'none',
                  transition: 'border-color var(--transition-fast)'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: 'var(--space-sm)',
              width: '100%',
              padding: '14px',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-md)',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-sm)',
              opacity: isLoading ? 0.7 : 1,
              transition: 'transform var(--transition-fast)'
            }}
            onMouseOver={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseOut={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(0)')}
            onMouseDown={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(0)')}
            onMouseUp={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(-2px)')}
          >
            {isLoading ? 'Authenticating...' : (
              <>
                Sign In <MdLogin size={20} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
