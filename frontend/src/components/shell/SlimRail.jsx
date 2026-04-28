import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessageCircle, BookOpen, ScrollText, CheckSquare,
  Activity, Shield, Brain, Plus
} from 'lucide-react'
import { RAIL_MODULES } from '../../config/modules'
import './SlimRail.css'

const ICON_MAP = { MessageCircle, BookOpen, ScrollText, CheckSquare, Activity, Shield, Brain }

function getActiveModuleId(pathname) {
  if (pathname === '/' || pathname === '') return 'chat'
  if (pathname.startsWith('/knowledge') || pathname.startsWith('/folders') ||
      pathname.startsWith('/ingest') || pathname.startsWith('/queries') ||
      pathname.startsWith('/observability') || pathname.startsWith('/campaigns') ||
      pathname.startsWith('/doc')) return 'knowledge'
  if (pathname.startsWith('/specs')) return 'specs'
  if (pathname.startsWith('/tasks')) return 'tasks'
  if (pathname.startsWith('/events')) return 'events'
  if (pathname.startsWith('/capaproxy')) return 'capaproxy'
  if (pathname.startsWith('/thinkrouter')) return 'thinkrouter'
  return 'chat'
}

export default function SlimRail() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeId = getActiveModuleId(location.pathname)

  return (
    <aside className="is1-rail">
      <div className="is1-rail-modules">
        {RAIL_MODULES.map(mod => {
          const Icon = ICON_MAP[mod.icon]
          const isActive = mod.id === activeId
          const isPlaceholder = mod.status === 'placeholder'
          return (
            <button
              key={mod.id}
              className={[
                'is1-rail-btn',
                isActive ? 'is1-rail-btn--active' : '',
                isPlaceholder ? 'is1-rail-btn--placeholder' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => !isPlaceholder && navigate(mod.defaultRoute)}
              title={isPlaceholder ? `${mod.label} — Coming Soon` : mod.label}
            >
              {Icon && <Icon size={20} />}
            </button>
          )
        })}
      </div>
      <div className="is1-rail-footer">
        <button
          className="is1-rail-btn is1-rail-btn--launcher"
          title="Module Launcher — Coming Soon"
        >
          <Plus size={20} />
        </button>
      </div>
    </aside>
  )
}
