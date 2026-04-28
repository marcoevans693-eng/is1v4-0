import React, { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import FolderSelector from '../folders/FolderSelector'
import { getTags } from '../../api/client'
import './ChatView.css'

const PREFS_KEY = 'is1v3_prefs'
const SESSION_KEY = 'is1v3_chat_session'

function loadSavedTagId() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return ''
    const prefs = JSON.parse(raw)
    return prefs.tagId || ''
  } catch { return '' }
}

function saveTagId(tagId) {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    const prefs = raw ? JSON.parse(raw) : {}
    prefs.tagId = tagId
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch { /* silent */ }
}

function loadSessionMessages() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const saved = JSON.parse(raw)
    // Strip any loading-state bubbles that were in-flight when user navigated away
    return (saved.messages || []).filter(m => !m.isLoading)
  } catch { return [] }
}

function saveSessionMessages(messages) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages }))
  } catch { /* silent */ }
}

export default function ChatView() {
  const [messages, setMessages] = useState(() => loadSessionMessages())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [tagId, setTagId] = useState('')
  const [tags, setTags] = useState([])
  const bottomRef = useRef(null)

  useEffect(() => {
    getTags()
      .then(fetchedTags => {
        setTags(fetchedTags)
        const savedTagId = loadSavedTagId()
        if (savedTagId) {
          const match = fetchedTags.find(t => t.id === savedTagId)
          if (match) {
            setTagId(savedTagId)
          } else {
            saveTagId('')
          }
        }
      })
      .catch(() => {})
  }, [])

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    saveSessionMessages(messages)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleTagChange(e) {
    const val = e.target.value
    setTagId(val)
    saveTagId(val)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', text: '', isLoading: true }])
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          folder_id: selectedFolder ? selectedFolder.id : null,
          tag_id: tagId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          text: data.response,
          provider: data.provider,
          sources: data.sources,
          isLoading: false,
        }
        return updated
      })
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          text: `Error: ${err.message}`,
          isLoading: false,
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-history">
        {messages.length === 0 && (
          <div className="chat-empty">Ask anything about your knowledge base.</div>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            text={m.text}
            provider={m.provider}
            sources={m.sources}
            isLoading={m.isLoading}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-filters">
        <FolderSelector selectedFolder={selectedFolder} onChange={setSelectedFolder} />
        <select
          className="tag-filter"
          value={tagId}
          onChange={handleTagChange}
        >
          <option value="">All tags</option>
          {tags.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          placeholder="Ask a question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={loading}
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
