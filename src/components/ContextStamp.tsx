'use client';

import { Clock, Layers, Activity } from 'lucide-react';

interface ContextStampProps {
  scenario?: string;
  timestep?: string;
  metric?: string;
  aggregation?: 'current' | 'cumulative';
  className?: string;
}

export default function ContextStamp({
  scenario,
  timestep,
  metric,
  aggregation = 'cumulative',
  className = '',
}: ContextStampProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 px-4 py-2.5 glass-panel border border-white/10 rounded-lg text-xs ${className}`}
      role="status"
      aria-label="Current data context"
    >
      {/* Scenario */}
      {scenario && (
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-slate-400 font-medium">Scenario:</span>
          <span className="font-bold text-blue-300 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded">
            {scenario}
          </span>
        </div>
      )}

      {/* Separator */}
      {scenario && (timestep || metric) && (
        <div className="h-4 w-px bg-slate-700" aria-hidden="true" />
      )}

      {/* Timestep */}
      {timestep && (
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-slate-400 font-medium">Time:</span>
          <span className="font-bold text-indigo-300 px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono">
            {timestep}
          </span>
        </div>
      )}

      {/* Separator */}
      {timestep && metric && <div className="h-4 w-px bg-slate-700" aria-hidden="true" />}

      {/* Metric */}
      {metric && (
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-slate-400 font-medium">Metric:</span>
          <span className="font-bold text-cyan-300 px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded">
            {metric}
          </span>
        </div>
      )}

      {/* Aggregation Badge */}
      <div className="ml-auto">
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
            aggregation === 'current'
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
              : 'bg-green-500/20 text-green-300 border border-green-500/40'
          }`}
          title={
            aggregation === 'current'
              ? 'Showing data for selected timestep only'
              : 'Showing cumulative data across entire event'
          }
        >
          {aggregation === 'current' ? 'Current Timestep' : 'Cumulative'}
        </span>
      </div>
    </div>
  );
}
