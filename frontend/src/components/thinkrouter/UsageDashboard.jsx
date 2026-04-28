import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './UsageDashboard.css'

const fmt$ = (v) => `$${Number(v).toFixed(4)}`
const fmtN = (v) => Number(v).toLocaleString()

const CHART_LEFT = 60
const CHART_TOP = 15
const CHART_W = 625
const CHART_H = 130
const CHART_BOTTOM = CHART_TOP + CHART_H

function BarChart({ days }) {
  if (!days || days.length === 0) {
    return (
      <svg viewBox="0 0 700 200" width="100%" style={{ display: 'block' }}>
        <text x="350" y="108" textAnchor="middle" fontSize="13" fill="#888">No spend data yet</text>
      </svg>
    )
  }

  const maxCost = Math.max(...days.map(d => d.cost_usd))
  if (maxCost === 0) {
    return (
      <svg viewBox="0 0 700 200" width="100%" style={{ display: 'block' }}>
        <text x="350" y="108" textAnchor="middle" fontSize="13" fill="#888">No spend data yet</text>
      </svg>
    )
  }

  const slotW = CHART_W / days.length
  const barW = Math.max(2, slotW * 0.7)
  const gridFracs = [0.25, 0.5, 0.75, 1.0]

  return (
    <svg viewBox="0 0 700 200" width="100%" style={{ display: 'block' }}>
      {gridFracs.map((frac, i) => {
        const y = CHART_TOP + CHART_H * (1 - frac)
        const label = `$${(maxCost * frac).toFixed(4)}`
        return (
          <g key={i}>
            <line x1={CHART_LEFT} y1={y} x2={CHART_LEFT + CHART_W} y2={y} stroke="#E8E0D5" strokeWidth="1" />
            <text x={CHART_LEFT - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#999">{label}</text>
          </g>
        )
      })}

      {days.map((d, i) => {
        const barH = (d.cost_usd / maxCost) * CHART_H
        const x = CHART_LEFT + i * slotW + (slotW - barW) / 2
        const y = CHART_BOTTOM - barH
        const cx = x + barW / 2
        const showLabel = i % 5 === 0
        return (
          <g key={i}>
            <rect
              className="usage-bar"
              x={x}
              y={barH > 0 ? y : CHART_BOTTOM - 1}
              width={barW}
              height={barH > 0 ? barH : 1}
            />
            {showLabel && (
              <text
                x={cx}
                y={CHART_BOTTOM + 12}
                textAnchor="end"
                fontSize="10"
                fill="#888"
                transform={`rotate(-45 ${cx} ${CHART_BOTTOM + 12})`}
              >
                {d.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UsageDashboard() {
  const [summary, setSummary] = useState(null)
  const [models, setModels] = useState([])
  const [conversations, setConversations] = useState([])
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/thinkrouter/usage/summary').then(r => r.json()),
      fetch('/api/thinkrouter/usage/by-model').then(r => r.json()),
      fetch('/api/thinkrouter/usage/by-conversation').then(r => r.json()),
      fetch('/api/thinkrouter/usage/daily').then(r => r.json()),
    ])
      .then(([s, m, c, d]) => {
        setSummary(s)
        setModels(m.models || [])
        setConversations(c.conversations || [])
        setDays(d.days || [])
      })
      .catch(err => setError(err.message || 'Failed to load usage data'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="usage-page">
        <div className="usage-loading">Loading usage data…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="usage-page">
        <div className="usage-dashboard">
          <div className="usage-error">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="usage-page">
      <div className="usage-dashboard">
        <h1 className="usage-page-header">Usage Dashboard</h1>

        <div className="usage-section">
          <h2>Summary</h2>
          <div className="usage-cards">
            <div className="usage-card">
              <span className="usage-card-label">Total Spend</span>
              <span className="usage-card-value">{fmt$(summary.total_cost_usd)}</span>
            </div>
            <div className="usage-card">
              <span className="usage-card-label">Total Turns</span>
              <span className="usage-card-value">{fmtN(summary.total_turns)}</span>
            </div>
            <div className="usage-card">
              <span className="usage-card-label">Tokens In</span>
              <span className="usage-card-value">{fmtN(summary.total_tokens_in)}</span>
            </div>
            <div className="usage-card">
              <span className="usage-card-label">Tokens Out</span>
              <span className="usage-card-value">{fmtN(summary.total_tokens_out)}</span>
            </div>
            <div className="usage-card">
              <span className="usage-card-label">Conversations</span>
              <span className="usage-card-value">{fmtN(summary.total_conversations)}</span>
            </div>
          </div>
        </div>

        <div className="usage-section">
          <h2>Daily Spend (30 days)</h2>
          <div className="usage-chart-wrap">
            <BarChart days={days} />
          </div>
        </div>

        <div className="usage-section">
          <h2>Model Breakdown</h2>
          <table className="usage-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Turns</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 ? (
                <tr><td colSpan={5} style={{ color: '#888', textAlign: 'center' }}>No data</td></tr>
              ) : models.map(m => (
                <tr key={m.model_sku}>
                  <td>{m.model_sku}</td>
                  <td>{fmtN(m.turn_count)}</td>
                  <td>{fmtN(m.total_tokens_in)}</td>
                  <td>{fmtN(m.total_tokens_out)}</td>
                  <td>{fmt$(m.total_cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="usage-section">
          <h2>Per-Conversation</h2>
          <table className="usage-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Turns</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Cost</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {conversations.length === 0 ? (
                <tr><td colSpan={6} style={{ color: '#888', textAlign: 'center' }}>No data</td></tr>
              ) : conversations.map(c => (
                <tr key={c.conversation_id}>
                  <td>
                    <Link to={`/thinkrouter/chat/${c.conversation_id}`}>{c.title}</Link>
                  </td>
                  <td>{fmtN(c.turn_count)}</td>
                  <td>{fmtN(c.total_tokens_in)}</td>
                  <td>{fmtN(c.total_tokens_out)}</td>
                  <td>{fmt$(c.total_cost_usd)}</td>
                  <td>{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
