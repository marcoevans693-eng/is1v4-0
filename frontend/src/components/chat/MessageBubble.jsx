import React from 'react'
import MarkdownRenderer from '../shared/MarkdownRenderer'
import SourceCard from './SourceCard'

const PROVIDER_LABELS = {
  anthropic: 'claude',
  openai: 'gpt-4o',
  google: 'gemini',
}

export default function MessageBubble({ role, text, provider, sources, isLoading }) {
  const isUser = role === 'user'

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="bubble-content">
        {isLoading ? (
          <span className="bubble-loading">Thinking…</span>
        ) : isUser ? (
          <span className="bubble-text">{text}</span>
        ) : (
          <div className="bubble-markdown">
            <MarkdownRenderer content={text} />
          </div>
        )}
        {!isUser && provider && (
          <span className="provider-badge">{PROVIDER_LABELS[provider] || provider}</span>
        )}
      </div>
      {!isUser && sources && sources.length > 0 && (
        <div className="source-row">
          {sources.map(s => (
            <SourceCard key={s.id} source={s} />
          ))}
        </div>
      )}
    </div>
  )
}
