import React, { useState, useRef, useCallback } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import './MarkdownEditor.css'

export default function MarkdownEditor({ value, onChange, placeholder }) {
  const [leftPct, setLeftPct] = useState(50)
  const dragging = useRef(false)
  const containerRef = useRef(null)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(e) {
      if (!dragging.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let pct = ((e.clientX - rect.left) / rect.width) * 100
      pct = Math.min(Math.max(pct, 20), 80)
      setLeftPct(pct)
    }

    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div className="md-editor" ref={containerRef}>

      <div className="md-editor-pane" style={{ width: leftPct + '%' }}>
        <div className="md-editor-pane-label">Markdown</div>
        <textarea
          className="md-editor-textarea"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'Write markdown here…'}
          spellCheck={false}
        />
      </div>

      <div className="md-editor-divider" onMouseDown={onMouseDown}>
        <div className="md-editor-divider-handle" />
      </div>

      <div className="md-editor-pane md-editor-right" style={{ width: (100 - leftPct) + '%' }}>
        <div className="md-editor-pane-label">Preview</div>
        <div className="md-editor-preview">
          {value
            ? <MarkdownRenderer content={value} />
            : <span className="md-editor-empty">Preview will appear here</span>
          }
        </div>
      </div>

    </div>
  )
}
