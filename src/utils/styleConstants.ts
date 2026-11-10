/**
 * Style Constants and Reusable CSS Classes
 *
 * World-class style management with:
 * - Consistent design system
 * - Type-safe style composition
 * - Responsive utilities
 * - Dark mode support
 */

/**
 * Positioning presets for absolute positioned elements
 */
export const POSITION_PRESETS = {
  topLeft: 'absolute top-4 left-4',
  topRight: 'absolute top-4 right-4',
  topCenter: 'absolute top-4 left-1/2 -translate-x-1/2',
  bottomLeft: 'absolute bottom-4 left-4',
  bottomRight: 'absolute bottom-4 right-4',
  bottomCenter: 'absolute bottom-4 left-1/2 -translate-x-1/2',
  center: 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
} as const;

/**
 * Z-index layers for consistent stacking
 */
export const Z_INDEX = {
  base: 'z-0',
  overlay: 'z-10',
  dropdown: 'z-20',
  modal: 'z-40',
  modalBackdrop: 'z-30',
  cycloneLayer: 'z-[5]',
  cycloneControls: 'z-[90]',
  mapControls: 'z-[100]',
  tooltip: 'z-50',
  toast: 'z-[200]',
} as const;

/**
 * Glass panel styles (glassmorphism effect)
 */
export const GLASS_PANEL = {
  base: 'glass-panel',
  border: 'border border-white/10',
  shadow: 'shadow-lg',
  rounded: 'rounded-lg',
  full: 'glass-panel rounded-lg',
} as const;

/**
 * Card component styles
 */
export const CARD_STYLES = {
  base: 'glass-panel rounded-lg',
  hover: 'hover:shadow-lg transition-shadow duration-200',
  interactive:
    'cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200',
} as const;

/**
 * Button size variants
 */
export const BUTTON_SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
  xl: 'px-8 py-4 text-lg',
} as const;

/**
 * Button style variants
 */
export const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-slate-700/70 hover:bg-slate-600/70 text-slate-100',
  success: 'bg-green-600 hover:bg-green-700 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-300',
} as const;

/**
 * Responsive width constraints
 */
export const RESPONSIVE_WIDTH = {
  panel: 'max-w-[min(320px,calc(100vw-40px))]',
  modal: 'max-w-[min(600px,calc(100vw-32px))]',
  legend: 'max-w-[min(20rem,calc(100vw-2rem))]',
  mapControl: 'max-w-[calc(100vw-2rem)]',
} as const;

/**
 * Responsive height constraints
 */
export const RESPONSIVE_HEIGHT = {
  panel: 'max-h-[calc(100vh-120px)]',
  modal: 'max-h-[95vh]',
  dropdown: 'max-h-[min(16rem,calc(100vh-400px))]',
} as const;

/**
 * Loading spinner styles
 */
export const SPINNER = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-4',
  base: 'animate-spin rounded-full border-blue-600 border-t-transparent',
} as const;

/**
 * Text styles
 */
export const TEXT_STYLES = {
  heading1: 'text-2xl sm:text-3xl font-bold',
  heading2: 'text-xl sm:text-2xl font-bold',
  heading3: 'text-lg sm:text-xl font-semibold',
  body: 'text-sm sm:text-base',
  caption: 'text-xs text-slate-400',
  label: 'text-sm font-medium text-slate-200',
} as const;

/**
 * Compose multiple class strings
 * @param classes - Array of class strings
 * @returns Combined class string
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Build a glass panel class string
 * @param options - Panel options
 * @returns Complete class string
 */
export function glassPanel(
  options: {
    position?: keyof typeof POSITION_PRESETS;
    zIndex?: keyof typeof Z_INDEX;
    responsive?: keyof typeof RESPONSIVE_WIDTH;
    maxHeight?: keyof typeof RESPONSIVE_HEIGHT;
    additional?: string;
  } = {}
): string {
  const { position, zIndex, responsive, maxHeight, additional } = options;

  return cn(
    GLASS_PANEL.full,
    position && POSITION_PRESETS[position],
    zIndex && Z_INDEX[zIndex],
    responsive && RESPONSIVE_WIDTH[responsive],
    maxHeight && RESPONSIVE_HEIGHT[maxHeight],
    additional
  );
}

/**
 * Build a button class string
 * @param options - Button options
 * @returns Complete class string
 */
export function button(
  options: {
    variant?: keyof typeof BUTTON_VARIANTS;
    size?: keyof typeof BUTTON_SIZES;
    disabled?: boolean;
    additional?: string;
  } = {}
): string {
  const { variant = 'primary', size = 'md', disabled = false, additional } = options;

  return cn(
    'rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
    additional
  );
}

/**
 * Build a spinner class string
 * @param size - Spinner size
 * @returns Complete class string
 */
export function spinner(size: keyof typeof SPINNER = 'md'): string {
  return cn(SPINNER.base, SPINNER[size]);
}
