import { useState, useEffect } from 'react'
import './ReceiptPanel.css'

export default function ReceiptPanel({ turnId, conversationId }) {
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!turnId || !conversationId) return
    setLoading(true)
    setError(false)
    setReceipt(null)
    fetch(`/api/thinkrouter/conversations/${conversationId}/turns/${turnId}/receipt`)
      .then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(data => {
        setReceipt(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [turnId, conversationId])

  if (!turnId) return null

  function formatCost(val) {
    if (val == null) return '—'
    return `$${Number(val).toFixed(6)}`
  }

  return (
    <div className="receipt-panel" onClick={() => setExpanded(e => !e)}>
      {loading && <span className="receipt-cost">—</span>}
      {error && <span className="receipt-cost receipt-unavailable">receipt unavailable</span>}
      {receipt && !expanded && (
        <span className="receipt-cost">{formatCost(receipt.cost_total_usd)}</span>
      )}
      {receipt && expanded && (
        <div className="receipt-detail">
          <div className="receipt-row"><span>Model</span><span>{receipt.model_sku}</span></div>
          <div className="receipt-row"><span>Provider</span><span>{receipt.provider}</span></div>
          <div className="receipt-row"><span>Tokens in</span><span>{receipt.tokens_in}</span></div>
          <div className="receipt-row"><span>Tokens out</span><span>{receipt.tokens_out}</span></div>
          <div className="receipt-row"><span>Cost</span><span>{formatCost(receipt.cost_total_usd)}</span></div>
          <div className="receipt-row"><span>Latency</span><span>{receipt.latency_ms}ms</span></div>
          <div className="receipt-row"><span>Timestamp</span><span>{new Date(receipt.created_at).toLocaleString()}</span></div>
        </div>
      )}
    </div>
  )
}
