import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './ConversationSidebar.css'

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function ConversationSidebar({ activeId, onSelect, onNewConversation, refreshTrigger }) {
  const [conversations, setConversations] = useState([])
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [renameError, setRenameError] = useState(null)
  const editInputRef = useRef(null)
  const navigate = useNavigate()

  function load() {
    fetch('/api/thinkrouter/conversations')
      .then(r => r.json())
      .then(data => {
        setConversations(data)
        setError(null)
      })
      .catch(() => setError('Failed to load conversations.'))
  }

  useEffect(() => {
    load()
  }, [refreshTrigger])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  async function handleNew() {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/thinkrouter/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Create failed')
      load()
      onNewConversation(data.id)
    } catch {
      setError('Failed to create conversation.')
    } finally {
      setCreating(false)
    }
  }

  function startEditing(e, conv) {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditingTitle(conv.title)
    setRenameError(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingTitle('')
    setRenameError(null)
  }

  async function commitRename(id) {
    const trimmed = editingTitle.trim()
    if (!trimmed) return
    try {
      const res = await fetch(`/api/thinkrouter/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Rename failed')
      cancelEditing()
      load()
    } catch (err) {
      setRenameError(err.message || 'Rename failed')
    }
  }

  function handleRenameKeyDown(e, id) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename(id)
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  return (
    <div className="conv-sidebar">
      <div className="conv-sidebar-header">
        <button className="conv-new-btn" onClick={handleNew} disabled={creating}>
          {creating ? 'Creating…' : '+ New Conversation'}
        </button>
      </div>
      {error && <p className="conv-sidebar-error">{error}</p>}
      <div className="conv-list">
        {conversations.length === 0 && !error && (
          <p className="conv-empty">No conversations yet.</p>
        )}
        {conversations.map(c => (
          <div
            key={c.id}
            className={`conv-row${c.id === activeId ? ' conv-row--active' : ''}`}
            onClick={() => { if (editingId !== c.id) onSelect(c.id) }}
          >
            {editingId === c.id ? (
              <div className="conv-row-rename" onClick={e => e.stopPropagation()}>
                <input
                  ref={editInputRef}
                  className="conv-rename-input"
                  value={editingTitle}
                  onChange={e => { setEditingTitle(e.target.value); setRenameError(null) }}
                  onKeyDown={e => handleRenameKeyDown(e, c.id)}
                  onBlur={cancelEditing}
                />
                {renameError && (
                  <span className="conv-rename-error">{renameError}</span>
                )}
              </div>
            ) : (
              <>
                <span
                  className="conv-row-title"
                  onDoubleClick={e => startEditing(e, c)}
                >
                  {c.title}
                </span>
                <span className="conv-row-time">{relativeTime(c.updated_at)}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="conv-footer">
        <div className="conv-footer-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/thinkrouter/search')}>
          Search chats
        </div>
        <div className="conv-footer-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/thinkrouter/all')}>
          All chats
        </div>
        <div className="conv-footer-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/thinkrouter/usage')}>
          Usage &amp; receipts
        </div>
      </div>
    </div>
  )
}
