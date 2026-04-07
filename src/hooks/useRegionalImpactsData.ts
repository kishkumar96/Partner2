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
type RegionalImpactsGeoJSON = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  RegionalFeatureProperties
>;

interface RegionalImpactsDataState {
  data: RegionalImpactsGeoJSON | null;
  sectorData: RegionalImpactsGeoJSON | null;
  loading: boolean;
  error: Error | null;
}

function getMissingPropertyCount(data: RegionalImpactsGeoJSON, propertyName: string): number {
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
  const requestIdRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const effectiveCountry = countryCode ?? 'VU';
    const basePath = DATA_PATH[effectiveCountry];
    const regionalImpactsPath = getCountryDataFilePath(
      effectiveCountry,
      'regional-impacts.geojson'
    );
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

      setState({
        data: null,
        sectorData: null,
        loading: true,
        error: null,
      });

      const [regionalResult, regionalSummary] = await Promise.all([
        loadGeoJSON<RegionalImpactsGeoJSON>(
          regionalImpactsPath || `${basePath}/regional-impacts.geojson`,
          {
            cache: true,
            retries: 3,
            retryDelay: 1000,
            timeout: 15000,
            signal: controller.signal,
          }
        ),
        loadRegionalSummary({
          basePath,
          countryCode: effectiveCountry,
          retries: 3,
          retryDelay: 1000,
          timeout: 15000,
          signal: controller.signal,
        }),
      ]);

      if (!isMounted || requestId !== requestIdRef.current) return;

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
          debugLogger.warn(
            'Partial data enrichment detected - continuing with available data',
            'map-source',
            {
              countryCode: effectiveCountry,
              missingLossCount,
              missingWindCount,
              availableKeys: Object.keys(props),
            }
          );
        }
      }

      cacheRef.current = {
        data: enrichedData,
        sectorData: null,
        cachedCountry: effectiveCountry,
      };

      setState({
        data: enrichedData,
        sectorData: null,
        loading: false,
        error: null,
      });

      void loadGeoJSON<RegionalImpactsGeoJSON>(
        regionalImpactsBySectorPath || `${basePath}/regional-impacts-by-sector.geojson`,
        {
          cache: true,
          retries: 3,
          retryDelay: 1000,
          timeout: 15000,
          signal: controller.signal,
        }
      )
        .then(sectorResult => {
          if (!isMounted || requestId !== requestIdRef.current || controller.signal.aborted) {
            return;
          }

          const sectorData = sectorResult.data || null;
          cacheRef.current = {
            data: enrichedData,
            sectorData,
            cachedCountry: effectiveCountry,
          };

          setState(prev => ({
            ...prev,
            sectorData,
          }));
        })
        .catch(error => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) {
            return;
          }
          debugLogger.warn('Could not load regional impacts by sector data', 'map-source', error);
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
