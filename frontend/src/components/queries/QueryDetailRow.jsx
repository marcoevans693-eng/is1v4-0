import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getQueryDetail, rerunQuery } from '../../api/client'
import { useToast } from '../shared/Toast'

export default function QueryDetailRow({ queryId, onRerunResult }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rerunning, setRerunning] = useState(false)

  useEffect(() => {
    getQueryDetail(queryId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [queryId])

  async function handleRerun() {
    setRerunning(true)
    try {
      const result = await rerunQuery(queryId)
      onRerunResult && onRerunResult(result)
      showToast('Re-run complete')
    } catch (err) {
      showToast(err.message || 'Re-run failed', 'error')
    }
    setRerunning(false)
  }

  if (loading) return <div className="qdr-loading">Loading detail…</div>
  if (!detail) return <div className="qdr-error">Failed to load detail.</div>

  return (
    <div className="qdr-container">
      <p className="qdr-full-query">{detail.query_text}</p>
      {detail.documents_hit && detail.documents_hit.length > 0 && (
        <div className="qdr-docs">
          <p className="qdr-docs-label">Documents hit:</p>
          <ul className="qdr-docs-list">
            {detail.documents_hit.map(d => (
              <li key={d.id}>
                {d.title ? (
                  <span className="qdr-doc-link" onClick={() => navigate(`/doc/${d.id}`)}>
                    {d.title}
                  </span>
                ) : (
                  <span className="qdr-deleted">Deleted document</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="qdr-rerun-btn" onClick={handleRerun} disabled={rerunning}>
        {rerunning ? 'Running…' : '↻ Re-run'}
      </button>
    </div>
  )
}
