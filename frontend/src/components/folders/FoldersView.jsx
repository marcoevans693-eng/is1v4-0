import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Folder, GripVertical, Pencil, Trash2, FilePlus,
  FileText, X, Plus,
} from 'lucide-react'
import {
  getFolders, createFolder, updateFolder, deleteFolder,
  reorderFolders, getFolderDocuments, getDocuments,
} from '../../api/client'
import { useToast } from '../shared/Toast'
import Spinner from '../shared/Spinner'
import './FoldersView.css'

/* ── Sort ──────────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { key: 'manual', label: 'Manual' },
  { key: 'last_accessed', label: 'Last Accessed' },
  { key: 'doc_count', label: 'Doc Count' },
]

function sortFolders(folders, sortKey) {
  if (sortKey === 'manual') return [...folders]
  const sorted = [...folders]
  if (sortKey === 'last_accessed') {
    sorted.sort((a, b) => {
      const da = a.last_accessed_at || a.created_at || ''
      const db = b.last_accessed_at || b.created_at || ''
      return db.localeCompare(da)
    })
  } else if (sortKey === 'doc_count') {
    sorted.sort((a, b) => (b.document_count || 0) - (a.document_count || 0))
  }
  return sorted
}

/* ── Sortable Card ─────────────────────────────────────────── */
function SortableFolderCard({ folder, onRename, onDelete, onNewDoc, onOpen, isDragEnabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className={`fv-card${isDragging ? ' fv-card--dragging' : ''}`}>
      <CardInner
        folder={folder} onRename={onRename} onDelete={onDelete}
        onNewDoc={onNewDoc} onOpen={onOpen}
        isDragEnabled={isDragEnabled}
        dragAttributes={attributes} dragListeners={listeners}
      />
    </div>
  )
}

/* ── Card inner ────────────────────────────────────────────── */
function CardInner({ folder, onRename, onDelete, onNewDoc, onOpen, isDragEnabled, dragAttributes, dragListeners }) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { showToast } = useToast()

  const docCount = folder.document_count || 0
  const dateLabel = (folder.last_accessed_at || folder.created_at)
    ? new Date(folder.last_accessed_at || folder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  async function handleSave() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === folder.name) { setEditing(false); return }
    setSaving(true)
    try {
      await updateFolder(folder.id, { name: trimmed })
      showToast('Folder renamed')
      setEditing(false)
      onRename()
    } catch (err) { showToast(err.message || 'Rename failed', 'error') }
    setSaving(false)
  }

  async function handleDelete() {
    try {
      await deleteFolder(folder.id)
      showToast('Folder deleted')
      onDelete()
    } catch (err) { showToast(err.message || 'Delete failed', 'error') }
    setShowDeleteConfirm(false)
  }

  return (
    <>
      {showDeleteConfirm && (
        <div className="fv-confirm-overlay">
          <div className="fv-confirm-dialog">
            <p>Delete "<strong>{folder.name}</strong>"? {docCount} document{docCount !== 1 ? 's' : ''} will be unassigned but not deleted.</p>
            <div className="fv-confirm-actions">
              <button className="fv-btn fv-btn--danger" onClick={handleDelete}>Delete</button>
              <button className="fv-btn fv-btn--secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="fv-card__header">
        {isDragEnabled && dragAttributes && dragListeners && (
          <span className="fv-card__drag" {...dragAttributes} {...dragListeners} title="Drag to reorder">
            <GripVertical size={14} />
          </span>
        )}
        <span className="fv-card__icon" onClick={() => onOpen(folder)}><Folder size={18} /></span>
      </div>

      <div className="fv-card__body" onClick={() => onOpen(folder)}>
        {editing ? (
          <input
            className="fv-card__name-input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={handleSave}
            onClick={e => e.stopPropagation()}
            autoFocus
            disabled={saving}
          />
        ) : (
          <span className="fv-card__name">{folder.name}</span>
        )}
        <div className="fv-card__meta">
          <span className="fv-card__count">{docCount} doc{docCount !== 1 ? 's' : ''}</span>
          {dateLabel && <span className="fv-card__date">{dateLabel}</span>}
        </div>
      </div>

      <div className="fv-card__actions">
        <button className="fv-card__action-btn fv-card__action-btn--new" title="New document" onClick={e => { e.stopPropagation(); onNewDoc(folder.id) }}>
          <FilePlus size={14} /><span>New Doc</span>
        </button>
        <button className="fv-card__action-btn" title="Rename" onClick={e => { e.stopPropagation(); setEditName(folder.name); setEditing(true) }}>
          <Pencil size={13} />
        </button>
        <button className="fv-card__action-btn fv-card__action-btn--delete" title="Delete" onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true) }}>
          <Trash2 size={13} />
        </button>
      </div>
    </>
  )
}

