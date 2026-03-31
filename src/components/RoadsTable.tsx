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

import { useCallback, useMemo } from 'react';
import { Construction, Search, ChevronDown, ChevronUp, MapPin, X } from 'lucide-react';
import type { RoadAsset } from '@/types/assetTables';
import { useAssetTableData, transformRoadData } from '@/hooks/useAssetTableData';
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

export default function RoadsTable({ data, onZoom, maxHeight = '600px' }: RoadsTableProps) {
  // Transform and classify roads using the default thresholds
  const baseRoads = useMemo(() => transformRoadData(data), [data]);
  const roads = useMemo(
    () =>
      baseRoads.map(road => ({
        ...road,
        damageLevel: classifyRoadDamageLevel(road.loss, DEFAULT_ROAD_DAMAGE_THRESHOLDS),
      })),
    [baseRoads]
  );

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
                  Damage (USD)
                  <SortIndicator columnKey="loss" sortConfig={sortConfig} />
                </div>
              </th>
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
