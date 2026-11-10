/**
 * Centralized Utilities Exports
 *
 * World-class utility functions for consistent patterns across the codebase
 */

// CSV Parsing
export { parseCSV, parseCSVToArray, validateCSV, type CSVParseOptions } from './csvParser';

// Data Loading
export {
  loadData,
  loadTextData,
  loadJSON,
  loadGeoJSON,
  loadMultiple,
  clearCache,
  getCacheStats,
  type DataLoaderOptions,
  type DataLoaderResult,
} from './dataLoader';

// Error Handling
export {
  createAppError,
  classifyError,
  logError,
  handleError,
  isRetryableError,
  safeAsync,
  createErrorHandler,
  aggregateErrors,
  ErrorSeverity,
  ErrorCategory,
  type AppError,
} from './errorHandling';

// Style Constants
export {
  POSITION_PRESETS,
  Z_INDEX,
  GLASS_PANEL,
  CARD_STYLES,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  RESPONSIVE_WIDTH,
  RESPONSIVE_HEIGHT,
  SPINNER,
  TEXT_STYLES,
  cn,
  glassPanel,
  button,
  spinner,
} from './styleConstants';

// Real Data Loading (uses the above utilities)
export {
  loadCycloneTrackData,
  loadRegionalImpacts,
  loadRegionalImpactsBySector,
  loadExposureByCluster,
  loadNationalSummary,
  loadImpactByAssetType,
  loadImpactBySector,
  loadRegionalSummary,
  loadRegionalSummaryBySector,
  loadDamagedBuildings,
  loadDamagedRoads,
  loadAllRealData,
  convertRegionalImpactsToEvents,
  convertRegionalImpactsBySectorToEvents,
  processWindIntensityData,
} from './realDataLoader';

// Cyclone Animation (uses the above utilities)
export {
  loadCycloneForecastTrack,
  getCategoryColor,
  getCategoryLabel,
  type CycloneForecastPoint,
} from './cycloneAnimationLoader';
