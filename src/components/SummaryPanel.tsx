'use client';

/**
 * ARCHITECTURAL NOTE: Cyclone Controls Encapsulation
 *
 * Current Implementation: The cyclone animation control state is managed by
 * the parent component and passed down through the left workspace.
 * This creates tight coupling between the parent page and SummaryPanel.
 *
 * Recommended Refactor: Create a dedicated <CycloneControlManager /> component that:
 * - Self-manages its active/inactive state internally
 * - Listens to map events for cyclone track clicks
 * - Renders the timeline controls directly (no portal needed)
 * - Is rendered within the cyclone workspace when data is available
 *
 * Benefits: Cleaner props interface, better separation of concerns, easier testing,
 * and improved maintainability.
 */

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  Flame,
  Home,
  Hourglass,
  MapPin,
  Navigation,
  Target,
  TrendingUp,
  Users,
  Wind,
  Wheat,
  X,
  Maximize2,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import {
  Event,
  SummaryStats,
  FilterState,
  District,
  Province,
  Sector,
  Hazard,
  RegionalSummary,
  RegionalSummaryBySector,
} from '@/types';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { computeFilteredData } from '../utils/filteredData';
import { COUNTRY_CONFIGS } from '@/data/countryConfigs';
import {
  areaMatchesSelection,
  normalizeEventAreaRows,
  normalizeSummaryAreaRows,
} from '@/utils/adminNormalization';
import AdvancedCharts from './AdvancedCharts';
import HeroMetric from './HeroMetric';
import TopInsightsCards, { createDistrictInsights } from './TopInsightsCards';
import RankedDistrictsChart from './RankedDistrictsChart';
import { SECTOR_COLORS, UI_COLORS } from '@/theme/colors';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SummaryPanelProps {
  events: Event[];
  filters: FilterState;
  districts: District[];
  provinces: Province[];
  sectors: Sector[];
  hazards: Hazard[];
  selectedCountry?: CountryCode | null;
  selectedRegion?: string | null;
  onRegionClear?: () => void;
  assetExposureData?: any;
  nationalSummary?: any[];
  regionalSummary?: RegionalSummary[];
  regionalSummaryBySector?: RegionalSummaryBySector[];
  impactBySector?: any[];
}

function PopoutVisualization({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    Promise.resolve().then(() => {
      setOverlayRoot(document.getElementById('map-overlay-root'));
    });
  }, []);

  const overlay = (
    <div className="absolute inset-0 pointer-events-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[min(1080px,94vw)] max-h-[88vh] rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-600/60 text-slate-200 bg-slate-900/60 hover:bg-slate-800/70 transition-colors"
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[calc(88vh-60px)]">{children}</div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-end justify-end mb-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-600/60 text-slate-200 bg-slate-900/60 hover:bg-slate-800/70 transition-colors"
          aria-label={`Expand ${title}`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Pop out
        </button>
      </div>
      {children}
      {isOpen &&
        (overlayRoot
          ? createPortal(overlay, overlayRoot)
          : createPortal(<div className="fixed inset-0 z-[90]">{overlay}</div>, document.body))}
    </>
  );
}

