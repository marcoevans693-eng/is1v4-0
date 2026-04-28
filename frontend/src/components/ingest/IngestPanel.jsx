import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Folder, Rocket } from 'lucide-react'
import MarkdownEditor from '../shared/MarkdownEditor'
import FoldersPanel from '../nav/FoldersPanel'
import CampaignsPanel from '../nav/CampaignsPanel'
import { createDocument, getFolders, getCampaigns } from '../../api/client'
import './IngestPanel.css'

export default function IngestPanel() {
  const [searchParams] = useSearchParams()
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [campaignsOpen, setCampaignsOpen] = useState(false)

  useEffect(() => {
    const folderId = searchParams.get('folder_id')
    const campaignId = searchParams.get('campaign_id')

    if (campaignId) {
      getCampaigns()
        .then(campaigns => {
          const match = (Array.isArray(campaigns) ? campaigns : []).find(c => c.id === campaignId)
          if (match) setCampaign(match)
        })
        .catch(() => {})
    } else if (folderId) {
      getFolders()
        .then(folders => {
          const match = (Array.isArray(folders) ? folders : []).find(f => f.id === folderId)
          if (match) setFolder(match)
        })
        .catch(() => {})
    }
  }, [searchParams])

  function handleSelectFolder(f) {
    setFolder(f)
    if (f) setCampaign(null)
  }

  function handleSelectCampaign(c) {
    setCampaign(c)
    if (c) setFolder(null)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    if (!content.trim()) { setError('Content is required'); return }
    setSubmitting(true)
    try {
      await createDocument({
        title: title.trim(),
        content: content.trim(),
        folder_id: folder?.id || null,
        campaign_id: campaign?.id || null,
      })
      setContent('')
      setTitle('')
      setFolder(null)
      setCampaign(null)
      showToast('Document saved')
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('duplicate')) {
        setError('Duplicate content — this document already exists')
      } else {
        setError(msg || 'Save failed — please try again')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ingest-panel">
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

      <h1 className="ingest-title">Ingest Document</h1>
      {toast && <div className="ingest-toast">{toast}</div>}
      {error && <div className="ingest-error">{error}</div>}

      <form onSubmit={handleSubmit} className="ingest-form">
        <div className="ingest-toolbar">
          <input
            className="ingest-input"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Document title (required)"
            maxLength={200}
          />
          <button
            type="button"
            className={`ingest-meta-btn${folder ? ' ingest-meta-btn--active' : ''}`}
            onClick={() => setFoldersOpen(true)}
          >
            <Folder size={13} />
            <span>{folder ? folder.name : 'Folder'}</span>
          </button>
          <button
            type="button"
            className={`ingest-meta-btn${campaign ? ' ingest-meta-btn--active' : ''}`}
            onClick={() => setCampaignsOpen(true)}
          >
            <Rocket size={13} />
            <span>{campaign ? campaign.name : 'Campaign'}</span>
          </button>
          <button type="submit" className="ingest-submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="ingest-field--editor">
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Paste or write document content here (markdown supported)"
          />
        </div>

        <div className="ingest-footer">
          <button type="submit" className="ingest-submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
