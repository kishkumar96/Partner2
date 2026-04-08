/**
 * Manual mock for lucide-react.
 *
 * All icon components are replaced with a lightweight stub that renders a
 * plain <svg> element.  This avoids the ESM/CJS incompatibility that the real
 * package causes in the Jest / Babel environment, while still letting
 * component tests assert that icon wrappers are rendered.
 */

const React = require('react');

/** Generic icon stub – renders a <svg> with a data-testid derived from the name. */
function makeIcon(name) {
  function Icon({ className, size, strokeWidth, ...rest }) {
    return React.createElement('svg', {
      'data-testid': `icon-${name}`,
      'aria-hidden': true,
      className,
      ...rest,
    });
  }
  Icon.displayName = name;
  return Icon;
}

// Export every icon that the codebase currently imports from lucide-react.
// Add more entries here if new icons are introduced.
const iconNames = [
  'Activity', 'AlertCircle', 'AlertOctagon', 'AlertTriangle',
  'BarChart', 'BarChart2', 'BarChart3', 'Bell', 'BellOff', 'Book', 'Building', 'Building2',
  'Calendar', 'Check', 'CheckCircle', 'CheckCircle2', 'CheckSquare', 'ChevronDown', 'ChevronLeft',
  'ChevronRight', 'ChevronUp', 'Circle', 'Clock', 'Cloud', 'Construction',
  'Crosshair', 'Database', 'DollarSign', 'Download', 'Droplet', 'Droplets',
  'ExternalLink', 'Eye', 'EyeOff',
  'FileText', 'Filter', 'Flag', 'Flame',
  'Globe', 'Globe2',
  'HelpCircle', 'Home', 'Home2', 'Hourglass',
  'Info',
  'Layers', 'LayoutDashboard', 'Lightbulb', 'List', 'Loader2',
  'Map', 'MapPin', 'Menu', 'Minimize2', 'Maximize2', 'Minus',
  'Navigation',
  'Pause', 'Play', 'Plus',
  'RefreshCw', 'Repeat', 'RotateCcw',
  'Satellite', 'Search', 'Settings', 'Settings2', 'Share', 'Share2', 'Shield', 'SkipBack', 'SkipForward', 'Square', 'Sun',
  'Table', 'Target', 'Thermometer', 'Timer', 'ToggleLeft', 'ToggleRight',
  'Trash', 'TrendingDown', 'TrendingUp',
  'Users',
  'Volume2', 'VolumeX',
  'Waves', 'Wheat', 'Wind',
  'X', 'XCircle', 'ZoomIn', 'ZoomOut',
];

const icons = {};
iconNames.forEach(name => {
  icons[name] = makeIcon(name);
});

const defaultIcon = makeIcon('LucideIcon');

module.exports = {
  // Tell Jest's CJS/ESM interop to treat `default` as the ES default export.
  // Without this, `import Foo from 'lucide-react/...'` receives the entire
  // module.exports object instead of the stub function.
  __esModule: true,
  default: defaultIcon,
  createLucideIcon: makeIcon,
  ...icons,
};
