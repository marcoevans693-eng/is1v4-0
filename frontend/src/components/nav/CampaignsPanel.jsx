import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Rocket } from 'lucide-react'
import './CampaignsPanel.css'

export default function CampaignsPanel({ open, onClose, onSelect }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(data => {
        setCampaigns(Array.isArray(data) ? data : [])
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

  function handleCampaignClick(campaign) {
    if (onSelect) onSelect(campaign)
    onClose()
  }

  function handleClearCampaign() {
    if (onSelect) onSelect(null)
    onClose()
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div className="campaigns-panel-backdrop" onClick={handleBackdropClick}>
      <div className="campaigns-panel" ref={panelRef}>
        <div className="campaigns-panel-header">Campaigns</div>
        <div className="campaigns-panel-list">
          {loading && <div className="campaigns-panel-loading">Loading…</div>}
          {!loading && (
            <button
              className="campaigns-panel-item campaigns-panel-item--clear"
              onClick={handleClearCampaign}
            >
              <span className="campaigns-panel-item-name">No campaign</span>
            </button>
          )}
          {!loading && campaigns.length === 0 && (
            <div className="campaigns-panel-empty">No campaigns yet</div>
          )}
          {!loading && campaigns.map(c => (
            <button
              key={c.id}
              className="campaigns-panel-item"
              onClick={() => handleCampaignClick(c)}
            >
              <Rocket size={16} />
              <span className="campaigns-panel-item-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
