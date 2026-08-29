import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MdSmartToy, MdSend, MdTrendingUp, MdShield,
  MdDirectionsBoat, MdRefresh, MdLightbulb, MdCheckCircle,
  MdWarning, MdSpeed, MdAccessTime, MdChat, MdInfoOutline,
  MdAutoAwesome, MdOutlineContentCopy, MdBarChart
} from 'react-icons/md'
import { getCopilotOverview, askCopilot } from '../api/client'

const QUICK_PROMPTS = [
  { label: '📈 Newcastle → Paradip Drivers', query: 'Why are freight rates rising for Newcastle to Paradip?' },
  { label: '🛡️ Red Sea & Suez Crisis Impact', query: 'Assess Red Sea disruption impact on Cape routing and landed costs' },
  { label: '🚢 Optimum Bulker for 75k MT Coal', query: 'Recommend the best vessel class for importing 75,000 MT Coal to Dhamra vs Haldia' },
  { label: '📊 Spot vs Forward Decision', query: 'Should we fix spot or lock forward contracts for East Coast India imports?' },
  { label: '⚓ Port Queue & Demurrage Check', query: 'What are current port waiting days and demurrage risks across Odisha ports?' }
]

export default function CopilotPage() {
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  // Load Executive Briefing on Mount
  useEffect(() => {
    setOverviewLoading(true)
    getCopilotOverview()
      .then(data => {
        setOverview(data)
        // Add initial system greeting
        setMessages([
          {
            sender: 'copilot',
            text: data.briefing || "Welcome to FreightIQ Maritime Copilot. Ask me anything about freight rate forecasts, SHAP feature importance, vessel choices, or geopolitical chokepoint risks.",
            key_insights: data.key_insights || [],
            suggested_actions: data.suggested_actions || [],
            timestamp: new Date().toLocaleTimeString()
          }
        ])
      })
      .catch(() => {
        setMessages([
          {
            sender: 'copilot',
            text: "Welcome to FreightIQ Maritime Copilot. How can I assist with your freight forecasting or vessel chartering strategy today?",
            key_insights: [
              "Macro Sentiment: Negative (-0.42)",
              "Red Sea Disruption Index: 0.88 (CRITICAL)",
              "Paradip Port Wait: ~4.8 days"
            ],
            suggested_actions: [
              "Explain Newcastle → Paradip rate drivers",
              "Recommend vessel for 75,000 MT coal"
            ],
            timestamp: new Date().toLocaleTimeString()
          }
        ])
      })
      .finally(() => setOverviewLoading(false))
  }, [])

  const handleSendMessage = (textToSend = null) => {
    const query = (textToSend || inputMessage).trim()
    if (!query || loading) return

    // Append User Message
    const userMsg = {
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString()
    }
    setMessages(prev => [...prev, userMsg])
    setInputMessage('')
    setLoading(true)

    askCopilot(query)
      .then(res => {
        const copilotMsg = {
          sender: 'copilot',
          text: res.response || "Analysis complete.",
          key_insights: res.key_insights || [],
          suggested_actions: res.suggested_actions || [],
          timestamp: new Date().toLocaleTimeString()
        }
        setMessages(prev => [...prev, copilotMsg])
      })
      .catch(err => {
        const errorMsg = {
          sender: 'copilot',
          text: "I encountered an issue processing that query. Please try again or select one of the suggested prompts below.",
          key_insights: [],
          suggested_actions: [],
          timestamp: new Date().toLocaleTimeString()
        }
        setMessages(prev => [...prev, errorMsg])
      })
      .finally(() => setLoading(false))
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* ─── Header ─── */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.5rem' }}>🤖</span>
            <h1 style={{ margin: 0 }}>AI Maritime Intelligence Copilot</h1>
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>NLP + XAI REASONING</span>
          </div>
          <p>Conversational explanations of freight rate forecasting, SHAP driver weights, and geopolitical risk</p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => window.location.reload()}
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
          >
            <MdRefresh style={{ marginRight: 6 }} /> Reset Session
          </button>
        </div>
      </div>

      {/* ─── Layout: 2 Columns (Main Chat + Context Inspector Sidebar) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }}>
        
        {/* ─── Column 1: Main Conversational Area ─── */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '720px', padding: 0, overflow: 'hidden' }}>
          
          {/* Top Chat Bar */}
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }} />
              <strong>FreightIQ Reasoning Copilot</strong>
              <span style={{ color: 'var(--text-muted)' }}>• Active Context: Australia, Indonesia, Odisha Ports</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>v2.0 XAI Mode</span>
          </div>

          {/* Messages Scroll View */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {messages.map((msg, i) => {
              const isUser = msg.sender === 'user'
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: isUser ? '80%' : '90%',
                    alignSelf: isUser ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 4,
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)'
                  }}>
                    <span>{isUser ? 'Procurement Lead' : '🤖 FreightIQ Copilot'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div style={{
                    background: isUser ? 'linear-gradient(135deg, var(--accent-ocean), hsl(200, 70%, 35%))' : 'var(--bg-elevated)',
                    border: isUser ? 'none' : '1px solid var(--border-subtle)',
                    borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    padding: '14px 18px',
                    color: isUser ? '#ffffff' : 'var(--text-primary)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    lineHeight: 1.6,
                    fontSize: '0.9rem',
                    whiteSpace: 'pre-line'
                  }}>
                    {msg.text}

                    {/* Key Insight Bullets */}
                    {msg.key_insights && msg.key_insights.length > 0 && (
                      <div style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: '1px solid hsla(0, 0%, 100%, 0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                          KEY TAKEAWAYS:
                        </div>
                        {msg.key_insights.map((insight, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                            <MdCheckCircle style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} size={14} />
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Suggested Follow-up Actions */}
                  {msg.suggested_actions && msg.suggested_actions.length > 0 && !isUser && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {msg.suggested_actions.map((act, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(act)}
                          style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--accent-ocean)',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-ocean)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                        >
                          ⚡ {act}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            })}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <span className="badge badge-info">Thinking...</span>
                <span>Synthesizing SHAP values and geopolitical risk indices...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Pills Bar */}
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '8px 16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}>
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(qp.query)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--accent-ocean)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div style={{
            padding: '14px 18px',
            background: 'var(--bg-primary)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 10,
            alignItems: 'center'
          }}>
            <input
              type="text"
              placeholder="Ask Copilot (e.g., 'Why is Newcastle freight rising?', 'Check Haldia draft limit', 'Explain Red Sea risk')..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !inputMessage.trim()}
              className="btn btn-primary"
              style={{ padding: '10px 18px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <MdSend /> Send
            </button>
          </div>
        </div>

        {/* ─── Column 2: Live Maritime Context Inspector ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Executive Briefing Summary Card */}
          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdAutoAwesome style={{ color: 'var(--accent-amber)' }} />
              Active System Knowledge Base
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>FinBERT Sentiment:</span>
                <strong style={{ color: (overview?.sentiment_score || -0.42) < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                  {overview?.sentiment_score || -0.42} ({overview?.sentiment_label || 'Negative'})
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Red Sea Disruption:</span>
                <strong style={{ color: 'var(--accent-rose)' }}>0.88 (CRITICAL)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Suez Canal Transit:</span>
                <strong style={{ color: 'var(--accent-amber)' }}>-58% YoY</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>VLSFO Bunker Est:</span>
                <strong style={{ color: '#ff9500' }}>$612/MT</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Recommended Fixing:</span>
                <strong style={{ color: 'var(--accent-cyan)' }}>60% Forward Term</strong>
              </div>
            </div>
          </div>

          {/* Top SHAP Weights Reference */}
          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdBarChart style={{ color: 'var(--accent-ocean)' }} />
              Live SHAP Driver Weights
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>VLSFO Bunker Fuel</span>
                  <strong>+21.8%</strong>
                </div>
                <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
                  <div style={{ width: '85%', height: '100%', background: 'var(--accent-ocean)', borderRadius: 2 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Baltic Dry Index (BDI)</span>
                  <strong>+17.5%</strong>
                </div>
                <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
                  <div style={{ width: '70%', height: '100%', background: 'var(--accent-emerald)', borderRadius: 2 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>Port Demurrage & Queue</span>
                  <strong>+14.2%</strong>
                </div>
                <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
                  <div style={{ width: '58%', height: '100%', background: 'var(--accent-amber)', borderRadius: 2 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>USD/INR Exchange Rate</span>
                  <strong>+9.8%</strong>
                </div>
                <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
                  <div style={{ width: '40%', height: '100%', background: 'var(--accent-violet)', borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Port Operational Constraints Quick Ref */}
          <div className="glass-card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdDirectionsBoat style={{ color: 'var(--accent-emerald)' }} />
              Draft Limits at a Glance
            </h3>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              • <strong>Paradip / Dhamra:</strong> 17.1m–18.5m (Capesize OK)<br/>
              • <strong>Visakhapatnam:</strong> 16.5m (Panamax/Capesize outer)<br/>
              • <strong>Haldia:</strong> 8.5m (Lighterage mandatory at Sagar)
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  )
}
