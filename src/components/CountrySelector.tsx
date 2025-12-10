"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, MapPin, CheckCircle2 } from "lucide-react";
import { CountryDataset } from "@/types/riskscape";

interface CountrySelectorProps {
  countries: CountryDataset[];
  selectedCountry: CountryDataset;
  onCountryChange: (country: CountryDataset) => void;
}

export default function CountrySelector({
  countries,
  selectedCountry,
  onCountryChange,
}: CountrySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCountrySelect = useCallback((country: CountryDataset) => {
    onCountryChange(country);
    setIsOpen(false);
    setFocusedIndex(-1);
  }, [onCountryChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % countries.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + countries.length) % countries.length);
          break;
        case "Enter":
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < countries.length) {
            handleCountrySelect(countries[focusedIndex]);
          }
          break;
        case "Tab":
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex, countries, handleCountrySelect]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label="Select country"
        aria-expanded={isOpen}
      >
        <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <div className="text-left">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {selectedCountry.name}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 py-2">
              Pacific Island Nations
            </div>
            
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {countries.map((country, index) => {
                const isSelected = country.id === selectedCountry.id;
                const isFocused = index === focusedIndex;
                
                return (
                  <button
                    key={country.id}
                    onClick={() => handleCountrySelect(country)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700"
                        : isFocused
                        ? "bg-gray-100 dark:bg-gray-700"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    }`}
                    aria-label={`Select ${country.name} to view climate risk data`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${
                            isSelected
                              ? "text-blue-900 dark:text-blue-100"
                              : "text-gray-900 dark:text-white"
                          }`}>
                            {country.name}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {country.description}
                        </p>
                        
                        {/* Data availability badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {country.availableData.slr && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                              SLR
                            </span>
                          )}
                          {country.availableData.pdna && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
                              PDNA
                            </span>
                          )}
                          {country.availableData.sectors && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">
                              Sectors
                            </span>
                          )}
                          {country.availableData.regional && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                              Regional
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
