'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import EnhancedRegionalTable from './EnhancedRegionalTable';
import ComparativeAnalytics from './ComparativeAnalytics';
import BuildingsTable from './BuildingsTable';
import RoadsTable from './RoadsTable';
import {
  Event,
  Hazard,
  Sector,
  ExposureData,
  EconomicDamageData,
  FilterState,
  District,
  Province,
} from '@/types';
import { CountryCode } from '@/types/thredds';
import {
  COUNTRY_CONFIGS,
  getAggregationLabel as getCountryAggregationLabel,
} from '@/data/countryConfigs';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { areaMatchesSelection } from '@/utils/adminNormalization';
import { computeFilteredData } from '../utils/filteredData';
import { aggregateEventsByLevel, filterEconomicDamageData } from '@/utils/filterUtils';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Download,
  Info,
  MapPin,
  Construction,
} from 'lucide-react';

interface BottomTabsProps {
  events: Event[];
  hazards: Hazard[];
  sectors: Sector[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[]; // Combined for backward compatibility
  sectorEconomicData?: any[]; // Sector-level economic data
  assetEconomicData?: any[]; // Asset-level economic data
  impactByAssetType?: any[];
  impactBySector?: any[];
  regionalSummary?: any[];
  regionalSummaryBySector?: any[]; // Regional breakdown by sector - filterable
  filters: FilterState;
  districts: District[];
  provinces: Province[];
  selectedRegion?: string | null;
  damagedBuildings?: GeoJSON.FeatureCollection | null;
  damagedRoads?: GeoJSON.FeatureCollection | null;
  onZoomToAsset?: (coordinates: [number, number], zoom?: number) => void;
  onRequestDamageData?: (type: 'buildings' | 'roads') => void;
  countryCode: CountryCode;
}

type TabType =
  | 'exposure'
  | 'economic-sector'
  | 'economic-asset'
  | 'events'
  | 'details'
  | 'damage'
  | 'analytics'
  | 'buildings'
  | 'roads';

export default function BottomTabs({
  events,
  hazards,
  sectors,
  exposureData,
  economicDamageData,
  sectorEconomicData = [],
  assetEconomicData = [],
  impactByAssetType = [],
  impactBySector = [],
  regionalSummary = [],
  regionalSummaryBySector = [],
  filters,
  districts,
  provinces,
  selectedRegion = null,
  damagedBuildings = null,
  damagedRoads = null,
  onZoomToAsset,
  onRequestDamageData,
  countryCode,
}: BottomTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('events');
  const geographyUi = COUNTRY_CONFIGS[countryCode].ui;
  const regionMatchesSelection = (row: any, selection: string | null) =>
    areaMatchesSelection(row, selection);

  useEffect(() => {
    if (activeTab === 'roads' && !damagedRoads) {
      onRequestDamageData?.('roads');
    }
    if (activeTab === 'buildings' && !damagedBuildings) {
      onRequestDamageData?.('buildings');
    }
  }, [activeTab, damagedRoads, damagedBuildings, onRequestDamageData]);

  // Export to CSV helper function
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers
          .map(h => {
            const value = row[h] ?? '';
            return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Helper functions (defined before useMemo hooks that use them)
  const getHazardName = (hazardId: string) =>
    hazards.find(h => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find(s => s.id === sectorId)?.name || sectorId;

  const getHazardColor = (hazardId: string) =>
    hazards.find(h => h.id === hazardId)?.color || '#64748b';

  const selectedSectorNames = useMemo(
    () =>
      filters.selectedSectors
        .map(id => sectors.find(sector => sector.id === id)?.name)
        .filter((name): name is string => !!name),
    [filters.selectedSectors, sectors]
  );

  const getAggregationLabel = () => {
    if (filters.aggregationLevel === 'district') return geographyUi.broaderAreaSingular;
    return getCountryAggregationLabel(countryCode, filters.aggregationLevel);
  };

  const {
    filteredEvents,
    filteredExposureData,
    filteredSectorEconomicData,
    filteredAssetEconomicData,
  } = useMemo(() => {
    const result = computeFilteredData({
      events,
      exposureData,
      economicDamageData,
      filters,
      districts,
      provinces,
    });

    // Filter sector and asset economic data using the same logic
    const filteredSector = filterEconomicDamageData(
      sectorEconomicData as EconomicDamageData[],
      filters
    ) as typeof sectorEconomicData;
    const filteredAsset = filterEconomicDamageData(
      assetEconomicData as EconomicDamageData[],
      filters
    ) as typeof assetEconomicData;

    return {
      ...result,
      filteredSectorEconomicData: filteredSector,
      filteredAssetEconomicData: filteredAsset,
    };
  }, [
    events,
    exposureData,
    economicDamageData,
    sectorEconomicData,
    assetEconomicData,
    filters,
    districts,
    provinces,
  ]);

  // Whether any meaningful filter that changes the data breakdown is active.
  // When hazard or sector filters are active, ignore raw CSV totals and use
  // filtered event data so the table reflects the current filter selection.
  const hasActiveDataFilters =
    filters.selectedHazards.length > 0 || filters.selectedSectors.length > 0;
  const hasEventOrDateFilters =
    filters.selectedEvents.length > 0 || !!filters.dateRange.start || !!filters.dateRange.end;
  const hasHazardEventOrDateFilters = filters.selectedHazards.length > 0 || hasEventOrDateFilters;

  // Impact data based on current aggregation level (respects filters)
  const impactData = useMemo(() => {
    // Use CSV data for the unfiltered province/national view — it has the best accuracy.
    // When hazard/sector filters are active we fall back to event-based aggregation
    // so the numbers reflect what the user filtered.
    const canUseCSV =
      !hasActiveDataFilters &&
      !hasEventOrDateFilters &&
      regionalSummary &&
      regionalSummary.length > 0;

    if (canUseCSV) {
      // CSV contains province-level data (Malampa, Penama, Sanma, Shefa, Tafea, Torba)
      const isDistrictSelected =
        selectedRegion &&
        !regionalSummary.some((row: any) => regionMatchesSelection(row, selectedRegion));

      // Only filter if selectedRegion matches a province name
      const filteredData =
        selectedRegion && !isDistrictSelected
          ? regionalSummary.filter((row: any) => regionMatchesSelection(row, selectedRegion))
          : regionalSummary;

      const provinceRows = filteredData
        .filter((row: any) => {
          const regionName = typeof row.Region === 'string' ? row.Region.trim() : row.Region;
          return !!regionName;
        })
        .map((row: any) => ({
          id: row.Region_ID || row.Region,
          name: typeof row.Region === 'string' ? row.Region.trim() : row.Region,
          totalEvents: 1, // Each region is one entry
          totalAffectedPopulation: Number(row.Population_Exposed_To_Any_Hazard) || 0,
          totalEconomicDamage: Number(row.Total_Loss) || 0,
        }));

      if (filters.aggregationLevel === 'national') {
        // Aggregate all provinces into one national row
        return [
          {
            id: 'national',
            name: geographyUi.nationalLabel,
            totalEvents: 1,
            totalAffectedPopulation: provinceRows.reduce(
              (sum, r) => sum + r.totalAffectedPopulation,
              0
            ),
            totalEconomicDamage: provinceRows.reduce((sum, r) => sum + r.totalEconomicDamage, 0),
          },
        ];
      }
      // Province or district: CSV only has province granularity — show province rows.
      return provinceRows;
    }

    // Event-based aggregation — used when filters are active or CSV is absent.
    // The sector events store province-level IDs as their provinceId, so
    // district-level breakdown is not available; fall back to province in that case.
    const effectiveLevel =
      filters.aggregationLevel === 'district' ? 'province' : filters.aggregationLevel;
    return aggregateEventsByLevel(filteredEvents, effectiveLevel, districts, provinces, false);
  }, [
    hasActiveDataFilters,
    hasEventOrDateFilters,
    regionalSummary,
    selectedRegion,
    filteredEvents,
    filters.aggregationLevel,
    districts,
    provinces,
    geographyUi,
  ]);

  // Calculate national totals for summary cards
  const nationalSummary = useMemo(() => {
    const totalPopulation = impactData.reduce((sum, d) => sum + d.totalAffectedPopulation, 0);
    const totalLoss = impactData.reduce((sum, d) => sum + d.totalEconomicDamage, 0);
    const totalEvents = impactData.reduce((sum, d) => sum + d.totalEvents, 0);
    return { totalPopulation, totalLoss, totalEvents, regionCount: impactData.length };
  }, [impactData]);

  // Display data is always the impactData (aggregated by FilterPanel's aggregation level)
  const displayData = impactData;

  // Exposure data: aggregate by region based on aggregation level
  const { exposureDisplayData, exposureTotals } = useMemo(() => {
    if (filters.aggregationLevel === 'national') {
      // Aggregate all exposure data to national level by sector
      const sectorMap = new Map<string, ExposureData>();
      filteredExposureData.forEach(exp => {
        const existing = sectorMap.get(exp.sectorId);
        if (existing) {
          existing.population = (existing.population || 0) + (exp.population || 0);
          existing.buildingCount = (existing.buildingCount || 0) + (exp.buildingCount || 0);
          existing.infrastructure = (existing.infrastructure || 0) + (exp.infrastructure || 0);
          existing.assets = (existing.assets || 0) + (exp.assets || 0);
        } else {
          sectorMap.set(exp.sectorId, {
            ...exp,
            id: `national-${exp.sectorId}`,
            region: 'National',
            population: exp.population || 0,
            buildingCount: exp.buildingCount || 0,
            infrastructure: exp.infrastructure || 0,
            assets: exp.assets || 0,
          });
        }
      });
      const aggregatedData = Array.from(sectorMap.values());
      return {
        exposureDisplayData: aggregatedData,
        exposureTotals: {
          population: aggregatedData.reduce((sum, d) => sum + (d.population || 0), 0),
          buildings: aggregatedData.reduce(
            (sum, d) => sum + (d.buildingCount || d.infrastructure || 0),
            0
          ),
          assets: aggregatedData.reduce((sum, d) => sum + (d.assets || 0), 0),
        },
      };
    } else {
      // Province or district level: show detailed view
      return {
        exposureDisplayData: filteredExposureData,
        exposureTotals: {
          population: filteredExposureData.reduce((sum, d) => sum + (d.population || 0), 0),
          buildings: filteredExposureData.reduce(
            (sum, d) => sum + (d.buildingCount || d.infrastructure || 0),
            0
          ),
          assets: filteredExposureData.reduce((sum, d) => sum + (d.assets || 0), 0),
        },
      };
    }
  }, [filteredExposureData, filters.aggregationLevel]);

  // Economic totals and percentages
  const sectorEconomicTotals = useMemo(() => {
    const total = filteredSectorEconomicData.reduce((sum, d) => sum + (d.totalLoss || 0), 0);
    return {
      directLoss: filteredSectorEconomicData.reduce((sum, d) => sum + (d.directLoss || 0), 0),
      totalLoss: total,
      buildings: filteredSectorEconomicData.reduce((sum, d) => sum + (d.buildingCount || 0), 0),
    };
  }, [filteredSectorEconomicData]);

  const assetEconomicTotals = useMemo(() => {
    const total = filteredAssetEconomicData.reduce((sum, d) => sum + (d.totalLoss || 0), 0);
    return {
      directLoss: filteredAssetEconomicData.reduce((sum, d) => sum + (d.directLoss || 0), 0),
      totalLoss: total,
      assetCount: filteredAssetEconomicData.reduce((sum, d) => sum + (d.assetCount || 0), 0),
    };
  }, [filteredAssetEconomicData]);

  // Filtered data for Details tab (respecting filters)
  const filteredImpactByAssetType = useMemo(() => {
    if (!impactByAssetType || impactByAssetType.length === 0) return [];
    return impactByAssetType; // CSV doesn't contain sector/hazard fields for filtering
  }, [impactByAssetType]);

  const filteredImpactBySector = useMemo(() => {
    // Use regional-summary-by-sector data if available (filterable by all dimensions)
    // Otherwise fall back to national impact-by-sector (only filterable by sector)
    if (regionalSummaryBySector && regionalSummaryBySector.length > 0) {
      let filtered = regionalSummaryBySector;

      // Filter by sector
      if (selectedSectorNames.length > 0) {
        filtered = filtered.filter((row: any) => {
          const sectorName = row.Sector || '';
          return selectedSectorNames.includes(sectorName);
        });
      }

      // Filter by region (if a specific region is selected)
      if (selectedRegion) {
        filtered = filtered.filter((row: any) => {
          const regionName = row.Region || '';
          return regionName === selectedRegion;
        });
      }

      // Aggregate by sector (sum across all regions)
      const bySector = new Map<string, any>();
      filtered.forEach((row: any) => {
        const sector = row.Sector || 'Unknown';
        if (!bySector.has(sector)) {
          bySector.set(sector, {
            Sector: sector,
            Number_Exposed_Buildings: 0,
            Number_Damaged_Buildings: 0,
            Building_Loss: 0,
            Total_Loss: 0,
          });
        }
        const aggregate = bySector.get(sector)!;
        aggregate.Number_Exposed_Buildings += Number(row.Number_Exposed_Buildings) || 0;
        aggregate.Number_Damaged_Buildings += Number(row.Number_Damaged_Buildings) || 0;
        aggregate.Building_Loss += Number(row.Building_Loss) || 0;
        aggregate.Total_Loss += Number(row.Total_Loss) || 0;
      });

      return Array.from(bySector.values());
    }

    // Fallback to national impact-by-sector (only sector filter applies)
    if (!impactBySector || impactBySector.length === 0) return [];
    if (selectedSectorNames.length > 0) {
      return impactBySector.filter((row: any) => {
        const sectorName = row.Sector || '';
        return selectedSectorNames.includes(sectorName);
      });
    }

    return impactBySector;
  }, [regionalSummaryBySector, impactBySector, selectedSectorNames, selectedRegion]);

  // Filtered regional summary for Damage tab
  const filteredRegionalSummary = useMemo(() => {
    if (!regionalSummary || regionalSummary.length === 0) return [];
    // Note: regionalSummary.csv is pre-aggregated across all sectors/hazards
    // It doesn't contain sector/hazard breakdown, so we can't filter by those dimensions
    // This represents total damage regardless of filter selections
    return regionalSummary;
  }, [regionalSummary]);

  const tabs: { id: TabType; label: ReactNode }[] = [
    {
      id: 'events',
      label: `Impact (${displayData.length || 0})`,
    },
    {
      id: 'exposure',
      label:
        filteredExposureData.length === exposureData.length
          ? `Exposure (${filteredExposureData.length})`
          : `Exposure (${filteredExposureData.length}/${exposureData.length})`,
    },
    {
      id: 'economic-sector',
      label:
        filteredSectorEconomicData.length === sectorEconomicData.length
          ? `Economic Damage $ by Sector (${filteredSectorEconomicData.length})`
          : `Economic Damage $ by Sector (${filteredSectorEconomicData.length}/${sectorEconomicData.length})`,
    },
    {
      id: 'economic-asset',
      label:
        filteredAssetEconomicData.length === assetEconomicData.length
          ? `Economic Damage $ by Asset (${filteredAssetEconomicData.length})`
          : `Economic Damage $ by Asset (${filteredAssetEconomicData.length}/${assetEconomicData.length})`,
    },
    // { id: "details", label: "Details" },
    // { id: "damage", label: `Damage (${regionalSummary.length})` },
    // {
    //   id: "buildings",
    //   label: (
    //     <span className="inline-flex items-center gap-1">
    //       <Building2 className="w-3 h-3" aria-hidden="true" />
    //       Buildings
    //     </span>
    //   ),
    // },
    {
      id: 'roads',
      label: (
        <span className="inline-flex items-center gap-1">
          <Construction className="w-3 h-3" aria-hidden="true" />
          Roads
        </span>
      ),
    },
    // {
    //   id: "analytics",
    //   label: (
    //     <span className="inline-flex items-center gap-1">
    //       <BarChart3 className="w-3 h-3" aria-hidden="true" />
    //       Analytics
    //     </span>
    //   ),
    // },
  ];

  return (
    <div className="h-[19rem] sm:h-72 lg:h-80 glass-panel border-t border-white/10 flex flex-col overflow-hidden min-h-0">
      {/* Tab Headers - Reduced padding */}
      <div className="flex overflow-x-auto border-b border-white/10 px-2 sm:px-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 whitespace-nowrap px-3 py-2 text-xs font-medium border-b-2 transition-colors sm:px-4 ${
              activeTab === tab.id
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content - Consistent spacing */}
      <div className="flex-1 overflow-auto p-3 space-y-4 sm:p-4">
        {activeTab === 'events' && (
          <div className="space-y-4">
            {/* Header with Export Button */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Impact Breakdown by {getAggregationLabel()}
                </div>
                {filters.aggregationLevel === 'district' && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {geographyUi.focusAreaSingular}-level data unavailable, showing{' '}
                    {geographyUi.broaderAreaPlural.toLowerCase()} totals
                  </div>
                )}
              </div>
              {displayData.length > 0 && (
                <button
                  onClick={() => {
                    const dataToExport = displayData.map(data => ({
                      [getAggregationLabel()]: data.name,
                      Population: data.totalAffectedPopulation,
                      'Economic Loss': data.totalEconomicDamage,
                    }));
                    exportToCSV(
                      dataToExport,
                      `impact-by-${filters.aggregationLevel}`,
                      Object.keys(dataToExport[0] || {})
                    );
                  }}
                  className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                  title="Export to CSV"
                >
                  <span className="inline-flex items-center gap-1">
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Export
                  </span>
                </button>
              )}
            </div>

            {/* Empty State */}
            {displayData.length === 0 && (
              <div className="glass-panel rounded-xl p-8 text-center space-y-4">
                <AlertCircle className="w-12 h-12 mx-auto text-slate-400" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">
                    No Impact Data Available
                  </h3>
                  <div className="text-sm text-slate-400 space-y-2">
                    {selectedRegion && (
                      <div className="flex items-center justify-center gap-2">
                        <MapPin className="w-4 h-4 text-amber-400" />
                        <span>
                          Region filter: <strong>{selectedRegion}</strong>
                        </span>
                      </div>
                    )}
                    {filters.selectedSectors.length > 0 && (
                      <div className="flex items-center justify-center gap-2">
                        <Construction className="w-4 h-4 text-blue-400" />
                        <span>
                          Sector filter: <strong>{filters.selectedSectors.join(', ')}</strong>
                        </span>
                      </div>
                    )}
                    {filters.selectedHazards.length > 0 && (
                      <div className="flex items-center justify-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                        <span>
                          Hazard filter: <strong>{filters.selectedHazards.join(', ')}</strong>
                        </span>
                      </div>
                    )}
                    {regionalSummary && regionalSummary.length === 0 && (
                      <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <p className="text-amber-300 text-xs">
                          CSV data not loaded. Check that regional-summary.csv is available.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Row Breakdown Table */}
            {displayData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-700/60">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        {getAggregationLabel()}
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Population
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Economic Damage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {displayData.map(data => (
                      <tr key={data.id} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                          {data.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-100 text-right">
                          {formatNumber(data.totalAffectedPopulation)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-100 text-right font-medium">
                          {formatCurrency(data.totalEconomicDamage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {displayData.length > 1 && (
                    <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-100">TOTAL</td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                          {formatNumber(nationalSummary.totalPopulation)}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                          {formatCurrency(nationalSummary.totalLoss)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'exposure' && (
          <div className="space-y-4">
            {/* Header with Export Button */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">
                Exposure Data ({exposureDisplayData.length} entries)
                {hasEventOrDateFilters && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    Event and date filters are applied using the active event metadata.
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  const dataToExport = exposureDisplayData.map(exp => ({
                    Region: exp.region,
                    Sector: getSectorName(exp.sectorId),
                    Hazard: exp.hazardId === 'aggregated' ? 'All' : getHazardName(exp.hazardId),
                    Population: exp.population,
                    Buildings: exp.buildingCount,
                    'Value at Risk': exp.assets,
                  }));
                  exportToCSV(dataToExport, 'exposure-data', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700/60">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Region
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Sector
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Hazard
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Population
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Buildings
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Value at Risk
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {exposureDisplayData.map((exposure, index) => (
                    <tr key={exposure.id || `exposure-${index}`} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                        {exposure.region || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        {getSectorName(exposure.sectorId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                          style={{ backgroundColor: getHazardColor(exposure.hazardId) }}
                          aria-hidden="true"
                        />
                        {getHazardName(exposure.hazardId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {formatNumber(exposure.population)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {formatNumber(exposure.buildingCount || (exposure as any).infrastructure)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right font-medium">
                        {formatCurrency(exposure.assets)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                  <tr>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100">TOTAL</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatNumber(exposureTotals.population)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatNumber(exposureTotals.buildings)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatCurrency(exposureTotals.assets)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'economic-sector' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="text-sm text-slate-400">
                Economic Damage aggregated by sector. For asset-specific details, see the
                &ldquo;Economic by Asset&rdquo; tab.
                {hasHazardEventOrDateFilters && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    Hazard, event, date, and sector filters are applied to these event-linked
                    economic records.
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  const dataToExport = filteredSectorEconomicData.map(damage => ({
                    Region: damage.region || geographyUi.nationalLabel,
                    Sector: getSectorName(damage.sectorId),
                    'Wind Loss': damage.directLoss,
                    'Total Loss': damage.totalLoss,
                    Buildings: damage.buildingCount || 0,
                  }));
                  exportToCSV(dataToExport, 'economic-sector', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700/60">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Region
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Sector
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Wind Damage
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Total Damage
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Buildings
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {filteredSectorEconomicData.map((damage, index) => (
                    <tr key={damage.id || `damage-sector-${index}`} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                        {damage.region || geographyUi.nationalLabel}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        {getSectorName(damage.sectorId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {formatCurrency(damage.directLoss)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right font-bold">
                        {formatCurrency(damage.totalLoss)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200 text-right">
                        {formatNumber(damage.buildingCount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                  <tr>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatCurrency(sectorEconomicTotals.directLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatCurrency(sectorEconomicTotals.totalLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatNumber(sectorEconomicTotals.buildings)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'economic-asset' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="text-sm text-slate-400">
                Economic damage aggregated by individual asset type. For sector-level aggregates,
                see the &ldquo;Economic by Sector&rdquo; tab.
                {hasHazardEventOrDateFilters && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    Hazard, event, date, and sector filters are applied to these event-linked
                    economic records.
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  const dataToExport = filteredAssetEconomicData.map(damage => ({
                    'Asset Type': damage.assetType || 'Unknown',
                    Sector: getSectorName(damage.sectorId),
                    Count: damage.assetCount || 0,
                    'Wind Loss': damage.directLoss,
                    'Total Loss': damage.totalLoss,
                  }));
                  exportToCSV(dataToExport, 'economic-asset', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700/60">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Asset Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Sector
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Count
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Wind Damage
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Total Damage
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {filteredAssetEconomicData.map((damage, index) => (
                    <tr key={damage.id || `damage-asset-${index}`} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                        {damage.assetType || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">
                        {getSectorName(damage.sectorId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {formatNumber(damage.assetCount || 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right">
                        {formatCurrency(damage.directLoss)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-100 text-right font-bold">
                        {formatCurrency(damage.totalLoss)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900/40 border-t-2 border-slate-700">
                  <tr>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatNumber(assetEconomicTotals.assetCount)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatCurrency(assetEconomicTotals.directLoss)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-100 text-right">
                      {formatCurrency(assetEconomicTotals.totalLoss)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Warning when incompatible filters are active */}
            {hasHazardEventOrDateFilters && (
              <div className="text-xs px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-2">
                <AlertCircle
                  className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-amber-200">
                  <strong>Limited Filter Support:</strong> This tab shows pre-aggregated CSV data.
                  {filters.selectedHazards.length > 0 && (
                    <div className="mt-1">
                      • Hazard filter is <strong>not applied</strong> (data contains all hazards)
                    </div>
                  )}
                  {hasEventOrDateFilters && (
                    <div className="mt-1">
                      • Event/Date filters are <strong>not applied</strong> (data contains all
                      events)
                    </div>
                  )}
                  <div className="mt-1.5 text-[10px] text-amber-300/80">
                    For fully filtered results, use the &quot;Economic by Sector&quot; or
                    &quot;Economic by Asset&quot; tabs.
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-slate-400 px-4 py-2 bg-slate-900/30 rounded border border-slate-700/50">
              <span className="inline-flex items-center gap-1">
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
                <strong>Data Source:</strong>
              </span>{' '}
              This tab displays national-level CSV aggregates.{' '}
              {regionalSummaryBySector && regionalSummaryBySector.length > 0 ? (
                <>
                  <strong>Sector and region filters apply.</strong> Other filters (hazard, date,
                  event) do not affect this data as the CSV lacks that granularity.
                </>
              ) : (
                <>
                  <strong>Only sector filter applies.</strong> Hazard, date, and event filters do
                  not affect this data as the CSV lacks that granularity.
                </>
              )}
            </div>
            {filteredImpactByAssetType && filteredImpactByAssetType.length > 0 && (
              <div className="overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-200">Impact by Asset Type</div>
                  <button
                    onClick={() => {
                      const dataToExport = filteredImpactByAssetType.map(row => ({
                        Asset: row.Asset || 'Unknown',
                        'Total Loss': Number(row.Total_Loss) || 0,
                      }));
                      exportToCSV(dataToExport, 'impact-by-asset', ['Asset', 'Total Loss']);
                    }}
                    className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                    title="Export to CSV"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Download className="w-3 h-3" aria-hidden="true" />
                      Export
                    </span>
                  </button>
                </div>
                <table className="min-w-full divide-y divide-slate-700/60">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Loss
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {[...filteredImpactByAssetType]
                      .sort((a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))
                      .map((row, idx) => (
                        <tr key={row.Asset || `asset-${idx}`} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-sm text-slate-100">
                            {row.Asset || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-100 text-right font-semibold">
                            {formatCurrency(Number(row.Total_Loss) || 0)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredImpactBySector && filteredImpactBySector.length > 0 && (
              <div className="overflow-x-auto">
                {/* Title and Export Button */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-blue-600 uppercase tracking-wide">
                    Sector Analysis
                  </h3>
                  <button
                    onClick={() => {
                      const dataToExport = filteredImpactBySector.map(row => ({
                        Sector: row.Sector || 'Unknown',
                        'Exposed Buildings': Number(row.Number_Exposed_Buildings) || 0,
                        'Damaged Buildings': Number(row.Number_Damaged_Buildings) || 0,
                        'Building Loss': Number(row.Building_Loss) || 0,
                        'Total Loss': Number(row.Total_Loss) || 0,
                      }));
                      exportToCSV(dataToExport, 'impact-by-sector', [
                        'Sector',
                        'Exposed Buildings',
                        'Damaged Buildings',
                        'Building Loss',
                        'Total Loss',
                      ]);
                    }}
                    className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                    title="Export to CSV"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Download className="w-3 h-3" aria-hidden="true" />
                      Export
                    </span>
                  </button>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg overflow-hidden shadow-lg border border-gray-200">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-blue-700">
                        <th className="px-6 py-4 text-left text-sm font-bold text-white uppercase tracking-wider border-r border-blue-600">
                          Sector
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-bold text-white uppercase tracking-wider border-r border-blue-600">
                          Exposed
                          <br />
                          Buildings
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-bold text-white uppercase tracking-wider border-r border-blue-600">
                          Damaged
                          <br />
                          Buildings
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-bold text-white uppercase tracking-wider border-r border-blue-600">
                          Building Loss
                          <br />
                          (USD)
                        </th>
                        <th className="px-6 py-4 text-center text-sm font-bold text-white uppercase tracking-wider">
                          Total Damage (USD)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredImpactBySector]
                        .sort((a, b) => (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0))
                        .map((row, idx) => (
                          <tr
                            key={row.Sector || `sector-${idx}`}
                            className={`${
                              idx % 2 === 0 ? 'bg-cyan-50/30' : 'bg-white'
                            } hover:bg-blue-50/50 transition-colors border-b border-cyan-200`}
                          >
                            <td className="px-6 py-4 text-sm text-blue-600 font-semibold border-r border-cyan-200">
                              {row.Sector || 'Unknown'}
                            </td>
                            <td className="px-6 py-4 text-sm text-blue-700 text-center tabular-nums border-r border-cyan-200">
                              {formatNumber(Number(row.Number_Exposed_Buildings) || 0)}
                            </td>
                            <td className="px-6 py-4 text-sm text-blue-700 text-center tabular-nums border-r border-cyan-200">
                              {formatNumber(Number(row.Number_Damaged_Buildings) || 0)}
                            </td>
                            <td className="px-6 py-4 text-sm text-blue-700 text-center tabular-nums border-r border-cyan-200">
                              {formatCurrency(Number(row.Building_Loss) || 0)}
                            </td>
                            <td className="px-6 py-4 text-sm text-blue-700 text-center font-semibold tabular-nums">
                              {formatCurrency(Number(row.Total_Loss) || 0)}
                            </td>
                          </tr>
                        ))}
                      {filteredImpactBySector.length > 0 && (
                        <tr className="bg-cyan-200/60 font-bold border-t-2 border-blue-400">
                          <td className="px-6 py-4 text-sm text-blue-900 uppercase tracking-wide border-r border-cyan-300">
                            Total
                          </td>
                          <td className="px-6 py-4 text-sm text-blue-900 text-center tabular-nums border-r border-cyan-300">
                            {formatNumber(
                              filteredImpactBySector.reduce(
                                (sum, row) => sum + (Number(row.Number_Exposed_Buildings) || 0),
                                0
                              )
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-blue-900 text-center tabular-nums border-r border-cyan-300">
                            {formatNumber(
                              filteredImpactBySector.reduce(
                                (sum, row) => sum + (Number(row.Number_Damaged_Buildings) || 0),
                                0
                              )
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-blue-900 text-center tabular-nums border-r border-cyan-300">
                            {formatCurrency(
                              filteredImpactBySector.reduce(
                                (sum, row) => sum + (Number(row.Building_Loss) || 0),
                                0
                              )
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-blue-900 text-center font-bold tabular-nums">
                            {formatCurrency(
                              filteredImpactBySector.reduce(
                                (sum, row) => sum + (Number(row.Total_Loss) || 0),
                                0
                              )
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'damage' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400 px-4 py-2 bg-slate-900/30 rounded border border-slate-700/50">
                <span className="inline-flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                  <strong>Note:</strong>
                </span>{' '}
                This tab shows regional damage totals (buildings, roads, roads) from pre-aggregated
                CSV data. <strong>Sector, hazard, and date filters do not apply</strong> as the
                source data doesn&apos;t contain that granularity. Shows total damage across all
                sectors and hazards for each region.
              </div>
              <button
                onClick={() => {
                  const dataToExport = filteredRegionalSummary
                    .filter((r: any) => r.Region && r.Region.trim() !== '')
                    .map((r: any) => ({
                      Region: r.Region,
                      Population: Number(r.Total_Population) || 0,
                      'Total Buildings': Number(r.Total_Buildings) || 0,
                      'Damaged Buildings': Number(r.Damaged_Buildings) || 0,
                      'Road km': Number(r.Damaged_Road_km) || 0,
                      'Total Loss': Number(r.Total_Loss) || 0,
                      'Loss per Capita':
                        (Number(r.Total_Loss) || 0) / (Number(r.Total_Population) || 1),
                      'Damage %':
                        (
                          ((Number(r.Damaged_Buildings) || 0) / (Number(r.Total_Buildings) || 1)) *
                          100
                        ).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        }) + '%',
                    }));
                  exportToCSV(dataToExport, 'regional-damage', Object.keys(dataToExport[0] || {}));
                }}
                className="px-3 py-1 text-xs rounded border bg-emerald-500/10 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/20 transition-colors"
                title="Export to CSV"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Export
                </span>
              </button>
            </div>
            {/* Enhanced Regional Table with Derived Metrics */}
            {filteredRegionalSummary && filteredRegionalSummary.length > 0 && (
              <EnhancedRegionalTable
                data={filteredRegionalSummary
                  .filter((r: any) => r.Region && r.Region.trim() !== '')
                  .map((r: any) => ({
                    id: r.Region_ID || r.Region,
                    name: r.Region,
                    economicLoss: Number(r.Total_Loss) || 0,
                    populationAffected: Number(r.Total_Population) || 0,
                    assetsExposed: Number(r.Total_Buildings) || 0,
                    assetsDamaged: Number(r.Damaged_Buildings) || 0,
                    area: 100, // Placeholder - would need actual area data
                    totalPopulation: Number(r.Total_Population) || 0,
                  }))}
                nationalTotal={filteredRegionalSummary.reduce(
                  (sum: number, r: any) => sum + (Number(r.Total_Loss) || 0),
                  0
                )}
                showDerivedMetrics={true}
              />
            )}

            {/* Regional Summary Table with Normalized Metrics */}
            {filteredRegionalSummary && filteredRegionalSummary.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <div className="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
                    <span>Regional Damage Assessment</span>
                    <span className="text-xs font-normal text-slate-400">
                      {filteredRegionalSummary.length} regions analyzed
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-slate-700/60 text-xs">
                    <thead className="bg-slate-900/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-200 uppercase tracking-wider sticky left-0 bg-slate-900/60">
                          Region
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Population
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Buildings
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Damaged
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Road km
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                          Total Loss
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider bg-blue-500/10">
                          Loss/Capita
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider bg-blue-500/10">
                          Damage %
                        </th>
                      </tr>
                    </thead>
                    <tbody className="glass-panel divide-y divide-slate-700">
                      {filteredRegionalSummary
                        .filter((r: any) => r.Region && r.Region.trim() !== '')
                        .sort(
                          (a: any, b: any) =>
                            (Number(b.Total_Loss) || 0) - (Number(a.Total_Loss) || 0)
                        )
                        .map((region: any, idx: number) => {
                          const totalPop = Number(region.Total_Population) || 1;
                          const totalBuildings = Number(region.Total_Buildings) || 1;
                          const totalLoss = Number(region.Total_Loss) || 0;
                          const damagedBuildings = Number(region.Damaged_Buildings) || 0;
                          const lossPerCapita = totalLoss / totalPop;
                          const damagePercent = (damagedBuildings / totalBuildings) * 100;
                          const damagePercentDisplay = damagePercent.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          });

                          return (
                            <tr
                              key={region.Region_ID || `region-${idx}`}
                              className="hover:bg-white/5/50 transition-colors"
                            >
                              <td className="px-3 py-2 text-sm font-medium text-slate-100 sticky left-0 bg-slate-900/95 backdrop-blur-sm">
                                {region.Region || 'Unknown'}
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-200 text-right tabular-nums">
                                {formatNumber(totalPop)}
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-200 text-right tabular-nums">
                                {formatNumber(totalBuildings)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {formatNumber(damagedBuildings)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-200 text-right tabular-nums">
                                {Number(region.Damaged_Road_km || 0)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums">
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {formatCurrency(totalLoss)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-200 text-right tabular-nums bg-blue-500/10">
                                ${lossPerCapita}
                              </td>
                              <td className="px-3 py-2 text-sm text-right tabular-nums bg-blue-500/10">
                                <span
                                  className={`font-semibold ${
                                    damagePercent > 75
                                      ? 'text-red-600 dark:text-red-400'
                                      : damagePercent > 50
                                        ? 'text-orange-600 dark:text-orange-400'
                                        : damagePercent > 25
                                          ? 'text-yellow-600 dark:text-yellow-400'
                                          : 'text-green-600 dark:text-green-400'
                                  }`}
                                >
                                  {damagePercentDisplay}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-slate-400">
                No regional summary data available
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="p-4 overflow-y-auto">
            <ComparativeAnalytics regionalData={regionalSummary} sectorData={impactBySector} />
          </div>
        )}

        {/* Buildings Tab */}
        {activeTab === 'buildings' && (
          <div className="overflow-y-auto">
            {damagedBuildings && onZoomToAsset ? (
              <BuildingsTable
                data={damagedBuildings}
                onZoom={onZoomToAsset}
                maxHeight="calc(100vh - 400px)"
              />
            ) : (
              <div className="glass-panel rounded-lg p-8 text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p className="text-slate-200 font-medium">No building damage data available</p>
                <p className="text-sm text-slate-400 mt-1">
                  Building data will appear here when loaded
                </p>
              </div>
            )}
          </div>
        )}

        {/* Roads Tab */}
        {activeTab === 'roads' && (
          <div className="overflow-y-auto">
            {damagedRoads && onZoomToAsset ? (
              <RoadsTable
                data={damagedRoads}
                onZoom={onZoomToAsset}
                maxHeight="calc(100vh - 400px)"
              />
            ) : (
              <div className="glass-panel rounded-lg p-8 text-center">
                <Construction className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p className="text-slate-200 font-medium">No road damage data available</p>
                <p className="text-sm text-slate-400 mt-1">
                  Road data will appear here when loaded
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
