import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocuments, deleteDocument } from '../../api/client'
import { Rocket } from 'lucide-react'
import { useToast } from '../shared/Toast'
import DeleteConfirmModal from '../shared/DeleteConfirmModal'
import Spinner from '../shared/Spinner'
import './KnowledgeAllDocsView.css'

function FolderBadge({ name, color }) {
  if (!name) return null
  return <span className="adv-folder-badge" style={{ background: color || '#6366f1' }}>{name}</span>
}

function CampaignBadge({ name, color }) {
  if (!name) return null
  return (
    <span className="adv-campaign-badge" style={{ background: color || '#5B8FA8' }}>
      <Rocket size={10} /> {name}
    </span>
  )
}

function TagPill({ tag }) {
  return <span className="adv-tag-pill" style={{ background: tag.color || '#334155' }}>{tag.name}</span>
}

function formatDate(iso) {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleDateString()
}

const PAGE_SIZE = 50

export default function KnowledgeAllDocsView({ folderFilter, tagFilter, campaignFilter }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState(null)

  const fetchDocs = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (folderFilter) params.folder_id = folderFilter
    if (tagFilter) params.tag_id = tagFilter
    if (campaignFilter) params.campaign_id = campaignFilter
    getDocuments(params)
      .then(data => {
        const rows = Array.isArray(data) ? data : (data.items || [])
        setDocs(rows)
        setTotal(Array.isArray(data) ? rows.length + page * PAGE_SIZE : (data.total || rows.length))
        setLoading(false)
      })
      .catch(err => { setError(err.message || 'Failed to load documents'); setLoading(false) })
  }, [folderFilter, tagFilter, campaignFilter, page])

  useEffect(() => { setPage(0) }, [folderFilter, tagFilter, campaignFilter])
  useEffect(() => { fetchDocs() }, [fetchDocs])

  function copyLink(doc) {
    const link = `[${doc.title}](/doc/${doc.id})`
    navigator.clipboard.writeText(link).then(() => showToast('Link copied'))
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteDocument(deleteTarget.id)
      showToast('Document deleted')
      setDeleteTarget(null)
      fetchDocs()
    } catch {
      showToast('Delete failed', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  function sortedDocs() {
    return [...docs].sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      if (sortField === 'created_at') { av = new Date(av); bv = new Date(bv) }
      if (sortField === 'title') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortHeader({ field, label }) {
    const active = sortField === field
    return (
      <th className={`adv-th sortable${active ? ' active' : ''}`} onClick={() => toggleSort(field)}>
        {label} {active ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
      </th>
    )
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="adv-container">
      {deleteTarget && (
        <DeleteConfirmModal
          documentId={deleteTarget.id}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={isDeleting}
        />
      )}

      {loading ? (
        <div className="adv-loading"><Spinner /></div>
      ) : error ? (
        <div className="adv-error">
          <span>{error}</span>
          <button className="btn-secondary" onClick={fetchDocs}>Retry</button>
        </div>
      ) : docs.length === 0 ? (
        <p className="adv-empty">No documents yet. Go to Ingest to add your first document.</p>
      ) : (
        <>
          <table className="adv-table">
            <thead>
              <tr>
                <SortHeader field="title" label="Title" />
                <th className="adv-th">Folder</th>
                <th className="adv-th">Tags</th>
                <SortHeader field="chunk_count" label="Chunks" />
                <SortHeader field="created_at" label="Created" />
                <th className="adv-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedDocs().map(doc => (
                <tr key={doc.id} className="adv-row">
                  <td className="adv-td">
                    <span className="adv-title-link" onClick={() => navigate(`/doc/${doc.id}`)}>
                      {doc.title}
                    </span>
                  </td>
                  <td className="adv-td">
                    <FolderBadge name={doc.folder_name} color={doc.folder_color} />
                    <CampaignBadge name={doc.campaign_name} color={doc.campaign_color} />
                  </td>
                  <td className="adv-td">
                    <div className="adv-tag-row">
                      {(Array.isArray(doc.tags) ? doc.tags : []).map(t => <TagPill key={t.id} tag={t} />)}
                    </div>
                  </td>
                  <td className="adv-td adv-num">{doc.chunk_count || 0}</td>
                  <td className="adv-td adv-date">{formatDate(doc.created_at)}</td>
                  <td className="adv-td adv-actions">
                    <button className="adv-icon-btn" title="Copy link" onClick={() => copyLink(doc)}>{'\uD83D\uDD17'}</button>
                    <button className="adv-icon-btn adv-del-btn" title="Delete" onClick={() => setDeleteTarget(doc)}>{'\uD83D\uDDD1'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="adv-pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary">{'\u2190'} Prev</button>
              <span className="adv-page-info">Page {page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary">Next {'\u2192'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
