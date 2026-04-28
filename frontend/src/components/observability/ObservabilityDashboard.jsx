import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getObsPostgres, getObsQdrant, getObsDuckDB,
  deleteDocument, updateTag, deleteTag, updateFolder, deleteFolder
} from '../../api/client'
import { useToast } from '../shared/Toast'
import DeleteConfirmModal from '../shared/DeleteConfirmModal'
import Spinner from '../shared/Spinner'
import './ObservabilityDashboard.css'

const PALETTE = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316',
  '#eab308','#22c55e','#10b981','#06b6d4','#3b82f6',
  '#64748b','#94a3b8',
]

function formatDT(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function truncateHash(h) {
  if (!h) return ''
  return h.slice(0, 12) + '…'
}

function FolderBadge({ name, color }) {
  if (!name) return null
  return <span className="obs-folder-badge" style={{ background: color || '#6366f1' }}>{name}</span>
}

function TagPill({ tag }) {
  return <span className="obs-tag-pill" style={{ background: tag.color || '#334155' }}>{tag.name}</span>
}

function EventBadge({ type }) {
  const colors = { ingest: '#22c55e', update: '#3b82f6', deletion: '#ef4444', delete: '#ef4444' }
  return <span className="obs-event-badge" style={{ background: colors[type] || '#475569' }}>{type}</span>
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="obs-color-picker">
      {PALETTE.map(c => (
        <button
          key={c}
          className={`obs-color-swatch${value === c ? ' selected' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          type="button"
        />
      ))}
    </div>
  )
}

// ─── Postgres Panel ──────────────────────────────────────────────────────────

function PostgresPanel({ data, onRefresh }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // Tag editing state
  const [tagEdit, setTagEdit] = useState({})      // {id: {name, color, showPicker}}
  const [folderEdit, setFolderEdit] = useState({}) // same

  // Filters
  const [titleSearch, setTitleSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [folderFilter, setFolderFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const debounceRef = useRef(null)
  const [filteredData, setFilteredData] = useState(data)

  // Re-fetch when filters change
  useEffect(() => {
    setFilteredData(data)
  }, [data])

  function handleTitleSearch(val) {
    setTitleSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // signal parent to refetch with filters — use onRefresh with params
      onRefresh({ title_search: val, tag_id: tagFilter, folder_id: folderFilter, sort_by: sortBy, sort_dir: sortDir })
    }, 300)
  }

  function applyFilters(overrides = {}) {
    const p = { title_search: titleSearch, tag_id: tagFilter, folder_id: folderFilter, sort_by: sortBy, sort_dir: sortDir, ...overrides }
    onRefresh(p)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteDocument(deleteTarget.id)
      showToast('Document deleted')
      setDeleteTarget(null)
      onRefresh()
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  // Tag actions
  async function saveTag(id) {
    const e = tagEdit[id]
    if (!e) return
    try {
      await updateTag(id, { name: e.name, color: e.color })
      showToast('Tag updated')
      setTagEdit(prev => { const n = {...prev}; delete n[id]; return n })
      onRefresh()
    } catch (err) { showToast(err.message || 'Update failed', 'error') }
  }

  async function handleDeleteTag(tag) {
    if (!window.confirm(`Delete tag '${tag.name}'? It will be removed from all documents.`)) return
    try {
      await deleteTag(tag.id)
      showToast('Tag deleted')
      onRefresh()
    } catch (err) { showToast(err.message || 'Delete failed', 'error') }
  }

  // Folder actions
  async function saveFolder(id) {
    const e = folderEdit[id]
    if (!e) return
    try {
      await updateFolder(id, { name: e.name, color: e.color })
      showToast('Folder updated')
      setFolderEdit(prev => { const n = {...prev}; delete n[id]; return n })
      onRefresh()
    } catch (err) { showToast(err.message || 'Update failed', 'error') }
  }

  async function handleDeleteFolder(folder) {
    if (!window.confirm(`Delete folder '${folder.name}'? ${folder.document_count} documents will become unfiled.`)) return
    try {
      await deleteFolder(folder.id)
      showToast('Folder deleted')
      onRefresh()
    } catch (err) { showToast(err.message || 'Delete failed', 'error') }
  }

  const docs = data?.documents || []
  const tags = data?.tags || []
  const folders = data?.folders || []
  const totalPages = Math.ceil(docs.length / PAGE_SIZE)
  const pagedDocs = docs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="obs-panel">
      {deleteTarget && (
        <DeleteConfirmModal
          documentId={deleteTarget.id}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={isDeleting}
        />
      )}

      <div className="obs-panel-header">
        <h2 className="obs-panel-title">Postgres — Documents, Tags &amp; Folders</h2>
        <div className="obs-panel-stats">
          {data?.document_count ?? '…'} documents ·{' '}
          {data?.total_tokens?.toLocaleString() ?? '…'} tokens ·{' '}
          {data?.tag_count ?? '…'} tags ·{' '}
          {data?.folder_count ?? '…'} folders
        </div>
      </div>

      <div className="obs-filter-bar">
        <input
          className="obs-input"
          placeholder="Search titles…"
          value={titleSearch}
          onChange={e => handleTitleSearch(e.target.value)}
        />
        <select className="obs-select" value={tagFilter} onChange={e => { setTagFilter(e.target.value); applyFilters({ tag_id: e.target.value }) }}>
          <option value="">All Tags</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="obs-select" value={folderFilter} onChange={e => { setFolderFilter(e.target.value); applyFilters({ folder_id: e.target.value }) }}>
          <option value="">All Folders</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          <option value="unfiled">Unfiled</option>
        </select>
        <select className="obs-select" value={sortBy} onChange={e => { setSortBy(e.target.value); applyFilters({ sort_by: e.target.value }) }}>
          <option value="created_at">Created Date</option>
          <option value="updated_at">Updated Date</option>
          <option value="title">Title</option>
          <option value="token_count">Token Count</option>
        </select>
        <button className="obs-sort-dir-btn" onClick={() => { const nd = sortDir === 'asc' ? 'desc' : 'asc'; setSortDir(nd); applyFilters({ sort_dir: nd }) }}>
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div className="obs-subtitle">Documents ({docs.length})</div>
      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th className="obs-th">Title</th>
              <th className="obs-th">Folder</th>
              <th className="obs-th">Tags</th>
              <th className="obs-th">Tokens</th>
              <th className="obs-th">Created</th>
              <th className="obs-th">Updated</th>
              <th className="obs-th">Hash</th>
              <th className="obs-th">Del</th>
            </tr>
          </thead>
          <tbody>
            {pagedDocs.length === 0 && (
              <tr><td colSpan={8} className="obs-empty-cell">No documents ingested yet.</td></tr>
            )}
            {pagedDocs.map(doc => (
              <tr key={doc.id} className="obs-row">
                <td className="obs-td obs-title-cell">
                  <span className="obs-link" onClick={() => navigate(`/doc/${doc.id}`)}>{doc.title}</span>
                </td>
                <td className="obs-td">
                  <FolderBadge name={doc.folder_name} color={doc.folder_color} />
                </td>
                <td className="obs-td">
                  <div className="obs-tag-row">
                    {(Array.isArray(doc.tags) ? doc.tags : []).map(t => <TagPill key={t.id} tag={t} />)}
                  </div>
                </td>
                <td className="obs-td obs-num">{doc.token_count || 0}</td>
                <td className="obs-td obs-date">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</td>
                <td className="obs-td obs-date">{doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : '—'}</td>
                <td className="obs-td obs-hash" title={doc.content_hash}>{truncateHash(doc.content_hash)}</td>
                <td className="obs-td">
                  <button className="obs-del-btn" onClick={() => setDeleteTarget(doc)} title="Delete">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="obs-pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="obs-page-btn">← Prev</button>
          <span className="obs-page-info">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="obs-page-btn">Next →</button>
        </div>
      )}

      {/* Tags section */}
      <div className="obs-subtitle">Tags ({tags.length})</div>
      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th className="obs-th">Name</th>
              <th className="obs-th">Docs</th>
              <th className="obs-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tags.map(tag => {
              const editing = tagEdit[tag.id]
              return (
                <tr key={tag.id} className="obs-row">
                  <td className="obs-td">
                    {editing ? (
                      <div className="obs-inline-edit">
                        <input
                          className="obs-inline-input"
                          value={editing.name}
                          onChange={e => setTagEdit(prev => ({...prev, [tag.id]: {...prev[tag.id], name: e.target.value}}))}
                        />
                        {editing.showPicker && (
                          <div className="obs-picker-popover">
                            <ColorPicker value={editing.color} onChange={c => setTagEdit(prev => ({...prev, [tag.id]: {...prev[tag.id], color: c, showPicker: false}}))} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="obs-tag-pill" style={{ background: tag.color }}>{tag.name}</span>
                    )}
                  </td>
                  <td className="obs-td obs-num">{tag.document_count}</td>
                  <td className="obs-td obs-actions-cell">
                    {editing ? (
                      <>
                        <button className="obs-icon-btn" onClick={() => setTagEdit(prev => ({...prev, [tag.id]: {...prev[tag.id], showPicker: !prev[tag.id]?.showPicker}}))}>🎨</button>
                        <button className="obs-icon-btn" onClick={() => saveTag(tag.id)}>✓</button>
                        <button className="obs-icon-btn" onClick={() => setTagEdit(prev => { const n={...prev}; delete n[tag.id]; return n })}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="obs-icon-btn" onClick={() => setTagEdit(prev => ({...prev, [tag.id]: {name: tag.name, color: tag.color, showPicker: false}}))}>✏️</button>
                        <button className="obs-del-btn" onClick={() => handleDeleteTag(tag)}>🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Folders section */}
      <div className="obs-subtitle">Folders ({folders.length})</div>
      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th className="obs-th">Name</th>
              <th className="obs-th">Docs</th>
              <th className="obs-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {folders.map(folder => {
              const editing = folderEdit[folder.id]
              return (
                <tr key={folder.id} className="obs-row">
                  <td className="obs-td">
                    {editing ? (
                      <div className="obs-inline-edit">
                        <input
                          className="obs-inline-input"
                          value={editing.name}
                          onChange={e => setFolderEdit(prev => ({...prev, [folder.id]: {...prev[folder.id], name: e.target.value}}))}
                        />
                        {editing.showPicker && (
                          <div className="obs-picker-popover">
                            <ColorPicker value={editing.color} onChange={c => setFolderEdit(prev => ({...prev, [folder.id]: {...prev[folder.id], color: c, showPicker: false}}))} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="obs-folder-badge" style={{ background: folder.color || '#6366f1' }}>{folder.name}</span>
                    )}
                  </td>
                  <td className="obs-td obs-num">{folder.document_count}</td>
                  <td className="obs-td obs-actions-cell">
                    {editing ? (
                      <>
                        <button className="obs-icon-btn" onClick={() => setFolderEdit(prev => ({...prev, [folder.id]: {...prev[folder.id], showPicker: !prev[folder.id]?.showPicker}}))}>🎨</button>
                        <button className="obs-icon-btn" onClick={() => saveFolder(folder.id)}>✓</button>
                        <button className="obs-icon-btn" onClick={() => setFolderEdit(prev => { const n={...prev}; delete n[folder.id]; return n })}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="obs-icon-btn" onClick={() => setFolderEdit(prev => ({...prev, [folder.id]: {name: folder.name, color: folder.color, showPicker: false}}))}>✏️</button>
                        <button className="obs-del-btn" onClick={() => handleDeleteFolder(folder)}>🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Qdrant Panel ────────────────────────────────────────────────────────────

function QdrantPanel({ data }) {
  const navigate = useNavigate()
  if (!data) return null

  const statusColors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }

  return (
    <div className="obs-panel">
      <div className="obs-panel-header">
        <h2 className="obs-panel-title">Qdrant — Vector Index</h2>
        <span
          className="obs-status-badge"
          style={{ background: statusColors[data.status] || '#475569' }}
        >
          {data.status}
        </span>
      </div>
      <div className="obs-panel-stats">
        {data.total_points} total points · {data.indexed_vectors} indexed vectors · Collection: {data.collection_name}
      </div>

      <div className="obs-subtitle">Points per Document ({data.points_per_document?.length || 0})</div>
      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              <th className="obs-th">Document</th>
              <th className="obs-th">Doc ID</th>
              <th className="obs-th">Chunks</th>
            </tr>
          </thead>
          <tbody>
            {(data.points_per_document || []).length === 0 && (
              <tr><td colSpan={3} className="obs-empty-cell">No vectors indexed yet.</td></tr>
            )}
            {(data.points_per_document || []).map(entry => (
              <tr key={entry.document_id} className="obs-row">
                <td className="obs-td">
                  {entry.document_title ? (
                    <span className="obs-link" onClick={() => navigate(`/doc/${entry.document_id}`)}>
                      {entry.document_title}
                    </span>
                  ) : (
                    <span className="obs-deleted">Deleted document</span>
                  )}
                </td>
                <td className="obs-td obs-monospace">{entry.document_id?.slice(0, 12)}…</td>
                <td className="obs-td obs-num">{entry.point_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── DuckDB Panel ─────────────────────────────────────────────────────────────

function DuckDBPanel({ onFetch }) {
  const { showToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [docIdFilter, setDocIdFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fetchData = useCallback(async (overrides = {}) => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = {
        event_type: eventTypeFilter,
        document_id: docIdFilter,
        from: fromDate,
        to: toDate,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...overrides,
      }
      const result = await getObsDuckDB(params)
      setData(result)
    } catch (err) {
      setFetchError(err.message || 'Failed to load audit events')
    } finally {
      setLoading(false)
    }
  }, [eventTypeFilter, docIdFilter, fromDate, toDate, page])

  useEffect(() => { fetchData() }, [fetchData])

  function applyFilter(overrides = {}) {
    setPage(0)
    fetchData({ ...overrides, offset: 0 })
  }

  async function handleCSVExport() {
    try {
      // Re-fetch with limit=1000
      const params = { event_type: eventTypeFilter, document_id: docIdFilter, from: fromDate, to: toDate, limit: 1000, offset: 0 }
      const result = await getObsDuckDB(params)
      const events = result.events || []
      const headers = ['id', 'document_id', 'event_type', 'title', 'folder', 'tags', 'token_count', 'content_hash', 'event_at']
      const rows = events.map(e => headers.map(h => JSON.stringify(e[h] ?? '')).join(','))
      const csv = [headers.join(','), ...rows].join('\n')
      await navigator.clipboard.writeText(csv)
      showToast('Copied to clipboard')
    } catch (err) {
      showToast('Export failed', 'error')
    }
  }

  const events = data?.events || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="obs-panel">
      <div className="obs-panel-header">
        <h2 className="obs-panel-title">DuckDB — Audit Trail</h2>
        <button className="obs-export-btn" onClick={handleCSVExport}>Copy as CSV</button>
      </div>

      <div className="obs-filter-bar">
        <select className="obs-select" value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); applyFilter({ event_type: e.target.value }) }}>
          <option value="">All Events</option>
          <option value="ingest">Ingest</option>
          <option value="update">Update</option>
          <option value="deletion">Deletion</option>
        </select>
        <input
          className="obs-input obs-input-sm"
          placeholder="Filter by document ID…"
          value={docIdFilter}
          onChange={e => setDocIdFilter(e.target.value)}
          onBlur={() => applyFilter({ document_id: docIdFilter })}
        />
        <input
          className="obs-input obs-input-date"
          type="date"
          value={fromDate}
          onChange={e => { setFromDate(e.target.value); applyFilter({ from: e.target.value }) }}
          title="From"
        />
        <input
          className="obs-input obs-input-date"
          type="date"
          value={toDate}
          onChange={e => { setToDate(e.target.value); applyFilter({ to: e.target.value }) }}
          title="To"
        />
        {(eventTypeFilter || docIdFilter || fromDate || toDate) && (
          <button className="obs-clear-btn" onClick={() => {
            setEventTypeFilter(''); setDocIdFilter(''); setFromDate(''); setToDate('')
            fetchData({ event_type: '', document_id: '', from: '', to: '', offset: 0 })
          }}>Clear</button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><Spinner /></div>
      ) : fetchError ? (
        <div className="obs-error-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <span>{fetchError}</span>
          <button className="obs-refresh-btn" onClick={() => fetchData()}>Retry</button>
        </div>
      ) : (
        <>
          <div className="obs-table-wrap">
            <table className="obs-table">
              <thead>
                <tr>
                  <th className="obs-th">Event</th>
                  <th className="obs-th">Title</th>
                  <th className="obs-th">Folder</th>
                  <th className="obs-th">Tags</th>
                  <th className="obs-th">Tokens</th>
                  <th className="obs-th">Hash</th>
                  <th className="obs-th">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className="obs-row">
                    <td className="obs-td"><EventBadge type={e.event_type} /></td>
                    <td className="obs-td obs-title-cell">{e.title || <span className="obs-deleted">—</span>}</td>
                    <td className="obs-td obs-muted">{e.folder || '—'}</td>
                    <td className="obs-td obs-muted">{e.tags || '—'}</td>
                    <td className="obs-td obs-num">{e.token_count ?? '—'}</td>
                    <td className="obs-td obs-monospace" title={e.content_hash}>{truncateHash(e.content_hash)}</td>
                    <td className="obs-td obs-date">{formatDT(e.event_at)}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={7} className="obs-empty-cell">No audit events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="obs-pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="obs-page-btn">← Prev</button>
              <span className="obs-page-info">Page {page + 1} of {totalPages} ({total} events)</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="obs-page-btn">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function ObservabilityDashboard() {
  const [pgData, setPgData] = useState(null)
  const [qdrantData, setQdrantData] = useState(null)
  const [pgLoading, setPgLoading] = useState(true)
  const [qdrantLoading, setQdrantLoading] = useState(true)
  const [pgError, setPgError] = useState(null)
  const [qdrantError, setQdrantError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [pgParams, setPgParams] = useState({})

  const fetchPostgres = useCallback(async (params = pgParams) => {
    setPgLoading(true)
    setPgError(null)
    try {
      const data = await getObsPostgres(params)
      setPgData(data)
    } catch (err) {
      setPgError(err.message)
    } finally {
      setPgLoading(false)
    }
  }, [pgParams])

  const fetchQdrant = useCallback(async () => {
    setQdrantLoading(true)
    setQdrantError(null)
    try {
      const data = await getObsQdrant()
      setQdrantData(data)
    } catch (err) {
      setQdrantError(err.message)
    } finally {
      setQdrantLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPostgres()
    fetchQdrant()
    setLastRefreshed(new Date())
  }, [])

  function handleRefreshAll() {
    fetchPostgres(pgParams)
    fetchQdrant()
    setLastRefreshed(new Date())
  }

  function handlePgRefresh(params) {
    if (params) setPgParams(params)
    fetchPostgres(params || pgParams)
  }

  return (
    <div className="obs-dashboard">
      <div className="obs-topbar">
        <h1 className="obs-page-title">Observability</h1>
        <div className="obs-topbar-right">
          {lastRefreshed && (
            <span className="obs-last-refreshed">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button className="obs-refresh-btn" onClick={handleRefreshAll}>↻ Refresh</button>
        </div>
      </div>

      {/* Panel 1: Postgres */}
      {pgLoading && !pgData ? (
        <div className="obs-panel obs-loading-panel"><Spinner /></div>
      ) : pgError ? (
        <div className="obs-panel obs-error-panel">Postgres error: {pgError}</div>
      ) : (
        <PostgresPanel data={pgData} onRefresh={handlePgRefresh} />
      )}

      {/* Panel 2: Qdrant */}
      {qdrantLoading && !qdrantData ? (
        <div className="obs-panel obs-loading-panel"><Spinner /></div>
      ) : qdrantError ? (
        <div className="obs-panel obs-error-panel">Qdrant error: {qdrantError}</div>
      ) : (
        <QdrantPanel data={qdrantData} />
      )}

      {/* Panel 3: DuckDB */}
      <DuckDBPanel />
    </div>
  )
}
