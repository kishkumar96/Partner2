/**
 * Accessibility Utilities
 * Helpers for improving application accessibility
 */

/**
 * Announce message to screen readers
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  if (typeof document === 'undefined') return;

  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Trap focus within a modal or dialog
 */
export const trapFocus = (element: HTMLElement) => {
  const focusableElements = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  };

  element.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
};

/**
 * Check if element is visible on screen
 */
export const isElementVisible = (element: HTMLElement): boolean => {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
};

/**
 * Get contrast ratio between two colors
 */
export const getContrastRatio = (color1: string, color2: string): number => {
  const getLuminance = (color: string): number => {
    // Simple RGB extraction (hex colors)
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    const [rs, gs, bs] = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Check if color combination meets WCAG standards
 */
export const meetsWCAGStandards = (
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  size: 'normal' | 'large' = 'normal'
): boolean => {
  const ratio = getContrastRatio(foreground, background);
  
  if (level === 'AAA') {
    return size === 'large' ? ratio >= 4.5 : ratio >= 7;
  }
  
  // AA level
  return size === 'large' ? ratio >= 3 : ratio >= 4.5;
};

/**
 * Generate accessible label for data value
 */
export const getAccessibleLabel = (
  label: string,
  value: number | string,
  unit?: string
): string => {
  const valueStr = typeof value === 'number' ? value.toLocaleString() : value;
  return unit ? `${label}: ${valueStr} ${unit}` : `${label}: ${valueStr}`;
};

/**
 * Create keyboard-accessible list navigation
 */
export const createListNavigation = (
  listElement: HTMLElement,
  onSelect: (index: number) => void
) => {
  const items = Array.from(listElement.children) as HTMLElement[];
  let currentIndex = 0;

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        currentIndex = Math.min(currentIndex + 1, items.length - 1);
        items[currentIndex]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        currentIndex = Math.max(currentIndex - 1, 0);
        items[currentIndex]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        currentIndex = 0;
        items[currentIndex]?.focus();
        break;
      case 'End':
        e.preventDefault();
        currentIndex = items.length - 1;
        items[currentIndex]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(currentIndex);
        break;
    }
  };

  listElement.addEventListener('keydown', handleKeyDown);

  // Make items focusable
  items.forEach((item, index) => {
    item.setAttribute('tabindex', index === 0 ? '0' : '-1');
    item.setAttribute('role', 'option');
  });

  listElement.setAttribute('role', 'listbox');

  return () => {
    listElement.removeEventListener('keydown', handleKeyDown);
  };
};

/**
 * Check if user prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get accessible color for status
 */
export const getAccessibleStatusColor = (
  status: 'success' | 'warning' | 'error' | 'info'
): { bg: string; text: string; border: string } => {
  const colors = {
    success: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-300',
    },
    warning: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-300',
    },
    error: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300',
    },
    info: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-300',
    },
  };

  return colors[status];
};

/**
 * Format date in accessible format
 */
export const formatAccessibleDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
};

/**
 * Create skip link for keyboard navigation
 */
export const createSkipLink = (targetId: string, label: string): HTMLAnchorElement => {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = label;
  skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded';
  skipLink.setAttribute('aria-label', label);
  
  return skipLink;
};

export default {
  announceToScreenReader,
  trapFocus,
  isElementVisible,
  getContrastRatio,
  meetsWCAGStandards,
  getAccessibleLabel,
  createListNavigation,
  prefersReducedMotion,
  getAccessibleStatusColor,
  formatAccessibleDate,
  createSkipLink,
};
