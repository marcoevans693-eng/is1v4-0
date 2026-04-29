import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConversationSidebar from './ConversationSidebar'
import ChatView from './ChatView'
import ChatSearch from './ChatSearch'
import AllChats from './AllChats'
import './ThinkRouterLayout.css'

export default function ThinkRouterLayout() {
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [scrollToTurnId, setScrollToTurnId] = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()

  const path = location.pathname

  function handleSelect(id) {
    setActiveConversationId(id)
    setScrollToTurnId(null)
    navigate('/chat')
  }

  function handleNewConversation(id) {
    setActiveConversationId(id)
    setScrollToTurnId(null)
    setRefreshTrigger(n => n + 1)
    navigate('/chat')
  }

  // Called from ChatSearch when user clicks a result
  function handleSearchSelect(conversationId, turnId) {
    setActiveConversationId(conversationId)
    setScrollToTurnId(turnId)
    navigate('/chat')
  }

  // Determine which right pane to render
  let rightPane
  if (path.startsWith('/chat/search')) {
    rightPane = <ChatSearch onSelect={handleSearchSelect} />
  } else if (path.startsWith('/chat/all')) {
    rightPane = <AllChats onSelect={(id) => handleSelect(id)} />
  } else {
    rightPane = (
      <ChatView
        conversationId={activeConversationId}
        scrollToTurnId={scrollToTurnId}
        onScrollHandled={() => setScrollToTurnId(null)}
      />
    )
  }

  return (
    <div className="thinkrouter-layout">
      <ConversationSidebar
        activeId={activeConversationId}
        onSelect={handleSelect}
        onNewConversation={handleNewConversation}
        refreshTrigger={refreshTrigger}
      />
      <div className="thinkrouter-main">
        {rightPane}
      </div>
    </div>
  )
}
