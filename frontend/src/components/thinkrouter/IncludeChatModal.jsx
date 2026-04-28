import { useState, useEffect } from 'react'
import './IncludeChatModal.css'

const MODES = [
  { value: 'summarize', label: 'Summarize', desc: '~500 tokens, ~$0.02 one-time. Recommended.' },
  { value: 'full', label: 'Full', desc: 'Entire thread injected verbatim. High token cost per turn.' },
  { value: 'reference', label: 'Reference', desc: 'Link recorded only. No content injected. Zero tokens.' },
]

export default function IncludeChatModal({
  conversationId,
  alreadyIncluded,
  onInclude,
  onClose,
}) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [mode, setMode] = useState('summarize')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/thinkrouter/conversations')
      .then(r => r.json())
      .then(data => {
        const all = (data.conversations || data || []).filter(c => c.id !== conversationId)
        setConversations(all)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [conversationId])

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(filter.toLowerCase())
  )

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleInclude() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    let hadError = false

    for (const targetId of [...selected]) {
      try {
        const res = await fetch(
          `/api/thinkrouter/conversations/${conversationId}/include`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_conv_id: targetId, include_mode: mode }),
          }
        )
        const data = await res.json()
        if (!res.ok) { hadError = true; setError(data.detail || 'Include failed'); break }
        onInclude(data)
      } catch (err) {
        hadError = true
        setError(err.message || 'Include failed')
        break
      }
    }

    setSubmitting(false)
    if (!hadError) onClose()
  }

  function formatDate(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="include-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="include-modal">
        <div className="include-modal-header">
          <span className="include-modal-title">Include a Past Chat as Context</span>
          <button className="include-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="include-modal-body">
          <input
            className="include-modal-search"
            type="text"
            placeholder="Filter conversations…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            autoFocus
          />

          <div className="include-modal-list">
            {loading && <div className="include-modal-empty">Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div className="include-modal-empty">No conversations found.</div>
            )}
            {filtered.map(c => {
              const isAlready = alreadyIncluded.has(c.id)
              const isSelected = selected.has(c.id)
              return (
                <div
                  key={c.id}
                  className={`include-modal-row${isSelected ? ' include-modal-row--selected' : ''}${isAlready ? ' include-modal-row--already' : ''}`}
                  onClick={() => { if (!isAlready) toggleSelect(c.id) }}
                >
                  <span className="include-modal-row-check">
                    {isAlready ? '✓' : isSelected ? '●' : '○'}
                  </span>
                  <span className="include-modal-row-title">{c.title}</span>
                  <span className="include-modal-row-meta">
                    {c.turn_count} turns · {formatDate(c.updated_at)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="include-modal-divider" />

          <div className="include-modal-modes">
            <div className="include-modal-modes-label">Include mode:</div>
            {MODES.map(m => (
              <label key={m.value} className="include-modal-mode-row">
                <input
                  type="radio"
                  name="include-mode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                />
                <span className="include-modal-mode-label">{m.label}</span>
                <span className="include-modal-mode-desc">{m.desc}</span>
              </label>
            ))}
          </div>

          {error && <div className="include-modal-error">{error}</div>}
        </div>

        <div className="include-modal-footer">
          <button className="include-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            className="include-modal-submit"
            onClick={handleInclude}
            disabled={selected.size === 0 || submitting}
          >
            {submitting ? 'Including…' : `Include Selected (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
