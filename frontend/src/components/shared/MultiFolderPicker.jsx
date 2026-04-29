import { useState } from 'react'
import FolderSelector from '../folders/FolderSelector'
import './MultiFolderPicker.css'

/**
 * MultiFolderPicker — IS1 v4 multi-folder selection chip bar.
 * Spec ref: §2.2 multi-folder retrieval with per-folder buckets.
 *
 * Props:
 *   selectedFolders: Array of folder objects { id, name }
 *   onChange(folders): called when folder list changes
 *   maxFolders: max selectable folders (default 3)
 */
export default function MultiFolderPicker({ selectedFolders = [], onChange, maxFolders = 3 }) {
  const [adding, setAdding] = useState(false)
  const [selectorKey, setSelectorKey] = useState(0)

  function handleAdd(folder) {
    // FolderSelector fires onChange(null) on deselect — ignore
    if (!folder) {
      setAdding(false)
      return
    }
    // Deduplicate
    if (!selectedFolders.find(f => f.id === folder.id)) {
      onChange([...selectedFolders, folder])
    }
    setAdding(false)
    setSelectorKey(k => k + 1)
  }

  function handleRemove(id) {
    onChange(selectedFolders.filter(f => f.id !== id))
  }

  const canAdd = selectedFolders.length < maxFolders

  return (
    <div className="mfp-root">
      {selectedFolders.map(f => (
        <span key={f.id} className="mfp-chip">
          <span className="mfp-chip-name">{f.name}</span>
          <button
            className="mfp-chip-remove"
            onClick={() => handleRemove(f.id)}
            title="Remove folder"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <div className="mfp-selector-wrap">
          <FolderSelector
            key={selectorKey}
            selectedFolder={null}
            onChange={handleAdd}
            direction="up"
          />
        </div>
      ) : canAdd ? (
        <button
          className="mfp-add-btn"
          onClick={() => setAdding(true)}
          title={selectedFolders.length === 0 ? 'Select folder for RAG' : 'Add another folder'}
        >
          {selectedFolders.length === 0 ? 'No folder' : '+ folder'}
        </button>
      ) : null}
    </div>
  )
}
