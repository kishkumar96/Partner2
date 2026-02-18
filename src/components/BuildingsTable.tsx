/**
 * BuildingsTable - Interactive table of damaged buildings with zoom functionality
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
import { Building2, Search, ChevronDown, ChevronUp, MapPin, X } from 'lucide-react';
import type { BuildingAsset } from '@/types/assetTables';
import { useAssetTableData, transformBuildingData } from '@/hooks/useAssetTableData';
import { getBuildingDamageColor } from '@/theme/colors';
import { formatCurrency, formatNumber } from '@/utils/formatters';

interface BuildingsTableProps {
  data: GeoJSON.FeatureCollection | null;
  onZoom: (coordinates: [number, number], zoom?: number) => void;
  maxHeight?: string;
}

// Sort indicator component (moved outside to avoid recreation on every render)
function SortIndicator({
  columnKey,
  sortConfig,
}: {
  columnKey: keyof BuildingAsset;
  sortConfig: { key: keyof BuildingAsset; direction: 'asc' | 'desc' } | null;
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
function DamageIndicator({ level, loss }: { level: string; loss: number }) {
  const color = getBuildingDamageColor(loss);
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs capitalize">{level}</span>
    </div>
  );
}

export default function BuildingsTable({ data, onZoom, maxHeight = '600px' }: BuildingsTableProps) {
  // Transform and manage data
  const buildings = useMemo(() => transformBuildingData(data), [data]);

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
  } = useAssetTableData<BuildingAsset>(buildings);

  // Handle row click to zoom
  const handleRowClick = useCallback(
    (building: BuildingAsset) => {
      onZoom(building.coordinates, 16);
    },
    [onZoom]
  );

  if (!data || buildings.length === 0) {
    return (
      <div className="bg-slate-800/40 backdrop-blur-sm border border-white/10 rounded-lg p-8 text-center">
        <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-400" />
        <p className="text-slate-300 font-medium">No building damage data available</p>
        <p className="text-sm text-slate-400 mt-1">Building data will appear here when loaded</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-slate-800/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white">Damaged Buildings</h3>
          </div>
          <div className="text-sm text-slate-300">
            <span className="font-bold">{formatNumber(totalCount)}</span> buildings
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="buildings-search"
              name="buildingsSearch"
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
                onClick={() => handleSort('buildingType')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Type
                  <SortIndicator columnKey="buildingType" sortConfig={sortConfig} />
                </div>
              </th>
              <th
                onClick={() => handleSort('occupancy')}
                className="text-left p-3 text-white/80 font-medium cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-1">
                  Occupancy
                  <SortIndicator columnKey="occupancy" sortConfig={sortConfig} />
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
            {displayData.map((building, idx) => (
              <tr
                key={building.id}
                onClick={() => handleRowClick(building)}
                className={`border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer ${
                  idx % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.02]'
                }`}
              >
                <td className="p-3 text-white font-mono">{formatCurrency(building.loss)}</td>
                <td className="p-3 text-white/80">
                  <DamageIndicator level={building.damageLevel} loss={building.loss} />
                </td>
                <td className="p-3 text-white/80">{building.buildingType}</td>
                <td className="p-3 text-white/80">{building.occupancy}</td>
                <td className="p-3 text-white/80">{building.region}</td>
                <td className="p-3 text-center">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleRowClick(building);
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
