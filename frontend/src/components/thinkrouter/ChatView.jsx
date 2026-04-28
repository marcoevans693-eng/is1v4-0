import { useState, useEffect, useRef } from 'react'
import TurnBubble from './TurnBubble'
import ReceiptPanel from './ReceiptPanel'
import ModelSelector from './ModelSelector'
import IncludedPill from './IncludedPill'
import IncludeChatModal from './IncludeChatModal'
import FolderSelector from '../folders/FolderSelector'
import './ChatView.css'

const ALLOWED_EXTS = new Set([
  '.txt','.md','.csv','.json','.jsonl','.yaml','.yml',
  '.py','.js','.ts','.jsx','.tsx','.html','.xml',
  '.sql','.log','.sh','.env','.toml','.ini','.cfg'
])
const MAX_FILE_BYTES = 1 * 1024 * 1024

function validateFiles(files) {
  const errors = []
  if (files.length > 5) errors.push('Maximum 5 files per turn.')
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) errors.push(`${f.name} exceeds 1 MB.`)
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!f.type.startsWith('text/') && !ALLOWED_EXTS.has(ext))
      errors.push(`${f.name} is not a supported text file type.`)
  }
  return errors
}

export default function ChatView({ conversationId, scrollToTurnId = null, onScrollHandled = () => {} }) {
  const [turns, setTurns] = useState([])
  const [models, setModels] = useState([])
  const [selectedSku, setSelectedSku] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [includedChats, setIncludedChats] = useState([])
  const [showIncludeModal, setShowIncludeModal] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setIncludedChats([])
    if (!conversationId) {
      setTurns([])
      return
    }
    fetch(`/api/thinkrouter/conversations/${conversationId}/turns`)
      .then(r => r.json())
      .then(data => {
        const rawTurns = data.turns ?? data
        setTurns(rawTurns.filter(t => !t.superseded_by))
      })
      .catch(() => {})
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  useEffect(() => {
    if (!scrollToTurnId || turns.length === 0) return
    const el = document.querySelector(`[data-turn-id="${scrollToTurnId}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('turn-bubble--highlight')
    const timer = setTimeout(() => {
      el.classList.remove('turn-bubble--highlight')
      onScrollHandled()
    }, 1500)
    return () => clearTimeout(timer)
  }, [scrollToTurnId, turns])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleInput(e) {
    setInput(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      const lineH = parseInt(getComputedStyle(el).lineHeight) || 20
      const maxH = lineH * 4
      el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
    }
  }

  function handleInclude(linkData) {
    setIncludedChats(prev => {
      if (prev.find(c => c.target_conv_id === linkData.target_conv_id)) return prev
      return [...prev, {
        link_id: linkData.link_id,
        target_conv_id: linkData.target_conv_id,
        target_title: linkData.target_title,
        include_mode: linkData.include_mode,
      }]
    })
  }

  async function handleRemoveInclude(targetConvId) {
    if (!conversationId) return
    try {
      await fetch(
        `/api/thinkrouter/conversations/${conversationId}/links/${targetConvId}`,
        { method: 'DELETE' }
      )
    } catch (err) {
      console.error('Remove include failed:', err)
    }
    setIncludedChats(prev => prev.filter(c => c.target_conv_id !== targetConvId))
  }

  async function handleFilesSelected(files) {
    const fileArr = Array.from(files)
    const errors = validateFiles(fileArr)
    if (errors.length) { alert(errors.join('\n')); return }

    setUploading(true)
    try {
      const fd = new FormData()
      fileArr.forEach(f => fd.append('files', f))
      const res = await fetch('/api/thinkrouter/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        alert(err.detail || 'Upload failed.')
        return
      }
      const data = await res.json()
      setAttachments(prev => {
        const combined = [...prev, ...data.attachments]
        return combined.slice(0, 5)
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleEditTurn(turnId, newContent) {
    if (!conversationId || !selectedSku || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(
        `/api/thinkrouter/conversations/${conversationId}/turns/${turnId}/edit`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent, model_sku: selectedSku }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        setSendError(err.detail || 'Edit failed')
        return
      }
      // Re-fetch full turn list to reflect superseded chain
      const updated = await fetch(`/api/thinkrouter/conversations/${conversationId}/turns`)
      const data = await updated.json()
      const rawTurns = data.turns ?? data
      setTurns(rawTurns.filter(t => !t.superseded_by))
    } catch (err) {
      setSendError('Edit failed')
    } finally {
      setSending(false)
    }
  }

  async function handleRegenerateTurn(turnId) {
    if (!conversationId || !selectedSku || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(
        `/api/thinkrouter/conversations/${conversationId}/turns/${turnId}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_sku: selectedSku }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        setSendError(err.detail || 'Regenerate failed')
        return
      }
      // Re-fetch full turn list
      const updated = await fetch(`/api/thinkrouter/conversations/${conversationId}/turns`)
      const data = await updated.json()
      const rawTurns = data.turns ?? data
      setTurns(rawTurns.filter(t => !t.superseded_by))
    } catch (err) {
      setSendError('Regenerate failed')
    } finally {
      setSending(false)
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || !selectedSku || sending || !conversationId) return

    setSending(true)
    setSendError(null)
    setInput('')
    setAttachments([])
    setSelectedFolder(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const optUserId = `opt-user-${Date.now()}`
    const optAsstId = `opt-asst-${Date.now()}`
    setTurns(prev => [...prev,
      { id: optUserId, role: 'user', content: text, superseded_by: null },
      { id: optAsstId, role: 'assistant', content: '', model_sku: selectedSku, isLoading: true, superseded_by: null },
    ])

    try {
      const res = await fetch(`/api/thinkrouter/conversations/${conversationId}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          model_sku: selectedSku,
          corpus: selectedFolder ? 'is1' : 'none',
          is1_folder_id: selectedFolder?.id || null,
          include_chat_ids: includedChats.map(c => c.target_conv_id),
          attachment_ids: attachments.map(a => a.id),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)

      const updated = await fetch(`/api/thinkrouter/conversations/${conversationId}/turns`)
      const updatedData = await updated.json()
      const rawTurns = updatedData.turns ?? updatedData
      setTurns(rawTurns.filter(t => !t.superseded_by))

    } catch (err) {
      setTurns(prev => prev.filter(t => t.id !== optUserId && t.id !== optAsstId))
      setSendError(err.message || 'Send failed. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (!conversationId) {
    return (
      <div className="tr-chatview tr-chatview--empty">
        <p className="tr-chatview-placeholder">Select or create a conversation.</p>
      </div>
    )
  }

  return (
    <div className="tr-chatview">
      <div className="tr-turn-list">
        {turns.length === 0 && (
          <p className="tr-chatview-placeholder">Select a model and start thinking.</p>
        )}
        {turns.map(t => (
          <div key={t.id} className="tr-turn-item" data-turn-id={t.id}>
            <TurnBubble
              key={t.id}
              turn={t}
              onEdit={t.role === 'user' ? handleEditTurn : undefined}
              onRegenerate={t.role === 'assistant' ? handleRegenerateTurn : undefined}
            />
            {!t.isLoading && t.role === 'assistant' && t.id && !t.id.startsWith('opt-') && (
              <ReceiptPanel turnId={t.id} conversationId={conversationId} />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="tr-input-bar">
        {sendError && <p className="tr-send-error">{sendError}</p>}
        {includedChats.length > 0 && (
          <div className="chat-view-pills">
            {includedChats.map(c => (
              <IncludedPill
                key={c.target_conv_id}
                title={c.target_title}
                mode={c.include_mode}
                onRemove={() => handleRemoveInclude(c.target_conv_id)}
              />
            ))}
          </div>
        )}
        <div className="tr-input-row">
          <textarea
            ref={textareaRef}
            className="tr-textarea"
            placeholder="Type your message…"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFilesSelected(e.dataTransfer.files)
            }}
          />
          {/* Attachment pills */}
          {attachments.length > 0 && (
            <div className="attachment-pills">
              {attachments.map(a => (
                <span key={a.id} className="attachment-pill">
                  <span className="attachment-pill-name">{a.filename}</span>
                  <button
                    className="attachment-pill-remove"
                    onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                    title="Remove"
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.jsonl,.yaml,.yml,.py,.js,.ts,.jsx,.tsx,.html,.xml,.sql,.log,.sh,.env,.toml,.ini,.cfg"
            style={{ display: 'none' }}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          <div className="tr-input-controls">
            <ModelSelector
              selectedSku={selectedSku}
              onSelect={sku => {
                setSelectedSku(sku)
                if (models.length === 0) {
                  fetch('/api/thinkrouter/models')
                    .then(r => r.json())
                    .then(setModels)
                    .catch(() => {})
                }
              }}
            />
            <button
              className="chat-view-include-btn"
              onClick={() => setShowIncludeModal(true)}
              disabled={!conversationId}
              title="Include a past chat as context"
            >
              🔗 Include Chat
            </button>
            <FolderSelector
              selectedFolder={selectedFolder}
              onChange={setSelectedFolder}
              direction="up"
            />
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= 5}
              title="Attach files"
            >
              {uploading ? '…' : '📎'}
            </button>
            <button
              className="tr-send-btn"
              onClick={send}
              disabled={sending || !input.trim() || !selectedSku}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {showIncludeModal && (
        <IncludeChatModal
          conversationId={conversationId}
          alreadyIncluded={new Set(includedChats.map(c => c.target_conv_id))}
          onInclude={handleInclude}
          onClose={() => setShowIncludeModal(false)}
        />
      )}
    </div>
  )
}
