import './IncludedPill.css'

export default function IncludedPill({ title, mode, onRemove }) {
  const modeLabel = mode === 'summarize' ? 'summarized' : mode === 'full' ? 'full' : 'ref'

  return (
    <div className="included-pill">
      <span className="included-pill-icon">🔗</span>
      <span className="included-pill-title">{title}</span>
      <span className="included-pill-mode">{modeLabel}</span>
      <button
        className="included-pill-remove"
        onClick={onRemove}
        title="Remove included chat"
      >
        ✕
      </button>
    </div>
  )
}
