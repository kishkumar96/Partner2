import type { RealWMSLayer } from '@/data/realThreddsLayers';
import type { CountryCode } from '@/types/thredds';
import { HAZARD_PRODUCTS, hazardProductBounds, hazardZarrEnabled, storeFor } from './hazardZarr';
import { ZarrError, type ZarrHttpStore } from './zarrReader';

/**
 * The hazard scenarios a Zarr store holds, as dashboard layers.
 *
 * The API needs to say only where the store is: one `hazard_information` row with protocol `zarr` and
 * the store's address. Which scenarios exist (sea-level rises, return periods, events) is written in
 * the store itself, so there is no row per scenario and no scenario columns to add to the API.
 */

export interface ZarrCatalogScenario {
  source: string;
  slr: number;
  /** A return period in years, or an event label, as the store spells it */
  selector: string;
  returnPeriodYears: number | null;
  eventLabel: string | null;
}

export interface ZarrCatalog {
  scenarios: ZarrCatalogScenario[];
  /** [west, south, east, north] per product */
  bounds: Record<string, [number, number, number, number]>;
}

const unique = (values: Array<number | string>) => new Set(values).size === values.length;

/** Whether a coordinate array holds real labels. A half-uploaded group reads back blanks or repeats. */
function usable(values: Array<number | string>, kind: 'number' | 'label'): boolean {
  if (values.length === 0 || !unique(values)) return false;
  return kind === 'number'
    ? values.every(value => typeof value === 'number' && Number.isFinite(value))
    : values.every(value => typeof value === 'string' && value.trim() !== '');
}

/** Every scenario of every product the store has, skipping a product whose upload is incomplete. */
export async function listHazardScenarios(store: ZarrHttpStore): Promise<ZarrCatalog> {
  const catalog: ZarrCatalog = { scenarios: [], bounds: {} };
  for (const [source, { group, dim }] of Object.entries(HAZARD_PRODUCTS)) {
    try {
      await store.arrayMeta(`${group}/depth`);
    } catch (error) {
      if (error instanceof ZarrError && error.message.startsWith('the store has no array'))
        continue;
      throw error;
    }
    const [slrValues, selectorValues] = await Promise.all([
      store.vector(`${group}/slr`),
      store.vector(`${group}/${dim}`),
    ]);
    const isEvent = dim === 'event';
    if (!usable(slrValues, 'number') || !usable(selectorValues, isEvent ? 'label' : 'number')) {
      console.warn(
        `Hazard store: '${group}' has no readable ${dim} labels or slr values (incomplete upload?), skipping.`
      );
      continue;
    }
    catalog.bounds[source] = await hazardProductBounds(store, source);
    const selectors = [...selectorValues].sort((a, b) =>
      isEvent ? 0 : (a as number) - (b as number)
    );
    for (const slr of [...(slrValues as number[])].sort((a, b) => a - b)) {
      for (const selector of selectors) {
        catalog.scenarios.push({
          source,
          slr,
          selector: String(selector),
          returnPeriodYears: isEvent ? null : (selector as number),
          eventLabel: isEvent ? (selector as string) : null,
        });
      }
    }
  }
  return catalog;
}

/** The scenario's layer name, spelled the way the server's catalogue spells it. */
export function scenarioLayerName(scenario: ZarrCatalogScenario): string {
  return scenario.eventLabel === null
    ? `${scenario.source}_slr${scenario.slr}_rp${scenario.selector}`
    : `${scenario.source}_slr${scenario.slr}_event${scenario.selector}`;
}

