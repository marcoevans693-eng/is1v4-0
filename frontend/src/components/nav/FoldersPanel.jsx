import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Folder } from 'lucide-react'
import './FoldersPanel.css'

export default function FoldersPanel({ open, onClose, onSelect }) {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/folders')
      .then(r => r.json())
      .then(data => {
        setFolders(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open])

  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [open, handleEscape])

  function handleFolderClick(folder) {
    if (onSelect) onSelect(folder)
    onClose()
  }

  function handleClearFolder() {
    if (onSelect) onSelect(null)
    onClose()
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div className="folders-panel-backdrop" onClick={handleBackdropClick}>
      <div className="folders-panel" ref={panelRef}>
        <div className="folders-panel-header">Folders</div>
        <div className="folders-panel-list">
          {loading && <div className="folders-panel-loading">Loading…</div>}
          {!loading && (
            <button
              className="folders-panel-item folders-panel-item--clear"
              onClick={handleClearFolder}
            >
              <span className="folders-panel-item-name">No folder</span>
            </button>
          )}
          {!loading && folders.length === 0 && (
            <div className="folders-panel-empty">No folders yet</div>
          )}
          {!loading && folders.map(f => (
            <button
              key={f.id}
              className="folders-panel-item"
              onClick={() => handleFolderClick(f)}
            >
              <Folder size={16} />
              <span className="folders-panel-item-name">{f.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
