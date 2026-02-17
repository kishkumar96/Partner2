/**
 * Skip to Content Link Component
 * Allows keyboard users to skip navigation and go directly to main content
 */

import React from 'react';

export const SkipToContent: React.FC = () => {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-6 focus:py-3 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-all"
      aria-label="Skip to main content"
    >
      Skip to main content
    </a>
  );
};

/**
 * VisuallyHidden Component
 * Hide content visually but keep it available for screen readers
 */
export const VisuallyHidden: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <span className="sr-only">{children}</span>;
};

/**
 * LiveRegion Component
 * Announce dynamic content to screen readers
 */
export const LiveRegion: React.FC<{
  children: React.ReactNode;
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
}> = ({ children, priority = 'polite', atomic = true }) => {
  return (
    <div role="status" aria-live={priority} aria-atomic={atomic} className="sr-only">
      {children}
    </div>
  );
};

export default {
  SkipToContent,
  VisuallyHidden,
  LiveRegion,
};
