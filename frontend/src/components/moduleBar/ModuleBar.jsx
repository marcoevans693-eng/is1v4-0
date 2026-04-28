import { useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Brain, Globe } from 'lucide-react';
import { MODULES } from '../../config/modules';
import './ModuleBar.css';

const ICON_MAP = { BookOpen, Brain, Globe };

export default function ModuleBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveModule = () => {
    if (location.pathname.startsWith('/thinkrouter')) return 'thinkrouter';
    if (location.pathname.startsWith('/harvester')) return 'harvester';
    return 'is1';
  };

  const activeId = getActiveModule();

  const handleClick = (mod) => {
    navigate(mod.defaultRoute);
  };

  return (
    <div className="module-bar">
      {MODULES.map((mod) => {
        const IconComponent = ICON_MAP[mod.icon];
        const isActive = mod.id === activeId;
        const isPlaceholder = mod.status === 'placeholder';

        return (
          <button
            key={mod.id}
            className={[
              'module-bar-tab',
              isActive ? 'module-bar-tab--active' : '',
              isPlaceholder ? 'module-bar-tab--placeholder' : '',
            ].join(' ')}
            onClick={() => handleClick(mod)}
            title={isPlaceholder ? `${mod.label} — In Development` : mod.label}
          >
            {IconComponent && <IconComponent size={14} />}
            <span>{mod.label}</span>
          </button>
        );
      })}
    </div>
  );
}
