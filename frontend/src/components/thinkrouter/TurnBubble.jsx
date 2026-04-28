import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './TurnBubble.css'

export default function TurnBubble({ turn, onEdit, onRegenerate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isHovered, setIsHovered] = useState(false)

  function startEdit() {
    setEditValue(turn.content)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditValue('')
  }

  function submitEdit() {
    if (!editValue.trim()) return
    setIsEditing(false)
    onEdit && onEdit(turn.id, editValue.trim())
  }

  const displayContent = turn.role === 'user'
    ? turn.content.split('\n\n---\n')[0]
    : turn.content

  if (turn.role === 'user') {
    return (
      <div
        className="turn-bubble"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="turn-user-row">
          <div className="turn-user-bubble">
            {isEditing ? (
              <div className="turn-edit-area">
                <textarea
                  className="turn-edit-textarea"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="turn-edit-actions">
                  <button className="turn-edit-save" onClick={submitEdit}>Save & Resend</button>
                  <button className="turn-edit-cancel" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="turn-content">{displayContent}</div>
                {isHovered && onEdit && (
                  <button className="turn-action-btn turn-edit-btn" onClick={startEdit} title="Edit message">
                    ✏️
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // assistant turn
  return (
    <div
      className="turn-bubble"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="turn-assistant-row">
        <div className="turn-assistant-card">
          {turn.model_sku && <span className="turn-model-label">{turn.model_sku}</span>}
          {turn.isLoading ? (
            <div className="turn-loading-pulse" />
          ) : (
            <div className="turn-assistant-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent || ''}
              </ReactMarkdown>
            </div>
          )}
          {isHovered && onRegenerate && (
            <button
              className="turn-action-btn turn-regen-btn"
              onClick={() => onRegenerate(turn.id)}
              title="Regenerate response"
            >
              ↺
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
