import { Folder, Brain, Clock } from 'lucide-react'
import './StatusBar.css'

// Phase 4A: static stub. Live data wired in Phase 7 (Memory) and Phase 8 (Events).
export default function StatusBar() {
  return (
    <footer className="is1-statusbar">
      <div className="is1-statusbar-item" title="Active folder — Phase 7">
        <Folder size={12} />
        <span>No folder active</span>
      </div>
      <div className="is1-statusbar-sep" />
      <div className="is1-statusbar-item" title="Memory state — Phase 7">
        <Brain size={12} />
        <span>Memory: Phase 7</span>
      </div>
      <div className="is1-statusbar-sep" />
      <div className="is1-statusbar-item" title="Last event — Phase 8">
        <Clock size={12} />
        <span>Events: Phase 8</span>
      </div>
    </footer>
  )
}
