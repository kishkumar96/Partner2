"use client";

import { CountryCode, COUNTRIES } from "@/types/thredds";
import { Globe } from "lucide-react";

interface CountrySelectorProps {
  selectedCountry: CountryCode | null;
  onCountryChange: (country: CountryCode | null) => void;
  useRealData: boolean;
  onDataSourceToggle: (useReal: boolean) => void;
}

export default function CountrySelector({
  selectedCountry,
  onCountryChange,
  useRealData,
  onDataSourceToggle,
}: CountrySelectorProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-lg">
      <div className="space-y-4">
        {/* Data Source Toggle */}
        <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Use Real Data
              </span>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={useRealData}
                onChange={(e) => onDataSourceToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </div>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {useRealData
              ? "Loading data from THREDDS server"
              : "Using mock demonstration data"}
          </p>
        </div>

        {/* Country Selection - Only shown when using real data */}
        {useRealData && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Country
            </label>
            <div className="space-y-2">
              <button
                onClick={() => onCountryChange(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCountry === null
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-500"
                    : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                🌍 All Countries
              </button>
              {Object.values(COUNTRIES).map((country) => (
                <button
                  key={country.code}
                  onClick={() => onCountryChange(country.code)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedCountry === country.code
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-500"
                      : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <div className="font-medium">{country.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {country.fullName}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Info Section */}
        {useRealData && selectedCountry && (
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">ℹ️</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                    Data Source
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Loading hazard layers and cyclone tracks from THREDDS server
                    for {COUNTRIES[selectedCountry].name}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 italic">
                    Check browser console for loading status and URLs
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Status Info */}
        {useRealData && !selectedCountry && (
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    Select a Country
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Choose a Pacific Island country to load real hazard data from the THREDDS server
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
