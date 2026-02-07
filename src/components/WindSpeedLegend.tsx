"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Wind } from "lucide-react";

interface WindSpeedLegendProps {
  mapStyle: "loss" | "wind";
}

export function WindSpeedLegend({ mapStyle }: WindSpeedLegendProps) {
  const [collapsed, setCollapsed] = useState(false);
  
  if (mapStyle !== "wind") return null;

  // Actual wind speed scale from TC Lola wind layer (local_wind.nc)
  // Using THREDDS YlOrRd (Yellow-Orange-Red) scale: 0-65.74 m/s
  // This matches the actual WMS layer configuration
  const windCategories = [
    { speed: "0-4.7", category: "Calm to Light Air", color: "#FFFFCC", text: "#1e293b", kmh: "0-17", beaufort: "0-1" },
    { speed: "4.7-9.4", category: "Light Breeze", color: "#FFEDA0", text: "#1e293b", kmh: "17-34", beaufort: "2" },
    { speed: "9.4-14.1", category: "Gentle Breeze", color: "#FED976", text: "#1e293b", kmh: "34-51", beaufort: "3" },
    { speed: "14.1-18.8", category: "Moderate Breeze", color: "#FEB24C", text: "#1e293b", kmh: "51-68", beaufort: "4" },
    { speed: "18.8-23.6", category: "Fresh Breeze", color: "#FD8D3C", text: "#1e293b", kmh: "68-85", beaufort: "5" },
    { speed: "23.6-28.3", category: "Strong Breeze", color: "#FC6E4A", text: "#fff", kmh: "85-102", beaufort: "6" },
    { speed: "28.3-33.0", category: "Near Gale", color: "#FD5434", text: "#fff", kmh: "102-119", beaufort: "7" },
    { speed: "33.0-37.7", category: "Gale", color: "#FD3A1E", text: "#fff", kmh: "119-136", beaufort: "8" },
    { speed: "37.7-42.4", category: "Strong Gale", color: "#F92307", text: "#fff", kmh: "136-153", beaufort: "9" },
    { speed: "42.4-47.2", category: "Storm", color: "#E31A1C", text: "#fff", kmh: "153-170", beaufort: "10" },
    { speed: "47.2-51.9", category: "Violent Storm", color: "#CB181C", text: "#fff", kmh: "170-187", beaufort: "11" },
    { speed: "51.9-56.6", category: "Hurricane Cat 1-2", color: "#B3151B", text: "#fff", kmh: "187-204", beaufort: "12" },
    { speed: "56.6-61.3", category: "Hurricane Cat 3", color: "#99131A", text: "#fff", kmh: "204-221", beaufort: "12+" },
    { speed: "61.3-65.74", category: "Hurricane Cat 4-5", color: "#7F1019", text: "#fff", kmh: "221-237", beaufort: "12+" },
  ];

  return (
    <div className="absolute top-20 left-4 glass-panel p-3 max-w-xs z-[100]">
      <div 
        className="flex items-center justify-between mb-2 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-neon-cyan/20 to-neon-cyan/5 flex items-center justify-center text-neon-cyan">
            <Wind className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-semibold text-slate-100 tracking-wider">
            TC LOLA WIND SPEED
          </h3>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </div>
      {!collapsed && (
        <>
          <div className="space-y-1.5">
            {windCategories.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-2 group">
                <div
                  className="w-6 h-4 rounded border border-white/10 flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: cat.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-200 leading-tight">
                    {cat.category}
                  </div>
                  <div className="text-[10px] text-slate-300">
                    <span className="font-mono">{cat.speed}</span> m/s
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {cat.kmh} km/h (B{cat.beaufort})
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-borderGlow">
            <p className="text-[10px] text-slate-300 font-semibold">
              Actual THREDDS WMS Data
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">
              YlOrRd scale (0-65.74 m/s)
            </p>
            <p className="text-[9px] text-slate-400">
              Beaufort Scale + Saffir-Simpson
            </p>
          </div>
        </>
      )}
    </div>
  );
}

