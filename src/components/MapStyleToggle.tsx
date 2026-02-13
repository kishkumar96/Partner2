"use client";

import { DollarSign, Wind } from "lucide-react";

interface MapStyleToggleProps {
  onStyleChange: (style: "loss" | "wind") => void;
  currentStyle: "loss" | "wind";
}

export function MapStyleToggle({ onStyleChange, currentStyle }: MapStyleToggleProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[15] max-w-[calc(100vw-2rem)] pointer-events-auto">
      <div className="glass-panel rounded-xl px-3 py-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 text-center font-medium">
          Primary Focus • Wind always visible
        </div>
        <div className="flex gap-1.5 flex-wrap justify-center">
          <button
            onClick={() => onStyleChange("loss")}
            className={`
              px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap
              ${
                currentStyle === "loss"
                  ? "bg-neon-coral/20 text-neon-coral shadow-glowCoral border border-neon-coral/40"
                  : "text-slate-300 hover:text-slate-100 hover:bg-white/5"
              }
            `}
          >
            <span className="inline-flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" aria-hidden="true" />
              Economic Loss
            </span>
          </button>
          <button
            onClick={() => onStyleChange("wind")}
            className={`
              px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap
              ${
                currentStyle === "wind"
                  ? "bg-neon-cyan/20 text-neon-cyan shadow-glowCyan border border-neon-cyan/40"
                  : "text-slate-300 hover:text-slate-100 hover:bg-white/5"
              }
            `}
          >
            <span className="inline-flex items-center gap-1.5">
              <Wind className="w-4 h-4" aria-hidden="true" />
              Wind Hazard
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
