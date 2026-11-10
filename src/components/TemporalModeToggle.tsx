'use client';

import { Clock, BarChart3, Calendar } from 'lucide-react';

export type TemporalMode = 'current' | 'cumulative' | 'total';

interface TemporalModeToggleProps {
  currentMode: TemporalMode;
  onModeChange: (mode: TemporalMode) => void;
  disabled?: boolean;
}

export default function TemporalModeToggle({
  currentMode,
  onModeChange,
  disabled = false,
}: TemporalModeToggleProps) {
  const modes = [
    {
      id: 'current' as TemporalMode,
      label: 'Current Step',
      icon: Clock,
      description: 'Current timestep values',
    },
    {
      id: 'cumulative' as TemporalMode,
      label: 'Cumulative',
      icon: BarChart3,
      description: 'Accumulated to date',
    },
    {
      id: 'total' as TemporalMode,
      label: 'Event Total',
      icon: Calendar,
      description: 'Full event aggregate',
    },
  ];

  return (
    <div className="inline-flex items-center gap-1 sm:gap-2 bg-slate-900/90 border-2 border-blue-500/50 rounded-lg p-1 shadow-lg backdrop-blur-sm flex-shrink-0 max-w-full overflow-hidden">
      <span className="text-xs font-bold text-blue-400 px-1 sm:px-2 whitespace-nowrap hidden md:inline">
        Temporal View:
      </span>
      {modes.map(mode => {
        const Icon = mode.icon;
        const isActive = currentMode === mode.id;

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onModeChange(mode.id)}
            disabled={disabled}
            title={mode.description}
            className={`
              flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-bold transition-all whitespace-nowrap
              ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/50'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span className="hidden lg:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
