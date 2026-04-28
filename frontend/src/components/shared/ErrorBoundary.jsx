import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ marginBottom: '12px' }}>Something went wrong in this section.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '7px 16px', background: '#1e293b', color: '#cbd5e1',
              border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
