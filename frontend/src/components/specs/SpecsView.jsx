import { useState, useEffect, useCallback } from 'react'
import { ScrollText, ChevronRight, ArrowLeft } from 'lucide-react'
import './SpecsView.css'

const TYPE_LABELS = {
  spec: 'Spec',
  patch: 'Patch',
  adr: 'ADR',
  phase_plan: 'Phase Plan',
  handoff: 'Handoff',
}

const TYPE_COLORS = {
  spec: '#4f8ef7',
  patch: '#f7a24f',
  adr: '#a24ff7',
  phase_plan: '#4fc9f7',
  handoff: '#4ff7a2',
}

export default function SpecsView() {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchList = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: 100, offset: 0 })
    if (typeFilter) params.set('type', typeFilter)
    if (q) params.set('q', q)
    fetch(`/api/specs?${params}`)
      .then(r => r.json())
      .then(data => {
        setRecords(data.records || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load spec records')
        setLoading(false)
      })
  }, [typeFilter, q])

  useEffect(() => { fetchList() }, [fetchList])

  const openDetail = (id) => {
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    fetch(`/api/specs/${id}`)
      .then(r => r.json())
      .then(data => {
        setDetail(data)
        setDetailLoading(false)
      })
      .catch(() => setDetailLoading(false))
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setQ(searchInput)
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (selectedId) {
    return (
      <div className="specs-view">
        <div className="specs-detail-header">
          <button className="specs-back-btn" onClick={() => { setSelectedId(null); setDetail(null) }}>
            <ArrowLeft size={14} /> Back
          </button>
          {detail && (
            <span className="specs-type-badge" style={{ background: TYPE_COLORS[detail.type] || '#888' }}>
              {TYPE_LABELS[detail.type] || detail.type}
            </span>
          )}
        </div>
        {detailLoading && <div className="specs-loading">Loading…</div>}
        {detail && (
          <div className="specs-detail">
            <div className="specs-detail-meta">
              <h2>{detail.title}</h2>
              <div className="specs-meta-row">
                <span>v{detail.version}</span>
                <span>{formatDate(detail.created_at)}</span>
                {detail.supersedes_id && <span className="specs-supersedes">supersedes {detail.supersedes_id.slice(0, 8)}…</span>}
              </div>
            </div>
            <pre className="specs-content">{detail.content_md}</pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="specs-view">
      <div className="specs-header">
        <div className="specs-title-row">
          <ScrollText size={18} />
          <h2>Spec Records</h2>
          <span className="specs-total">{total} record{total !== 1 ? 's' : ''}</span>
        </div>
        <div className="specs-controls">
          <div className="specs-type-filters">
            {['', 'spec', 'patch', 'adr', 'phase_plan', 'handoff'].map(t => (
              <button
                key={t}
                className={'specs-type-btn' + (typeFilter === t ? ' active' : '')}
                onClick={() => setTypeFilter(t)}
                style={typeFilter === t && t ? { background: TYPE_COLORS[t], color: '#fff' } : {}}
              >
                {t ? (TYPE_LABELS[t] || t) : 'All'}
              </button>
            ))}
          </div>
          <form className="specs-search-form" onSubmit={handleSearch}>
            <input
              className="specs-search-input"
              placeholder="Search title or content…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            <button type="submit" className="specs-search-btn">Search</button>
            {q && <button type="button" className="specs-clear-btn" onClick={() => { setQ(''); setSearchInput('') }}>Clear</button>}
          </form>
        </div>
      </div>

      {loading && <div className="specs-loading">Loading…</div>}
      {error && <div className="specs-error">{error}</div>}
      {!loading && !error && records.length === 0 && (
        <div className="specs-empty">No spec records found.</div>
      )}
      {!loading && !error && records.length > 0 && (
        <div className="specs-list">
          {records.map(rec => (
            <div key={rec.id} className="specs-row" onClick={() => openDetail(rec.id)}>
              <span className="specs-row-badge" style={{ background: TYPE_COLORS[rec.type] || '#888' }}>
                {TYPE_LABELS[rec.type] || rec.type}
              </span>
              <div className="specs-row-main">
                <span className="specs-row-title">{rec.title}</span>
                <span className="specs-row-meta">v{rec.version} · {formatDate(rec.created_at)}</span>
              </div>
              <ChevronRight size={14} className="specs-row-chevron" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
