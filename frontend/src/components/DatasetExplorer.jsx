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
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px 20px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            <MdStorage style={{ color: '#38bdf8' }} /> Total Dataset Records
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            {data?.summary?.total_records?.toLocaleString() || '---'}
          </div>
        </div>

        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px 20px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            <MdDateRange style={{ color: '#4ade80' }} /> Time Span
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
            {data?.summary?.date_min || 'N/A'} → {data?.summary?.date_max || 'N/A'}
          </div>
        </div>

        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px 20px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            <MdAltRoute style={{ color: '#facc15' }} /> Trade Routes
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            {data?.summary?.routes_count || 0}
          </div>
        </div>

        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px 20px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            <MdDirectionsBoat style={{ color: '#c084fc' }} /> Vessel Classes
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
            {data?.summary?.vessel_classes?.join(', ') || 'None'}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px 20px', border: '1px solid #334155', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
            <MdSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '18px' }} />
            <input
              type="text"
              placeholder="Search table..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Route Filter */}
          <select
            value={selectedRoute}
            onChange={(e) => { setSelectedRoute(e.target.value); setPage(1); }}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
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
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">All Vessel Classes</option>
            {data?.available_vessels?.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Showing {data?.summary?.filtered_records?.toLocaleString() || 0} matching records
          </div>

          <button
            onClick={handleDownloadCSV}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            }}
          >
            <MdDownload style={{ fontSize: '16px' }} /> Download CSV
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Route ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Vessel Class</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Freight Rate ($/MT)</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>BDI Index</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Bunker ($/t)</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>USD/INR FX</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Lag 1W ($)</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Volatility 4W</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    Loading unified dataset timeseries...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No dataset records match current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #334155',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.4)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#f8fafc' }}>{row.date || '---'}</td>
                    <td style={{ padding: '10px 16px', color: '#38bdf8' }}>{row.route_id || '---'}</td>
                    <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>{row.vessel_class || '---'}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#4ade80' }}>
                      {typeof row.rate_usd_per_mt === 'number' ? `$${row.rate_usd_per_mt.toFixed(2)}` : row.rate_usd_per_mt || '---'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#facc15' }}>{row.bdi_index ?? '---'}</td>
                    <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>{row.bunker_price_usd_t ? `$${row.bunker_price_usd_t}` : '---'}</td>
                    <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>{row.usd_inr_fx ?? '---'}</td>
                    <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{row.freight_lag_1w ?? '---'}</td>
                    <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{row.volatility_4w ?? '---'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Page {data?.page || 1} of {data?.total_pages || 1}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: page <= 1 ? '#1e293b' : '#334155',
                color: page <= 1 ? '#64748b' : '#f8fafc',
                border: 'none',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px',
              }}
            >
              <MdChevronLeft /> Prev
            </button>

            <button
              onClick={() => setPage(p => Math.min(data?.total_pages || 1, p + 1))}
              disabled={page >= (data?.total_pages || 1) || loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: page >= (data?.total_pages || 1) ? '#1e293b' : '#334155',
                color: page >= (data?.total_pages || 1) ? '#64748b' : '#f8fafc',
                border: 'none',
                cursor: page >= (data?.total_pages || 1) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px',
              }}
            >
              Next <MdChevronRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
