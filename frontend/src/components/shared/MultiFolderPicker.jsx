import { useState, useEffect } from 'react'
import './MultiFolderPicker.css'

/**
 * MultiFolderPicker — IS1 v4 multi-folder chip bar.
 * Spec ref: §2.2 multi-folder retrieval with per-folder buckets.
 * Fetches folder list directly — no FolderSelector dependency.
 * Native select stays in DOM at all times — no layout shift.
 */
export default function MultiFolderPicker({ selectedFolders = [], onChange, maxFolders = 3 }) {
  const [folders, setFolders] = useState([])
  const [selectKey, setSelectKey] = useState(0)

  useEffect(() => {
    fetch('/api/thinkrouter/is1-folders')
      .then(r => r.json())
      .then(data => setFolders(data || []))
      .catch(() => {})
  }, [])

  function handleSelectChange(e) {
    const folderId = e.target.value
    if (!folderId) return
    const folder = folders.find(f => f.id === folderId)
    if (!folder) return
    if (!selectedFolders.find(f => f.id === folder.id)) {
      onChange([...selectedFolders, folder])
    }
    // Force-reset select to placeholder after pick
    setSelectKey(k => k + 1)
  }

  function handleRemove(id) {
    onChange(selectedFolders.filter(f => f.id !== id))
  }

  const canAdd = selectedFolders.length < maxFolders
  const available = folders.filter(f => !selectedFolders.find(s => s.id === f.id))

  return (
    <div className="mfp-root">
      {selectedFolders.map(f => (
        <span key={f.id} className="mfp-chip">
          <span className="mfp-chip-name">{f.name}</span>
          <button
            className="mfp-chip-remove"
            onClick={() => handleRemove(f.id)}
            title="Remove folder"
          >x</button>
        </span>
      ))}
      {canAdd && (
        <select
          key={selectKey}
          className="mfp-select"
          value=""
          onChange={handleSelectChange}
        >
          <option value="">
            {selectedFolders.length === 0 ? 'No folder' : '+ folder'}
          </option>
          {available.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
