/**
 * @deprecated This component has been replaced by UnifiedMapLegend.
 * Information is now shown in the legend's "Map Display" section.
 * This file is kept only as a placeholder to prevent import errors.
 * DO NOT USE - will throw error in development mode.
 */

/**
 * @deprecated Use UnifiedMapLegend instead.
 * This component throws an error in development and returns null in production.
 */
export function MapTitleOverlay() {
  // Component disabled - throw in development to catch accidental usage, return null in production
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "MapTitleOverlay is deprecated and should not be used. Please use UnifiedMapLegend instead."
    );
  }
  
  // In production, silently return null to prevent errors
  return null;
}

export default MapTitleOverlay;

// Original code has been archived and removed.
// This component displayed map titles and metadata overlays.
// Functionality has been moved to UnifiedMapLegend component.
// See git history if original implementation is needed for reference.