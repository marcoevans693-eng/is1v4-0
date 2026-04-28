import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getFolders, getTags, getCampaigns } from '../../api/client'
import KnowledgeHistoryView from './KnowledgeHistoryView'
import KnowledgeAllDocsView from './KnowledgeAllDocsView'
import KnowledgeSearchView from './KnowledgeSearchView'
import KnowledgeMostRetrievedView from './KnowledgeMostRetrievedView'
import './KnowledgeExplorer.css'

const TABS = ['History', 'All Docs', 'Search', 'Most Retrieved']

export default function KnowledgeExplorer() {
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab = TABS.includes(tabParam) ? tabParam : 'History'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [folderFilter, setFolderFilter] = useState(null)
  const [tagFilter, setTagFilter] = useState(null)
  const [campaignFilter, setCampaignFilter] = useState(null)
  const [folders, setFolders] = useState([])
  const [tags, setTags] = useState([])
  const [campaigns, setCampaigns] = useState([])

  // Sync tab when URL param changes (nav click while already on /knowledge)
  useEffect(() => {
    if (tabParam && TABS.includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    getFolders().then(setFolders).catch(console.error)
    getTags().then(setTags).catch(console.error)
    getCampaigns().then(setCampaigns).catch(console.error)
  }, [])

  const filtersActive = folderFilter || tagFilter || campaignFilter

  function clearFilters() {
    setFolderFilter(null)
    setTagFilter(null)
    setCampaignFilter(null)
  }

  function renderSubView() {
    const props = { folderFilter, tagFilter, campaignFilter }
    switch (activeTab) {
      case 'History': return <KnowledgeHistoryView {...props} />
      case 'All Docs': return <KnowledgeAllDocsView {...props} />
      case 'Search': return <KnowledgeSearchView {...props} />
      case 'Most Retrieved': return <KnowledgeMostRetrievedView {...props} />
      default: return null
    }
  }

  return (
    <div className="ke-container">
      <div className="ke-header">
        <h1 className="ke-title">Knowledge Explorer</h1>
        <div className="ke-filters">
          <select
            className="ke-select"
            value={folderFilter || ''}
            onChange={e => setFolderFilter(e.target.value || null)}
          >
            <option value="">All Folders</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="unfiled">Unfiled</option>
          </select>
          <select
            className="ke-select"
            value={campaignFilter || ''}
            onChange={e => setCampaignFilter(e.target.value || null)}
          >
            <option value="">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="ke-select"
            value={tagFilter || ''}
            onChange={e => setTagFilter(e.target.value || null)}
          >
            <option value="">All Tags</option>
            {tags.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {filtersActive && (
            <button className="ke-clear-btn" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="ke-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`ke-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="ke-content">
        {renderSubView()}
      </div>
    </div>
  )
}
