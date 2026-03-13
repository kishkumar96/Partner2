/**
 * RoadsTable - Interactive table of damaged roads with zoom functionality
 *
 * Features:
 * - Sortable columns (loss, damage level, type, region)
 * - Search and filter capabilities
 * - Pagination for performance
 * - Click-to-zoom on map
 * - Visual damage indicators
 * - Responsive design
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { Construction, Search, ChevronDown, ChevronUp, MapPin, X } from 'lucide-react';
import type { RoadAsset } from '@/types/assetTables';
import { useAssetTableData, transformRoadData } from '@/hooks/useAssetTableData';
import { ROAD_DAMAGE_COLORS } from '@/theme/colors';
import { formatCurrency, formatNumber } from '@/utils/formatters';

interface RoadsTableProps {
  data: GeoJSON.FeatureCollection | null;
  onZoom: (coordinates: [number, number], zoom?: number) => void;
  maxHeight?: string;
}

interface RoadDamageThresholds {
  moderate: number;
  heavy: number;
  severe: number;
}

const DEFAULT_ROAD_DAMAGE_THRESHOLDS: RoadDamageThresholds = {
  moderate: 1000,
  heavy: 2000,
  severe: 3000,
};

function classifyRoadDamageLevel(
  loss: number,
  thresholds: RoadDamageThresholds
): RoadAsset['damageLevel'] {
  if (loss >= thresholds.severe) return 'severe';
  if (loss >= thresholds.heavy) return 'heavy';
  if (loss >= thresholds.moderate) return 'moderate';
  return 'light';
}

// Sort indicator component (moved outside to avoid recreation on every render)
function SortIndicator({
  columnKey,
  sortConfig,
}: {
  columnKey: keyof RoadAsset;
  sortConfig: { key: keyof RoadAsset; direction: 'asc' | 'desc' } | null;
}) {
  if (sortConfig?.key !== columnKey) {
    return <ChevronDown className="w-3 h-3 opacity-30" />;
  }
  return sortConfig.direction === 'desc' ? (
    <ChevronDown className="w-3 h-3" />
  ) : (
    <ChevronUp className="w-3 h-3" />
  );
}

// Damage indicator component (moved outside to avoid recreation on every render)
function DamageIndicator({ level }: { level: RoadAsset['damageLevel'] }) {
  const color = ROAD_DAMAGE_COLORS[level];
  const widths = {
    light: '3px',
    moderate: '5px',
    heavy: '7px',
    severe: '9px',
  };
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-3 rounded-sm flex-shrink-0"
        style={{
          backgroundColor: color,
          width: widths[level as keyof typeof widths] || '3px',
        }}
      />
      <span className="text-xs capitalize">{level}</span>
    </div>
  );
}

export default function RoadsTable({ data, onZoom, maxHeight = '600px' }: RoadsTableProps) {
  const [thresholds, setThresholds] = useState<RoadDamageThresholds>(
    DEFAULT_ROAD_DAMAGE_THRESHOLDS
  );
  const [thresholdDraft, setThresholdDraft] = useState<RoadDamageThresholds>(
    DEFAULT_ROAD_DAMAGE_THRESHOLDS
  );

  // Transform and classify roads using editable thresholds
  const baseRoads = useMemo(() => transformRoadData(data), [data]);
  const roads = useMemo(
    () =>
      baseRoads.map(road => ({
        ...road,
        damageLevel: classifyRoadDamageLevel(road.loss, thresholds),
      })),
    [baseRoads, thresholds]
  );

  const thresholdsValid =
    thresholdDraft.moderate < thresholdDraft.heavy && thresholdDraft.heavy < thresholdDraft.severe;
  const hasThresholdChanges =
    thresholdDraft.moderate !== thresholds.moderate ||
    thresholdDraft.heavy !== thresholds.heavy ||
    thresholdDraft.severe !== thresholds.severe;

  const {
    data: displayData,
    totalCount,
    sortConfig,
    filter,
    pagination,
    uniqueRegions,
    handleSort,
    handleFilterChange,
    handlePageChange,
    handlePageSizeChange,
    resetFilters,
  } = useAssetTableData<RoadAsset>(roads);

  // Handle row click to zoom
  const handleRowClick = useCallback(
    (road: RoadAsset) => {
      onZoom(road.coordinates, 15);
    },
    [onZoom]
  );

  if (!data || roads.length === 0) {
    return (
      <div className="bg-slate-800/40 backdrop-blur-sm border border-white/10 rounded-lg p-8 text-center">
        <Construction className="w-12 h-12 mx-auto mb-3 text-slate-400" />
        <p className="text-slate-300 font-medium">No road damage data available</p>
        <p className="text-sm text-slate-400 mt-1">Road data will appear here when loaded</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-slate-800/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Construction className="w-5 h-5 text-orange-400" />
            <h3 className="text-lg font-semibold text-white">Damaged Roads</h3>
          </div>
          <div className="text-sm text-slate-300">
            <span className="font-bold">{formatNumber(totalCount)}</span> road segments
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="roads-search"
              name="roadsSearch"
              type="text"
              placeholder="Search by ID, region, type..."
              value={filter.searchTerm}
              onChange={e => handleFilterChange({ searchTerm: e.target.value })}
              className="w-full pl-9 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Region filter */}
          {uniqueRegions.length > 1 && (
            <select
              value={filter.region?.[0] || ''}
              onChange={e =>
                handleFilterChange({
                  region: e.target.value ? [e.target.value] : undefined,
                })
              }
              className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Regions</option>
              {uniqueRegions.map(region => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          )}

          {/* Clear filters */}
          {(filter.searchTerm || filter.region) && (
            <button
              onClick={resetFilters}
              className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Editable road damage thresholds */}
        <div className="mt-3 p-3 bg-slate-900/40 border border-white/10 rounded-lg">
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-xs text-slate-300 font-medium mr-1">Damage thresholds (USD)</span>
            <label className="flex items-center gap-1 text-xs text-slate-300">
              Moderate
              <input
                type="number"
                min={0}
                step={100}
                value={thresholdDraft.moderate}
                onChange={e =>
                  setThresholdDraft(prev => ({
                    ...prev,
                    moderate: Number(e.target.value) || 0,
                  }))
                }
                className="w-20 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-300">
              Heavy
              <input
                type="number"
                min={0}
                step={100}
                value={thresholdDraft.heavy}
                onChange={e =>
                  setThresholdDraft(prev => ({
                    ...prev,
                    heavy: Number(e.target.value) || 0,
                  }))
                }
                className="w-20 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-300">
              Severe
              <input
                type="number"
                min={0}
                step={100}
                value={thresholdDraft.severe}
                onChange={e =>
                  setThresholdDraft(prev => ({
                    ...prev,
                    severe: Number(e.target.value) || 0,
                  }))
                }
                className="w-20 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <button
              type="button"
              onClick={() => setThresholds(thresholdDraft)}
              disabled={!thresholdsValid || !hasThresholdChanges}
              className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setThresholds(DEFAULT_ROAD_DAMAGE_THRESHOLDS);
                setThresholdDraft(DEFAULT_ROAD_DAMAGE_THRESHOLDS);
              }}
              className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors"
            >
              Reset
            </button>
          </div>
          {!thresholdsValid && (
            <p className="mt-2 text-[11px] text-red-300">
              Thresholds must be ascending: Moderate &lt; Heavy &lt; Severe.
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80 sticky top-0 z-10 border-b border-white/10">
            <tr>
              <th
                onClick={() => handleSort('name')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Road Name
                  <SortIndicator columnKey="name" sortConfig={sortConfig} />
                </div>
              </th>
              <th
                onClick={() => handleSort('loss')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Loss (USD)
                  <SortIndicator columnKey="loss" sortConfig={sortConfig} />
                </div>
              </th>
              <th className="text-left p-3 text-white/80 font-medium">Damage Level</th>
              <th
                onClick={() => handleSort('roadType')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Road Type
                  <SortIndicator columnKey="roadType" sortConfig={sortConfig} />
                </div>
              </th>
              <th
                onClick={() => handleSort('surface')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Surface
                  <SortIndicator columnKey="surface" sortConfig={sortConfig} />
                </div>
              </th>
              <th
                onClick={() => handleSort('region')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Region
                  <SortIndicator columnKey="region" sortConfig={sortConfig} />
                </div>
              </th>
              <th className="text-center p-3 text-white/80 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((road, idx) => (
              <tr
                key={road.id}
                onClick={() => handleRowClick(road)}
                className={`border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer ${
                  idx % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.02]'
                }`}
              >
                <td className="p-3 text-white/90">{road.name || `Road ${road.id}`}</td>
                <td className="p-3 text-white font-mono">{formatCurrency(road.loss)}</td>
                <td className="p-3 text-white/80">
                  <DamageIndicator level={road.damageLevel} />
                </td>
                <td className="p-3 text-white/80">{road.roadType}</td>
                <td className="p-3 text-white/80">{road.surface}</td>
                <td className="p-3 text-white/80">{road.region}</td>
                <td className="p-3 text-center">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleRowClick(road);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs transition-colors"
                    title="Zoom to location"
                  >
                    <MapPin className="w-3 h-3" />
                    Zoom
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="p-3 border-t border-white/10 bg-slate-800/60 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Rows per page:</span>
            <select
              value={pagination.pageSize}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
              className="px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-slate-300">
            <span>
              {(pagination.currentPage - 1) * pagination.pageSize + 1}-
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} of{' '}
              {pagination.totalItems}
            </span>

            <div className="flex gap-1 ml-2">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className="px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
                className="px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