/* ── Slide Panel ───────────────────────────────────────────── */
function FolderPanel({ folder, onClose, onNewDoc, onNavigateDoc }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!folder) return
    setLoading(true)
    setDocs([])
    const fetch = folder.id === 'unfiled'
      ? getDocuments({ folder_id: 'unfiled', limit: 100 })
      : getFolderDocuments(folder.id)
    fetch
      .then(data => {
        const list = Array.isArray(data) ? data : (data.documents || data.items || [])
        setDocs(list)
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [folder])

  if (!folder) return null

  return (
    <>
      <div className="fv-panel-backdrop" onClick={onClose} />
      <div className="fv-panel">
        <div className="fv-panel__header">
          <div className="fv-panel__title-row">
            <Folder size={18} className="fv-panel__folder-icon" />
            <h2 className="fv-panel__title">{folder.name}</h2>
          </div>
          <div className="fv-panel__header-actions">
            <button className="fv-panel__new-doc" onClick={() => onNewDoc(folder.id)} title="New document in this folder">
              <FilePlus size={14} /><span>New Doc</span>
            </button>
            <button className="fv-panel__close" onClick={onClose} title="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="fv-panel__body">
          {loading ? (
            <div className="fv-panel__loading"><Spinner /></div>
          ) : docs.length === 0 ? (
            <div className="fv-panel__empty">
              <FileText size={32} className="fv-panel__empty-icon" />
              <p>No documents in this folder yet.</p>
              <button className="fv-btn fv-btn--primary" onClick={() => onNewDoc(folder.id)}>
                <FilePlus size={14} /><span>Add First Document</span>
              </button>
            </div>
          ) : (
            <div className="fv-panel__list">
              {docs.map(d => (
                <div key={d.id} className="fv-panel__doc" onClick={() => onNavigateDoc(d.id)}>
                  <FileText size={15} className="fv-panel__doc-icon" />
                  <div className="fv-panel__doc-info">
                    <span className="fv-panel__doc-title">{d.title}</span>
                    {d.created_at && (
                      <span className="fv-panel__doc-date">
                        {new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Main ──────────────────────────────────────────────────── */
export default function FoldersView() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('manual')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [panelFolder, setPanelFolder] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchFolders = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await getFolders()
      setFolders(Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message || 'Failed to load folders'); setFolders([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      await createFolder({ name: trimmed })
      showToast('Folder created')
      setNewName(''); setShowCreateForm(false); fetchFolders()
    } catch (err) { showToast(err.message || 'Create failed', 'error') }
    setCreating(false)
  }

  function handleNewDoc(folderId) {
    navigate(folderId ? `/ingest?folder_id=${folderId}` : '/ingest')
  }

  function handleNavigateDoc(docId) { navigate(`/doc/${docId}`) }

  function handleOpenFolder(folder) { setPanelFolder(folder) }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = folders.findIndex(f => f.id === active.id)
    const newIdx = folders.findIndex(f => f.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(folders, oldIdx, newIdx)
    setFolders(reordered)
    try {
      await reorderFolders(reordered.map((f, i) => ({ id: f.id, sort_order: i })))
    } catch (err) {
      console.error('Reorder failed:', err)
      showToast('Reorder failed', 'error')
      fetchFolders()
    }
  }

  const displayFolders = sortFolders(folders, sortKey)
  const isDragEnabled = sortKey === 'manual'

  return (
    <div className="fv-container">
      <div className="fv-header">
        <h1 className="fv-title">Folders</h1>
        <div className="fv-header__controls">
          <div className="fv-sort">
            <span className="fv-sort__label">Sort:</span>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.key} className={`fv-sort__btn${sortKey === opt.key ? ' fv-sort__btn--active' : ''}`} onClick={() => setSortKey(opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>
          <button className="fv-btn fv-btn--primary" onClick={() => setShowCreateForm(s => !s)}>
            <Plus size={15} /><span>New Folder</span>
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="fv-create">
          <input
            className="fv-create__input" value={newName}
            onChange={e => setNewName(e.target.value)} placeholder="Folder name…"
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreateForm(false); setNewName('') } }}
            autoFocus
          />
          <button className="fv-btn fv-btn--primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button className="fv-btn fv-btn--secondary" onClick={() => { setShowCreateForm(false); setNewName('') }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="fv-loading"><Spinner /></div>
      ) : error ? (
        <div className="fv-error"><span>{error}</span><button className="fv-btn fv-btn--secondary" onClick={fetchFolders}>Retry</button></div>
      ) : (
        <div className="fv-grid">
          {folders.length === 0 && <p className="fv-empty">No folders yet. Create one to start organizing.</p>}

          {isDragEnabled ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayFolders.map(f => f.id)} strategy={rectSortingStrategy}>
                {displayFolders.map(f => (
                  <SortableFolderCard key={f.id} folder={f} onRename={fetchFolders} onDelete={fetchFolders} onNewDoc={handleNewDoc} onOpen={handleOpenFolder} isDragEnabled />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            displayFolders.map(f => (
              <div key={f.id} className="fv-card">
                <CardInner folder={f} onRename={fetchFolders} onDelete={fetchFolders} onNewDoc={handleNewDoc} onOpen={handleOpenFolder} isDragEnabled={false} />
              </div>
            ))
          )}

          {/* Unfiled */}
          <div className="fv-card fv-card--unfiled" onClick={() => handleOpenFolder({ id: 'unfiled', name: 'Unfiled' })}>
            <div className="fv-card__header"><span className="fv-card__icon"><Folder size={18} /></span></div>
            <div className="fv-card__body">
              <span className="fv-card__name">Unfiled</span>
              <div className="fv-card__meta"><span className="fv-card__count fv-card__count--muted">No folder assigned</span></div>
            </div>
            <div className="fv-card__actions">
              <button className="fv-card__action-btn fv-card__action-btn--new" onClick={e => { e.stopPropagation(); handleNewDoc(null) }}>
                <FilePlus size={14} /><span>New Doc</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out panel */}
      <FolderPanel
        folder={panelFolder}
        onClose={() => setPanelFolder(null)}
        onNewDoc={handleNewDoc}
        onNavigateDoc={handleNavigateDoc}
      />
    </div>
  )
}
