import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/shared/Toast'
import ErrorBoundary from './components/shared/ErrorBoundary'

// Shell components
import TopBar from './components/shell/TopBar'
import SlimRail from './components/shell/SlimRail'
import StatusBar from './components/shell/StatusBar'
import CommandPalette from './components/shell/CommandPalette'

// Module components

import IngestPanel from './components/ingest/IngestPanel'
import KnowledgeExplorer from './components/knowledge/KnowledgeExplorer'
import KnowledgeDocDetail from './components/knowledge/KnowledgeDocDetail'
import FoldersView from './components/folders/FoldersView'
import QueryHistoryView from './components/queries/QueryHistoryView'
import ObservabilityDashboard from './components/observability/ObservabilityDashboard'
import CampaignsView from './components/campaigns/CampaignsView'
import SpecsView from './components/specs/SpecsView'
import ThinkRouterLayout from './components/thinkrouter/ThinkRouterLayout'
import UsageDashboard from './components/thinkrouter/UsageDashboard'
import ComingSoon from './components/shared/ComingSoon'

import './App.css'

function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false)

  // Global ⌘K / Ctrl+K handler
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="is1-shell">
      <TopBar onCommandPalette={() => setCmdOpen(true)} />

      <div className="is1-shell-body">
        <SlimRail />

        <main className="is1-shell-canvas">
          <ErrorBoundary>
            <Routes>
              {/* Chat �� unified ThinkRouter surface (Phase 4B) */}
              <Route path="/" element={<ThinkRouterLayout />} />
              <Route path="/chat/usage" element={<UsageDashboard />} />
              <Route path="/chat/*" element={<ThinkRouterLayout />} />

              {/* Knowledge cluster */}
              <Route path="/knowledge" element={<ErrorBoundary><KnowledgeExplorer /></ErrorBoundary>} />
              <Route path="/doc/:id" element={<KnowledgeDocDetail />} />
              <Route path="/folders" element={<ErrorBoundary><FoldersView /></ErrorBoundary>} />
              <Route path="/ingest" element={<IngestPanel />} />
              <Route path="/queries" element={<ErrorBoundary><QueryHistoryView /></ErrorBoundary>} />
              <Route path="/observability" element={<ErrorBoundary><ObservabilityDashboard /></ErrorBoundary>} />
              <Route path="/campaigns" element={<ErrorBoundary><CampaignsView /></ErrorBoundary>} />

              {/* Specs */}
              <Route path="/specs" element={<ErrorBoundary><SpecsView /></ErrorBoundary>} />

              {/* Placeholder modules — Phase 4A stubs */}
              <Route path="/tasks" element={<ComingSoon moduleName="Tasks" />} />
              <Route path="/events" element={<ComingSoon moduleName="Events" />} />
              <Route path="/capaproxy" element={<ComingSoon moduleName="CapaProxy" />} />


            </Routes>
          </ErrorBoundary>
        </main>
      </div>

      <StatusBar />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
      />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </BrowserRouter>
  )
}
