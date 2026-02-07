"use client";

import { GlassStatCard } from "./GlassStatCard";
import { Building2, Users, Layers, TrendingUp, Heart, School, Home } from "lucide-react";

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
      {/* Primary hero card */}
      <GlassStatCard
        title="Total Economic Damage"
        value={totalEconomicDamage}
        subtitle={`${eventCount} events • ${populationAffected.toLocaleString()} affected`}
        badge="HIGH IMPACT"
        glow="coral"
        icon={<TrendingUp className="h-4 w-4 text-neon-coral" />}
      />

      {/* Grid of secondary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-panel rounded-xl p-3 hover:bg-surface-strong transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-neon-amber" />
            <p className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
              Buildings Exposed
            </p>
          </div>
          <p className="text-2xl font-bold text-neon-amber tabular-nums">
            {buildingsExposed.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3 hover:bg-surface-strong transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-neon-coral" />
            <p className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
              Buildings Damaged
            </p>
          </div>
          <p className="text-2xl font-bold text-neon-coral tabular-nums">
            {buildingsDamaged.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3 hover:bg-surface-strong transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-neon-purple" />
            <p className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
              Population
            </p>
          </div>
          <p className="text-2xl font-bold text-neon-purple tabular-nums">
            {populationAffected.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3 hover:bg-surface-strong transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-neon-cyan" />
            <p className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
              Infrastructure
            </p>
          </div>
          <p className="text-2xl font-bold text-neon-cyan tabular-nums">
            {infrastructureItems.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Critical Infrastructure breakdown - only show if asset data available */}
      {assetStats && (
        <div className="glass-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-neon-cyan" />
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Critical Infrastructure Exposed
            </h3>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {assetStats.healthFacilities !== undefined && (
              <div className="bg-surface-strong rounded-lg p-3 text-center">
                <Heart className="h-5 w-5 text-red-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-400 tabular-nums">
                  {assetStats.healthFacilities}
                </p>
                <p className="text-[10px] text-slate-300 uppercase tracking-wide mt-1">
                  Health
                </p>
              </div>
            )}
            
            {assetStats.schools !== undefined && (
              <div className="bg-surface-strong rounded-lg p-3 text-center">
                <School className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-blue-400 tabular-nums">
                  {assetStats.schools}
                </p>
                <p className="text-[10px] text-slate-300 uppercase tracking-wide mt-1">
                  Schools
                </p>
              </div>
            )}
            
            {assetStats.evacuationCenters !== undefined && (
              <div className="bg-surface-strong rounded-lg p-3 text-center">
                <Home className="h-5 w-5 text-green-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-green-400 tabular-nums">
                  {assetStats.evacuationCenters}
                </p>
                <p className="text-[10px] text-slate-300 uppercase tracking-wide mt-1">
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
