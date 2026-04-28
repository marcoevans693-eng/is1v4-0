import React from 'react'

export default function SourceCard({ source }) {
  const { id, title, relevance_score, folder_name, tags } = source
  const pct = relevance_score != null ? `${Math.round(relevance_score * 100)}%` : null

  return (
    <div className="source-card">
      <div className="source-title">{title || 'Untitled'}</div>
      <div className="source-meta">
        {folder_name && <span className="source-folder">{folder_name}</span>}
        {tags && tags.map(t => (
          <span
            key={t.id}
            className="source-tag"
            style={{ background: t.color || '#6B7280' }}
          >
            {t.name}
          </span>
        ))}
        {pct && <span className="source-score">{pct}</span>}
      </div>
    </div>
  )
}
