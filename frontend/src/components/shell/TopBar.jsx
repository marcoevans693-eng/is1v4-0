import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessageCircle, BookOpen, ScrollText, CheckSquare,
  Activity, Command, User
} from 'lucide-react'
import { TOP_MODULES } from '../../config/modules'
import './TopBar.css'

const ICON_MAP = { MessageCircle, BookOpen, ScrollText, CheckSquare, Activity }

function getActiveModuleId(pathname) {
  if (pathname === '/' || pathname === '') return 'chat'
  if (pathname.startsWith('/knowledge') || pathname.startsWith('/folders') ||
      pathname.startsWith('/ingest') || pathname.startsWith('/queries') ||
      pathname.startsWith('/observability') || pathname.startsWith('/campaigns') ||
      pathname.startsWith('/doc')) return 'knowledge'
  if (pathname.startsWith('/specs')) return 'specs'
  if (pathname.startsWith('/tasks')) return 'tasks'
  if (pathname.startsWith('/events')) return 'events'
  return 'chat'
}

export default function TopBar({ onCommandPalette }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeId = getActiveModuleId(location.pathname)

  return (
    <header className="is1-topbar">
      <div className="is1-topbar-brand" onClick={() => navigate('/')}>
        IS1 <span className="is1-topbar-brand-v">v4</span>
      </div>

      <nav className="is1-topbar-tabs">
        {TOP_MODULES.map(mod => {
          const Icon = ICON_MAP[mod.icon]
          const isActive = mod.id === activeId
          const isPlaceholder = mod.status === 'placeholder'
          return (
            <button
              key={mod.id}
              className={[
                'is1-topbar-tab',
                isActive ? 'is1-topbar-tab--active' : '',
                isPlaceholder ? 'is1-topbar-tab--placeholder' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => !isPlaceholder && navigate(mod.defaultRoute)}
              title={isPlaceholder ? `${mod.label} — Coming Soon` : mod.label}
            >
              {Icon && <Icon size={14} />}
              <span>{mod.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="is1-topbar-right">
        <button
          className="is1-topbar-cmdpalette"
          onClick={onCommandPalette}
          title="Command Palette (⌘K)"
        >
          <Command size={14} />
          <span className="is1-topbar-cmdkey">⌘K</span>
        </button>
        <div className="is1-topbar-avatar" title="Marco">
          <User size={16} />
        </div>
      </div>
    </header>
  )
}
