import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  Search, MessageCircle, FileText, Folder, FilePlus,
  History, Rocket, BookOpen
} from 'lucide-react'
import { ToastProvider } from './components/shared/Toast'
import ErrorBoundary from './components/shared/ErrorBoundary'
import IngestPanel from './components/ingest/IngestPanel'
import ChatView from './components/chat/ChatView'
import KnowledgeExplorer from './components/knowledge/KnowledgeExplorer'
import KnowledgeDocDetail from './components/knowledge/KnowledgeDocDetail'
import FoldersView from './components/folders/FoldersView'
import QueryHistoryView from './components/queries/QueryHistoryView'
import ObservabilityDashboard from './components/observability/ObservabilityDashboard'
import './index.css'
import './App.css'
import CampaignsView from './components/campaigns/CampaignsView'
import ModuleBar from './components/moduleBar/ModuleBar'
import ThinkRouterLayout from './components/thinkrouter/ThinkRouterLayout'
import ComingSoon from './components/shared/ComingSoon'
import UsageDashboard from './components/thinkrouter/UsageDashboard'

const MODULE_ROUTES = ['/thinkrouter', '/harvester', '/thinkrouter/usage']

function AppShell() {
  const location = useLocation()
  const isModuleRoute = MODULE_ROUTES.some(r => location.pathname.startsWith(r))

  return (
    <div className="app-layout">
      <ModuleBar />
      <div className="app-body">
        {!isModuleRoute && (
          <nav className="sidebar">
            <div className="sidebar-brand">IS1v3</div>
            <NavLink to="/knowledge?tab=Search" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Search size={15} /> Search
            </NavLink>
            <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <MessageCircle size={15} /> Chat
            </NavLink>
            <NavLink to="/knowledge?tab=All+Docs" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <FileText size={15} /> All Documents
            </NavLink>
            <NavLink to="/folders" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Folder size={15} /> Folders
            </NavLink>
            <NavLink to="/ingest" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <FilePlus size={15} /> Ingest
            </NavLink>
            <NavLink to="/queries" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <History size={15} /> Query History
            </NavLink>
            <div className="nav-divider" />
            <NavLink to="/campaigns" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Rocket size={15} /> Campaigns
            </NavLink>
            <NavLink to="/knowledge" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <BookOpen size={15} /> Knowledge
            </NavLink>
          </nav>
        )}
        {isModuleRoute ? (
          <Routes>
            <Route path="/thinkrouter/usage" element={<UsageDashboard />} />
            <Route path="/thinkrouter/*" element={<ThinkRouterLayout />} />
            <Route path="/harvester" element={<ComingSoon moduleName="SiteHarvester1" />} />
          </Routes>
        ) : (
          <main className="main-content">
            <Routes>
              <Route path="/" element={<ChatView />} />
              <Route path="/ingest" element={<IngestPanel />} />
              <Route path="/knowledge" element={<ErrorBoundary><KnowledgeExplorer /></ErrorBoundary>} />
              <Route path="/doc/:id" element={<KnowledgeDocDetail />} />
              <Route path="/folders" element={<ErrorBoundary><FoldersView /></ErrorBoundary>} />
              <Route path="/queries" element={<ErrorBoundary><QueryHistoryView /></ErrorBoundary>} />
              <Route path="/observability" element={<ErrorBoundary><ObservabilityDashboard /></ErrorBoundary>} />
              <Route path="/campaigns" element={<ErrorBoundary><CampaignsView /></ErrorBoundary>} />
            </Routes>
          </main>
        )}
      </div>
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
