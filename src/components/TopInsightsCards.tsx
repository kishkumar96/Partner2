'use client';

import {
  TrendingUp,
  Users,
  DollarSign,
  Home,
  AlertTriangle,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { AggregatedEventData } from '@/types';

interface TopInsight {
  id: string;
  label: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
}

interface TopInsightsCardsProps {
  insights: TopInsight[];
  className?: string;
}

export default function TopInsightsCards({ insights, className = '' }: TopInsightsCardsProps) {
  if (insights.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 gap-3 ${className}`}>
      {insights.map(insight => {
        const IconComponent = insight.icon;
        const isClickable = !!insight.onClick;

        return (
          <div
            key={insight.id}
            onClick={insight.onClick}
            className={`
              relative overflow-hidden rounded-xl border glass-panel p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl min-w-0
              ${isClickable ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]' : ''}
              ${insight.color}
            `}
            role={isClickable ? 'button' : 'article'}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      insight.onClick?.();
                    }
                  }
                : undefined
            }
            aria-label={`${insight.label}: ${insight.value}`}
          >
            {/* Decorative background pattern */}
            <div className="absolute top-0 right-0 opacity-10">
              <IconComponent className="w-24 h-24 -mr-8 -mt-8" aria-hidden="true" />
            </div>

            {/* Content */}
            <div className="relative z-10 space-y-2">
              {/* Icon & Label */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-700/40 backdrop-blur-sm rounded-lg">
                    <IconComponent className="w-5 h-5 text-slate-100" aria-hidden="true" />
                  </div>
                  {insight.trend && (
                    <div
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        insight.trend === 'up'
                          ? 'bg-red-500/30 text-red-100'
                          : insight.trend === 'down'
                            ? 'bg-green-500/30 text-green-100'
                            : 'bg-slate-700/40 text-slate-100'
                      }`}
                    >
                      {insight.trend === 'up' ? '↑' : insight.trend === 'down' ? '↓' : '→'}
                    </div>
                  )}
                </div>
              </div>

              {/* Label */}
              <h3 className="text-sm font-semibold text-slate-100/90 uppercase tracking-wide leading-tight">
                {insight.label}
              </h3>

              {/* Value */}
              <div className="space-y-1">
                <p className="text-2xl font-bold text-slate-100 leading-none break-words">
                  {typeof insight.value === 'number' ? formatNumber(insight.value) : insight.value}
                </p>
                {insight.subtitle && (
                  <p className="text-xs text-slate-100/80 font-medium break-words">
                    {insight.subtitle}
                  </p>
                )}
              </div>

              {/* Clickable indicator */}
              {isClickable && (
                <div className="flex items-center gap-1 text-xs text-slate-100/70 mt-3">
                  <span>Click to view details</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Utility function to create top insights from district data
export function createDistrictInsights(
  districts: AggregatedEventData[],
  onDistrictClick?: (districtId: string) => void
): TopInsight[] {
  if (!districts || districts.length === 0) return [];

  // Support both aggregated data format (totalEconomicDamage) and raw format (economicDamage)
  const getEconomicDamage = (d: AggregatedEventData) => d.totalEconomicDamage || 0;
  const getAffectedPop = (d: AggregatedEventData) => d.totalAffectedPopulation || 0;

  // Find top districts by various metrics
  const sortedByLoss = [...districts].sort((a, b) => getEconomicDamage(b) - getEconomicDamage(a));
  const sortedByPop = [...districts].sort((a, b) => getAffectedPop(b) - getAffectedPop(a));

  const topByLoss = sortedByLoss[0];
  const topByPop = sortedByPop[0];

  const totalLoss = districts.reduce((sum, d) => sum + getEconomicDamage(d), 0);
  const totalPop = districts.reduce((sum, d) => sum + getAffectedPop(d), 0);

  const insights: TopInsight[] = [];

  // Top District by Loss
  if (topByLoss && getEconomicDamage(topByLoss) > 0) {
    const lossValue = getEconomicDamage(topByLoss);
    const lossPercent = totalLoss > 0 ? ((lossValue / totalLoss) * 100).toFixed(1) : '0.0';
    insights.push({
      id: 'top-loss',
      label: 'Highest Economic Loss',
      value: formatCurrency(lossValue),
      subtitle: `${topByLoss.name} (${lossPercent}% of total)`,
      icon: DollarSign,
      color: 'border-red-500/40 text-slate-100',
      trend: 'up',
      onClick: onDistrictClick ? () => onDistrictClick(topByLoss.id) : undefined,
    });
  }

  // Top District by Population
  if (topByPop && getAffectedPop(topByPop) > 0) {
    const popValue = getAffectedPop(topByPop);
    const popPercent = totalPop > 0 ? ((popValue / totalPop) * 100).toFixed(1) : '0.0';
    insights.push({
      id: 'top-pop',
      label: 'Most Affected Population',
      value: formatNumber(popValue),
      subtitle: `${topByPop.name} (${popPercent}% of total)`,
      icon: Users,
      color: 'border-orange-500/40 text-slate-100',
      trend: 'up',
      onClick: onDistrictClick ? () => onDistrictClick(topByPop.id) : undefined,
    });
  }

  // High Risk Districts Count
  const highRiskCount = districts.filter(
    d => getEconomicDamage(d) > 1000000 || getAffectedPop(d) > 1000
  ).length;

  if (highRiskCount > 0) {
    insights.push({
      id: 'high-risk-count',
      label: 'High Risk Districts',
      value: highRiskCount,
      subtitle: `${((highRiskCount / districts.length) * 100).toFixed(0)}% of total districts`,
      icon: AlertTriangle,
      color: 'border-yellow-500/40 text-slate-100',
      trend: 'neutral',
    });
  }

  return insights;
}