export default function SummaryPanel({
  events,
  filters,
  districts,
  provinces,
  sectors,
  hazards,
  selectedCountry = null,
  selectedRegion = null,
  onRegionClear,
  assetExposureData = null,
  nationalSummary = [],
  regionalSummary = [],
  regionalSummaryBySector = [],
  impactBySector = [],
}: SummaryPanelProps) {
  const geographyUi = selectedCountry
    ? COUNTRY_CONFIGS[selectedCountry].ui
    : {
        focusAreaSingular: 'District',
        focusAreaPlural: 'Districts',
        broaderAreaSingular: 'Region',
        broaderAreaPlural: 'Regions',
        nationalLabel: 'National',
      };
  const regionMatchesSelection = useCallback(
    (row: any, selection: string | null) => areaMatchesSelection(row, selection),
    []
  );
  const [activeTab, setActiveTab] = useState<'summary' | 'exposure' | 'damage' | 'analytics'>(
    'summary'
  );
  const [districtMetric, setDistrictMetric] = useState<'loss' | 'population'>('loss');
  const isSummaryTab = activeTab === 'summary';

  const { filteredEvents, aggregatedEventData } = useMemo(
    () =>
      computeFilteredData({
        events,
        filters,
        districts,
        provinces,
      }),
    [events, filters, districts, provinces]
  );

  const normalizedEventAreaData = useMemo(
    () => normalizeEventAreaRows(aggregatedEventData as unknown as Record<string, unknown>[]),
    [aggregatedEventData]
  );

  const requiresEventDerivedAreas =
    filters.selectedHazards.length > 0 ||
    filters.selectedEvents.length > 0 ||
    !!filters.dateRange.start ||
    !!filters.dateRange.end;

  const selectedSectorNames = useMemo(
    () =>
      filters.selectedSectors
        .map(id => sectors.find(sector => sector.id === id)?.name)
        .filter((name): name is string => !!name),
    [filters.selectedSectors, sectors]
  );

  // Filter CSV data based on sector filters (Tier 1 + Tier 2)
  const filteredImpactBySector = useMemo(() => {
    if (!impactBySector || impactBySector.length === 0) return [];
    if (selectedSectorNames.length === 0) return impactBySector;
    return impactBySector.filter(row => selectedSectorNames.includes(row.Sector));
  }, [impactBySector, selectedSectorNames]);

  const filteredRegionalSummaryBySector = useMemo(() => {
    if (!regionalSummaryBySector || regionalSummaryBySector.length === 0) return [];
    if (selectedSectorNames.length === 0) return regionalSummaryBySector;
    return regionalSummaryBySector.filter(row => selectedSectorNames.includes(row.Sector));
  }, [regionalSummaryBySector, selectedSectorNames]);

  // Derive regional totals from filtered sector data (Tier 2)
  const derivedRegionalSummary = useMemo(() => {
    if (filteredRegionalSummaryBySector.length === 0) return regionalSummary || [];

    // Build a lookup of population stats from the full regional summary,
    // because regional-summary-by-sector.csv has no population columns.
    const regionPopLookup: Record<
      string,
      { Total_Population: number; Population_Exposed_To_Any_Hazard: number }
    > = {};
    (regionalSummary || []).forEach((r: any) => {
      regionPopLookup[r.Region] = {
        Total_Population: Number(r.Total_Population) || 0,
        Population_Exposed_To_Any_Hazard: Number(r.Population_Exposed_To_Any_Hazard) || 0,
      };
    });

    const regionTotals = filteredRegionalSummaryBySector.reduce((acc: any, row: any) => {
      const region = row.Region;
      if (!acc[region]) {
        acc[region] = {
          Region: region,
          Total_Loss: 0,
          Total_Buildings: 0,
          Damaged_Buildings: 0,
          // Population from full regional summary (sector CSVs have no population columns)
          Total_Population: regionPopLookup[region]?.Total_Population ?? 0,
          Population_Exposed_To_Any_Hazard:
            regionPopLookup[region]?.Population_Exposed_To_Any_Hazard ?? 0,
        };
      }
      acc[region].Total_Loss += Number(row.Total_Loss || 0);
      acc[region].Total_Buildings += Number(row.Total_Number_Buildings || 0);
      acc[region].Damaged_Buildings += Number(row.Number_Damaged_Buildings || 0);
      return acc;
    }, {});

    return Object.values(regionTotals) as RegionalSummary[];
  }, [filteredRegionalSummaryBySector, regionalSummary]);

  const normalizedSummaryAreaData = useMemo(
    () => normalizeSummaryAreaRows(derivedRegionalSummary as unknown as Record<string, unknown>[]),
    [derivedRegionalSummary]
  );

  const displayAggregatedData = useMemo(() => {
    if (!requiresEventDerivedAreas && normalizedSummaryAreaData.length > 0) {
      return normalizedSummaryAreaData;
    }

    if (filteredEvents.length > 0 && normalizedEventAreaData.length > 0) {
      return normalizedEventAreaData;
    }

    return normalizedSummaryAreaData;
  }, [
    requiresEventDerivedAreas,
    normalizedSummaryAreaData,
    filteredEvents.length,
    normalizedEventAreaData,
  ]);

  const isUsingEventAreaData =
    filteredEvents.length > 0 && displayAggregatedData === normalizedEventAreaData;
  const areaLabelSingular = isUsingEventAreaData
    ? geographyUi.focusAreaSingular
    : geographyUi.broaderAreaSingular;
  const areaLabelPlural = isUsingEventAreaData
    ? geographyUi.focusAreaPlural
    : geographyUi.broaderAreaPlural;

  // Filter regional data by selected region
  const regionFilteredData = useMemo(() => {
    if (!selectedRegion) return derivedRegionalSummary;
    return derivedRegionalSummary.filter(row => regionMatchesSelection(row, selectedRegion));
  }, [selectedRegion, derivedRegionalSummary, regionMatchesSelection]);

  // Calculate CSV-based totals (for when CSV data is available)
  const csvTotals = useMemo(() => {
    // If region is selected, sum from filtered regional data
    if (selectedRegion && regionFilteredData.length > 0) {
      return {
        totalLoss: regionFilteredData.reduce((sum, row) => sum + (Number(row.Total_Loss) || 0), 0),
        totalPopulation: regionFilteredData.reduce(
          (sum, row) => sum + (Number(row.Total_Population) || 0),
          0
        ),
        affectedPopulation: regionFilteredData.reduce(
          (sum, row) => sum + (Number(row.Population_Exposed_To_Any_Hazard) || 0),
          0
        ),
        districtCount: regionFilteredData.length,
      };
    }

    // Otherwise use national summary
    if (nationalSummary && nationalSummary.length > 0) {
      return {
        totalLoss: Number(nationalSummary[0]?.Total_Loss) || 0,
        totalPopulation: Number(nationalSummary[0]?.Total_Population) || 0,
        affectedPopulation: Number(nationalSummary[0]?.Population_Exposed_To_Any_Hazard) || 0,
        districtCount: regionalSummary?.length || 0,
      };
    }

    return null;
  }, [selectedRegion, regionFilteredData, nationalSummary, regionalSummary]);

  // Check if filters are active (Tier 3)
  const hasActiveFilters = useMemo(
    () => filters.selectedSectors.length > 0 || filters.selectedHazards.length > 0,
    [filters.selectedSectors.length, filters.selectedHazards.length]
  );

  const activeFilterLabel = useMemo(() => {
    const selectedSectorNames = filters.selectedSectors
      .map(id => sectors.find(sector => sector.id === id)?.name)
      .filter((name): name is string => !!name);
    const selectedHazardNames = filters.selectedHazards
      .map(id => hazards.find(hazard => hazard.id === id)?.name || id)
      .filter(Boolean);

    return [...selectedSectorNames, ...selectedHazardNames].join(' • ');
  }, [filters.selectedHazards, filters.selectedSectors, hazards, sectors]);

  // Calculate summary statistics DIRECTLY from filtered events (not aggregated data)
  // This ensures stats are always accurate even when district/province IDs don't match
  const stats: SummaryStats = useMemo(
    () => ({
      totalEvents: filteredEvents.length,
      totalAffectedPopulation: filteredEvents.reduce(
        (sum, e) => sum + (e.totalAffectedPopulation || 0),
        0
      ),
      totalEconomicDamage: filteredEvents.reduce((sum, e) => sum + (e.totalEconomicDamage || 0), 0),
    }),
    [filteredEvents]
  );

  // Define sector colors using the centralized theme system
  // These colors complement the application's blue/purple/slate aesthetic
  const sectorColors: { [key: string]: string } = useMemo(
    () => ({
      Residential: SECTOR_COLORS.residential,
      Infrastructure: SECTOR_COLORS.infrastructure,
      Public: SECTOR_COLORS.government,
      Productive: SECTOR_COLORS.agriculture,
      Education: SECTOR_COLORS.education,
      Health: SECTOR_COLORS.health,
      Commercial: SECTOR_COLORS.commercial,
      Industrial: SECTOR_COLORS.industrial,
      Other: UI_COLORS.textMuted,
    }),
    []
  );

  // Shared doughnut chart tooltip configuration using theme colors
  const doughnutTooltipConfig = {
    backgroundColor: UI_COLORS.glassDark,
    titleColor: UI_COLORS.textPrimary,
    bodyColor: UI_COLORS.textSecondary,
    borderColor: UI_COLORS.borderMedium,
    borderWidth: 1,
    padding: 12,
    displayColors: true,
    boxWidth: 12,
    boxHeight: 12,
    boxPadding: 6,
  };

  // Helper function to create doughnut chart data
  const createDoughnutData = useCallback(
    (data: any[], valueField: string) => {
      if (!data || data.length === 0) return null;

      const validSectors = data.filter(s => s.Sector !== 'Unknown' && (s[valueField] || 0) > 0);

      if (validSectors.length === 0) return null;

      const total = validSectors.reduce((sum, s) => sum + (s[valueField] || 0), 0);

      return {
        labels: validSectors.map(s => s.Sector),
        datasets: [
          {
            data: validSectors.map(s => (s[valueField] || 0) / 1000000),
            backgroundColor: validSectors.map(s => sectorColors[s.Sector] || UI_COLORS.textMuted),
            borderWidth: 3,
            borderColor: UI_COLORS.glassDark,
            hoverBorderColor: UI_COLORS.borderMedium,
            hoverBorderWidth: 3,
          },
        ],
        total: total / 1000000,
      };
    },
    [sectorColors]
  );

  const realSectorChartData = useMemo(() => {
    if (!filteredImpactBySector || filteredImpactBySector.length === 0) {
      return null;
    }

    // Filter out Unknown sector and sort by total loss
    const sortedSectors = [...filteredImpactBySector]
      .filter(s => s.Sector !== 'Unknown')
      .sort((a, b) => (b.Total_Loss || 0) - (a.Total_Loss || 0));

    return {
      labels: sortedSectors.map(s => s.Sector),
      datasets: [
        {
          label: 'Economic Loss (Millions USD)',
          data: sortedSectors.map(s => (s.Total_Loss || 0) / 1000000),
          backgroundColor: sortedSectors.map(s => sectorColors[s.Sector] || UI_COLORS.textMuted),
          borderRadius: 6,
        },
      ],
    };
  }, [filteredImpactBySector, sectorColors]);

  // Doughnut chart data for Total Exposed Value by Sector
  const exposureDoughnutData = useMemo(
    () => createDoughnutData(filteredImpactBySector, 'Total_Exposed_Value'),
    [filteredImpactBySector, createDoughnutData]
  );

  // Doughnut chart data for Total Loss by Sector
  const damageDoughnutData = useMemo(
    () => createDoughnutData(filteredImpactBySector, 'Total_Loss'),
    [filteredImpactBySector, createDoughnutData]
  );

  // Asset type breakdown chart data
  const assetTypeChartData = useMemo(() => {
    if (
      !assetExposureData ||
      !assetExposureData.stats ||
      !assetExposureData.stats.byType ||
      typeof assetExposureData.stats.byType !== 'object'
    ) {
      return null;
    }

    const assetTypes = Object.entries(assetExposureData.stats.byType)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 5); // Top 5 asset types

    // Use theme colors for asset types
    const colors = [
      SECTOR_COLORS.agriculture,
      SECTOR_COLORS.residential,
      SECTOR_COLORS.commercial,
      SECTOR_COLORS.infrastructure,
      SECTOR_COLORS.industrial,
    ];

    return {
      labels: assetTypes.map(([type]) => type),
      datasets: [
        {
          data: assetTypes.map(([, count]) => count),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: UI_COLORS.glassDark,
        },
      ],
    };
  }, [assetExposureData]);

  // Process wind intensity data from national summary
  const windIntensityData = useMemo(() => {
    if (!nationalSummary || nationalSummary.length === 0) return null;

    const data = nationalSummary[0];
    const ranges = [
      {
        label: '<83',
        population: Number(data['Wind_Gusts_kmph.range_<_83.Population']) || 0,
      },
      {
        label: '83-125',
        population: Number(data['Wind_Gusts_kmph.range_83_125.Population']) || 0,
      },
      {
        label: '125-164',
        population: Number(data['Wind_Gusts_kmph.range_125_164.Population']) || 0,
      },
      {
        label: '164-224',
        population: Number(data['Wind_Gusts_kmph.range_164_224.Population']) || 0,
      },
      {
        label: '224-280',
        population: Number(data['Wind_Gusts_kmph.range_224_280.Population']) || 0,
      },
      {
        label: '280+',
        population: Number(data['Wind_Gusts_kmph.range_280_+.Population']) || 0,
      },
    ];

    return {
      labels: ranges.map(r => r.label),
      datasets: [
        {
          label: 'Population',
          data: ranges.map(r => r.population),
          backgroundColor: SECTOR_COLORS.industrial, // Purple-500 from theme
          borderRadius: 4,
        },
      ],
    };
  }, [nationalSummary]);

  // Regional impact comparison - economic loss by region
  const regionalComparisonData = useMemo(() => {
    if (!derivedRegionalSummary || derivedRegionalSummary.length === 0) {
      return null;
    }

    const sortedRegions = [...derivedRegionalSummary]
      .sort((a: RegionalSummary, b: RegionalSummary) => (b.Total_Loss || 0) - (a.Total_Loss || 0))
      .slice(0, 6); // Top 6 regions

    return {
      labels: sortedRegions.map((r: RegionalSummary) => r.Region || 'Unknown'),
      datasets: [
        {
          label: 'Economic Loss (Millions USD)',
          data: sortedRegions.map((r: RegionalSummary) => (r.Total_Loss || 0) / 1000000),
          backgroundColor: [
            SECTOR_COLORS.residential,
            SECTOR_COLORS.infrastructure,
            SECTOR_COLORS.commercial,
            SECTOR_COLORS.agriculture,
            SECTOR_COLORS.education,
            SECTOR_COLORS.health,
          ],
          borderRadius: 4,
        },
      ],
    };
  }, [derivedRegionalSummary]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: UI_COLORS.borderSubtle,
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  // Show "No Data Available" state if no events and no CSV data exist
  const hasCSVData =
    (nationalSummary && nationalSummary.length > 0) ||
    (regionalSummary && regionalSummary.length > 0) ||
    (impactBySector && impactBySector.length > 0) ||
    (assetExposureData && Object.keys(assetExposureData).length > 0);

  if (events.length === 0 && !hasCSVData) {
    return (
      <aside className="w-80 max-w-[min(320px,calc(100vw-40px))] flex flex-col flex-shrink-0 glass-panel border-l border-white/10 h-full min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="glass-panel rounded-xl p-8 text-center space-y-4">
            <BarChart3 className="w-14 h-14 mx-auto text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-200">No Impact Data Available</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {selectedCountry ? (
                <>
                  PDIE model outputs for{' '}
                  <span className="font-semibold text-slate-300">
                    {COUNTRIES[selectedCountry].name}
                  </span>{' '}
                  have not been processed yet. Only hazard visualization layers are currently
                  available.
                </>
              ) : (
                'Select a country to view impact data and analysis.'
              )}
            </p>
            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Available: Cyclone track data and WMS hazard layers</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <Hourglass className="w-4 h-4 text-amber-400" />
                <span>Pending: Impact analysis and economic damage data</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div
      className="w-80 max-w-[min(320px,calc(100vw-40px))] h-full min-h-0 glass-panel border-l border-white/10 flex flex-col flex-shrink-0 overflow-hidden z-50"
      data-testid="summary-panel"
    >
      {/* Header */}
      <div className="p-4 space-y-3 border-b border-borderGlow bg-surface/95 backdrop-blur-sm flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Summary Dashboard</h2>
          <p className="text-xs text-slate-400 mt-1">
            {csvTotals
              ? `${csvTotals.districtCount} ${csvTotals.districtCount === 1 ? areaLabelSingular : areaLabelPlural}`
              : filteredEvents.length === events.length
                ? `${filteredEvents.length} ${filteredEvents.length === 1 ? areaLabelSingular : areaLabelPlural}`
                : `${filteredEvents.length} of ${events.length} ${areaLabelPlural.toLowerCase()}`}
          </p>
          {/* Active Filters Indicator */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-start gap-1.5 px-2 py-1 mt-2 bg-blue-500/10 border border-blue-500/30 rounded-md">
              <BarChart3 className="w-3 h-3 text-blue-400" />
              <span className="text-xs font-medium text-blue-300 break-words max-w-full">
                {activeFilterLabel}
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 gap-1 border-t border-slate-700/50 pt-3">
          {[
            { id: 'summary', label: 'Summary', icon: BarChart3 },
            { id: 'exposure', label: 'Exposure', icon: Home },
            { id: 'damage', label: 'Damage', icon: Flame },
            { id: 'analytics', label: 'Analytics', icon: TrendingUp },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`h-9 min-w-0 w-full flex items-center justify-center rounded-lg border text-slate-300 transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'bg-slate-700/20 border-transparent text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
              }`}
              aria-label={tab.label}
              title={tab.label}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span className="sr-only">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Region Selection Indicator */}
        {selectedRegion && (
          <div className="bg-neon-amber/10 border border-neon-amber/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-neon-amber flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{selectedRegion}</span>
              </span>
              <span className="text-xs text-slate-400 truncate">Filtering by region</span>
            </div>
            {onRegionClear && (
              <button
                onClick={onRegionClear}
                className="text-slate-400 hover:text-slate-200 transition-colors"
                aria-label="Clear region selection"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 space-y-4">
        {/* Summary Tab - Always mounted, visibility controlled by CSS */}
        <div className={isSummaryTab ? 'space-y-4' : 'hidden'}>
          <div className="space-y-4">
            {/* Data Scope Indicator */}
            <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-800/50 to-slate-700/30 border border-slate-600/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${hasActiveFilters ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'}`}
                />
                <span className="text-xs font-semibold text-slate-200">
                  {hasActiveFilters ? 'FILTERED DATA' : 'ALL DATA'}
                </span>
              </div>
              {hasActiveFilters && (
                <span className="text-[10px] text-blue-300 font-medium">
                  {csvTotals
                    ? `${csvTotals.districtCount} of ${regionalSummary?.length || 0} ${areaLabelPlural.toLowerCase()}`
                    : `${filteredEvents.length} of ${events.length} ${areaLabelPlural.toLowerCase()}`}
                </span>
              )}
            </div>

            {/* Hero Metrics */}
            <div className="space-y-3">
              {/* Total Economic Damage */}
              <HeroMetric
                label="Total Economic Damage"
                value={formatCurrency(csvTotals?.totalLoss ?? stats.totalEconomicDamage)}
                subtitle={
                  csvTotals
                    ? `Across ${csvTotals.districtCount} ${csvTotals.districtCount !== 1 ? areaLabelPlural.toLowerCase() : areaLabelSingular.toLowerCase()}`
                    : `Across ${filteredEvents.length} ${filteredEvents.length !== 1 ? areaLabelPlural.toLowerCase() : areaLabelSingular.toLowerCase()}`
                }
                icon={DollarSign}
                color="red"
              />

              {/* Affected Population */}
              <HeroMetric
                label="Affected Population"
                value={formatNumber(csvTotals?.affectedPopulation ?? stats.totalAffectedPopulation)}
                subtitle={
                  csvTotals && csvTotals.totalPopulation > 0
                    ? `${((csvTotals.affectedPopulation / csvTotals.totalPopulation) * 100 || 0).toFixed(1)}% of total population`
                    : `${filteredEvents.length} ${filteredEvents.length !== 1 ? areaLabelPlural.toLowerCase() : areaLabelSingular.toLowerCase()} affected`
                }
                icon={Users}
                color="orange"
              />
            </div>

            {/* Sector Breakdown - Doughnut Charts */}
            {(exposureDoughnutData || damageDoughnutData) && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-blue-100 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                    <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                  </svg>
                  Sector Distribution
                </h3>
                <div className="space-y-3">
                  {/* Exposure by Sector */}
                  {exposureDoughnutData && (
                    <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                      <h4 className="text-xs font-medium text-slate-300">Exposure by Sector</h4>
                      <PopoutVisualization
                        title="Exposure by Sector"
                        subtitle="Sector share of exposed value"
                      >
                        <div className="relative" style={{ height: '220px' }}>
                          <Doughnut
                            data={{
                              labels: exposureDoughnutData.labels,
                              datasets: exposureDoughnutData.datasets,
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: false },
                                tooltip: {
                                  ...doughnutTooltipConfig,
                                  callbacks: {
                                    label: context => {
                                      const label = context.label || '';
                                      const value = context.parsed || 0;
                                      const total = exposureDoughnutData.total;
                                      const percentage =
                                        total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                                      return `${label}: $${value.toFixed(1)}M (${percentage}%)`;
                                    },
                                  },
                                },
                              },
                            }}
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-bold text-white">
                              ${exposureDoughnutData.total.toFixed(0)}M
                            </span>
                            <span className="text-xs text-slate-400 mt-1">Total Exposed</span>
                          </div>
                        </div>
                        {/* Legend */}
                        <div className="mt-3 space-y-2">
                          {exposureDoughnutData.labels.map((label: string, idx: number) => {
                            const value = exposureDoughnutData.datasets[0].data[idx];
                            const percentage =
                              exposureDoughnutData.total > 0
                                ? ((value / exposureDoughnutData.total) * 100).toFixed(1)
                                : '0';
                            const color = exposureDoughnutData.datasets[0].backgroundColor[idx];
                            return (
                              <div key={idx} className="group">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-sm shadow-md transition-transform group-hover:scale-110"
                                      style={{
                                        backgroundColor: color,
                                        boxShadow: `0 0 10px ${color}50`,
                                      }}
                                    />
                                    <span className="text-slate-200 font-medium">{label}</span>
                                  </div>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-slate-300 font-semibold">
                                      ${value.toFixed(1)}M
                                    </span>
                                    <span className="text-slate-500 text-[10px]">•</span>
                                    <span className="text-cyan-400 font-bold">{percentage}%</span>
                                  </div>
                                </div>
                                <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: color,
                                      boxShadow: `0 0 8px ${color}80`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </PopoutVisualization>
                    </div>
                  )}

                  {/* Economic Damage by Sector */}
                  {damageDoughnutData && (
                    <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                      <h4 className="text-xs font-medium text-slate-300">
                        Economic Damage by Sector
                      </h4>
                      <PopoutVisualization
                        title="Economic Damage by Sector"
                        subtitle="Sector share of total losses"
                      >
                        <div className="relative" style={{ height: '220px' }}>
                          <Doughnut
                            data={{
                              labels: damageDoughnutData.labels,
                              datasets: damageDoughnutData.datasets,
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: false },
                                tooltip: {
                                  ...doughnutTooltipConfig,
                                  callbacks: {
                                    label: context => {
                                      const label = context.label || '';
                                      const value = context.parsed || 0;
                                      const total = damageDoughnutData.total;
                                      const percentage =
                                        total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                                      return `${label}: $${value.toFixed(1)}M (${percentage}%)`;
                                    },
                                  },
                                },
                              },
                            }}
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-bold text-white">
                              ${damageDoughnutData.total.toFixed(0)}M
                            </span>
                            <span className="text-xs text-slate-400 mt-1">Total Damage</span>
                          </div>
                        </div>
                        {/* Legend */}
                        <div className="mt-3 space-y-2">
                          {damageDoughnutData.labels.map((label: string, idx: number) => {
                            const value = damageDoughnutData.datasets[0].data[idx];
                            const percentage =
                              damageDoughnutData.total > 0
                                ? ((value / damageDoughnutData.total) * 100).toFixed(1)
                                : '0';
                            const color = damageDoughnutData.datasets[0].backgroundColor[idx];
                            return (
                              <div key={idx} className="group">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-sm shadow-md transition-transform group-hover:scale-110"
                                      style={{
                                        backgroundColor: color,
                                        boxShadow: `0 0 10px ${color}50`,
                                      }}
                                    />
                                    <span className="text-slate-200 font-medium">{label}</span>
                                  </div>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-slate-300 font-semibold">
                                      ${value.toFixed(1)}M
                                    </span>
                                    <span className="text-slate-500 text-[10px]">•</span>
                                    <span className="text-cyan-400 font-bold">{percentage}%</span>
                                  </div>
                                </div>
                                <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: color,
                                      boxShadow: `0 0 8px ${color}80`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </PopoutVisualization>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filtered Analysis Section */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs font-semibold text-blue-300">FILTERED VIEW</span>
                </div>
                <span className="text-xs text-blue-200/80 ml-auto">
                  {filters.selectedSectors.length > 0 &&
                    `${filters.selectedSectors.length} sector${filters.selectedSectors.length !== 1 ? 's' : ''}`}
                  {filters.selectedSectors.length > 0 &&
                    filters.selectedHazards.length > 0 &&
                    ' • '}
                  {filters.selectedHazards.length > 0 &&
                    `${filters.selectedHazards.length} hazard${filters.selectedHazards.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}

            {/* Summary Details - Collapsible */}
            <div className="space-y-4">
              <div className="space-y-4">
                {/* Top Insights - Analytical Highlights */}
                {displayAggregatedData && displayAggregatedData.length > 0 && (
                  <div className="glass-panel rounded-xl p-3 border border-slate-700/50 bg-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-amber-300" aria-hidden="true" />
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Key Insights
                      </h3>
                      {hasActiveFilters && (
                        <span className="ml-auto px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-full">
                          FILTERED
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 text-xs">
                      {(() => {
                        const topDistrict = [...displayAggregatedData].sort(
                          (a, b) => b.totalEconomicDamage - a.totalEconomicDamage
                        )[0];
                        const totalDamage = displayAggregatedData.reduce(
                          (sum, d) => sum + d.totalEconomicDamage,
                          0
                        );
                        const topDistrictShare =
                          totalDamage > 0
                            ? (topDistrict.totalEconomicDamage / totalDamage) * 100
                            : 0;
                        const avgDamagePerArea = totalDamage / displayAggregatedData.length;
                        const highImpactAreas = displayAggregatedData.filter(
                          d => d.totalEconomicDamage > avgDamagePerArea * 1.5
                        ).length;
                        const hasEconomicDamage = totalDamage > 0;

                        return (
                          <>
                            <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded-lg">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                              <div>
                                <span className="text-slate-300 font-medium">
                                  {topDistrict.name}
                                </span>
                                <span className="text-slate-400"> accounts for </span>
                                <span className="text-red-400 font-bold">
                                  {topDistrictShare.toFixed(1)}%
                                </span>
                                <span className="text-slate-400">
                                  {' '}
                                  of total damage
                                  {hasEconomicDamage
                                    ? ' — highest vulnerability'
                                    : ' — no recorded economic loss in current view'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded-lg">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                              <div>
                                <span className="text-orange-400 font-bold">
                                  {highImpactAreas}{' '}
                                  {highImpactAreas === 1
                                    ? areaLabelSingular.toLowerCase()
                                    : areaLabelPlural.toLowerCase()}
                                </span>
                                <span className="text-slate-400"> exceed </span>
                                <span className="text-slate-300">150% of average</span>
                                <span className="text-slate-400">
                                  {' '}
                                  damage — concentrated impact pattern
                                </span>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded-lg">
                              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                              <div>
                                <span className="text-slate-400">
                                  Average damage per {areaLabelSingular.toLowerCase()}:{' '}
                                </span>
                                <span className="text-cyan-400 font-bold font-mono">
                                  {formatCurrency(avgDamagePerArea)}
                                </span>
                                <span className="text-slate-400"> — use for prioritization</span>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {displayAggregatedData && displayAggregatedData.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Impact Highlights
                      </h4>
                      {hasActiveFilters && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-full">
                          FILTERED
                        </span>
                      )}
                    </div>
                    <TopInsightsCards
                      insights={createDistrictInsights(displayAggregatedData, undefined, {
                        singular: areaLabelSingular.toLowerCase(),
                        plural: areaLabelPlural.toLowerCase(),
                      })}
                      className="grid-cols-1 md:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1"
                    />
                  </div>
                )}

                {/* National Overview Section */}
                {nationalSummary && nationalSummary.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded-lg mt-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-xs font-semibold text-slate-300">
                          NATIONAL OVERVIEW
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 ml-auto">
                        All sectors • Complete dataset
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Households Affected
                            </p>
                            <p className="text-2xl font-bold text-blue-400 mt-1 tabular-nums">
                              {formatNumber(nationalSummary[0]?.Exposed_Households || 0)}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              of {formatNumber(nationalSummary[0]?.Total_Households || 0)} total
                              <span className="text-blue-400 font-semibold ml-1">
                                (
                                {(
                                  (nationalSummary[0]?.Exposed_Households /
                                    nationalSummary[0]?.Total_Households) *
                                    100 || 0
                                ).toFixed(1)}
                                %)
                              </span>
                            </p>
                          </div>
                          <div className="w-9 h-9 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                            <Home className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Roads Damaged
                            </p>
                            <p className="text-2xl font-bold text-orange-400 mt-1 tabular-nums">
                              {Number(nationalSummary[0]?.Damaged_Road_km || 0).toFixed(1)} km
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              of {Number(nationalSummary[0]?.Total_Road_km || 0).toFixed(1)} km
                              total
                              <span className="text-orange-400 font-semibold ml-1">
                                (
                                {(
                                  (nationalSummary[0]?.Damaged_Road_km /
                                    nationalSummary[0]?.Total_Road_km) *
                                    100 || 0
                                ).toFixed(1)}
                                %)
                              </span>
                            </p>
                          </div>
                          <div className="w-9 h-9 rounded-lg bg-orange-400/10 text-orange-400 flex items-center justify-center flex-shrink-0">
                            <Navigation className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Agricultural Damage
                            </p>
                            <p className="text-2xl font-bold text-green-400 mt-1 tabular-nums">
                              {formatCurrency(nationalSummary[0]?.Crop_Loss || 0)}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              of {formatCurrency(nationalSummary[0]?.Total_Crop_Value || 0)} value
                              <span className="text-green-400 font-semibold ml-1">
                                (
                                {(
                                  (nationalSummary[0]?.Crop_Loss /
                                    nationalSummary[0]?.Total_Crop_Value) *
                                    100 || 0
                                ).toFixed(1)}
                                %)
                              </span>
                            </p>
                          </div>
                          <div className="w-9 h-9 rounded-lg bg-green-400/10 text-green-400 flex items-center justify-center flex-shrink-0">
                            <Wheat className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Peak Wind Speed
                            </p>
                            <p className="text-2xl font-bold text-cyan-400 mt-1 tabular-nums">
                              {Number(nationalSummary[0]?.Max_Wind_Gusts || 0).toFixed(0)} km/h
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Maximum recorded gusts</p>
                          </div>
                          <div className="w-9 h-9 rounded-lg bg-cyan-400/10 text-cyan-400 flex items-center justify-center flex-shrink-0">
                            <Wind className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Top 5 Impacted Districts */}
                {displayAggregatedData &&
                  displayAggregatedData.length > 0 &&
                  (() => {
                    const nationalTotal = displayAggregatedData.reduce(
                      (sum, d) => sum + d.totalEconomicDamage,
                      0
                    );
                    const top5Districts = [...displayAggregatedData]
                      .sort((a, b) => b.totalEconomicDamage - a.totalEconomicDamage)
                      .slice(0, 5);
                    const top5Total = top5Districts.reduce(
                      (sum, d) => sum + d.totalEconomicDamage,
                      0
                    );
                    const top5Share =
                      nationalTotal > 0 ? ((top5Total / nationalTotal) * 100).toFixed(1) : '0.0';

                    return (
                      <div className="glass-panel rounded-xl p-3 border border-slate-700/50 animate-fadeSlide">
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="w-4 h-4 text-amber-400" />
                          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                            Top 5 Impacted {areaLabelPlural}
                          </h4>
                          {hasActiveFilters && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-full">
                              FILTERED
                            </span>
                          )}
                        </div>

                        {/* Table Header */}
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-700">
                          <span>#</span>
                          <span className="ml-2">{areaLabelSingular}</span>
                          <span className="ml-auto">Damage</span>
                        </div>

                        {/* Table Rows */}
                        <div className="space-y-2 mt-2">
                          {top5Districts.map((district, idx) => {
                            const shareOfTotal =
                              nationalTotal > 0
                                ? ((district.totalEconomicDamage / nationalTotal) * 100).toFixed(1)
                                : '0.0';

                            return (
                              <div
                                key={district.id}
                                className="p-2 rounded-lg hover:bg-slate-700/30 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-bold text-amber-400 text-sm w-4 text-center">
                                    {idx + 1}
                                  </span>
                                  <span
                                    className="text-slate-200 font-semibold text-sm truncate"
                                    title={district.name}
                                  >
                                    {district.name}
                                  </span>
                                  <span className="ml-auto text-red-400 font-bold text-sm whitespace-nowrap">
                                    {formatCurrency(district.totalEconomicDamage)}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs">
                                  <span className="text-blue-400">
                                    Pop. {formatNumber(district.totalAffectedPopulation)}
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      parseFloat(shareOfTotal) > 15
                                        ? 'text-red-400'
                                        : parseFloat(shareOfTotal) > 10
                                          ? 'text-orange-400'
                                          : parseFloat(shareOfTotal) > 5
                                            ? 'text-yellow-400'
                                            : 'text-green-400'
                                    }`}
                                  >
                                    {shareOfTotal}% share
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Totals Row */}
                        <div className="mt-2 pt-2 border-t border-slate-600">
                          <div className="p-2 bg-slate-700/50 rounded-lg">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-bold">Top 5 Total</span>
                              <span className="text-white font-bold">
                                {formatCurrency(top5Total)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                              <span>
                                Pop.{' '}
                                {formatNumber(
                                  top5Districts.reduce(
                                    (sum, d) => sum + d.totalAffectedPopulation,
                                    0
                                  )
                                )}
                              </span>
                              <span className="text-cyan-400 font-bold">{top5Share}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Legend */}
                        <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
                          <div className="flex flex-col gap-1">
                            <div>
                              <span className="font-semibold">% Share:</span> Portion of national
                              damage
                            </div>
                            {nationalTotal <= 0 && (
                              <div>
                                <span className="text-slate-400">
                                  No economic loss values available for the current filters.
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-amber-400 font-semibold">
                                Top 5 = {top5Share}% of total impact
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            </div>
          </div>
        </div>

        {/* Exposure Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === 'exposure' ? 'space-y-4' : 'hidden'}>
          {/* Data Scope Indicator */}
          <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-800/50 to-slate-700/30 border border-slate-600/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${hasActiveFilters ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'}`}
              />
              <span className="text-xs font-semibold text-slate-200">
                {hasActiveFilters ? 'FILTERED DATA' : 'ALL DATA'}
              </span>
            </div>
            {hasActiveFilters && (
              <span className="text-[10px] text-blue-300 font-medium">
                {filteredEvents.length} of {events.length} {areaLabelPlural.toLowerCase()}
              </span>
            )}
          </div>

          {/* Regional Comparison Chart */}
          {regionalComparisonData && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Most Affected Regions
              </h4>
              <div className="text-xs text-slate-400 mb-2">
                Economic loss by administrative region
              </div>
              <PopoutVisualization
                title="Most Affected Regions"
                subtitle="Economic loss by administrative region"
              >
                <div className="h-48">
                  <Bar
                    data={regionalComparisonData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: { color: UI_COLORS.borderSubtle },
                          ticks: {
                            font: { size: 9 },
                            callback: function (value) {
                              return '$' + value + 'M';
                            },
                          },
                          title: {
                            display: true,
                            text: 'Economic Damage (USD)',
                            font: { size: 10 },
                            color: UI_COLORS.textTertiary,
                          },
                        },
                        x: {
                          grid: { display: false },
                          ticks: { font: { size: 9 } },
                        },
                      },
                    }}
                  />
                </div>
              </PopoutVisualization>
            </div>
          )}

          {/* Asset Type Breakdown Chart */}
          {assetTypeChartData && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Exposed Assets by Type
              </h4>
              <div className="text-xs text-slate-400 mb-3">
                Showing {assetExposureData.stats.total} individual assets
              </div>
              <PopoutVisualization
                title="Exposed Assets by Type"
                subtitle={`Showing ${assetExposureData.stats.total} individual assets`}
              >
                <div className="h-40">
                  <Bar
                    data={assetTypeChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      indexAxis: 'y',
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },
                      scales: {
                        x: {
                          beginAtZero: true,
                          grid: {
                            color: UI_COLORS.borderSubtle,
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                        y: {
                          grid: {
                            display: false,
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </PopoutVisualization>
            </div>
          )}

          {/* Wind Exposure Distribution */}
          {assetExposureData && (
            <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Wind Exposure Levels
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Extreme (&gt;200 km/h)</span>
                  <span className="text-red-400 font-semibold">
                    {assetExposureData.stats.windExposure.extreme}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600"
                    style={{
                      width: `${(assetExposureData.stats.windExposure.extreme / assetExposureData.stats.total) * 100}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">High (150-200)</span>
                  <span className="text-orange-400 font-semibold">
                    {assetExposureData.stats.windExposure.high}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600"
                    style={{
                      width: `${(assetExposureData.stats.windExposure.high / assetExposureData.stats.total) * 100}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Moderate (100-150)</span>
                  <span className="text-yellow-400 font-semibold">
                    {assetExposureData.stats.windExposure.moderate}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-600"
                    style={{
                      width: `${(assetExposureData.stats.windExposure.moderate / assetExposureData.stats.total) * 100}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Low (&lt;100 km/h)</span>
                  <span className="text-green-400 font-semibold">
                    {assetExposureData.stats.windExposure.low}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600"
                    style={{
                      width: `${(assetExposureData.stats.windExposure.low / assetExposureData.stats.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Wind Intensity Distribution Chart */}
          {windIntensityData && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Wind Intensity Distribution
              </h4>
              <div className="text-xs text-slate-400 mb-2">Population by wind speed</div>
              <PopoutVisualization
                title="Wind Intensity Distribution"
                subtitle="Population by wind speed"
              >
                <div className="h-56">
                  <Bar
                    data={windIntensityData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom' as const,
                          labels: {
                            usePointStyle: true,
                            padding: 10,
                            font: { size: 9 },
                          },
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          grid: {
                            color: UI_COLORS.borderSubtle,
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                        x: {
                          grid: {
                            display: false,
                          },
                          ticks: {
                            font: { size: 9 },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </PopoutVisualization>
            </div>
          )}
        </div>

        {/* Damage Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === 'damage' ? 'space-y-4' : 'hidden'}>
          {/* Data Scope Indicator */}
          <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-800/50 to-slate-700/30 border border-slate-600/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${hasActiveFilters ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'}`}
              />
              <span className="text-xs font-semibold text-slate-200">
                {hasActiveFilters ? 'FILTERED DATA' : 'ALL DATA'}
              </span>
            </div>
            {hasActiveFilters && (
              <span className="text-[10px] text-blue-300 font-medium">
                {filteredEvents.length} of {events.length} {areaLabelPlural.toLowerCase()}
              </span>
            )}
          </div>
          {(filters.selectedHazards.length > 0 ||
            filters.dateRange.start ||
            filters.dateRange.end) && (
            <div className="text-[10px] text-slate-400">
              Pre-aggregated CSV damage metrics may remain broader than the active hazard/date
              filters when the source data has no matching event-level breakdown.
            </div>
          )}

          {/* Sector Analysis */}
          {realSectorChartData && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Impact by Sector
              </h4>
              <PopoutVisualization title="Impact by Sector" subtitle="Sector damage comparison">
                <div className="h-40 mb-4">
                  <Bar data={realSectorChartData} options={chartOptions} />
                </div>
              </PopoutVisualization>
            </div>
          )}

          {/* Building Damage Distribution by Loss Range */}
          {filteredImpactBySector &&
            filteredImpactBySector.length > 0 &&
            (() => {
              const totalData = filteredImpactBySector.reduce(
                (acc: any, sector: any) => {
                  acc.range_1_100 += Number(sector['By_Loss.range_1_100.Number']) || 0;
                  acc.range_100_1000 += Number(sector['By_Loss.range_100_1000.Number']) || 0;
                  acc.range_1000_10000 += Number(sector['By_Loss.range_1000_10000.Number']) || 0;
                  acc.range_10000_100000 +=
                    Number(sector['By_Loss.range_10000_100000.Number']) || 0;
                  acc.range_100000_plus += Number(sector['By_Loss.range_100000_+.Number']) || 0;
                  return acc;
                },
                {
                  range_1_100: 0,
                  range_100_1000: 0,
                  range_1000_10000: 0,
                  range_10000_100000: 0,
                  range_100000_plus: 0,
                }
              );

              const lossRangeData = {
                labels: ['$1-100', '$100-1K', '$1K-10K', '$10K-100K', '$100K+'],
                datasets: [
                  {
                    label: 'Buildings',
                    data: [
                      totalData.range_1_100,
                      totalData.range_100_1000,
                      totalData.range_1000_10000,
                      totalData.range_10000_100000,
                      totalData.range_100000_plus,
                    ],
                    backgroundColor: [
                      SECTOR_COLORS.agriculture, // Green for low damage
                      SECTOR_COLORS.commercial, // Blue for moderate
                      SECTOR_COLORS.education, // Amber for medium
                      SECTOR_COLORS.infrastructure, // Orange for high
                      SECTOR_COLORS.residential, // Red for critical
                    ],
                    borderRadius: 4,
                  },
                ],
              };

              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Building Damage Distribution
                  </h4>
                  <PopoutVisualization
                    title="Building Damage Distribution"
                    subtitle="Buildings grouped by loss range"
                  >
                    <div className="h-40 mb-4">
                      <Bar
                        data={lossRangeData}
                        options={{
                          ...chartOptions,
                          scales: {
                            ...chartOptions.scales,
                            y: {
                              ...chartOptions.scales.y,
                              title: {
                                display: true,
                                text: 'Number of Buildings',
                                font: { size: 10 },
                                color: 'rgba(255,255,255,0.6)',
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  </PopoutVisualization>
                </div>
              );
            })()}

          {/* Building Exposure Status */}
          {filteredImpactBySector &&
            filteredImpactBySector.length > 0 &&
            (() => {
              const totalBuildings = filteredImpactBySector.reduce(
                (sum: number, s: any) => sum + (Number(s.Total_Number_Buildings) || 0),
                0
              );
              const exposedBuildings = filteredImpactBySector.reduce(
                (sum: number, s: any) => sum + (Number(s.Number_Exposed_Buildings) || 0),
                0
              );
              const damagedBuildings = filteredImpactBySector.reduce(
                (sum: number, s: any) => sum + (Number(s.Number_Damaged_Buildings) || 0),
                0
              );
              const unaffectedBuildings = totalBuildings - exposedBuildings;

              const exposureData = {
                labels: ['Damaged', 'Exposed (Undamaged)', 'Unaffected'],
                datasets: [
                  {
                    label: 'Buildings',
                    data: [
                      damagedBuildings,
                      exposedBuildings - damagedBuildings,
                      unaffectedBuildings,
                    ],
                    backgroundColor: [
                      SECTOR_COLORS.residential, // Red for damaged
                      SECTOR_COLORS.infrastructure, // Orange for exposed
                      SECTOR_COLORS.agriculture, // Green for unaffected
                    ],
                    borderRadius: 4,
                  },
                ],
              };

              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Building Exposure Status
                  </h4>
                  <div className="grid grid-cols-1 gap-2 mb-3">
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-1">Damaged</div>
                      <div className="text-lg font-bold text-red-400">
                        {formatNumber(damagedBuildings)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {((damagedBuildings / totalBuildings) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-1">Exposed</div>
                      <div className="text-lg font-bold text-amber-400">
                        {formatNumber(exposedBuildings)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {((exposedBuildings / totalBuildings) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-1">Total</div>
                      <div className="text-lg font-bold text-slate-300">
                        {formatNumber(totalBuildings)}
                      </div>
                      <div className="text-xs text-slate-500">100%</div>
                    </div>
                  </div>
                  <PopoutVisualization
                    title="Building Exposure Status"
                    subtitle="Damaged, exposed, and unaffected buildings"
                  >
                    <div className="h-40">
                      <Bar data={exposureData} options={chartOptions} />
                    </div>
                  </PopoutVisualization>
                </div>
              );
            })()}

          {/* Asset Value at Risk */}
          {filteredImpactBySector &&
            filteredImpactBySector.length > 0 &&
            (() => {
              const totalValue = filteredImpactBySector.reduce(
                (sum: number, s: any) => sum + (Number(s.Total_Value) || 0),
                0
              );
              const exposedValue = filteredImpactBySector.reduce(
                (sum: number, s: any) => sum + (Number(s.Total_Exposed_Value) || 0),
                0
              );
              const totalLoss = filteredImpactBySector.reduce(
                (sum: number, s: any) => sum + (Number(s.Total_Loss) || 0),
                0
              );

              return (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Asset Value Analysis
                  </h4>
                  <div className="space-y-3">
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400">Total Asset Value</span>
                        <span className="text-sm font-bold text-slate-200">
                          {formatCurrency(totalValue)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-slate-400 h-2 rounded-full"
                          style={{ width: '100%' }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-3 border border-amber-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-amber-400">Exposed Value</span>
                        <span className="text-sm font-bold text-amber-300">
                          {formatCurrency(exposedValue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span>{((exposedValue / totalValue) * 100).toFixed(1)}% of total</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-amber-500 h-2 rounded-full transition-all"
                          style={{ width: `${(exposedValue / totalValue) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-3 border border-red-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-red-400">Total Loss</span>
                        <span className="text-sm font-bold text-red-300">
                          {formatCurrency(totalLoss)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span>{((totalLoss / totalValue) * 100).toFixed(2)}% of total</span>
                        <span>{((totalLoss / exposedValue) * 100).toFixed(1)}% of exposed</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full transition-all"
                          style={{ width: `${(totalLoss / totalValue) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>

        {/* Analytics Tab - Always mounted, visibility controlled by CSS */}
        <div className={activeTab === 'analytics' ? 'space-y-4' : 'hidden'}>
          {/* Data Scope Indicator */}
          <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-800/50 to-slate-700/30 border border-slate-600/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${hasActiveFilters ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'}`}
              />
              <span className="text-xs font-semibold text-slate-200">
                {hasActiveFilters ? 'FILTERED DATA' : 'ALL DATA'}
              </span>
            </div>
            {hasActiveFilters && (
              <span className="text-[10px] text-blue-300 font-medium">
                {filteredEvents.length} of {events.length} {areaLabelPlural.toLowerCase()}
              </span>
            )}
          </div>

          {displayAggregatedData && displayAggregatedData.length > 0 && (
            <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Top {areaLabelPlural} by {districtMetric === 'loss' ? 'Loss' : 'Population'}
                </h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDistrictMetric('loss')}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      districtMetric === 'loss'
                        ? 'bg-red-500/20 text-red-300 border-red-500/50'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Loss
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistrictMetric('population')}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      districtMetric === 'population'
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Population
                  </button>
                </div>
              </div>
              <PopoutVisualization
                title={`Top ${areaLabelPlural} Ranking`}
                subtitle={`Top ${areaLabelPlural.toLowerCase()} by ${districtMetric === 'loss' ? 'economic loss' : 'affected population'}`}
              >
                <RankedDistrictsChart
                  data={displayAggregatedData}
                  metric={districtMetric}
                  topN={8}
                  areaLabelPlural={areaLabelPlural.toLowerCase()}
                />
              </PopoutVisualization>
            </div>
          )}

          <div className="glass-panel rounded-xl p-3 border border-slate-700/50">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Sector and Regional Structure
            </h4>
            {derivedRegionalSummary.length > 0 || filteredRegionalSummaryBySector.length > 0 ? (
              <PopoutVisualization
                title="Sector and Regional Structure"
                subtitle="Heatmap and bar analysis for regional economic distribution"
              >
                <AdvancedCharts
                  regionalSummary={derivedRegionalSummary}
                  regionalSummaryBySector={filteredRegionalSummaryBySector}
                />
              </PopoutVisualization>
            ) : (
              <p className="text-xs text-slate-500 text-center py-6 italic">
                No regional sector data available
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
