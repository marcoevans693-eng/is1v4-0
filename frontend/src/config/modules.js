// IS1 v4.0 Module Registry
// Spec ref: §4 Module Roster (Day-1 v4) and §9 Approved Shell
//
// TOP_MODULES: appear in TopBar horizontal tabs (4-6 max daily-use)
// RAIL_MODULES: appear in SlimRail (all modules including rail-only)

export const TOP_MODULES = [
  {
    id: 'chat',
    label: 'Chat',
    icon: 'MessageCircle',
    defaultRoute: '/',
    status: 'active',
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: 'BookOpen',
    defaultRoute: '/knowledge',
    status: 'active',
  },
  {
    id: 'specs',
    label: 'Specs',
    icon: 'ScrollText',
    defaultRoute: '/specs',
    status: 'active',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: 'CheckSquare',
    defaultRoute: '/tasks',
    status: 'placeholder',
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'Activity',
    defaultRoute: '/events',
    status: 'placeholder',
  },
]

export const RAIL_MODULES = [
  ...TOP_MODULES,
  {
    id: 'capaproxy',
    label: 'CapaProxy',
    icon: 'Shield',
    defaultRoute: '/capaproxy',
    status: 'placeholder',
  },

]

// Legacy export retained for any files still referencing MODULES
// Remove after Phase 4B cleanup
export const MODULES = TOP_MODULES
