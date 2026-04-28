import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getKnowledgeHistoryRecent, getDocuments } from '../../api/client'
import Spinner from '../shared/Spinner'
import './KnowledgeHistoryView.css'

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const PAGE_SIZE = 20

export default function KnowledgeHistoryView({ folderFilter, tagFilter }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [docMeta, setDocMeta] = useState({})

  // Fetch doc metadata for folder/tag filtering
  const fetchDocMeta = useCallback(async () => {
    try {
      const data = await getDocuments({ limit: 200 })
      const rows = Array.isArray(data) ? data : (data.items || [])
      const map = {}
      rows.forEach(d => { map[d.id] = d })
      setDocMeta(map)
    } catch { /* best-effort */ }
  }, [])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getKnowledgeHistoryRecent({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      let ents = data.entries || []

      // Client-side folder/tag filter
      if ((folderFilter || tagFilter) && Object.keys(docMeta).length > 0) {
        ents = ents.filter(e => {
          const d = docMeta[e.document_id]
          if (!d) return true // unknown doc — keep
          if (folderFilter === 'unfiled' && d.folder_id) return false
          if (folderFilter && folderFilter !== 'unfiled' && d.folder_id !== folderFilter) return false
          if (tagFilter && !(Array.isArray(d.tags) && d.tags.some(t => t.id === tagFilter))) return false
          return true
        })
      }

      setEntries(ents)
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message || 'Failed to load history')
      setEntries([])
    }
    setLoading(false)
  }, [page, folderFilter, tagFilter, docMeta])

  useEffect(() => { fetchDocMeta() }, [fetchDocMeta])
  useEffect(() => { setPage(0) }, [folderFilter, tagFilter])
  useEffect(() => { fetchHistory() }, [fetchHistory])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="hv-container">
      {loading ? (
        <div className="hv-loading"><Spinner /></div>
      ) : error ? (
        <div className="hv-error">
          <span>{error}</span>
          <button className="btn-secondary" onClick={fetchHistory}>Retry</button>
        </div>
      ) : entries.length === 0 ? (
        <p className="hv-empty">No retrieval history yet. Start a chat or search to see access history.</p>
      ) : (
        <>
          <table className="hv-table">
            <thead>
              <tr>
                <th className="hv-th">Document</th>
                <th className="hv-th">Accessed</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.document_id} className="hv-row">
                  <td className="hv-td">
                    {e.document_title ? (
                      <span className="hv-doc-link" onClick={() => navigate(`/doc/${e.document_id}`)}>
                        {e.document_title}
                      </span>
                    ) : (
                      <span className="hv-deleted">Deleted document</span>
                    )}
                  </td>
                  <td className="hv-td hv-date">{formatDateTime(e.last_accessed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="hv-pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary">← Prev</button>
              <span className="hv-page-info">Page {page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
