"use client";

import { GlassStatCard } from "./GlassStatCard";
import { BarChart3, Building2, Home, Layers, TrendingUp, Users, Heart, School } from "lucide-react";

interface StatsGridProps {
  totalEconomicDamage: number;
  buildingsExposed: number;
  buildingsDamaged: number;
  populationAffected: number;
  infrastructureItems: number;
  eventCount: number;
  assetStats?: {
    healthFacilities?: number;
    schools?: number;
    evacuationCenters?: number;
  };
}

export function StatsGrid({
  totalEconomicDamage,
  buildingsExposed,
  buildingsDamaged,
  populationAffected,
  infrastructureItems,
  eventCount,
  assetStats,
}: StatsGridProps) {
  return (
    <div className="space-y-3">
      {/* Section Label: Impact */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border-l-4 border-blue-500 rounded">
        <BarChart3 className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wide text-blue-300">
          Impact (Modelled)
        </span>
      </div>

      {/* Primary hero card - Subdued styling for consistency */}
      <div className="glass-panel rounded-xl p-3 border border-slate-700/50 transition-all duration-200 hover:bg-slate-800/80">
        <GlassStatCard
          title="Total Economic Damage"
          value={totalEconomicDamage}
          subtitle={`${eventCount} events • ${populationAffected.toLocaleString()} affected`}
          badge="HIGH IMPACT"
          severity="danger"
          icon={<TrendingUp className="h-4 w-4 text-red-400" />}
          metricInfo={{
            unit: "USD (millions)",
            temporalScope: "Cumulative event total",
            methodology: "Modelled using sector exposure × wind vulnerability curves (PDIE system)",
            classification: "Impact"
          }}
        />
      </div>

      {/* Section Label: Exposure */}
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border-l-4 border-orange-500 rounded mt-4">
        <Home className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wide text-orange-400">
          Exposure
        </span>
      </div>

      {/* Grid of secondary metrics */}
      <div className="grid grid-cols-1 gap-3">
        <div className="glass-panel rounded-xl p-3 border border-slate-700/50 hover:bg-slate-800/80 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Buildings Exposed
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-400 tabular-nums">
            {buildingsExposed.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3 border border-slate-700/50 hover:bg-slate-800/80 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-red-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Buildings Damaged
            </p>
          </div>
          <p className="text-2xl font-bold text-red-400 tabular-nums">
            {buildingsDamaged.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3 border border-slate-700/50 hover:bg-slate-800/80 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Population
            </p>
          </div>
          <p className="text-2xl font-bold text-blue-400 tabular-nums">
            {populationAffected.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3 border border-slate-700/50 hover:bg-slate-800/80 transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Infrastructure
            </p>
          </div>
          <p className="text-2xl font-bold text-cyan-400 tabular-nums">
            {infrastructureItems.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Critical Infrastructure breakdown - only show if asset data available */}
      {assetStats && (
        <div className="glass-panel rounded-xl p-3 border border-slate-700/50 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Critical Infrastructure Exposed
            </h3>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {assetStats.healthFacilities !== undefined && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
                <Heart className="h-4 w-4 text-red-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-400 tabular-nums">
                  {assetStats.healthFacilities}
                </p>
                <p className="text-xs text-slate-400 uppercase tracking-wide mt-1">
                  Health
                </p>
              </div>
            )}
            
            {assetStats.schools !== undefined && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
                <School className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-blue-400 tabular-nums">
                  {assetStats.schools}
                </p>
                <p className="text-xs text-slate-400 uppercase tracking-wide mt-1">
                  Schools
                </p>
              </div>
            )}
            
            {assetStats.evacuationCenters !== undefined && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
                <Home className="h-4 w-4 text-green-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-green-400 tabular-nums">
                  {assetStats.evacuationCenters}
                </p>
                <p className="text-xs text-slate-400 uppercase tracking-wide mt-1">
                  Shelters
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
