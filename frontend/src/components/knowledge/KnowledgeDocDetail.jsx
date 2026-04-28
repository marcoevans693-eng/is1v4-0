import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDocument, updateDocument, deleteDocument } from '../../api/client'
import { Folder, Rocket, Eye, X } from 'lucide-react'
import MarkdownEditor from '../shared/MarkdownEditor'
import MarkdownRenderer from '../shared/MarkdownRenderer'
import FoldersPanel from '../nav/FoldersPanel'
import CampaignsPanel from '../nav/CampaignsPanel'
import { useToast } from '../shared/Toast'
import './KnowledgeDocDetail.css'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function KnowledgeDocDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [campaignsOpen, setCampaignsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [folder, setFolder] = useState(null)
  const [campaign, setCampaign] = useState(null)

  const fetchDoc = useCallback(() => {
    setLoading(true)
    getDocument(id)
      .then(data => {
        setDoc(data)
        setTitle(data.title || '')
        setContent(data.content || '')
        setFolder(data.folder_id ? { id: data.folder_id, name: data.folder_name, color: data.folder_color } : null)
        setCampaign(data.campaign_id ? { id: data.campaign_id, name: data.campaign_name } : null)
        setLoading(false)
      })
      .catch(() => {
        setNotFound(true)
        setLoading(false)
      })
  }, [id])

  useEffect(() => { fetchDoc() }, [fetchDoc])

  // Core save — accepts explicit override values to avoid stale state on autosave
  async function saveWith({ useTitle, useContent, useFolder, useCampaign }) {
    if (!useTitle.trim()) {
      setSaveError('Title cannot be blank')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await updateDocument(id, {
        title: useTitle.trim(),
        content: useContent,
        folder_id: useFolder ? useFolder.id : null,
        campaign_id: useCampaign ? useCampaign.id : null,
      })
      await fetchDoc()
      showToast('Document saved')
    } catch (err) {
      if (err.message && err.message.includes('409')) {
        setSaveError('Duplicate content — this content already exists in another document')
      } else if (err.message && err.message.includes('400')) {
        setSaveError(err.message)
      } else {
        setSaveError('Save failed — please try again')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    await saveWith({ useTitle: title, useContent: content, useFolder: folder, useCampaign: campaign })
  }

  function handleSelectFolder(f) {
    const newFolder = f
    const newCampaign = f ? null : campaign
    setFolder(newFolder)
    if (f) setCampaign(null)
    saveWith({ useTitle: title, useContent: content, useFolder: newFolder, useCampaign: newCampaign })
  }

  function handleSelectCampaign(c) {
    const newCampaign = c
    const newFolder = c ? null : folder
    setCampaign(newCampaign)
    if (c) setFolder(null)
    saveWith({ useTitle: title, useContent: content, useFolder: newFolder, useCampaign: newCampaign })
  }

  async function handleDelete() {
    try {
      await deleteDocument(id)
      showToast('Document deleted')
      navigate('/knowledge')
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  function copyLink() {
    if (!doc) return
    const link = `[${doc.title}](/doc/${id})`
    navigator.clipboard.writeText(link).then(() => showToast('Link copied'))
  }

  if (loading) return <div className="doc-detail-loading">Loading…</div>

  if (notFound) return (
    <div className="doc-detail-notfound">
      <p>Document not found.</p>
      <button className="btn-secondary" onClick={() => navigate('/knowledge')}>← Back</button>
    </div>
  )

  return (
    <div className="doc-detail">
      <FoldersPanel
        open={foldersOpen}
        onClose={() => setFoldersOpen(false)}
        onSelect={handleSelectFolder}
      />
      <CampaignsPanel
        open={campaignsOpen}
        onClose={() => setCampaignsOpen(false)}
        onSelect={handleSelectCampaign}
      />

      {/* ── Full Screen Preview Overlay ── */}
      {previewOpen && (
        <div className="doc-preview-overlay">
          <div className="doc-preview-header">
            <span className="doc-preview-title">{title || 'Preview'}</span>
            <button className="doc-preview-close" onClick={() => setPreviewOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="doc-preview-body">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="doc-confirm-overlay">
          <div className="doc-confirm-dialog">
            <p>Delete this document? This cannot be undone.</p>
            <div className="doc-confirm-actions">
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="doc-toolbar">
        <button className="btn-secondary" onClick={() => navigate('/knowledge')}>← Back</button>
        <input
          className="doc-title-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Document title…"
        />
        <button
          className="doc-folder-link"
          onClick={() => setFoldersOpen(true)}
          title={folder ? folder.name : 'Assign folder'}
        >
          <Folder size={14} />
          <span>{folder ? folder.name : 'Folder'}</span>
        </button>
        <button
          className="doc-folder-link"
          onClick={() => setCampaignsOpen(true)}
          title={campaign ? campaign.name : 'Assign campaign'}
        >
          <Rocket size={14} />
          <span>{campaign ? campaign.name : 'Campaign'}</span>
        </button>
        <button className="doc-preview-link" onClick={() => setPreviewOpen(true)} title="Preview full screen">
          <Eye size={14} />
          <span>Preview Full Screen</span>
        </button>
        <button className="btn-secondary btn-icon" onClick={copyLink} title="Copy link">🔗</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={saving}>Delete</button>
      </div>

      {saveError && <div className="doc-save-error">{saveError}</div>}

      <div className="doc-meta">
        <span>Created: {formatDate(doc.created_at)}</span>
        <span>Updated: {formatDate(doc.updated_at)}</span>
        {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
      </div>

      <MarkdownEditor
        value={content}
        onChange={setContent}
        placeholder="Document content (markdown)…"
      />

      <div className="doc-footer-actions">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
