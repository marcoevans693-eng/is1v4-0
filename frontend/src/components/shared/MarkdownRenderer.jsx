import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useNavigate } from 'react-router-dom'
import './MarkdownRenderer.css'

function CustomLink({ href, children }) {
  const navigate = useNavigate()
  if (href && href.startsWith('/doc/')) {
    return (
      <a
        href={href}
        onClick={e => { e.preventDefault(); navigate(href) }}
        className="md-internal-link"
      >
        {children}
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

function CustomCode({ node, inline, className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '')
  if (!inline && match) {
    return (
      <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" {...props}>
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    )
  }
  return <code className={className} {...props}>{children}</code>
}

export default function MarkdownRenderer({ content, className }) {
  return (
    <div className={`markdown-body${className ? ' ' + className : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: CustomLink,
          code: CustomCode,
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}
