import React, { useState, useEffect, useRef } from 'react'
import { triggerModelRetrain, getRetrainStatus } from '../api/client'
import { MdPlayArrow, MdClose, MdRefresh, MdCheckCircle, MdError, MdTerminal } from 'react-icons/md'

export default function RetrainModal({ isOpen, onClose, onTrainingSuccess }) {
  const [statusState, setStatusState] = useState({
    status: 'idle',
    started_at: null,
    ended_at: null,
    logs: [],
    error: null,
  })
  const [loading, setLoading] = useState(false)
  const logContainerRef = useRef(null)
  const pollTimerRef = useRef(null)

  // Poll status when modal is open or when status is running
  const fetchStatus = async () => {
    try {
      const data = await getRetrainStatus()
      setStatusState(data)
      if (data.status === 'completed' && onTrainingSuccess) {
        onTrainingSuccess()
      }
    } catch (err) {
      console.error('Failed to fetch training status:', err)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    fetchStatus()

    // Poll every 1.5s if status is running
    pollTimerRef.current = setInterval(() => {
      fetchStatus()
    }, 1500)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [isOpen])

  // Auto-scroll terminal log window to bottom on new log lines
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [statusState.logs])

  const handleStartRetrain = async () => {
    setLoading(true)
    try {
      await triggerModelRetrain()
      await fetchStatus()
    } catch (err) {
      console.error('Failed to trigger retraining:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const isRunning = statusState.status === 'running'
  const isCompleted = statusState.status === 'completed'
  const isFailed = statusState.status === 'failed'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '850px',
          backgroundColor: '#0f172a',
          borderRadius: '16px',
          border: '1px solid #1e293b',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              <MdTerminal />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
                Retrain ML Models Pipeline
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Run 5-stage feature engineering, tree ensemble & PyTorch BiLSTM model trainer
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Status Badge */}
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: isRunning
                  ? 'rgba(234, 179, 8, 0.15)'
                  : isCompleted
                  ? 'rgba(34, 197, 94, 0.15)'
                  : isFailed
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(148, 163, 184, 0.15)',
                color: isRunning
                  ? '#eab308'
                  : isCompleted
                  ? '#22c55e'
                  : isFailed
                  ? '#ef4444'
                  : '#94a3b8',
                border: `1px solid ${
                  isRunning
                    ? 'rgba(234, 179, 8, 0.3)'
                    : isCompleted
                    ? 'rgba(34, 197, 94, 0.3)'
                    : isFailed
                    ? 'rgba(239, 68, 68, 0.3)'
                    : 'rgba(148, 163, 184, 0.3)'
                }`,
              }}
            >
              {isRunning && <span className="spinner-border spinner-border-sm" style={{ width: '12px', height: '12px' }} />}
              {isCompleted && <MdCheckCircle />}
              {isFailed && <MdError />}
              {statusState.status.toUpperCase()}
            </span>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '22px',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
              }}
            >
              <MdClose />
            </button>
          </div>
        </div>

        {/* Terminal Log Console */}
        <div
          ref={logContainerRef}
          style={{
            flex: 1,
            backgroundColor: '#020617',
            padding: '16px 20px',
            fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            color: '#38bdf8',
            overflowY: 'auto',
            minHeight: '320px',
            maxHeight: '480px',
            borderBottom: '1px solid #1e293b',
          }}
        >
          {statusState.logs.length === 0 ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', padding: '24px 0', textAlign: 'center' }}>
              Terminal idle. Click "Start Model Retraining" below to execute python train_models.py...
            </div>
          ) : (
            statusState.logs.map((log, index) => {
              let color = '#cbd5e1'
              if (log.includes('Initiating')) color = '#38bdf8'
              if (log.includes('Saved') || log.includes('completed')) color = '#4ade80'
              if (log.includes('failed') || log.includes('error')) color = '#f87171'
              if (log.includes('Epoch') || log.includes('Estimator')) color = '#facc15'

              return (
                <div key={index} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {log}
                </div>
              )
            })
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0f172a',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {statusState.started_at && (
              <span>Started: {new Date(statusState.started_at).toLocaleTimeString()}</span>
            )}
            {statusState.ended_at && (
              <span style={{ marginLeft: '12px' }}>Finished: {new Date(statusState.ended_at).toLocaleTimeString()}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={fetchStatus}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MdRefresh /> Refresh Log
            </button>

            <button
              onClick={handleStartRetrain}
              disabled={isRunning || loading}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                backgroundColor: isRunning ? '#334155' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isRunning || loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isRunning ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
            >
              <MdPlayArrow style={{ fontSize: '18px' }} />
              {isRunning ? 'Retraining Models...' : 'Start Model Retraining'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
