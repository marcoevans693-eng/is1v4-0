import { useState, useEffect } from 'react'
import './AllChats.css'

const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'created_at', label: 'Date Created' },
  { value: 'total_cost_usd', label: 'Total Cost' },
  { value: 'turn_count', label: 'Turn Count' },
]

export default function AllChats({ onSelect }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('updated_at')
  const [order, setOrder] = useState('desc')
  const [includeArchived, setIncludeArchived] = useState(false)

  useEffect(() => {
    load()
  }, [sort, order, includeArchived])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ sort, order, include_archived: includeArchived })
      const res = await fetch(`/api/thinkrouter/conversations/all?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to load')
      setConversations(data.conversations || [])
    } catch (err) {
      setError(err.message || 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }

  function toggleSort(field) {
    if (sort === field) {
      setOrder(o => o === 'desc' ? 'asc' : 'desc')
    } else {
      setSort(field)
      setOrder('desc')
    }
  }

  function sortIndicator(field) {
    if (sort !== field) return null
    return <span className="all-chats-sort-indicator">{order === 'desc' ? ' ↓' : ' ↑'}</span>
  }

  function formatDate(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatCost(val) {
    if (!val && val !== 0) return '—'
    if (val === 0) return '$0.00'
    if (val < 0.001) return `$${val.toFixed(6)}`
    return `$${val.toFixed(4)}`
  }

  return (
    <div className="all-chats">
      <div className="all-chats-header">
        <h2 className="all-chats-title">All Conversations</h2>
        <div className="all-chats-controls">
          <label className="all-chats-archived-toggle">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
      </div>

      {error && <div className="all-chats-error">{error}</div>}

      {loading ? (
        <div className="all-chats-loading">Loading…</div>
      ) : conversations.length === 0 ? (
        <div className="all-chats-empty">No conversations yet.</div>
      ) : (
        <div className="all-chats-table-wrap">
          <table className="all-chats-table">
            <thead>
              <tr>
                <th className="all-chats-th all-chats-th--title">Title</th>
                <th
                  className="all-chats-th all-chats-th--sortable"
                  onClick={() => toggleSort('turn_count')}
                >
                  Turns{sortIndicator('turn_count')}
                </th>
                <th
                  className="all-chats-th all-chats-th--sortable"
                  onClick={() => toggleSort('total_cost_usd')}
                >
                  Cost{sortIndicator('total_cost_usd')}
                </th>
                <th
                  className="all-chats-th all-chats-th--sortable"
                  onClick={() => toggleSort('updated_at')}
                >
                  Last Updated{sortIndicator('updated_at')}
                </th>
                <th
                  className="all-chats-th all-chats-th--sortable"
                  onClick={() => toggleSort('created_at')}
                >
                  Created{sortIndicator('created_at')}
                </th>
              </tr>
            </thead>
            <tbody>
              {conversations.map(c => (
                <tr
                  key={c.id}
                  className="all-chats-row"
                  onClick={() => onSelect(c.id)}
                >
                  <td className="all-chats-td all-chats-td--title">
                    {c.pinned && <span className="all-chats-pin">📌 </span>}
                    {c.archived && <span className="all-chats-archived-badge">archived </span>}
                    {c.title}
                  </td>
                  <td className="all-chats-td all-chats-td--num">{c.turn_count}</td>
                  <td className="all-chats-td all-chats-td--num">{formatCost(c.total_cost_usd)}</td>
                  <td className="all-chats-td">{formatDate(c.updated_at)}</td>
                  <td className="all-chats-td">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
