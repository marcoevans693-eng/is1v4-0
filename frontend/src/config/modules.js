// IS1 Module Registry
// Controls the ModuleBar at the top of matriixai.com.
// status: 'active' = routes normally | 'placeholder' = routes to ComingSoon

export const MODULES = [
  {
    id: 'is1',
    label: 'IS1v3',
    icon: 'BookOpen',
    defaultRoute: '/',
    status: 'active',
  },
  {
    id: 'thinkrouter',
    label: 'IS1ThinkRouter',
    icon: 'Brain',
    defaultRoute: '/thinkrouter',
    status: 'active',
  },
  {
    id: 'harvester',
    label: 'SiteHarvester1',
    icon: 'Globe',
    defaultRoute: '/harvester',
    status: 'placeholder',
  },
  {
    id: 'specs',
    label: 'Spec System',
    icon: 'ScrollText',
    defaultRoute: '/specs',
    status: 'placeholder',
  },
];
