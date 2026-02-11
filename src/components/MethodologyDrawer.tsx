"use client";

import { X, AlertCircle, Database, TrendingUp } from "lucide-react";
import { useEffect } from "react";

interface MethodologyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MethodologyDrawer({ isOpen, onClose }: MethodologyDrawerProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div 
        className="fixed right-0 top-0 h-full max-h-screen w-full md:w-[600px] lg:w-[700px] max-w-[95vw] glass-panel border-l border-white/10 shadow-2xl z-[60] overflow-y-auto transform transition-transform"
        role="dialog"
        aria-labelledby="methodology-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white px-6 py-4 flex items-center justify-between shadow-lg z-[61]">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
            <h2 id="methodology-title" className="text-xl font-bold">
              Methodology & Definitions
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Close methodology drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Data Sources Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-blue-400" aria-hidden="true" />
              <h3 className="text-lg font-bold text-slate-100">
                Data Sources & Timestamps
              </h3>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-100 mb-1">
                  Event Data
                </p>
                <p className="text-sm text-slate-300">
                  Cyclone Lola (October 2023) - Track data from Vanuatu Meteorological Service, 
                  wind field analysis from TC Lola Best Track bulletin
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 mb-1">
                  Exposure Data
                </p>
                <p className="text-sm text-slate-300">
                  Population: WorldPop 2023 (100m resolution), Buildings: OpenStreetMap extract (October 2023), 
                  Infrastructure: Vanuatu Ministry of Infrastructure spatial database
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 mb-1">
                  Last Updated
                </p>
                <p className="text-sm text-slate-300">
                  February 7, 2026 14:30 UTC
                </p>
              </div>
            </div>
          </section>

          {/* Risk Classification Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-red-400" aria-hidden="true" />
              <h3 className="text-lg font-bold text-slate-100">
                Risk & Exposure Classifications
              </h3>
            </div>
            
            {/* High Risk Definition */}
            <div className="space-y-4">
              <div className="border border-slate-700/60 rounded-lg p-4 bg-slate-800/60">
                <h4 className="text-base font-bold text-slate-100 mb-2">
                  "High Risk" Definition
                </h4>
                <p className="text-sm text-slate-300 mb-3">
                  Districts classified as "High Risk" meet at least one of the following criteria:
                </p>
                <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside ml-2">
                  <li><strong>Affected Population:</strong> &gt;5,000 people exposed to wind speeds ≥120 km/h</li>
                  <li><strong>Economic Damage:</strong> Modelled losses &gt;$5M USD</li>
                  <li><strong>Building Damage:</strong> &gt;500 structures with damage state D3+ (moderate-severe)</li>
                  <li><strong>Critical Infrastructure:</strong> ≥3 critical assets (hospitals, schools, evacuation centers) exposed</li>
                </ul>
              </div>

              {/* Wind Exposure Thresholds */}
              <div className="border border-slate-700/60 rounded-lg p-4 bg-slate-800/60">
                <h4 className="text-base font-bold text-slate-100 mb-3">
                  Wind Exposure Level Thresholds
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 px-3 bg-red-500/15 rounded border-l-4 border-red-500">
                    <span className="text-sm font-semibold text-slate-100">Extreme</span>
                    <span className="text-sm font-mono text-slate-300">&gt;200 km/h (Cat 5)</span>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 bg-orange-500/15 rounded border-l-4 border-orange-500">
                    <span className="text-sm font-semibold text-slate-100">High</span>
                    <span className="text-sm font-mono text-slate-300">165-200 km/h (Cat 4)</span>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 bg-yellow-500/15 rounded border-l-4 border-yellow-500">
                    <span className="text-sm font-semibold text-slate-100">Moderate</span>
                    <span className="text-sm font-mono text-slate-300">120-165 km/h (Cat 3)</span>
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 bg-green-500/15 rounded border-l-4 border-green-500">
                    <span className="text-sm font-semibold text-slate-100">Low</span>
                    <span className="text-sm font-mono text-slate-300">&lt;120 km/h (Cat 1-2)</span>
                  </div>
                </div>
              </div>

              {/* Affected Population Method */}
              <div className="border border-slate-700/60 rounded-lg p-4 bg-slate-800/60">
                <h4 className="text-base font-bold text-slate-100 mb-2">
                  "Affected Population" Methodology
                </h4>
                <p className="text-sm text-slate-300 mb-2">
                  Calculated by intersecting wind speed footprint with population raster (WorldPop 100m):
                </p>
                <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside ml-2">
                  <li>Raster cells within wind hazard polygons identified</li>
                  <li>Population values aggregated by district boundary</li>
                  <li>Threshold: Population exposed to winds ≥63 km/h (TS force)</li>
                  <li>Direct exposure only - does not include displaced/evacuated persons</li>
                </ul>
              </div>

              {/* Economic Damage Method */}
              <div className="border border-slate-700/60 rounded-lg p-4 bg-slate-800/60">
                <h4 className="text-base font-bold text-slate-100 mb-2">
                  "Economic Damage" Methodology
                </h4>
                <p className="text-sm text-slate-300 mb-2">
                  Direct physical damage only (replacement cost), calculated per asset type:
                </p>
                <div className="text-sm text-slate-300 space-y-2 ml-2">
                  <p><strong>Buildings:</strong> Damage functions by construction type × wind speed, unit costs from Vanuatu National Statistics Office</p>
                  <p><strong>Roads:</strong> Length of damaged segments × repair cost per km ($150k-$400k by road class)</p>
                  <p><strong>Agriculture:</strong> Crop loss estimates (coconut, copra, kava) based on wind exposure and growth stage</p>
                  <p><strong>Infrastructure:</strong> Damage state assessment × replacement value from asset registry</p>
                  <p className="mt-3 pt-2 border-t border-slate-700/60">
                    <strong>Not included:</strong> Indirect losses (business interruption, lost wages), reconstruction inflation, cascading impacts
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Confidence & Limitations */}
          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-4">
              Confidence & Limitations
            </h3>
            <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-4 space-y-2">
              <p className="text-sm text-slate-200">
                <strong>Model Uncertainty:</strong> Economic damage estimates have ±30% uncertainty due to variable construction quality and incomplete asset valuation data.
              </p>
              <p className="text-sm text-slate-200">
                <strong>Coverage:</strong> 98% of districts have complete exposure data. Remote islands may have outdated building footprints.
              </p>
              <p className="text-sm text-slate-200">
                <strong>Scenario Spread:</strong> Best/Forecast/Worst scenarios represent 10th/50th/90th percentile outcomes from ensemble model runs.
              </p>
            </div>
          </section>

          {/* Contact Info */}
          <section className="pt-4 border-t border-slate-700/60">
            <p className="text-xs text-slate-400">
              For methodology questions or data access requests, contact: 
              <a href="mailto:data@vanuatu-disaster-risk.gov.vu" className="text-blue-300 hover:underline ml-1">
                data@vanuatu-disaster-risk.gov.vu
              </a>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
