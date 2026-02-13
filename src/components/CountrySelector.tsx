"use client";

import { CountryCode, COUNTRIES } from "@/types/thredds";
import { Globe2, Info, Lightbulb } from "lucide-react";

interface CountrySelectorProps {
  selectedCountry: CountryCode | null;
  onCountryChange: (country: CountryCode | null) => void;
}

export default function CountrySelector({
  selectedCountry,
  onCountryChange,
}: CountrySelectorProps) {
  // Note: Data source toggle has been moved to main header for better UX
  // This component now focuses solely on country selection
  
  return (
    <div className="glass-panel rounded-lg p-4 shadow-lg max-w-[min(24rem,calc(100vw-4rem))]">
      <div className="space-y-4">
        {/* Country Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Select Country
          </label>
          <p className="text-xs text-slate-400 mb-3">
            Choose a country to view specific hazard data and cyclone impacts
          </p>
          <div className="space-y-2">
            <button
              onClick={() => onCountryChange(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCountry === null
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "bg-slate-800/70 text-slate-200 border border-slate-700/60 hover:bg-slate-700/70"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Globe2 className="w-4 h-4" aria-hidden="true" />
                All Countries
              </span>
            </button>
            {Object.values(COUNTRIES).map((country) => (
              <button
                key={country.code}
                onClick={() => onCountryChange(country.code)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCountry === country.code
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "bg-slate-800/70 text-slate-200 border border-slate-700/60 hover:bg-slate-700/70"
                }`}
              >
                <div className="font-medium">{country.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {country.fullName}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Info Section */}
        {selectedCountry && (
          <div className="pt-3 border-t border-slate-700/60">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-200 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-blue-200">
                    Data Source
                  </p>
                  <p className="text-xs text-blue-300 mt-1">
                    Loading hazard layers and cyclone tracks from THREDDS server
                    for {COUNTRIES[selectedCountry].name}
                  </p>
                  <p className="text-xs text-blue-300 mt-2 italic">
                    Check browser console for loading status and URLs
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Status Info - Show helper when no country selected */}
        {!selectedCountry && (
          <div className="pt-3 border-t border-slate-700/60">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-200 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-200">
                    Select a Country
                  </p>
                  <p className="text-xs text-amber-300 mt-1">
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
