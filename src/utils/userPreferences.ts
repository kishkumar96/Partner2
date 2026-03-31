/**
 * User Preferences Management
 *
 * Utilities for storing and retrieving user preferences from localStorage.
 * Gracefully handles cases where localStorage is unavailable (SSR, private browsing).
 */

const STORAGE_KEYS = {
  BASEMAP_PREFERENCE_SET: 'basemap-preference-set',
  PREFERRED_BASEMAP: 'preferred-basemap',
} as const;

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user has already set basemap preference
 */
export function hasBasemapPreference(): boolean {
  if (!isLocalStorageAvailable()) return false; // Return false in SSR; will check again on client mount

  try {
    return localStorage.getItem(STORAGE_KEYS.BASEMAP_PREFERENCE_SET) === 'true';
  } catch {
    return false; // Return false on error to allow modal to show
  }
}

/**
 * Get user's preferred basemap (if any)
 */
export function getPreferredBasemap(): string | null {
  if (!isLocalStorageAvailable()) return null;

  try {
    return localStorage.getItem(STORAGE_KEYS.PREFERRED_BASEMAP);
  } catch {
    return null;
  }
}

/**
 * Save basemap preference
 */
export function saveBasemapPreference(basemapStyle: string): void {
  if (!isLocalStorageAvailable()) return;

  try {
    localStorage.setItem(STORAGE_KEYS.BASEMAP_PREFERENCE_SET, 'true');
    localStorage.setItem(STORAGE_KEYS.PREFERRED_BASEMAP, basemapStyle);
  } catch (error) {
    console.warn('Failed to save basemap preference:', error);
  }
}

/**
 * Reset basemap preference (will show modal again on next visit)
 */
export function resetBasemapPreference(): void {
  if (!isLocalStorageAvailable()) return;

  try {
    localStorage.removeItem(STORAGE_KEYS.BASEMAP_PREFERENCE_SET);
    localStorage.removeItem(STORAGE_KEYS.PREFERRED_BASEMAP);
  } catch (error) {
    console.warn('Failed to reset basemap preference:', error);
  }
}

/**
 * Get initial basemap style based on URL state > localStorage > default
 *
 * Priority:
 * 1. URL state (shared links take precedence)
 * 2. User's saved preference
 * 3. Default (Light basemap)
 */
export function getInitialBasemap(urlBasemap?: string): string {
  const defaultBasemap = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

  // URL state has highest priority (for shareable links)
  if (urlBasemap) {
    return urlBasemap;
  }

  // Check localStorage preference
  const savedPreference = getPreferredBasemap();
  if (savedPreference) {
    return savedPreference;
  }

  // Fall back to default
  return defaultBasemap;
}
