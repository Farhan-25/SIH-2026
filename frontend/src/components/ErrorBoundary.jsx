import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('FreightIQ Unhandled Error Caught by ErrorBoundary:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--accent-rose)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: 'var(--glass-shadow)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>!</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-rose)', marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px' }}>
              An unexpected error occurred while rendering the interface.
            </p>
            {this.state.error && (
              <div style={{
                background: 'var(--bg-input)',
                padding: '12px 16px',
                borderRadius: '8px',
                textAlign: 'left',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                color: 'var(--accent-rose)',
                overflowX: 'auto',
                marginBottom: '20px',
                border: '1px solid var(--border-subtle)',
              }}>
                {this.state.error.toString()}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                className="btn btn-primary"
                style={{ padding: '10px 20px', fontSize: '0.9rem' }}
              >
                Return to Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', fontSize: '0.9rem' }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
