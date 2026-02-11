"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info, DollarSign, Wind } from "lucide-react";

interface MapHUDProps {
  mapStyle: "loss" | "wind";
  dataSource: string;
  temporalScope: string;
  visible?: boolean;
  isPanelOpen?: boolean;
  hasSelection?: boolean;
}

export default function MapHUD({
  mapStyle,
  dataSource,
  temporalScope,
  visible = true,
  isPanelOpen = false,
  hasSelection = false,
}: MapHUDProps) {
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // Hide HUD when panel is open or something is selected
  if (!visible || isPanelOpen || hasSelection) return null;

  const legendConfig = mapStyle === "loss" 
    ? {
        title: "Economic Loss",
        icon: DollarSign,
        iconColor: "text-green-500",
        classes: [
          { label: "> $50M", color: "bg-red-700" },
          { label: "$20M - $50M", color: "bg-red-500" },
          { label: "$10M - $20M", color: "bg-orange-500" },
          { label: "$5M - $10M", color: "bg-yellow-500" },
          { label: "$1M - $5M", color: "bg-yellow-300" },
          { label: "< $1M", color: "bg-green-200" },
        ],
      }
    : {
        title: "Wind Speed",
        icon: Wind,
        iconColor: "text-blue-500",
        classes: [
          { label: "> 200 km/h", color: "bg-purple-700" },
          { label: "165-200", color: "bg-red-600" },
          { label: "140-165", color: "bg-orange-500" },
          { label: "120-140", color: "bg-yellow-500" },
          { label: "100-120", color: "bg-yellow-300" },
          { label: "63-100", color: "bg-blue-300" },
          { label: "< 63", color: "bg-slate-200" },
        ],
      };

  const IconComponent = legendConfig.icon;

  return (
    <div className="absolute top-4 right-4 z-[10] glass-panel rounded-lg shadow-lg w-64 max-w-[calc(100vw-2rem)] pointer-events-auto">
      {/* Data Source & Temporal Scope */}
      <div className="px-3 py-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2 mb-1.5">
          <Info className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Map Display
          </span>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Source:</span>
            <span className="font-medium text-slate-100">{dataSource}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Scope:</span>
            <span className="font-medium text-slate-100">{temporalScope}</span>
          </div>
        </div>
      </div>

      {/* Legend - Collapsible */}
      <div className="px-3 py-2">
        <div 
          className="flex items-center justify-between cursor-pointer mb-2"
          onClick={() => setLegendCollapsed(!legendCollapsed)}
        >
          <div className="flex items-center gap-2">
            <IconComponent className={`w-4 h-4 ${legendConfig.iconColor}`} />
            <span className="text-xs font-semibold text-slate-100">
              {legendConfig.title}
            </span>
          </div>
          {legendCollapsed ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          )}
        </div>

        {!legendCollapsed && (
          <div className="space-y-1">
            {legendConfig.classes.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className={`w-6 h-3 rounded shadow-sm ${item.color}`}
                />
                <span className="text-xs font-mono text-slate-300">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
