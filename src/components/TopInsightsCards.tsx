'use client';

import { Users, DollarSign, AlertTriangle, ChevronRight } from 'lucide-react';
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
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 ${className}`}
    >
      {insights.map(insight => {
        const IconComponent = insight.icon;
        const isClickable = !!insight.onClick;

        return (
          <div
            key={insight.id}
            onClick={insight.onClick}
            className={`
              min-w-0 rounded-full border px-2.5 py-1.5 transition-colors duration-200
              ${isClickable ? 'cursor-pointer hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 active:bg-slate-800/90' : ''}
              ${insight.color.replace('text-slate-100', 'text-slate-200')}
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex items-center gap-1.5">
                <div className="rounded-full bg-slate-800/55 p-1 text-slate-300/85">
                  <IconComponent className="h-3 w-3" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-100/60">
                  {insight.label}
                </span>
              </div>

              <span className="text-sm font-semibold leading-none text-slate-100">
                {typeof insight.value === 'number' ? formatNumber(insight.value) : insight.value}
              </span>

              {insight.subtitle && (
                <span className="text-[10px] font-medium text-slate-100/45">
                  {insight.subtitle}
                </span>
              )}

              {isClickable && (
                <div className="flex items-center gap-1 text-[10px] text-slate-100/50">
                  <span>View details</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              )}

              {insight.trend && (
                <div
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    insight.trend === 'up'
                      ? 'bg-red-500/20 text-red-100/80'
                      : insight.trend === 'down'
                        ? 'bg-green-500/20 text-green-100/80'
                        : 'bg-slate-700/40 text-slate-100/70'
                  }`}
                >
                  {insight.trend === 'up' ? '↑' : insight.trend === 'down' ? '↓' : '→'}
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
  onDistrictClick?: (districtId: string) => void,
  labels: { singular: string; plural: string } = { singular: 'district', plural: 'districts' }
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
      label: 'Highest Economic Damage',
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
      label: `High Risk ${labels.plural}`,
      value: highRiskCount,
      subtitle: `${((highRiskCount / districts.length) * 100).toFixed(0)}% of total ${labels.plural}`,
      icon: AlertTriangle,
      color: 'border-yellow-500/40 text-slate-100',
      trend: 'neutral',
    });
  }

  return insights;
}
