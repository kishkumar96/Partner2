/**
 * Multi-Country Impact Data Demo Component
 *
 * This component demonstrates the new multi-country impact data loading capability.
 * Drop this into any page to test that all countries display economic damage and wind intensity.
 *
 * USAGE:
 * 1. Create a new route: /src/app/demo/page.tsx
 * 2. Import and render this component
 * 3. Navigate to /demo to see all 4 countries with impact data
 */

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CountryCode } from '@/types/thredds';

// Dynamically import MapView to avoid SSR issues
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Loading Multi-Country Map...</p>
      </div>
    </div>
  ),
});

export default function MultiCountryImpactDemo() {
  // Toggle between ALL countries (null) and specific country
  const [selectedCountry, setSelectedCountry] = useState<CountryCode | null>(null);
  const [mapStyle, setMapStyle] = useState<'loss' | 'wind'>('loss');

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Control Panel */}
      <div className="bg-slate-900 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">Multi-Country Impact Data Demo</h1>

          <div className="flex flex-wrap gap-4 items-center">
            {/* Country Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">View Mode</label>
              <select
                value={selectedCountry ?? 'ALL'}
                onChange={e =>
                  setSelectedCountry(
                    e.target.value === 'ALL' ? null : (e.target.value as CountryCode)
                  )
                }
                className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-600 hover:border-blue-500 transition-colors"
              >
                <option value="ALL">🌍 All Countries (Multi-Country Mode)</option>
                <option value="VU">🇻🇺 Vanuatu</option>
                <option value="WS">🇼🇸 Samoa</option>
                <option value="TO">🇹🇴 Tonga</option>
                <option value="CK">🇨🇰 Cook Islands</option>
              </select>
            </div>

            {/* Map Style Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Display Mode</label>
              <select
                value={mapStyle}
                onChange={e => setMapStyle(e.target.value as 'loss' | 'wind')}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-600 hover:border-blue-500 transition-colors"
              >
                <option value="loss">💰 Economic Damage</option>
                <option value="wind">💨 Wind Intensity</option>
              </select>
            </div>

            {/* Status Indicator */}
            <div className="flex-1">
              <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-600">
                <div className="text-sm">
                  <span className="text-slate-400">Current Mode:</span>{' '}
                  <span className="font-semibold text-blue-400">
                    {selectedCountry === null ? '🌐 ALL COUNTRIES' : `🏳️ ${selectedCountry}`}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {selectedCountry === null
                    ? 'Loading impact data for Vanuatu, Samoa, Tonga, and Cook Islands'
                    : `Loading impact data for ${selectedCountry} only`}
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-300">
              <strong>💡 Tip:</strong> Select "All Countries" to see the multi-country mode in
              action. All 4 countries should display colored regional overlays showing economic
              damage or wind intensity. Check your browser console for detailed loading logs.
            </p>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <MapView
          key={`demo-${selectedCountry}-${mapStyle}`}
          events={[]}
          hazards={[]}
          filters={{
            selectedEvents: [],
            selectedHazards: [],
            selectedSectors: [],
            dateRange: { start: '', end: '' },
            aggregationLevel: 'district',
          }}
          selectedCountry={selectedCountry}
          mapStyle={mapStyle}
        />

        {/* Overlay Legend */}
        <div className="absolute top-4 right-4 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 max-w-xs">
          <h3 className="font-semibold text-white mb-2">What to Look For:</h3>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>✅ Colored regional overlays on all countries</li>
            <li>✅ Darker colors = Higher impact</li>
            <li>✅ Click regions for detailed popups</li>
            <li>✅ Smooth pan/zoom interactions</li>
          </ul>

          <div className="mt-3 pt-3 border-t border-slate-700">
            <h4 className="font-semibold text-white text-sm mb-1">Expected Features:</h4>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• VU: ~107 regions</li>
              <li>• WS: ~45 regions</li>
              <li>• TO: ~23 regions</li>
              <li>• CK: ~15 regions</li>
              <li className="font-semibold text-blue-400">Total: ~190 regions</li>
            </ul>
          </div>
        </div>

        {/* Console Log Hint */}
        <div className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3">
          <p className="text-xs text-slate-400">
            📊 Open browser DevTools console to see detailed loading logs
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * HOW TO USE THIS DEMO:
 *
 * 1. Create /src/app/demo/page.tsx with:
 *
 *    import MultiCountryImpactDemo from '@/components/MultiCountryImpactDemo';
 *
 *    export default function DemoPage() {
 *      return <MultiCountryImpactDemo />;
 *    }
 *
 * 2. Navigate to http://localhost:3000/demo
 *
 * 3. Check console for these messages:
 *    🌐 [useRegionalImpactsData] Loading data for ALL countries...
 *    ✅ Loaded 107 regions for VU
 *    ✅ Loaded 45 regions for WS
 *    ✅ Loaded 23 regions for TO
 *    ✅ Loaded 15 regions for CK
 *    🎉 Combined 190 total regions from 4 countries
 *
 * 4. Verify all 4 countries show colored overlays
 *
 * 5. Click regions to see popups with:
 *    - Economic damage (Total_Loss)
 *    - Wind intensity (Max_Wind_Gusts)
 *    - Buildings damaged
 *    - Population affected
 *
 * TROUBLESHOOTING:
 *
 * - If only Vanuatu shows data:
 *   → Check that selectedCountry is actually null in console
 *   → Verify data files exist in public/samoa, public/tonga, public/cook-islands
 *
 * - If console shows errors:
 *   → Check network tab for failed requests
 *   → Verify file paths match COUNTRY_DATA_FILE_OVERRIDES
 *
 * - If performance is slow:
 *   → Check that loading is parallel (all 4 at once, not sequential)
 *   → Enable caching in next.config.ts
 */
