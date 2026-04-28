import React, { useState, useEffect, useRef } from 'react'
import { getTags, createTag } from '../../api/client'
import './TagMultiSelect.css'

function luminance(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const toLinear = x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function tagTextColor(hex) {
  if (!hex || hex.length < 7) return '#000'
  return luminance(hex) > 0.179 ? '#111' : '#fff'
}

export default function TagMultiSelect({ selectedTags = [], onChange, maxTags = 3 }) {
  const [allTags, setAllTags] = useState([])
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    getTags().then(setAllTags).catch(console.error)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedIds = new Set(selectedTags.map(t => t.id))
  const atMax = selectedTags.length >= maxTags

  const filtered = allTags.filter(t =>
    !selectedIds.has(t.id) &&
    t.name.toLowerCase().includes(filter.toLowerCase())
  )

  const exactMatch = allTags.some(t => t.name.toLowerCase() === filter.toLowerCase())
  const showCreate = filter.trim() && !exactMatch && !atMax

  function removeTag(id) {
    onChange(selectedTags.filter(t => t.id !== id))
  }

  function addTag(tag) {
    if (atMax) return
    onChange([...selectedTags, tag])
    setFilter('')
  }

  async function handleCreate() {
    try {
      const newTag = await createTag({ name: filter.trim() })
      setAllTags(prev => [...prev, newTag])
      addTag(newTag)
      setOpen(false)
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="tms-container" ref={containerRef}>
      <div className="tms-input-row" onClick={() => setOpen(true)}>
        {selectedTags.map(tag => (
          <span
            key={tag.id}
            className="tms-pill"
            style={{ background: tag.color, color: tagTextColor(tag.color) }}
          >
            {tag.name}
            <button
              className="tms-remove"
              style={{ color: tagTextColor(tag.color) }}
              onClick={e => { e.stopPropagation(); removeTag(tag.id) }}
              type="button"
            >×</button>
          </span>
        ))}
        {!atMax && (
          <input
            className="tms-filter-input"
            value={filter}
            onChange={e => { setFilter(e.target.value); setOpen(true) }}
            placeholder={selectedTags.length === 0 ? 'Add tags…' : ''}
            onFocus={() => setOpen(true)}
          />
        )}
      </div>

      {open && (
        <div className="tms-dropdown">
          {atMax && <div className="tms-max-note">Max {maxTags} tags</div>}
          {!atMax && filtered.map(tag => (
            <div
              key={tag.id}
              className="tms-option"
              onMouseDown={e => { e.preventDefault(); addTag(tag); setOpen(false) }}
            >
              <span
                className="tms-option-pill"
                style={{ background: tag.color, color: tagTextColor(tag.color) }}
              >{tag.name}</span>
            </div>
          ))}
          {showCreate && (
            <div
              className="tms-option tms-create"
              onMouseDown={e => { e.preventDefault(); handleCreate() }}
            >
              Create "<strong>{filter.trim()}</strong>"
            </div>
          )}
          {!atMax && filtered.length === 0 && !showCreate && (
            <div className="tms-empty">No tags found</div>
          )}
        </div>
      )}
    </div>
  )
}
