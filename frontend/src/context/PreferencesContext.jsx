import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const PreferencesContext = createContext(null)

const USD_TO_INR = 83.5

const CURRENCY = {
  USD: { symbol: '$', code: 'USD', locale: 'en-US', rate: 1 },
  INR: { symbol: '₹', code: 'INR', locale: 'en-IN', rate: USD_TO_INR },
}

function getStoredValue(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) || fallback
}

function toNumber(value) {
  if (typeof value === 'number') return value
  if (value === undefined || value === null) return 0
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function PreferencesProvider({ children }) {
  const [theme, setTheme] = useState(() => getStoredValue('freightiq-theme', 'dark'))
  const [currency, setCurrency] = useState(() => getStoredValue('freightiq-currency', 'USD'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('freightiq-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('freightiq-currency', currency)
  }, [currency])

  const value = useMemo(() => {
    const meta = CURRENCY[currency] || CURRENCY.USD
    const convert = (amount) => toNumber(amount) * meta.rate
    const formatMoney = (amount, options = {}) => {
      const {
        decimals = 2,
        compact = false,
        suffix = '',
        showCode = false,
      } = options
      const converted = convert(amount)
      const formatted = new Intl.NumberFormat(meta.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        notation: compact ? 'compact' : 'standard',
      }).format(converted)
      return `${meta.symbol}${formatted}${suffix}${showCode ? ` ${meta.code}` : ''}`
    }

    const isLight = theme === 'light'

    return {
      theme,
      currency,
      currencySymbol: meta.symbol,
      currencyCode: meta.code,
      axisCurrencyPrefix: meta.symbol,
      isLightMode: isLight,
      chartTick: isLight ? 'hsl(220, 10%, 36%)' : 'hsl(0, 0%, 55%)',
      chartGrid: isLight ? 'hsla(220, 12%, 20%, 0.1)' : 'hsla(0, 0%, 20%, 0.2)',
      toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'),
      toggleCurrency: () => setCurrency(current => current === 'USD' ? 'INR' : 'USD'),
      formatMoney,
      convertMoney: convert,
    }
  }, [theme, currency])

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used inside PreferencesProvider')
  }
  return context
}
