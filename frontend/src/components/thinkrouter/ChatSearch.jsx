import { useState } from 'react'
import './ChatSearch.css'

export default function ChatSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [modelFilter, setModelFilter] = useState('')
  const [models, setModels] = useState([])
  const [modelsLoaded, setModelsLoaded] = useState(false)

  // Fetch model list once for filter dropdown
  useState(() => {
    fetch('/api/thinkrouter/models')
      .then(r => r.json())
      .then(data => { setModels(data || []); setModelsLoaded(true) })
      .catch(() => setModelsLoaded(true))
  }, [])

  async function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const body = { query: q, limit: 20 }
      if (modelFilter) body.model_sku = modelFilter
      const res = await fetch('/api/thinkrouter/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Search failed')
      setResults(data.results || [])
    } catch (err) {
      setError(err.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="chat-search">
      <div className="chat-search-header">
        <h2 className="chat-search-title">Search Conversations</h2>
      </div>

      <form className="chat-search-form" onSubmit={handleSearch}>
        <input
          className="chat-search-input"
          type="text"
          placeholder="Search your conversations…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <select
          className="chat-search-model-filter"
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
        >
          <option value="">All models</option>
          {models.map(m => (
            <option key={m.sku} value={m.sku}>{m.label}</option>
          ))}
        </select>
        <button className="chat-search-btn" type="submit" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="chat-search-error">{error}</div>}

      {!loading && !error && results.length === 0 && query.trim() && (
        <div className="chat-search-empty">No results found for "{query}".</div>
      )}

      <div className="chat-search-results">
        {results.map(r => (
          <div
            key={r.conversation_id}
            className="chat-search-result"
            onClick={() => onSelect(r.conversation_id, r.matched_turn_id)}
          >
            <div className="chat-search-result-header">
              <span className="chat-search-result-title">{r.title}</span>
              <span className="chat-search-result-meta">
                <span className="chat-search-result-model">{r.model_sku}</span>
                <span className="chat-search-result-date">{formatDate(r.updated_at)}</span>
                <span className="chat-search-result-score">{(r.relevance * 100).toFixed(0)}% match</span>
              </span>
            </div>
            {r.matched_turn_excerpt && (
              <div className="chat-search-result-excerpt">{r.matched_turn_excerpt}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
