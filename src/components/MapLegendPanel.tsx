"use client";

import { useMemo, useState } from "react";
import { DollarSign, Wind, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/utils/formatters";

// DEPRECATED: This component is replaced by UnifiedMapLegend
// Keeping for reference only - DO NOT USE

interface MapLegendPanelProps {
  mode: "loss" | "wind";
  visible?: boolean;
  isPanelOpen?: boolean;
  hasSelection?: boolean;
}

export default function MapLegendPanel({ mode, visible = true, isPanelOpen = false, hasSelection = false }: MapLegendPanelProps) {
  // Component disabled - return null
  return null;
  const [isExpanded, setIsExpanded] = useState(false);

  // Hide completely when not visible or when something is selected
  if (!visible || hasSelection) return null;

  const legendConfig = useMemo(() => {
    if (mode === "loss") {
      return {
        title: "Economic Loss (USD)",
        subtitle: "District aggregated modelled loss",
        icon: DollarSign,
        iconColor: "text-green-600 dark:text-green-400",
        classes: [
          { label: "> $50M", color: "bg-red-700", textColor: "text-slate-900 dark:text-white", range: "Catastrophic" },
          { label: "$20M - $50M", color: "bg-red-500", textColor: "text-slate-900 dark:text-white", range: "Severe" },
          { label: "$10M - $20M", color: "bg-orange-500", textColor: "text-slate-900 dark:text-white", range: "High" },
          { label: "$5M - $10M", color: "bg-yellow-500", textColor: "text-slate-900 dark:text-white", range: "Moderate" },
          { label: "$1M - $5M", color: "bg-yellow-300", textColor: "text-slate-900 dark:text-white", range: "Low" },
          { label: "< $1M", color: "bg-green-200", textColor: "text-slate-900 dark:text-white", range: "Minimal" },
        ],
      };
    } else {
      return {
        title: "Peak Wind Speed (km/h)",
        subtitle: "Maximum sustained wind speed per district",
        icon: Wind,
        iconColor: "text-blue-600 dark:text-blue-400",
        classes: [
          { label: "> 200", color: "bg-purple-700", textColor: "text-white", range: "Cat 5 - Extreme" },
          { label: "180-200", color: "bg-red-600", textColor: "text-white", range: "Cat 4 - Major" },
          { label: "165-180", color: "bg-red-500", textColor: "text-white", range: "Cat 4" },
          { label: "140-165", color: "bg-orange-500", textColor: "text-slate-900 dark:text-white", range: "Cat 3 - Severe" },
          { label: "120-140", color: "bg-yellow-500", textColor: "text-slate-900 dark:text-white", range: "Cat 3" },
          { label: "100-120", color: "bg-yellow-300", textColor: "text-slate-900 dark:text-white", range: "Cat 2 - Moderate" },
          { label: "63-100", color: "bg-blue-300", textColor: "text-slate-900 dark:text-white", range: "Cat 1 / TS" },
          { label: "< 63", color: "bg-slate-200 dark:bg-slate-700", textColor: "text-slate-900 dark:text-white", range: "Below TS" },
        ],
      };
    }
  }, [mode]);

  const IconComponent = legendConfig.icon;

  return (
    <div className={`fixed bottom-8 left-8 z-10 transition-all duration-300 ease-in-out ${isExpanded ? 'w-80' : 'w-12'}`}>
      {/* Collapsible drawer */}
      <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-lg shadow-2xl overflow-hidden">
        {/* Toggle button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
          aria-label={isExpanded ? "Collapse legend" : "Expand legend"}
        >
          <div className="flex items-center gap-2">
            <IconComponent className={`w-4 h-4 ${legendConfig.iconColor}`} aria-hidden="true" />
            {isExpanded && (
              <span className="text-sm font-semibold text-white">Legend</span>
            )}
          </div>
          {isExpanded ? (
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-slate-700/50">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-800/30">
              <h3 className="text-sm font-bold text-white mb-1">
                {legendConfig.title}
              </h3>
              <p className="text-xs text-slate-400">
                {legendConfig.subtitle}
              </p>
            </div>

            {/* Legend Items with 8px spacing */}
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {legendConfig.classes.map((item, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-3 p-2 rounded hover:bg-slate-800/30 transition-colors"
                >
                  {/* Color Swatch */}
                  <div 
                    className={`w-8 h-5 rounded shadow-sm ring-1 ring-black/20 flex-shrink-0 ${item.color}`}
                    aria-hidden="true"
                  />
                  
                  {/* Labels with improved typography */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold font-mono text-white">
                        {item.label}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {item.range}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer with 8px padding */}
            <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
              <p className="text-xs text-slate-500">
                {mode === "loss" 
                  ? "Direct physical damage replacement costs" 
                  : "10-minute sustained wind speed values"
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
