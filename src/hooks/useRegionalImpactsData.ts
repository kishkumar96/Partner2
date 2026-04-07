import { useEffect, useRef, useState } from 'react';
import { loadGeoJSON } from '@/utils/dataLoader';
import { CountryCode } from '@/types/thredds';
import {
  DATA_PATH,
  enrichRegionalImpactsWithSummary,
  getCountryDataFilePath,
  loadRegionalSummary,
} from '@/utils/realDataLoader';
import { debugLogger } from '@/utils/debugLogger';

type RegionalFeatureProperties = Record<string, unknown>;
type RegionalImpactsGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionalFeatureProperties>;

interface RegionalImpactsDataState {
  data: RegionalImpactsGeoJSON | null;
  sectorData: RegionalImpactsGeoJSON | null;
  loading: boolean;
  error: Error | null;
}

function getMissingPropertyCount(
  data: RegionalImpactsGeoJSON,
  propertyName: string
): number {
  return data.features.reduce((missingCount, feature) => {
    return propertyName in (feature.properties || {}) ? missingCount : missingCount + 1;
  }, 0);
}

export function useRegionalImpactsData(countryCode?: CountryCode | null): RegionalImpactsDataState {
  const [state, setState] = useState<RegionalImpactsDataState>({
    data: null,
    sectorData: null,
    loading: true,
    error: null,
  });

  const cacheRef = useRef<{
    data?: RegionalImpactsGeoJSON;
    sectorData?: RegionalImpactsGeoJSON | null;
    cachedCountry?: CountryCode | null;
  }>({});

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const effectiveCountry = countryCode ?? 'VU';
    const basePath = DATA_PATH[effectiveCountry];
    const regionalImpactsPath = getCountryDataFilePath(effectiveCountry, 'regional-impacts.geojson');
    const regionalImpactsBySectorPath = getCountryDataFilePath(
      effectiveCountry,
      'regional-impacts-by-sector.geojson'
    );

    const loadData = async () => {
      if (cacheRef.current.cachedCountry && cacheRef.current.cachedCountry !== effectiveCountry) {
        cacheRef.current = {};
      }

      if (
        cacheRef.current.data &&
        cacheRef.current.sectorData !== undefined &&
        cacheRef.current.cachedCountry === effectiveCountry
      ) {
        setState({
          data: cacheRef.current.data,
          sectorData: cacheRef.current.sectorData,
          loading: false,
          error: null,
        });
        return;
      }

      setState(prev => ({ ...prev, loading: true, error: null }));

      const [regionalResult, sectorResult, regionalSummary] = await Promise.all([
        loadGeoJSON<RegionalImpactsGeoJSON>(regionalImpactsPath || `${basePath}/regional-impacts.geojson`, {
          cache: true,
          signal: controller.signal,
        }),
        loadGeoJSON<RegionalImpactsGeoJSON>(
          regionalImpactsBySectorPath || `${basePath}/regional-impacts-by-sector.geojson`,
          {
            cache: true,
            signal: controller.signal,
          }
        ),
        loadRegionalSummary({ basePath, countryCode: effectiveCountry, signal: controller.signal }),
      ]);

      if (!isMounted) return;

      if (!regionalResult.data) {
        setState({
          data: null,
          sectorData: null,
          loading: false,
          error: regionalResult.error ?? new Error('Failed to load regional impacts data'),
        });
        return;
      }

      const enrichedData = enrichRegionalImpactsWithSummary(
        regionalResult.data,
        regionalSummary as Array<Record<string, unknown>> | null | undefined
      ) as RegionalImpactsGeoJSON;
      const sectorData = sectorResult.data || null;

      // Validate that enriched data has both Total_Loss and Max_Wind_Gusts across all features.
      if (enrichedData.features.length > 0) {
        const firstFeature = enrichedData.features[0];
        const props = (firstFeature.properties || {}) as Record<string, unknown>;
        const missingLossCount = getMissingPropertyCount(enrichedData, 'Total_Loss');
        const missingWindCount = getMissingPropertyCount(enrichedData, 'Max_Wind_Gusts');
        const hasLoss = missingLossCount === 0;
        const hasWind = missingWindCount === 0;

        if (process.env.NODE_ENV === 'development') {
          console.log('[useRegionalImpactsData] Data enrichment validation:', {
            country: effectiveCountry,
            features: enrichedData.features.length,
            hasLossField: hasLoss,
            hasWindField: hasWind,
            missingLossCount,
            missingWindCount,
            sampleLoss: props.Total_Loss,
            sampleWind: props.Max_Wind_Gusts,
          });
        }

        if (!hasLoss || !hasWind) {
          const validationError = new Error(
            `Regional impacts data validation failed for ${effectiveCountry}`
          );
          debugLogger.warn('Regional impacts data validation failed', 'map-source', {
            countryCode: effectiveCountry,
            missingLossCount,
            missingWindCount,
            availableKeys: Object.keys(props),
          });
          setState({
            data: null,
            sectorData: null,
            loading: false,
            error: validationError,
          });
          return;
        }
      }

      cacheRef.current = {
        data: enrichedData,
        sectorData,
        cachedCountry: effectiveCountry,
      };

      setState({
        data: enrichedData,
        sectorData,
        loading: false,
        error: null,
      });
    };

    void loadData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [countryCode]);

  return state;
}
