"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";

interface MetricTooltipProps {
  unit: string;
  temporalScope: string;
  methodology: string;
  classification?: string; // e.g., "Hazard", "Exposure", "Impact"
}

export default function MetricTooltip({
  unit,
  temporalScope,
  methodology,
  classification,
}: MetricTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const classificationColors = {
    Hazard: "text-red-300 bg-red-500/20",
    Exposure: "text-orange-300 bg-orange-500/20",
    Impact: "text-blue-300 bg-blue-500/20",
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className="text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Show metric information"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-50">
          <div className="glass-panel rounded-lg shadow-xl p-3">
            <div className="space-y-2 text-xs">
              {classification && (
                <div className="flex items-center gap-2 pb-2 border-b border-slate-700/60">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${classificationColors[classification as keyof typeof classificationColors]}`}>
                    {classification}
                  </span>
                </div>
              )}
              
              <div>
                <span className="font-semibold text-slate-100">Unit:</span>
                <div className="text-slate-300 mt-0.5">{unit}</div>
              </div>

              <div>
                <span className="font-semibold text-slate-100">Temporal Scope:</span>
                <div className="text-slate-300 mt-0.5">{temporalScope}</div>
              </div>

              <div>
                <span className="font-semibold text-slate-100">Methodology:</span>
                <div className="text-slate-300 mt-0.5 leading-relaxed">{methodology}</div>
              </div>
            </div>

            {/* Arrow pointing down */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="border-8 border-transparent border-t-slate-900/90"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
