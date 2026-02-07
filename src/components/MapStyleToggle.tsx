"use client";

import { useState } from "react";

interface MapStyleToggleProps {
  onStyleChange: (style: "loss" | "wind") => void;
  currentStyle: "loss" | "wind";
}

export function MapStyleToggle({ onStyleChange, currentStyle }: MapStyleToggleProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <div className="glass-panel rounded-xl px-1 py-1 flex gap-1">
        <button
          onClick={() => onStyleChange("loss")}
          className={`
            px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
            ${
              currentStyle === "loss"
                ? "bg-neon-coral/20 text-neon-coral shadow-glowCoral border border-neon-coral/40"
                : "text-slate-300 hover:text-slate-100 hover:bg-white/5"
            }
          `}
        >
          💰 Economic Loss
        </button>
        <button
          onClick={() => onStyleChange("wind")}
          className={`
            px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
            ${
              currentStyle === "wind"
                ? "bg-neon-cyan/20 text-neon-cyan shadow-glowCyan border border-neon-cyan/40"
                : "text-slate-300 hover:text-slate-100 hover:bg-white/5"
            }
          `}
        >
          🌪️ Wind Speed
        </button>
      </div>
    </div>
  );
}