export function buildZarrHazardLayers(options: {
  countryCode: CountryCode;
  countryName: string;
  storeUrl: string;
  catalog: ZarrCatalog;
}): RealWMSLayer[] {
  const { countryCode, countryName, catalog } = options;
  const storeUrl = options.storeUrl.replace(/\/+$/, '');
  return catalog.scenarios.map(scenario => {
    const layerName = scenarioLayerName(scenario);
    const title =
      scenario.eventLabel === null
        ? `${countryName} ${scenario.source} flood depth — SLR ${scenario.slr}m, ${scenario.selector}yr return period`
        : `${countryName} ${scenario.source} flood depth — SLR ${scenario.slr}m, event ${scenario.selector}`;
    return {
      id: `zarr-${countryCode.toLowerCase()}-${layerName.replace(/[^A-Za-z0-9_.-]+/g, '_')}`,
      name: title,
      countryCode,
      ncFile: layerName,
      layerName,
      description: title,
      hazardType: 'flood',
      bbox: catalog.bounds[scenario.source],
      // the picture is coloured over 0-5 m, as the server's tiles were
      styleConfig: { colorScaleRange: '0,5' },
      source: 'partner_api',
      zarrScenario: {
        storeUrl,
        source: scenario.source,
        slr: scenario.slr,
        selector: scenario.selector,
      },
      hazardScenario: {
        product: scenario.source,
        slrScenarioM: scenario.slr,
        returnPeriodYears: scenario.returnPeriodYears,
        eventLabel: scenario.eventLabel,
      },
    } satisfies RealWMSLayer;
  });
}

/** The addresses of the Zarr stores the API's hazard rows point at (protocol `zarr`). */
export function zarrStoreUrls(hazardRows: Array<Record<string, unknown>>): string[] {
  const urls = hazardRows
    .filter(
      row => String(row.protocol ?? '').toLowerCase() === 'zarr' && typeof row.url === 'string'
    )
    .map(row => (row.url as string).trim().replace(/\/+$/, ''))
    .filter(url => url !== '');
  return [...new Set(urls)];
}

const catalogs = new Map<string, Promise<ZarrCatalog>>();

/** One listing per store address; a failure is not remembered, so the next load tries again. */
function catalogOf(storeUrl: string): Promise<ZarrCatalog> {
  let catalog = catalogs.get(storeUrl);
  if (!catalog) {
    catalog = listHazardScenarios(storeFor(storeUrl));
    catalogs.set(storeUrl, catalog);
    catalog.catch(() => catalogs.delete(storeUrl));
  }
  return catalog;
}

export function clearZarrCatalogCache(): void {
  catalogs.clear();
}

/** The layers of every Zarr store the country's hazard rows name; none if there are no such rows or a store is unreachable. */
export async function loadZarrHazardLayers(
  countryCode: CountryCode,
  countryName: string,
  hazardRows: Array<Record<string, unknown>>
): Promise<RealWMSLayer[]> {
  if (!hazardZarrEnabled()) return [];
  const layers: RealWMSLayer[] = [];
  for (const storeUrl of zarrStoreUrls(hazardRows)) {
    try {
      layers.push(
        ...buildZarrHazardLayers({
          countryCode,
          countryName,
          storeUrl,
          catalog: await catalogOf(storeUrl),
        })
      );
    } catch (error) {
      console.warn(
        `Hazard store ${storeUrl} could not be read; its scenarios are not offered.`,
        error
      );
    }
  }
  return layers;
}

const scenarioKey = (layer: RealWMSLayer) => {
  const scenario = layer.hazardScenario;
  return scenario
    ? `${scenario.product}|${scenario.slrScenarioM}|${scenario.returnPeriodYears ?? ''}|${scenario.eventLabel ?? ''}`
    : null;
};

/**
 * The catalogue rows' layers and the store's layers together. A scenario both describe is offered
 * once, from the store, so a country that still has per-scenario rows does not list everything twice.
 */
export function mergeHazardLayers(
  rowLayers: RealWMSLayer[],
  zarrLayers: RealWMSLayer[]
): RealWMSLayer[] {
  if (zarrLayers.length === 0) return rowLayers;
  const fromStore = new Set(zarrLayers.map(scenarioKey));
  return [...rowLayers.filter(layer => !fromStore.has(scenarioKey(layer))), ...zarrLayers];
}
