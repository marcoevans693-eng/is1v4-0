import { useState, useEffect } from 'react'
import './ModelSelector.css'

export default function ModelSelector({ selectedSku, onSelect }) {
  const [models, setModels] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/thinkrouter/models')
      .then(r => r.json())
      .then(data => {
        setModels(data)
        if (!selectedSku) {
          const defaultModel =
            data.find(m => m.default && m.status !== 'stub') ||
            data.find(m => m.status !== 'stub')
          if (defaultModel) onSelect(defaultModel.sku)
        }
      })
      .catch(() => setError(true))
  }, [])

  if (error) return <span className="model-selector-error">Models unavailable</span>

  return (
    <select
      className="model-selector"
      value={selectedSku || ''}
      onChange={e => onSelect(e.target.value)}
    >
      {models.map(m => (
        <option key={m.sku} value={m.sku} disabled={m.status === 'stub'}>
          {m.label}{m.status === 'stub' ? ' · Phase 9' : ''}
        </option>
      ))}
    </select>
  )
}
