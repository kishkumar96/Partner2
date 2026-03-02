'use client';

import { CountryCode, COUNTRIES } from '@/types/thredds';
import { Info } from 'lucide-react';

interface CountrySelectorProps {
  selectedCountry: CountryCode;
  onCountryChange: (country: CountryCode) => void;
}

export default function CountrySelector({
  selectedCountry,
  onCountryChange,
}: CountrySelectorProps) {
  return (
    <div className="glass-panel rounded-lg p-4 shadow-lg max-w-[min(24rem,calc(100vw-4rem))]">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Select Country</label>
          <p className="text-xs text-slate-400 mb-3">
            Choose a country to view specific hazard data and cyclone impacts
          </p>
          <div className="space-y-2">
            {Object.values(COUNTRIES).map(country => (
              <button
                key={country.code}
                onClick={() => onCountryChange(country.code)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCountry === country.code
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-slate-800/70 text-slate-200 border border-slate-700/60 hover:bg-slate-700/70'
                }`}
              >
                <div className="font-medium">{country.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{country.fullName}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-700/60">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-200 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-200">Data Source</p>
                <p className="text-xs text-blue-300 mt-1">
                  Loading hazard layers and cyclone tracks from THREDDS server for{' '}
                  {COUNTRIES[selectedCountry].name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
