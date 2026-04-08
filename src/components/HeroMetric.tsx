import React from 'react';
import { LucideIcon } from 'lucide-react';

interface HeroMetricProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color: 'orange' | 'purple' | 'amber' | 'cyan' | 'red' | 'green';
}

const colorStyles = {
  orange: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-800/80',
    text: 'text-orange-400',
    labelText: 'text-slate-400',
    valueText: 'text-orange-400',
    subtitleText: 'text-slate-400',
    iconBg: 'bg-orange-500/10',
    iconText: 'text-orange-400',
  },
  purple: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-800/80',
    text: 'text-purple-400',
    labelText: 'text-slate-400',
    valueText: 'text-purple-400',
    subtitleText: 'text-slate-400',
    iconBg: 'bg-purple-500/10',
    iconText: 'text-purple-400',
  },
  amber: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-800/80',
    text: 'text-amber-400',
    labelText: 'text-slate-400',
    valueText: 'text-amber-400',
    subtitleText: 'text-slate-400',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-400',
  },
  cyan: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-800/80',
    text: 'text-cyan-400',
    labelText: 'text-slate-400',
    valueText: 'text-cyan-400',
    subtitleText: 'text-slate-400',
    iconBg: 'bg-cyan-500/10',
    iconText: 'text-cyan-400',
  },
  red: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-800/80',
    text: 'text-red-400',
    labelText: 'text-slate-400',
    valueText: 'text-red-400',
    subtitleText: 'text-slate-400',
    iconBg: 'bg-red-500/10',
    iconText: 'text-red-400',
  },
  green: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-800/80',
    text: 'text-green-400',
    labelText: 'text-slate-400',
    valueText: 'text-green-400',
    subtitleText: 'text-slate-400',
    iconBg: 'bg-green-500/10',
    iconText: 'text-green-400',
  },
};

/**
 * HeroMetric - Consistent metric display card with subdued styling
 *
 * Designed for visual consistency with:
 * - Uniform card size and padding
 * - Subtle background colors
 * - Consistent text sizing (2xl)
 * - Clean, modern look
 */
export default function HeroMetric({ label, value, subtitle, icon: Icon, color }: HeroMetricProps) {
  const styles = colorStyles[color];

  return (
    <div
      className={`rounded-xl border ${styles.border} ${styles.bg} backdrop-blur-sm transition-all duration-200 hover:bg-slate-800`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${styles.text}`} />
              <p className={`text-xs font-semibold uppercase tracking-wide ${styles.labelText}`}>
                {label}
              </p>
            </div>
            <p className={`text-2xl font-bold ${styles.valueText} mb-1 tabular-nums`}>{value}</p>
            {subtitle && <p className={`text-xs ${styles.subtitleText}`}>{subtitle}</p>}
          </div>
          <div
            className={`w-10 h-10 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}
          >
            <Icon className={`w-5 h-5 ${styles.iconText}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
