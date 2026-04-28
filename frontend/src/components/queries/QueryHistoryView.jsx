import React, { useState, useEffect, useCallback } from 'react'
import { getQueries, rerunQuery } from '../../api/client'
import { useToast } from '../shared/Toast'
import QueryDetailRow from './QueryDetailRow'
import Spinner from '../shared/Spinner'
import './QueryHistoryView.css'

const MODE_COLORS = {
  chat: '#3b82f6',
  keyword: '#22c55e',
  wildcard: '#f97316',
  semantic: '#8b5cf6',
}

function ModeBadge({ mode }) {
  return (
    <span className="qhv-mode-badge" style={{ background: MODE_COLORS[mode] || '#475569' }}>
      {mode}
    </span>
  )
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function truncate(text, n) {
  if (!text) return ''
  return text.length > n ? text.slice(0, n) + '…' : text
}

const PAGE_SIZE = 20

export default function QueryHistoryView() {
  const { showToast } = useToast()
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [rerunResults, setRerunResults] = useState({})
  const [rerunningId, setRerunningId] = useState(null)

  // Filters
  const [modeFilter, setModeFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fetchQueries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
      if (modeFilter) params.mode = modeFilter
      if (textFilter) params.q = textFilter
      if (fromDate) params.from = fromDate
      if (toDate) params.to = toDate
      const data = await getQueries(params)
      setEntries(data.entries || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message || 'Failed to load queries')
      setEntries([])
    }
    setLoading(false)
  }, [page, modeFilter, textFilter, fromDate, toDate])

  useEffect(() => { setPage(0) }, [modeFilter, textFilter, fromDate, toDate])
  useEffect(() => { fetchQueries() }, [fetchQueries])

  function clearFilters() {
    setModeFilter(''); setTextFilter(''); setFromDate(''); setToDate('')
  }

  async function handleRerun(id) {
    setRerunningId(id)
    try {
      const result = await rerunQuery(id)
      setRerunResults(prev => ({ ...prev, [id]: result }))
      showToast('Re-run complete')
    } catch (err) {
      showToast(err.message || 'Re-run failed', 'error')
    }
    setRerunningId(null)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const filtersActive = modeFilter || textFilter || fromDate || toDate

  return (
    <div className="qhv-container">
      <h1 className="qhv-title">Query History</h1>

      <div className="qhv-filter-bar">
        <select className="qhv-select" value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
          <option value="">All Modes</option>
          <option value="chat">Chat</option>
          <option value="keyword">Keyword</option>
          <option value="wildcard">Wildcard</option>
          <option value="semantic">Semantic</option>
        </select>
        <input
          className="qhv-input"
          placeholder="Filter by query text…"
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
        />
        <input
          className="qhv-input qhv-date"
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          title="From date"
        />
        <input
          className="qhv-input qhv-date"
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          title="To date"
        />
        {filtersActive && (
          <button className="qhv-clear-btn" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {loading ? (
        <div className="qhv-loading"><Spinner /></div>
      ) : error ? (
        <div className="qhv-error">
          <span>{error}</span>
          <button className="btn-secondary" onClick={fetchQueries}>Retry</button>
        </div>
      ) : entries.length === 0 ? (
        <p className="qhv-empty">No queries yet. Start a chat or search to see history here.</p>
      ) : (
        <>
          <table className="qhv-table">
            <thead>
              <tr>
                <th className="qhv-th">Query</th>
                <th className="qhv-th">Mode</th>
                <th className="qhv-th">Results</th>
                <th className="qhv-th">Latency</th>
                <th className="qhv-th">Tokens</th>
                <th className="qhv-th">Time</th>
                <th className="qhv-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <React.Fragment key={e.id}>
                  <tr className="qhv-row">
                    <td className="qhv-td qhv-query-text">{truncate(e.query_text, 80)}</td>
                    <td className="qhv-td"><ModeBadge mode={e.query_mode} /></td>
                    <td className="qhv-td qhv-num">{e.result_count ?? '—'}</td>
                    <td className="qhv-td qhv-num">{e.latency_ms != null ? `${e.latency_ms}ms` : '—'}</td>
                    <td className="qhv-td qhv-num">{e.query_mode === 'chat' && e.tokens_consumed != null ? e.tokens_consumed : '—'}</td>
                    <td className="qhv-td qhv-date">{formatDateTime(e.executed_at)}</td>
                    <td className="qhv-td qhv-actions">
                      <button
                        className="qhv-icon-btn"
                        title="Re-run"
                        onClick={() => handleRerun(e.id)}
                        disabled={rerunningId === e.id}
                      >
                        {rerunningId === e.id ? '…' : '↻'}
                      </button>
                      <button
                        className="qhv-icon-btn"
                        title={expandedId === e.id ? 'Collapse' : 'Expand'}
                        onClick={() => setExpandedId(id => id === e.id ? null : e.id)}
                      >
                        {expandedId === e.id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === e.id && (
                    <tr className="qhv-detail-row">
                      <td colSpan={7} className="qhv-detail-td">
                        <QueryDetailRow
                          queryId={e.id}
                          onRerunResult={result => setRerunResults(prev => ({ ...prev, [e.id]: result }))}
                        />
                      </td>
                    </tr>
                  )}
                  {rerunResults[e.id] && (
                    <tr className="qhv-rerun-row">
                      <td colSpan={7} className="qhv-rerun-td">
                        <div className="qhv-rerun-result">
                          <p className="qhv-rerun-label">Re-run result (of query from {formatDateTime(e.executed_at)}):</p>
                          {rerunResults[e.id].response ? (
                            <p className="qhv-rerun-text">{rerunResults[e.id].response}</p>
                          ) : rerunResults[e.id].results ? (
                            <ul className="qhv-rerun-list">
                              {rerunResults[e.id].results.map(r => (
                                <li key={r.id}>{r.title}</li>
                              ))}
                            </ul>
                          ) : (
                            <pre className="qhv-rerun-raw">{JSON.stringify(rerunResults[e.id], null, 2)}</pre>
                          )}
                          <button className="qhv-dismiss-btn" onClick={() => setRerunResults(prev => { const n = {...prev}; delete n[e.id]; return n })}>Dismiss</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="qhv-pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary">← Prev</button>
              <span className="qhv-page-info">Page {page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
