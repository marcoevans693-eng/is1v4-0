import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchDocuments } from '../../api/client'
import { Rocket } from 'lucide-react'
import './KnowledgeSearchView.css'

function FolderBadge({ name, color }) {
  if (!name) return null
  return <span className="sv-folder-badge" style={{ background: color || '#6366f1' }}>{name}</span>
}

function CampaignBadge({ name, color }) {
  if (!name) return null
  return (
    <span className="sv-campaign-badge" style={{ background: color || '#5B8FA8' }}>
      <Rocket size={10} /> {name}
    </span>
  )
}

function TagPill({ tag }) {
  return <span className="sv-tag-pill" style={{ background: tag.color || '#334155' }}>{tag.name}</span>
}

const MODES = ['keyword', 'wildcard', 'semantic']

export default function KnowledgeSearchView({ folderFilter, tagFilter, campaignFilter }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('keyword')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const params = { q: query.trim(), mode }
      if (folderFilter) params.folder_id = folderFilter
      if (tagFilter) params.tag_id = tagFilter
      if (campaignFilter) params.campaign_id = campaignFilter
      const data = await searchDocuments(params)
      setResults(data)
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') doSearch()
  }

  return (
    <div className="sv-container">
      <div className="sv-mode-bar">
        {MODES.map(m => (
          <button
            key={m}
            className={`sv-mode-btn${mode === m ? ' active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="sv-input-row">
        <input
          className="sv-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${mode} search\u2026`}
        />
        <button className="sv-search-btn" onClick={doSearch} disabled={loading}>
          {loading ? 'Searching\u2026' : 'Search'}
        </button>
      </div>

      {error && <p className="sv-error">{error}</p>}

      {results && (
        <div className="sv-results">
          {results.results.length === 0 ? (
            <p className="sv-empty">No results for "{results.query}".</p>
          ) : (
            <>
              {results.results.map(r => (
                <div key={r.id} className="sv-result-row">
                  <div className="sv-result-header">
                    <span className="sv-result-title" onClick={() => navigate(`/doc/${r.id}`)}>
                      {r.title}
                    </span>
                    <FolderBadge name={r.folder_name} color={r.folder_color} />
                    <CampaignBadge name={r.campaign_name} color={r.campaign_color} />
                    <div className="sv-tag-row">
                      {(Array.isArray(r.tags) ? r.tags : []).map(t => <TagPill key={t.id} tag={t} />)}
                    </div>
                    {mode === 'semantic' && r.score != null && (
                      <span className="sv-score">{Math.round(r.score * 100)}%</span>
                    )}
                  </div>
                  {r.snippet && <p className="sv-snippet">{r.snippet}</p>}
                </div>
              ))}
              <p className="sv-latency">
                {results.result_count} result{results.result_count !== 1 ? 's' : ''} in {results.latency_ms}ms
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
