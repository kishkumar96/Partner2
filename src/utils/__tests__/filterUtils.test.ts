import type { District, Event, Province } from '@/types';
import { aggregateEventsByLevel } from '@/utils/filterUtils';

const emptyDistricts: District[] = [];
const emptyProvinces: Province[] = [];

describe('aggregateEventsByLevel', () => {
  it('falls back to province grouping from event data when province metadata is unavailable', () => {
    const events: Event[] = [
      {
        id: 'haapai-residential',
        parentEventId: 'tc-harold-tonga-2020',
        name: "Cyclone Harold - Ha'apai (Residential)",
        date: '2020-04-09',
        hazardId: 'tropical-cyclone',
        countryCode: 'TO',
        sectorId: 'Residential',
        districtId: 'TO-001',
        provinceId: 'TO-001',
        location: { lat: -19.75, lng: -174.35 },
        severity: 'high',
        totalAffectedPopulation: 80,
        totalEconomicDamage: 125000,
        affectedRegions: 1,
      },
      {
        id: 'haapai-public',
        parentEventId: 'tc-harold-tonga-2020',
        name: "Cyclone Harold - Ha'apai (Public)",
        date: '2020-04-09',
        hazardId: 'tropical-cyclone',
        countryCode: 'TO',
        sectorId: 'Public',
        districtId: 'TO-001',
        provinceId: 'TO-001',
        location: { lat: -19.75, lng: -174.35 },
        severity: 'medium',
        totalAffectedPopulation: 20,
        totalEconomicDamage: 5000,
        affectedRegions: 1,
      },
    ];

    expect(
      aggregateEventsByLevel(events, 'province', emptyDistricts, emptyProvinces, false)
    ).toEqual([
      {
        id: 'TO-001',
        name: "Ha'apai",
        totalEvents: 2,
        totalAffectedPopulation: 100,
        totalEconomicDamage: 130000,
      },
    ]);
  });

  it('falls back to district grouping from regional impact names when district metadata is unavailable', () => {
    const events: Event[] = [
      {
        id: 'rarotonga-other',
        parentEventId: 'tc-ck-event',
        name: 'Tropical Cyclone Event - Rarotonga (Other)',
        date: '2024-01-01',
        hazardId: 'tropical-cyclone',
        countryCode: 'CK',
        sectorId: 'Other',
        districtId: '9',
        provinceId: '9',
        location: { lat: -21.23, lng: -159.78 },
        severity: 'high',
        totalAffectedPopulation: 44,
        totalEconomicDamage: 220000,
        affectedRegions: 1,
        regionalImpacts: [
          {
            id: 'ri-rarotonga',
            eventId: 'tc-ck-event',
            regionId: '9',
            regionName: 'Rarotonga',
            regionType: 'province',
            location: { lat: -21.23, lng: -159.78 },
            severity: 'high',
            affectedPopulation: 44,
            economicDamage: 220000,
          },
        ],
      },
    ];

    expect(
      aggregateEventsByLevel(events, 'district', emptyDistricts, emptyProvinces, false)
    ).toEqual([
      {
        id: '9',
        name: 'Rarotonga',
        totalEvents: 1,
        totalAffectedPopulation: 44,
        totalEconomicDamage: 220000,
      },
    ]);
  });
});
