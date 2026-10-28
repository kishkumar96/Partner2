/**
 * Example Component Migration
 * 
 * This demonstrates how to refactor an existing component to use the new unified utilities
 */

// ============================================================================
// BEFORE: Old approach with duplicated code
// ============================================================================

// Old Component (MapHUD.tsx) - BEFORE
/*
export default function MapHUD() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/data.json');
        if (!response.ok) {
          console.error('Failed to load data');
          return;
        }
        const json = await response.json();
        setData(json);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    }
    fetchData();
  }, []);
  
  return (
    <div className="absolute top-4 right-4 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-w-[calc(100vw-2rem)]">
      {data ? (
        <div>Content here</div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
          Loading...
        </div>
      )}
    </div>
  );
}
*/

// ============================================================================
// AFTER: Modern approach with unified utilities
// ============================================================================

import { useState, useEffect } from 'react';
import { loadJSON, glassPanel, spinner } from '@/utils';

export default function MapHUD() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // Unified data loader with retry logic and caching
      const { data: result, error } = await loadJSON('/api/data.json', {
        retries: 2,
        cache: true,
        timeout: 10000
      });
      
      if (result) {
        setData(result);
      }
      // Error is automatically logged by the loader
      
      setLoading(false);
    }
    fetchData();
  }, []);
  
  return (
    <div className={glassPanel({ 
      position: 'topRight',
      zIndex: 'overlay',
      responsive: 'mapControl'
    })}>
      {loading ? (
        <div className="flex items-center gap-2">
          <div className={spinner('sm')} />
          Loading...
        </div>
      ) : data ? (
        <div>Content here</div>
      ) : (
        <div>Failed to load</div>
      )}
    </div>
  );
}

// ============================================================================
// Benefits of the new approach:
// ============================================================================

/**
 * 1. CODE REDUCTION
 *    - Before: 20+ lines of fetch/error handling
 *    - After: 5 lines with loadJSON
 *    - Savings: ~75% less boilerplate
 * 
 * 2. FEATURES ADDED
 *    - ✅ Automatic retry on failure (2 attempts)
 *    - ✅ Caching (subsequent calls use cache)
 *    - ✅ Timeout protection (10 second limit)
 *    - ✅ Consistent error logging
 *    - ✅ Type safety with TypeScript
 * 
 * 3. MAINTAINABILITY
 *    - Style changes: Update one constant vs 30+ components
 *    - Loading logic: Fix once in dataLoader vs everywhere
 *    - Error handling: Consistent pattern across app
 * 
 * 4. PERFORMANCE
 *    - Caching prevents redundant API calls
 *    - Timeout prevents hanging requests
 *    - Smaller bundle (shared utilities)
 * 
 * 5. TESTING
 *    - Mock loadJSON in tests vs mocking fetch everywhere
 *    - Test spinner() once vs testing 30+ spinner implementations
 *    - Centralized utilities easier to unit test
 */

// ============================================================================
// CSV Parsing Example
// ============================================================================

// BEFORE: Manual CSV parsing with bugs
/*
function parseSectorData(csvText: string) {
  const lines = csvText.split('\n'); // ❌ Doesn't handle \r\n
  const headers = lines[0].split(','); // ❌ Breaks on quoted commas
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(','); // ❌ Breaks on quoted commas
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]; // ❌ No type conversion
    });
    rows.push(row);
  }
  
  return rows;
}
*/

// AFTER: Robust CSV parsing
import { parseCSV, validateCSV } from '@/utils';

function parseSectorData(csvText: string) {
  // Validate first
  const validation = validateCSV(csvText);
  if (!validation.valid) {
    console.error('Invalid CSV:', validation.errors);
    return [];
  }
  
  // Parse with proper options
  return parseCSV(csvText, {
    inferTypes: true,      // ✅ Auto-convert numbers
    trimValues: true,      // ✅ Remove whitespace
    skipEmptyRows: true,   // ✅ Ignore blank lines
    convertNaN: true       // ✅ NaN → null
  });
}

// ============================================================================
// Style Composition Example
// ============================================================================

// BEFORE: Long, repeated class strings
/*
<button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
  Submit
</button>

<button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
  Submit Large
</button>

<button className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-900 text-sm rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
  Cancel
</button>
*/

// AFTER: Reusable button utility
import { button, cn } from '@/utils';

function FormButtons() {
  return (
    <>
      <button className={button({ variant: 'primary', size: 'md' })}>
        Submit
      </button>
      
      <button className={button({ variant: 'primary', size: 'lg' })}>
        Submit Large
      </button>
      
      <button className={button({ variant: 'secondary', size: 'sm' })}>
        Cancel
      </button>
      
      {/* Add custom classes easily */}
      <button className={cn(
        button({ variant: 'primary', size: 'md' }),
        'mt-4',
        'custom-animation'
      )}>
        Custom Button
      </button>
    </>
  );
}

// ============================================================================
// Performance Comparison
// ============================================================================

/**
 * NETWORK REQUESTS WITHOUT CACHING:
 * - Component A fetches /regional-summary.csv
 * - Component B fetches /regional-summary.csv (again!)
 * - Component C fetches /regional-summary.csv (again!!)
 * Total: 3 network requests for identical data
 * 
 * WITH CACHING:
 * - Component A: loadTextData('/regional-summary.csv', { cache: true })
 * - Component B: Instant return from cache ⚡
 * - Component C: Instant return from cache ⚡
 * Total: 1 network request, 2 cache hits
 * 
 * Result: 3x faster, less bandwidth, better UX
 */

// ============================================================================
// Migration Checklist
// ============================================================================

/**
 * □ Replace manual CSV parsing with parseCSV
 * □ Replace fetch() calls with loadJSON/loadTextData/loadGeoJSON
 * □ Replace repeated class strings with style constants
 * □ Replace inline spinners with spinner() utility
 * □ Add retry logic to critical data fetching
 * □ Enable caching for frequently accessed data
 * □ Use glassPanel() for overlay components
 * □ Use button() for all button components
 * □ Update imports to use @/utils barrel export
 * □ Remove duplicate utility functions
 * □ Add TypeScript types from @/utils
 * □ Test error handling with new utilities
 */
