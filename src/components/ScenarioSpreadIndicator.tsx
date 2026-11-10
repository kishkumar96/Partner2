'use client';

import { formatCurrency, formatNumber } from '@/utils/formatters';

interface ScenarioMetric {
  best: number;
  forecast: number;
  worst: number;
  label: string;
  unit?: 'currency' | 'number';
}

interface ScenarioComparisonProps {
  metrics: ScenarioMetric[];
  className?: string;
}

export function ScenarioComparison({ metrics, className = '' }: ScenarioComparisonProps) {
  const formatValue = (value: number, unit?: 'currency' | 'number') => {
    if (unit === 'currency') {
      return formatCurrency(value);
    }
    return formatNumber(value);
  };

  const calculateSpread = (best: number, forecast: number, worst: number) => {
    const range = worst - best;
    const uncertainty = (range / forecast) * 100;
    return {
      range,
      uncertainty: Math.min(uncertainty, 999), // Cap at 999%
    };
  };

  return (
    <div
      className={`bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6 ${className}`}
    >
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">Scenario Analysis</h3>
        <p className="text-sm text-white/60">
          Comparing best-case, forecast, and worst-case scenarios
        </p>
      </div>

      <div className="space-y-6">
        {metrics.map((metric, idx) => {
          const spread = calculateSpread(metric.best, metric.forecast, metric.worst);
          const bestPosition = 0;
          const forecastPosition =
            ((metric.forecast - metric.best) / (metric.worst - metric.best)) * 100;
          const worstPosition = 100;

          return (
            <div key={idx} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-white/90">{metric.label}</span>
                <span className="text-xs text-white/50">
                  ±{spread.uncertainty.toFixed(0)}% uncertainty
                </span>
              </div>

              {/* Visual spread indicator */}
              <div className="relative h-12 bg-white/5 rounded-lg overflow-hidden">
                {/* Gradient background showing range */}
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 via-yellow-500/20 to-red-500/20" />

                {/* Best case marker */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-green-400"
                  style={{ left: `${bestPosition}%` }}
                />

                {/* Forecast marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-400 rounded-full border-2 border-white shadow-lg"
                  style={{ left: `${forecastPosition}%`, marginLeft: '-6px' }}
                />

                {/* Worst case marker */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-red-400"
                  style={{ left: `${worstPosition}%` }}
                />
              </div>

              {/* Values */}
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="text-center">
                  <div className="text-green-400 font-medium mb-1">Best Case</div>
                  <div className="text-white/80">{formatValue(metric.best, metric.unit)}</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-400 font-medium mb-1">Forecast</div>
                  <div className="text-white font-semibold">
                    {formatValue(metric.forecast, metric.unit)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-red-400 font-medium mb-1">Worst Case</div>
                  <div className="text-white/80">{formatValue(metric.worst, metric.unit)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-center gap-6 text-xs text-white/60">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded" />
          <span>Best Case</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-400 rounded-full" />
          <span>Forecast</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-400 rounded" />
          <span>Worst Case</span>
        </div>
      </div>
    </div>
  );
}

export default ScenarioComparison;
