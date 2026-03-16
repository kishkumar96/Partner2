/**
 * Partner API Health Monitor Component
 * 
 * Displays real-time health status of Partner API endpoints for all countries.
 * Useful for admin/debug purposes to verify API connectivity.
 */

'use client';

import { useEffect, useState } from 'react';
import { checkPartnerApiHealth, checkCountryApiAvailability } from '@/services/partnerApiService';
import type { CountryApiAvailability } from '@/types/partnerApi';
import type { CountryCode } from '@/types/thredds';

const COUNTRY_NAMES: Record<CountryCode, string> = {
  VU: 'Vanuatu',
  WS: 'Samoa',
  TO: 'Tonga',
  CK: 'Cook Islands',
};

interface PartnerApiHealthMonitorProps {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  compact?: boolean;
}

export default function PartnerApiHealthMonitor({
  autoRefresh = false,
  refreshInterval = 60000, // 1 minute
  compact = false,
}: PartnerApiHealthMonitorProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<Record<CountryCode, CountryApiAvailability> | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await checkPartnerApiHealth();
      setHealthData(result.countries);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check API health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();

    if (autoRefresh) {
      const interval = setInterval(checkHealth, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  if (loading && !healthData) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-sm text-gray-600">Checking Partner API health...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-red-500">❌</span>
            <span className="text-sm text-red-700">Error: {error}</span>
          </div>
          <button
            onClick={checkHealth}
            className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!healthData) return null;

  const countryCodes: CountryCode[] = ['VU', 'WS', 'TO', 'CK'];
  const availableCountries = countryCodes.filter(code => healthData[code]?.available);

  if (compact) {
    return (
      <div className="inline-flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
        <div
          className={`h-2 w-2 rounded-full ${
            availableCountries.length > 0 ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="font-medium">Partner API:</span>
        <span className="text-gray-600">
          {availableCountries.length}/{countryCodes.length} countries
        </span>
        {lastChecked && (
          <span className="text-gray-400 text-xs">
            ({new Date().getTime() - lastChecked.getTime() < 60000 ? 'just now' : 'stale'})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-gray-900">Partner API Health</h3>
            <div
              className={`h-3 w-3 rounded-full ${
                availableCountries.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            />
          </div>
          <div className="flex items-center space-x-3">
            {lastChecked && (
              <span className="text-xs text-gray-500">
                Last checked: {lastChecked.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={checkHealth}
              disabled={loading}
              className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded transition-colors"
            >
              {loading ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Country Status */}
      <div className="p-4 space-y-4">
        {countryCodes.map(code => {
          const country = healthData[code];
          const isAvailable = country?.available || false;

          return (
            <div key={code} className="border border-gray-200 rounded-lg p-3">
              {/* Country Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{isAvailable ? '✅' : '❌'}</span>
                  <h4 className="font-medium text-gray-900">
                    {COUNTRY_NAMES[code]} ({code})
                  </h4>
                </div>
                {country?.countryId && (
                  <span className="text-xs text-gray-500 font-mono">ID: {country.countryId}</span>
                )}
              </div>

              {/* Endpoint Status */}
              {country && country.countryId && (
                <div className="ml-7 space-y-1">
                  {Object.entries(country.endpoints).map(([name, status]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <span>{status.available ? '✓' : '✗'}</span>
                        <span className={status.available ? 'text-gray-700' : 'text-gray-400'}>
                          {name.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {status.responseTime && (
                        <span className="text-xs text-gray-400">{status.responseTime.toFixed(0)}ms</span>
                      )}
                      {status.error && (
                        <span className="text-xs text-red-500">{status.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!country?.countryId && (
                <div className="ml-7 text-sm text-gray-500">
                  Country not found in Partner API database
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
        <strong>{availableCountries.length}</strong> of <strong>{countryCodes.length}</strong>{' '}
        countries have data available in Partner API
        {availableCountries.length > 0 && (
          <span className="ml-2">
            ({availableCountries.map(c => COUNTRY_NAMES[c]).join(', ')})
          </span>
        )}
      </div>
    </div>
  );
}
