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
  Rocket, GripVertical, Pencil, Trash2, FilePlus,
  FileText, X, Plus,
} from 'lucide-react'
import {
  getCampaigns, createCampaign, updateCampaign, deleteCampaign,
  reorderCampaigns, getCampaignDocuments,
} from '../../api/client'
import { useToast } from '../shared/Toast'
import Spinner from '../shared/Spinner'
import './CampaignsView.css'

/* ── Sort ──────────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { key: 'manual', label: 'Manual' },
  { key: 'last_accessed', label: 'Last Accessed' },
  { key: 'doc_count', label: 'Doc Count' },
]

function sortCampaigns(campaigns, sortKey) {
  if (sortKey === 'manual') return [...campaigns]
  const sorted = [...campaigns]
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
function SortableCampaignCard({ campaign, onRename, onDelete, onNewDoc, onOpen, isDragEnabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: campaign.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className={`cv-card${isDragging ? ' cv-card--dragging' : ''}`}>
      <CardInner
        campaign={campaign} onRename={onRename} onDelete={onDelete}
        onNewDoc={onNewDoc} onOpen={onOpen}
        isDragEnabled={isDragEnabled}
        dragAttributes={attributes} dragListeners={listeners}
      />
    </div>
  )
}

/* ── Card inner ────────────────────────────────────────────── */
function CardInner({ campaign, onRename, onDelete, onNewDoc, onOpen, isDragEnabled, dragAttributes, dragListeners }) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(campaign.name)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { showToast } = useToast()

  const docCount = campaign.document_count || 0
  const dateLabel = (campaign.last_accessed_at || campaign.created_at)
    ? new Date(campaign.last_accessed_at || campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  async function handleSave() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === campaign.name) { setEditing(false); return }
    setSaving(true)
    try {
      await updateCampaign(campaign.id, { name: trimmed })
      showToast('Campaign renamed')
      setEditing(false)
      onRename()
    } catch (err) { showToast(err.message || 'Rename failed', 'error') }
    setSaving(false)
  }

  async function handleDelete() {
    try {
      await deleteCampaign(campaign.id)
      showToast('Campaign deleted')
      onDelete()
    } catch (err) { showToast(err.message || 'Delete failed', 'error') }
    setShowDeleteConfirm(false)
  }

  return (
    <>
      {showDeleteConfirm && (
        <div className="cv-confirm-overlay">
          <div className="cv-confirm-dialog">
            <p>Delete "<strong>{campaign.name}</strong>"? {docCount} document{docCount !== 1 ? 's' : ''} will be unassigned but not deleted.</p>
            <div className="cv-confirm-actions">
              <button className="cv-btn cv-btn--danger" onClick={handleDelete}>Delete</button>
              <button className="cv-btn cv-btn--secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="cv-card__header">
        {isDragEnabled && dragAttributes && dragListeners && (
          <span className="cv-card__drag" {...dragAttributes} {...dragListeners} title="Drag to reorder">
            <GripVertical size={14} />
          </span>
        )}
        <span className="cv-card__icon" onClick={() => onOpen(campaign)}><Rocket size={18} /></span>
      </div>

      <div className="cv-card__body" onClick={() => onOpen(campaign)}>
        {editing ? (
          <input
            className="cv-card__name-input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={handleSave}
            onClick={e => e.stopPropagation()}
            autoFocus
            disabled={saving}
          />
        ) : (
          <span className="cv-card__name">{campaign.name}</span>
        )}
        <div className="cv-card__meta">
          <span className="cv-card__count">{docCount} doc{docCount !== 1 ? 's' : ''}</span>
          {dateLabel && <span className="cv-card__date">{dateLabel}</span>}
        </div>
      </div>

      <div className="cv-card__actions">
        <button className="cv-card__action-btn cv-card__action-btn--new" title="New document" onClick={e => { e.stopPropagation(); onNewDoc(campaign.id) }}>
          <FilePlus size={14} /><span>New Doc</span>
        </button>
        <button className="cv-card__action-btn" title="Rename" onClick={e => { e.stopPropagation(); setEditName(campaign.name); setEditing(true) }}>
          <Pencil size={13} />
        </button>
        <button className="cv-card__action-btn cv-card__action-btn--delete" title="Delete" onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true) }}>
          <Trash2 size={13} />
        </button>
      </div>
    </>
  )
}

