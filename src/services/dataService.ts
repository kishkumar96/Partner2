/**
 * Data Service - Unified interface for loading data
 * Automatically uses backend API if available, falls back to file loading
 */

import { loadGeoJSON, loadTextData } from '@/utils/dataLoader';
import { parseCSV } from '@/utils/csvParser';
import { logger } from '@/utils/logger';

// Check if backend is available
let backendAvailable: boolean | null = null;
let checkingBackend = false;

async function isBackendAvailable(): Promise<boolean> {
  if (backendAvailable !== null) return backendAvailable;
  if (checkingBackend) {
    // Wait for existing check
    await new Promise(resolve => setTimeout(resolve, 100));
    return backendAvailable ?? false;
  }

  checkingBackend = true;
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    backendAvailable = response.ok;
  } catch {
    backendAvailable = false;
  }
  checkingBackend = false;
  return backendAvailable;
}

/**
 * Load damaged buildings data
 * Uses API if available, otherwise loads from file
 */
export async function loadDamagedBuildings(bbox?: [number, number, number, number]) {
  const useBackend = await isBackendAvailable();

  if (useBackend && bbox) {
    try {
      const response = await fetch(`/api/buildings?bbox=${bbox.join(',')}&limit=5000`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      logger.warn('API failed, falling back to file:', error);
    }
  }

  // Fallback to file loading
  const { data } = await loadGeoJSON('/damaged-buildings.geojson', { cache: true });
  return data;
}

/**
 * Load damaged roads data
 */
export async function loadDamagedRoads(bbox?: [number, number, number, number]) {
  const useBackend = await isBackendAvailable();

  if (useBackend && bbox) {
    try {
      const response = await fetch(`/api/roads?bbox=${bbox.join(',')}&limit=5000`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      logger.warn('API failed, falling back to file:', error);
    }
  }

  // Fallback to file loading
  const { data } = await loadGeoJSON('/damaged-roads.geojson', { cache: true });
  return data;
}

/**
 * Load regional impacts
 */
export async function loadRegionalImpacts() {
  const useBackend = await isBackendAvailable();

  if (useBackend) {
    try {
      const response = await fetch('/api/regions');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      logger.warn('API failed, falling back to file:', error);
    }
  }

  // Fallback to file loading
  const { data } = await loadGeoJSON('/regional-impacts.geojson', { cache: true });
  return data;
}

/**
 * Load cyclone track data
 */
export async function loadCycloneTrack() {
  const useBackend = await isBackendAvailable();

  if (useBackend) {
    try {
      const response = await fetch('/api/cyclone');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      logger.warn('API failed, falling back to file:', error);
    }
  }

  // Fallback to file loading
  const { data } = await loadGeoJSON('/cyclone-track.geojson', { cache: true });
  return data;
}

/**
 * Load statistics data
 */
export async function loadStats() {
  const useBackend = await isBackendAvailable();

  if (useBackend) {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      logger.warn('API failed, falling back to files:', error);
    }
  }

  // Fallback to file loading
  const [nationalSummary, regionalSummary, impactByAsset, impactBySector] = await Promise.all([
    loadTextData('/national-summary.csv', { cache: true }).then(r =>
      r.data ? parseCSV(r.data) : null
    ),
    loadTextData('/regional-summary.csv', { cache: true }).then(r =>
      r.data ? parseCSV(r.data) : null
    ),
    loadTextData('/impact-by-asset-type.csv', { cache: true }).then(r =>
      r.data ? parseCSV(r.data) : null
    ),
    loadTextData('/impact-by-sector.csv', { cache: true }).then(r =>
      r.data ? parseCSV(r.data) : null
    ),
  ]);

  return {
    nationalSummary,
    regionalSummary,
    impactByAsset,
    impactBySector,
  };
}

/**
 * Force refresh backend availability check
 */
export function refreshBackendCheck() {
  backendAvailable = null;
  checkingBackend = false;
}

/**
 * Get current backend status
 */
export function getBackendStatus() {
  return backendAvailable;
}
