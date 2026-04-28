import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getKnowledgeHistoryTop, getDocuments } from '../../api/client'
import Spinner from '../shared/Spinner'
import './KnowledgeMostRetrievedView.css'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

export default function KnowledgeMostRetrievedView({ folderFilter, tagFilter }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [docMeta, setDocMeta] = useState({})

  const fetchDocMeta = useCallback(async () => {
    try {
      const data = await getDocuments({ limit: 200 })
      const rows = Array.isArray(data) ? data : (data.items || [])
      const map = {}
      rows.forEach(d => { map[d.id] = d })
      setDocMeta(map)
    } catch { /* best-effort */ }
  }, [])

  const fetchTop = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getKnowledgeHistoryTop({ limit: 50 })
      let ents = data.entries || []

      if ((folderFilter || tagFilter) && Object.keys(docMeta).length > 0) {
        ents = ents.filter(e => {
          const d = docMeta[e.document_id]
          if (!d) return true
          if (folderFilter === 'unfiled' && d.folder_id) return false
          if (folderFilter && folderFilter !== 'unfiled' && d.folder_id !== folderFilter) return false
          if (tagFilter && !(Array.isArray(d.tags) && d.tags.some(t => t.id === tagFilter))) return false
          return true
        })
      }

      setEntries(ents)
    } catch (err) {
      setError(err.message || 'Failed to load')
      setEntries([])
    }
    setLoading(false)
  }, [folderFilter, tagFilter, docMeta])

  useEffect(() => { fetchDocMeta() }, [fetchDocMeta])
  useEffect(() => { fetchTop() }, [fetchTop])

  return (
    <div className="mrv-container">
      {loading ? (
        <div className="mrv-loading"><Spinner /></div>
      ) : error ? (
        <div className="mrv-error">
          <span>{error}</span>
          <button className="btn-secondary" onClick={fetchTop}>Retry</button>
        </div>
      ) : entries.length === 0 ? (
        <p className="mrv-empty">No retrieval history yet.</p>
      ) : (
        <div className="mrv-list">
          {entries.map((e, i) => {
            const meta = docMeta[e.document_id]
            return (
              <div key={e.document_id} className="mrv-row">
                <span className="mrv-rank">#{i + 1}</span>
                <div className="mrv-info">
                  {e.document_title ? (
                    <span className="mrv-title" onClick={() => navigate(`/doc/${e.document_id}`)}>
                      {e.document_title}
                    </span>
                  ) : (
                    <span className="mrv-deleted">Deleted document</span>
                  )}
                  {meta && (
                    <div className="mrv-meta-row">
                      {meta.folder_name && (
                        <span className="mrv-folder-badge" style={{ background: meta.folder_color || '#6366f1' }}>
                          {meta.folder_name}
                        </span>
                      )}
                      {(Array.isArray(meta.tags) ? meta.tags : []).map(t => (
                        <span key={t.id} className="mrv-tag-pill" style={{ background: t.color || '#334155' }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mrv-stats">
                  <span className="mrv-count">{e.retrieval_count}×</span>
                  <span className="mrv-date">Last: {formatDate(e.last_accessed)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