/* ── Slide Panel ───────────────────────────────────────────── */
function CampaignPanel({ campaign, onClose, onNewDoc, onNavigateDoc }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaign) return
    setLoading(true)
    setDocs([])
    getCampaignDocuments(campaign.id)
      .then(data => {
        const list = Array.isArray(data) ? data : (data.documents || data.items || [])
        setDocs(list)
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [campaign])

  if (!campaign) return null

  return (
    <>
      <div className="cv-panel-backdrop" onClick={onClose} />
      <div className="cv-panel">
        <div className="cv-panel__header">
          <div className="cv-panel__title-row">
            <Rocket size={18} className="cv-panel__campaign-icon" />
            <h2 className="cv-panel__title">{campaign.name}</h2>
          </div>
          <div className="cv-panel__header-actions">
            <button className="cv-panel__new-doc" onClick={() => onNewDoc(campaign.id)} title="New document in this campaign">
              <FilePlus size={14} /><span>New Doc</span>
            </button>
            <button className="cv-panel__close" onClick={onClose} title="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="cv-panel__body">
          {loading ? (
            <div className="cv-panel__loading"><Spinner /></div>
          ) : docs.length === 0 ? (
            <div className="cv-panel__empty">
              <FileText size={32} className="cv-panel__empty-icon" />
              <p>No documents in this campaign yet.</p>
              <button className="cv-btn cv-btn--primary" onClick={() => onNewDoc(campaign.id)}>
                <FilePlus size={14} /><span>Add First Document</span>
              </button>
            </div>
          ) : (
            <div className="cv-panel__list">
              {docs.map(d => (
                <div key={d.id} className="cv-panel__doc" onClick={() => onNavigateDoc(d.id)}>
                  <FileText size={15} className="cv-panel__doc-icon" />
                  <div className="cv-panel__doc-info">
                    <span className="cv-panel__doc-title">{d.title}</span>
                    {d.created_at && (
                      <span className="cv-panel__doc-date">
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
export default function CampaignsView() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('manual')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [panelCampaign, setPanelCampaign] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchCampaigns = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await getCampaigns()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message || 'Failed to load campaigns'); setCampaigns([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      await createCampaign({ name: trimmed })
      showToast('Campaign created')
      setNewName(''); setShowCreateForm(false); fetchCampaigns()
    } catch (err) { showToast(err.message || 'Create failed', 'error') }
    setCreating(false)
  }

  function handleNewDoc(campaignId) {
    navigate(campaignId ? `/ingest?campaign_id=${campaignId}` : '/ingest')
  }

  function handleNavigateDoc(docId) { navigate(`/doc/${docId}`) }

  function handleOpenCampaign(campaign) { setPanelCampaign(campaign) }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = campaigns.findIndex(c => c.id === active.id)
    const newIdx = campaigns.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(campaigns, oldIdx, newIdx)
    setCampaigns(reordered)
    try {
      await reorderCampaigns(reordered.map((c, i) => ({ id: c.id, sort_order: i })))
    } catch (err) {
      console.error('Reorder failed:', err)
      showToast('Reorder failed', 'error')
      fetchCampaigns()
    }
  }

  const displayCampaigns = sortCampaigns(campaigns, sortKey)
  const isDragEnabled = sortKey === 'manual'

  return (
    <div className="cv-container">
      <div className="cv-header">
        <h1 className="cv-title">Campaigns</h1>
        <div className="cv-header__controls">
          <div className="cv-sort">
            <span className="cv-sort__label">Sort:</span>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.key} className={`cv-sort__btn${sortKey === opt.key ? ' cv-sort__btn--active' : ''}`} onClick={() => setSortKey(opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>
          <button className="cv-btn cv-btn--primary" onClick={() => setShowCreateForm(s => !s)}>
            <Plus size={15} /><span>New Campaign</span>
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="cv-create">
          <input
            className="cv-create__input" value={newName}
            onChange={e => setNewName(e.target.value)} placeholder="Campaign name…"
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreateForm(false); setNewName('') } }}
            autoFocus
          />
          <button className="cv-btn cv-btn--primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button className="cv-btn cv-btn--secondary" onClick={() => { setShowCreateForm(false); setNewName('') }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="cv-loading"><Spinner /></div>
      ) : error ? (
        <div className="cv-error"><span>{error}</span><button className="cv-btn cv-btn--secondary" onClick={fetchCampaigns}>Retry</button></div>
      ) : (
        <div className="cv-grid">
          {campaigns.length === 0 && <p className="cv-empty">No campaigns yet. Create one to start organizing.</p>}

          {isDragEnabled ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayCampaigns.map(c => c.id)} strategy={rectSortingStrategy}>
                {displayCampaigns.map(c => (
                  <SortableCampaignCard key={c.id} campaign={c} onRename={fetchCampaigns} onDelete={fetchCampaigns} onNewDoc={handleNewDoc} onOpen={handleOpenCampaign} isDragEnabled />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            displayCampaigns.map(c => (
              <div key={c.id} className="cv-card">
                <CardInner campaign={c} onRename={fetchCampaigns} onDelete={fetchCampaigns} onNewDoc={handleNewDoc} onOpen={handleOpenCampaign} isDragEnabled={false} />
              </div>
            ))
          )}
        </div>
      )}

      {/* Slide-out panel */}
      <CampaignPanel
        campaign={panelCampaign}
        onClose={() => setPanelCampaign(null)}
        onNewDoc={handleNewDoc}
        onNavigateDoc={handleNavigateDoc}
      />
    </div>
  )
}
