import React, { useState, useEffect } from 'react'
import { getDocumentDependencies } from '../../api/client'
import './DeleteConfirmModal.css'

export default function DeleteConfirmModal({ documentId, onConfirm, onCancel, isDeleting }) {
  const [deps, setDeps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDocumentDependencies(documentId)
      .then(data => { setDeps(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [documentId])

  return (
    <div className="dcm-overlay" onClick={e => { if (e.target === e.currentTarget && !isDeleting) onCancel() }}>
      <div className="dcm-dialog">
        {loading ? (
          <p className="dcm-loading">Loading dependency summary…</p>
        ) : error ? (
          <>
            <p className="dcm-error">Failed to load dependency summary: {error}</p>
            <div className="dcm-actions">
              <button className="dcm-btn-secondary" onClick={onCancel}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="dcm-title">Delete "{deps.title}"?</h2>
            <div className="dcm-summary">
              <p className="dcm-summary-label">This will permanently remove:</p>
              <ul className="dcm-list">
                <li>1 document from Postgres</li>
                <li>{deps.qdrant.point_count} chunk{deps.qdrant.point_count !== 1 ? 's' : ''} from Qdrant</li>
                {deps.postgres.tag_count > 0 && (
                  <li>{deps.postgres.tag_count} tag association{deps.postgres.tag_count !== 1 ? 's' : ''}</li>
                )}
                {deps.postgres.folder_name && (
                  <li>Folder assignment ({deps.postgres.folder_name})</li>
                )}
              </ul>
              <p className="dcm-preserved">
                Access history ({deps.duckdb.access_log_count} entries) will be preserved for audit.
              </p>
            </div>
            <div className="dcm-actions">
              <button
                className="dcm-btn-secondary"
                onClick={onCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="dcm-btn-danger"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
