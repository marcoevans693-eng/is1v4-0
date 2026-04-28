import React, { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { getFolders, createFolder, reorderFolders } from '../../api/client'
import './FolderSelector.css'

const PREFS_KEY = 'is1v3_prefs'

function loadSavedFolderId() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const prefs = JSON.parse(raw)
    return prefs.folderId || null
  } catch { return null }
}

function saveFolderId(folderId) {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    const prefs = raw ? JSON.parse(raw) : {}
    prefs.folderId = folderId
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch { /* silent */ }
}

/* ── Sortable folder item ────────────────────────────────── */
function SortableFolderItem({ folder, onPick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`fs-item${isDragging ? ' fs-item--dragging' : ''}`}
    >
      <span
        className="fs-drag-handle"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </span>
      <span
        className="fs-item-text"
        onMouseDown={e => { e.preventDefault(); onPick(folder) }}
      >
        {folder.name}
      </span>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */
export default function FolderSelector({ selectedFolder, onChange, direction = 'up' }) {
  const [allFolders, setAllFolders] = useState([])
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [initialized, setInitialized] = useState(false)
  const wrapRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  useEffect(() => {
    getFolders()
      .then(folders => {
        setAllFolders(folders)
        if (!initialized) {
          const savedId = loadSavedFolderId()
          if (savedId) {
            const match = folders.find(f => f.id === savedId)
            if (match) {
              onChange(match)
            } else {
              saveFolderId(null)
              onChange(null)
            }
          }
          setInitialized(true)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleOpen() {
    setOpen(prev => !prev)
    if (open) setFilter('')
  }

  const filtered = allFolders.filter(f =>
    f.name.toLowerCase().includes(filter.toLowerCase())
  )
  const exactMatch = allFolders.some(
    f => f.name.toLowerCase() === filter.toLowerCase()
  )
  const showCreate = filter.trim() && !exactMatch

  /* Whether drag is allowed — only when showing full unfiltered list */
  const isDragEnabled = !filter.trim()

  function pick(folder) {
    onChange(folder)
    saveFolderId(folder ? folder.id : null)
    setOpen(false)
    setFilter('')
  }

  async function handleCreate() {
    try {
      const nf = await createFolder({ name: filter.trim() })
      setAllFolders(prev => [...prev, nf])
      pick(nf)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = allFolders.findIndex(f => f.id === active.id)
    const newIndex = allFolders.findIndex(f => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(allFolders, oldIndex, newIndex)
    setAllFolders(reordered)

    /* Persist new sort_order to backend */
    try {
      await reorderFolders(
        reordered.map((f, i) => ({ id: f.id, sort_order: i }))
      )
    } catch (err) {
      console.error('Reorder failed:', err)
      /* Revert on failure */
      setAllFolders(allFolders)
    }
  }

  return (
    <div className="fs-wrap" ref={wrapRef}>
      <button type="button" className="fs-btn" onClick={toggleOpen}>
        <span className={selectedFolder ? 'fs-label' : 'fs-label fs-label--empty'}>
          {selectedFolder ? selectedFolder.name : 'No folder'}
        </span>
        <span className="fs-arrow">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className={`fs-menu ${direction === 'down' ? 'fs-menu--down' : ''}`}>
          <input
            className="fs-filter"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search folders…"
            autoFocus
          />
          <div className="fs-list">
            {/* "No folder" option — always first, not draggable */}
            <div
              className="fs-item"
              onMouseDown={e => { e.preventDefault(); pick(null) }}
            >
              <span className="fs-item-text fs-item--none">No folder</span>
            </div>

            {isDragEnabled ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filtered.map(f => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filtered.map(f => (
                    <SortableFolderItem key={f.id} folder={f} onPick={pick} />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              /* Filtered view — no drag, just clickable items */
              filtered.map(f => (
                <div
                  key={f.id}
                  className="fs-item"
                  onMouseDown={e => { e.preventDefault(); pick(f) }}
                >
                  <span className="fs-item-text">{f.name}</span>
                </div>
              ))
            )}

            {showCreate && (
              <div
                className="fs-item fs-item--create"
                onMouseDown={e => { e.preventDefault(); handleCreate() }}
              >
                Create "<strong>{filter.trim()}</strong>"
              </div>
            )}
            {filtered.length === 0 && !showCreate && (
              <div className="fs-item fs-item--empty">No folders found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
