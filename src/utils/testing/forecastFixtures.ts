import type { EventRecord } from '@/data/eventRecords';
import {
  WIND_DANGER_ORDER,
  buildForecastExposure,
  type ForecastExposure,
} from '../forecastExposure';

/** Test data shaped like REF's own tables, run through the real parser. */
export interface RegionSpec {
  name: string;
  /** REF's band name for the area: "Gale Winds", "Possible Gale Winds", ... or '' for not exposed */
  winds: string;
  people: number;
  buildings?: number;
  health?: number;
  schools?: number;
  evac?: number;
}

const rank = (label: string) => (WIND_DANGER_ORDER as readonly string[]).indexOf(label);

export function exposureFixture(options: {
  country?: string;
  totalPopulation?: number;
  regions: RegionSpec[];
  trackUncertaintyPeople?: number;
}): ForecastExposure {
  const {
    country = 'Cook Islands',
    totalPopulation = 15279,
    regions,
    trackUncertaintyPeople = 0,
  } = options;
  const sum = (pick: (r: RegionSpec) => number) => regions.reduce((total, r) => total + pick(r), 0);
  const strongest = regions
    .map(r => r.winds)
    .filter(Boolean)
    .sort((a, b) => rank(b) - rank(a))[0];

  const regionalRow = (r: RegionSpec) => ({
    Country: country,
    Region: r.name,
    Overall_Winds: r.winds,
    Exposed_Population: r.people,
    Exposed_Buildings: r.buildings ?? Math.round(r.people / 3),
    Exposed_Health_Facilties: r.health ?? 0,
    Exposed_Schools: r.schools ?? 0,
    Exposed_Evacuation_Centres: r.evac ?? 0,
    Total_Population: Math.max(r.people, 1000),
    Total_Buildings: 5000,
  });
  const national = {
    Country: country,
    Region: country,
    Overall_Winds: strongest ?? '',
    Exposed_Population: sum(r => r.people),
    Exposed_Buildings: sum(r => r.buildings ?? Math.round(r.people / 3)),
    Exposed_Health_Facilties: sum(r => r.health ?? 0),
    Exposed_Schools: sum(r => r.schools ?? 0),
    Exposed_Evacuation_Centres: sum(r => r.evac ?? 0),
    Total_Population: totalPopulation,
    Total_Buildings: 18546,
    Population_in_Track_Uncertainty: trackUncertaintyPeople,
  };

  const byBand = new Map<string, number>();
  for (const r of regions)
    if (r.winds && r.people > 0) byBand.set(r.winds, (byBand.get(r.winds) ?? 0) + r.people);

  return buildForecastExposure({
    national: [national],
    regional: regions.map(regionalRow),
    byWindSpeed: [...byBand].map(([Danger, Population]) => ({ Danger, WindSpeed: 34, Population })),
    byTrackDistance: [],
  }) as ForecastExposure;
}

/** The Cook Islands, 17 Oct 12:00: gale in Mauke and Mitiaro, only possible in Aitutaki and Atiu */
export const WATI_17_OCT = () =>
  exposureFixture({
    regions: [
      {
        name: 'Aitutaki',
        winds: 'Possible Gale Winds',
        people: 1608,
        health: 3,
        schools: 4,
        evac: 0,
      },
      { name: 'Atiu', winds: 'Possible Gale Winds', people: 461, schools: 2, evac: 10 },
      { name: 'Mauke', winds: 'Gale Winds', people: 372, health: 0, schools: 1, evac: 7 },
      { name: 'Mitiaro', winds: 'Gale Winds', people: 181, schools: 1 },
      { name: 'Mangaia', winds: '', people: 0 },
      { name: 'Rarotonga', winds: '', people: 0 },
    ],
  });

/** 19 Oct 12:00: the storm has moved away and nothing is exposed */
export const WATI_19_OCT = () =>
  exposureFixture({
    regions: [
      { name: 'Aitutaki', winds: '', people: 0 },
      { name: 'Rarotonga', winds: '', people: 0 },
    ],
  });

export function recordFixture(
  fields: Partial<EventRecord> & { id: string; trackIssuedTime: string }
): EventRecord {
  return {
    name: 'Tropical Cyclone Wati',
    cycloneName: fields.trackIssuedTime.slice(0, 13).replace(/\D/g, '').slice(0, 10) + '_Wati',
    countryCode: 'CK',
    isForecast: true,
    modelRunStatus: 'complete',
    date: fields.trackIssuedTime.slice(0, 10),
    ...fields,
  } as EventRecord;
}
