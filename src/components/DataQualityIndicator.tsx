'use client';

import { Info, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export interface DataQualityProps {
  compact?: boolean;
}

export default function DataQualityIndicator({ compact = false }: DataQualityProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (compact) {
    return (
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors"
        title="Data Quality Information"
      >
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Data Quality</span>
        {showDetails && (
          <div
            className="absolute left-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50"
            onClick={e => e.stopPropagation()}
          >
            <DataQualityContent />
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Data Quality & Reliability
        </h3>
      </div>
      <DataQualityContent />
    </div>
  );
}

function DataQualityContent() {
  return (
    <div className="space-y-4">
      {/* Quality Scores */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <div className="text-xs text-green-600 dark:text-green-400 font-medium">Accuracy</div>
          </div>
          <div className="text-xl font-bold text-green-700 dark:text-green-300">±20%</div>
          <div className="text-[10px] text-green-600 dark:text-green-400">Economic</div>
        </div>

        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Spatial</div>
          </div>
          <div className="text-xl font-bold text-blue-700 dark:text-blue-300">±10m</div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400">Buildings</div>
        </div>

        <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle className="w-4 h-4 text-purple-600" />
            <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
              Validated
            </div>
          </div>
          <div className="text-xl font-bold text-purple-700 dark:text-purple-300">r²=0.78</div>
          <div className="text-[10px] text-purple-600 dark:text-purple-400">Model Fit</div>
        </div>
      </div>

      {/* Coverage Status */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Data Coverage
        </div>
        {[
          { category: 'Population', coverage: 100, color: 'green' },
          { category: 'Roads', coverage: 95, color: 'green' },
          { category: 'Buildings', coverage: 85, color: 'blue' },
          { category: 'Economic Values', coverage: 80, color: 'amber' },
        ].map(item => (
          <div key={item.category}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">{item.category}</span>
              <span className="font-semibold text-gray-900 dark:text-white">{item.coverage}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${
                  item.color === 'green'
                    ? 'bg-green-500'
                    : item.color === 'blue'
                      ? 'bg-blue-500'
                      : 'bg-amber-500'
                }`}
                style={{ width: `${item.coverage}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Validation Info */}
      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-green-800 dark:text-green-200">
            <strong>Field Validated:</strong> Damage assessments verified in 12 communities (n=450
            structures). Correlation coefficient r²=0.78 between modeled and observed damage.
          </div>
        </div>
      </div>

      {/* Limitations Warning */}
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Single Event Data:</strong> This dataset represents TC Lola (Feb 2024) only.
            Cannot predict future events or provide probabilistic risk analysis.
          </div>
        </div>
      </div>

      {/* Source Attribution */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-[10px] text-gray-600 dark:text-gray-400 space-y-1">
          <div>
            <strong>Model:</strong> RiskScape Multi-Hazard Platform v1.x
          </div>
          <div>
            <strong>Sources:</strong> Pacific Disaster Center, Vanuatu NSO, PCRAFI
          </div>
          <div>
            <strong>Last Updated:</strong> February 25, 2024
          </div>
        </div>
      </div>
    </div>
  );
}
