'use client';

import React from 'react';
import MetricTooltip from './MetricTooltip';

type Severity = 'danger' | 'warning' | 'caution' | 'normal' | 'success';

function getSeverityColor(severity: Severity) {
  switch (severity) {
    case 'danger':
      return 'text-red-500'; // Semantic: catastrophic/severe
    case 'warning':
      return 'text-orange-500'; // Semantic: high risk
    case 'caution':
      return 'text-yellow-500'; // Semantic: moderate
    case 'success':
      return 'text-green-500'; // Semantic: safe/minimal
    default:
      return 'text-blue-400'; // UI element color
  }
}

function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function GlassStatCard(props: {
  title: string;
  value: number;
  subtitle?: string;
  badge?: string;
  severity?: Severity; // Semantic severity instead of arbitrary glow
  icon?: React.ReactNode;
  metricInfo?: {
    unit: string;
    temporalScope: string;
    methodology: string;
    classification?: 'Hazard' | 'Exposure' | 'Impact';
  };
}) {
  const { title, value, subtitle, badge, severity = 'danger', icon, metricInfo } = props;

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700/50 transition-all duration-200 hover:bg-slate-800/80">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {/* Title with improved contrast - 12px, muted */}
          <div className="flex items-center gap-2">
            {icon && <div className="shrink-0 text-slate-400">{icon}</div>}

            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{title}</p>

            {metricInfo && (
              <MetricTooltip
                unit={metricInfo.unit}
                temporalScope={metricInfo.temporalScope}
                methodology={metricInfo.methodology}
                classification={metricInfo.classification}
              />
            )}
          </div>

          {badge && (
            <div className="mt-1.5 inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5">
              <span className="text-xs font-bold tracking-wider text-red-400 uppercase">
                {badge}
              </span>
            </div>
          )}
        </div>

        {/* Severity indicator dot */}
        <div className={`h-2 w-2 rounded-full ${getSeverityColor(severity)} flex-shrink-0 mt-1`} />
      </div>

      {/* Hero value - Bold, 20px for consistency */}
      <div className="mb-1">
        <div
          className={`text-xl font-bold tabular-nums ${getSeverityColor(severity)}`}
          style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}
        >
          {formatCompactCurrency(value)}
        </div>
      </div>

      {/* Subtitle - 12px, muted */}
      {subtitle && <p className="text-xs text-slate-400 font-normal">{subtitle}</p>}
    </div>
  );
}
