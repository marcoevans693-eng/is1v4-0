import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MessageCircle, BookOpen, ScrollText, CheckSquare, Activity, Shield, Brain, X } from 'lucide-react'
import { RAIL_MODULES } from '../../config/modules'
import './CommandPalette.css'

const ICON_MAP = { MessageCircle, BookOpen, ScrollText, CheckSquare, Activity, Shield, Brain }

// Phase 4A: module navigation only. Full fuzzy search (docs, convos, specs, events) in Phase 6+.
export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // Filter modules by query
  const results = RAIL_MODULES.filter(m =>
    !query || m.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      const mod = results[selectedIdx]
      if (mod && mod.status !== 'placeholder') {
        navigate(mod.defaultRoute)
        onClose()
      }
    }
  }

  function handleSelect(mod) {
    if (mod.status === 'placeholder') return
    navigate(mod.defaultRoute)
    onClose()
  }

  if (!open) return null

  return (
    <div className="is1-cp-overlay" onClick={onClose}>
      <div className="is1-cp-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="is1-cp-input-row">
          <Search size={16} className="is1-cp-search-icon" />
          <input
            ref={inputRef}
            className="is1-cp-input"
            placeholder="Jump to module…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="is1-cp-close" onClick={onClose}><X size={14} /></button>
        </div>

        {results.length === 0 && (
          <div className="is1-cp-empty">No results</div>
        )}

        <div className="is1-cp-results">
          {results.map((mod, idx) => {
            const Icon = ICON_MAP[mod.icon]
            return (
              <div
                key={mod.id}
                className={[
                  'is1-cp-row',
                  idx === selectedIdx ? 'is1-cp-row--selected' : '',
                  mod.status === 'placeholder' ? 'is1-cp-row--placeholder' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleSelect(mod)}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                {Icon && <Icon size={15} />}
                <span className="is1-cp-row-label">{mod.label}</span>
                {mod.status === 'placeholder' && (
                  <span className="is1-cp-row-tag">Coming Soon</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="is1-cp-footer">
          Full search (docs · convos · specs · events) — Phase 6
        </div>
      </div>
    </div>
  )
}
