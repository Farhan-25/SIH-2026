import React, { useState, useEffect, useCallback } from 'react'
import { getDatasetPreview } from '../api/client'
import { MdTableChart, MdFilterList, MdSearch, MdChevronLeft, MdChevronRight, MdStorage, MdDateRange, MdDirectionsBoat, MdAltRoute, MdDownload } from 'react-icons/md'

export default function DatasetExplorer() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedRoute, setSelectedRoute] = useState('')
  const [selectedVessel, setSelectedVessel] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const handleDownloadCSV = () => {
    const params = new URLSearchParams()
    if (selectedRoute) params.append('route_id', selectedRoute)
    if (selectedVessel) params.append('vessel_class', selectedVessel)
    const url = `/api/v1/dataset/download?${params.toString()}`
    window.open(url, '_blank')
  }


  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDatasetPreview({
        page,
        page_size: pageSize,
        route_id: selectedRoute || undefined,
        vessel_class: selectedVessel || undefined,
      })
      setData(res)
    } catch (err) {
      console.error('Failed to load dataset preview:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, selectedRoute, selectedVessel])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRecords = data?.records?.filter(row => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return Object.values(row).some(val => String(val).toLowerCase().includes(term))
  }) || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
            <MdStorage style={{ color: 'var(--accent-ocean)' }} /> Total Dataset Records
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {data?.summary?.total_records?.toLocaleString() || '---'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
            <MdDateRange style={{ color: 'var(--accent-emerald)' }} /> Time Span
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data?.summary?.date_min || 'N/A'} → {data?.summary?.date_max || 'N/A'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
            <MdAltRoute style={{ color: 'var(--accent-amber)' }} /> Trade Routes
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {data?.summary?.routes_count || 0}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>
            <MdDirectionsBoat style={{ color: 'var(--accent)' }} /> Vessel Classes
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data?.summary?.vessel_classes?.join(', ') || 'None'}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
            <MdSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '18px' }} />
            <input
              type="text"
              placeholder="Search table..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{
                paddingLeft: '36px',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Route Filter */}
          <select
            value={selectedRoute}
            onChange={(e) => { setSelectedRoute(e.target.value); setPage(1); }}
            className="form-control"
            style={{ fontSize: '13px', width: 'auto', cursor: 'pointer' }}
          >
            <option value="">All Routes</option>
            {data?.available_routes?.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* Vessel Filter */}
          <select
            value={selectedVessel}
            onChange={(e) => { setSelectedVessel(e.target.value); setPage(1); }}
            className="form-control"
            style={{ fontSize: '13px', width: 'auto', cursor: 'pointer' }}
          >
            <option value="">All Vessel Classes</option>
            {data?.available_vessels?.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Showing {data?.summary?.filtered_records?.toLocaleString() || 0} matching records
          </div>

          <button
            onClick={handleDownloadCSV}
            className="btn btn-primary"
            style={{ fontSize: '13px' }}
          >
            <MdDownload style={{ fontSize: '16px' }} /> Download CSV
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
          <table className="data-table" style={{ fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', position: 'sticky', top: 0, zIndex: 10 }}>
                <th>Date</th>
                <th>Route ID</th>
                <th>Vessel Class</th>
                <th>Freight Rate ($/MT)</th>
                <th>BDI Index</th>
                <th>Bunker ($/t)</th>
                <th>USD/INR FX</th>
                <th>Lag 1W ($)</th>
                <th>Volatility 4W</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Loading unified dataset timeseries...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No dataset records match current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-hover)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.date || '---'}</td>
                    <td style={{ color: 'var(--accent-ocean)' }}>{row.route_id || '---'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.vessel_class || '---'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                      {typeof row.rate_usd_per_mt === 'number' ? `$${row.rate_usd_per_mt.toFixed(2)}` : row.rate_usd_per_mt || '---'}
                    </td>
                    <td style={{ color: 'var(--accent-amber)' }}>{row.bdi_index ?? '---'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.bunker_price_usd_t ? `$${row.bunker_price_usd_t}` : '---'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.usd_inr_fx ?? '---'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.freight_lag_1w ?? '---'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.volatility_4w ?? '---'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Page {data?.page || 1} of {data?.total_pages || 1}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '13px', opacity: page <= 1 ? 0.4 : 1 }}
            >
              <MdChevronLeft /> Prev
            </button>

            <button
              onClick={() => setPage(p => Math.min(data?.total_pages || 1, p + 1))}
              disabled={page >= (data?.total_pages || 1) || loading}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '13px', opacity: page >= (data?.total_pages || 1) ? 0.4 : 1 }}
            >
              Next <MdChevronRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
