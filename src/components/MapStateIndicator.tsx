"use client";

// DEPRECATED: This component's functionality is now in UnifiedMapLegend
// Keeping for reference only - DO NOT USE

export default function MapStateIndicator() {
  // Component disabled - return null
  return null;
  
  /* ORIGINAL CODE DISABLED
  // Hide when not visible, when a panel is open, or when something is selected
  if (!visible || isPanelOpen || hasSelection) return null;

  return (
    <div className="absolute top-4 left-4 z-[10] glass-panel rounded-lg shadow-lg border border-white/10 max-w-xs pointer-events-auto">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
            Map Display
          </h3>
        </div>
        
        <div className="space-y-2 text-xs">
          <div>
            <span className="font-semibold text-slate-100">Metric:</span>
            <div className="text-slate-300 mt-0.5">
              {metric}
            </div>
            <div className="text-slate-400 text-xs mt-0.5 italic">
              {metricDescription}
            </div>
          </div>
          
          <div className="pt-2 border-t border-slate-700/60">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-400">Aggregation:</span>
                <div className="font-medium text-slate-100">{aggregation}</div>
              </div>
              <div>
                <span className="text-slate-400">Scope:</span>
                <div className="font-medium text-slate-100">{temporalScope}</div>
              </div>
            </div>
          </div>
          
          <div className="pt-2 border-t border-slate-700/60">
            <span className="text-slate-400">Data source:</span>
            <div className="font-medium text-slate-100">{dataSource}</div>
          </div>
        </div>
      </div>
    </div>
  );
  */
}
