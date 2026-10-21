import {
  featuresForRegion,
  forecastFocusCollection,
  buildForecastExposure,
  findExposureArea,
  isForecastExposureRow,
} from '../forecastExposure';

// Shapes and spellings as a REF run writes them (values trimmed)
const national = [
  {
    Region: 'Vanuatu',
    Overall_Winds: 'Hurricane Winds',
    Max_WindSpeed_kmph: '119',
    Exposed_Population: '260935',
    Exposed_Buildings: '148660',
    Exposed_Residential_Buildings: '27080',
    Exposed_Building_Value: '7569220132',
    Exposed_Health_Facilties: '117',
    Exposed_Schools: '362',
    Exposed_Evacuation_Centres: '563',
    Total_Population: '306697',
    Population_in_Track_Uncertainty: '43509',
  },
];
const regional = [
  { Country: 'Vanuatu', Region: '', Overall_Winds: 'Gale Winds', Exposed_Population: '0' },
  {
    Country: 'Vanuatu',
    Region: 'Malampa',
    Overall_Winds: 'Hurricane Winds',
    Exposed_Population: '42777',
  },
  {
    Country: 'Vanuatu',
    Region: 'Shefa',
    Overall_Winds: 'Possible Gale Winds',
    Exposed_Population: '108830',
  },
];
const byWindSpeed = [
  { WindSpeed: '', Danger: 'Not exposed', Population: '2252', Health_Facilties: '2' },
  { WindSpeed: '64.0', Danger: 'Hurricane Winds', Population: '79950', Health_Facilties: '38' },
  { WindSpeed: '34.0', Danger: 'Gale Winds', Population: '16603', Health_Facilties: '16' },
];
const byTrackDistance = [
  { Track_distance: '200+ km away from track', km: '', Population: '144224' },
  { Track_distance: 'Within 50km of track', km: '50', Population: '55108' },
  { Track_distance: 'Within 25km of track', km: '25', Population: '28805' },
];

describe('forecastExposure', () => {
  it('recognises REF rows by exposure columns without loss', () => {
    expect(isForecastExposureRow(national[0])).toBe(true);
    expect(isForecastExposureRow({ Region: 'Shefa', Total_Loss: 10, Exposed_Population: 1 })).toBe(
      false
    );
    expect(isForecastExposureRow({ Region: 'Shefa', Population_Exposed_To_Any_Hazard: 5 })).toBe(
      false
    );
  });

  it('returns null for damage assessments', () => {
    expect(
      buildForecastExposure({
        national: [],
        regional: [{ Region: 'Shefa', Total_Loss: 100, Population_Exposed_To_Any_Hazard: 5 }],
        byWindSpeed: [],
        byTrackDistance: [],
      })
    ).toBeNull();
  });

  it('builds national, province and band tables', () => {
    const exposure = buildForecastExposure({ national, regional, byWindSpeed, byTrackDistance })!;

    expect(exposure.national).toMatchObject({
      name: 'Vanuatu',
      overallWinds: 'Hurricane Winds',
      maxWindKmph: 119,
      totalPopulation: 306697,
      populationInTrackUncertainty: 43509,
    });
    expect(exposure.national!.exposed).toMatchObject({
      population: 260935,
      buildingValue: 7569220132,
      healthFacilities: 117, // from REF's "Facilties" spelling
      schools: 362,
    });
    // The blank-region row is dropped; most exposed first
    expect(exposure.regions.map(area => area.name)).toEqual(['Shefa', 'Malampa']);
    // Most severe band first
    expect(exposure.byWindDanger.map(band => band.label)).toEqual([
      'Hurricane Winds',
      'Gale Winds',
      'Not exposed',
    ]);
    expect(exposure.byWindDanger[0].totals.healthFacilities).toBe(38);
    // Nearest first, open-ended band last
    expect(exposure.byTrackDistance.map(band => band.label)).toEqual([
      'Within 25km of track',
      '25–50 km from track',
      '200+ km away from track',
    ]);
  });

  it('finds a selected province or area council', () => {
    const exposure = buildForecastExposure({ national, regional, byWindSpeed, byTrackDistance })!;
    const features: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [168, -17] },
          properties: {
            'Region.ID': 'VU0101',
            'Region.Region': 'North Efate',
            Overall_Winds: 'Storm Winds',
            Exposed_Population: '900',
          },
        },
      ],
    };
    expect(findExposureArea(exposure, features, 'shefa')?.name).toBe('Shefa');
    expect(findExposureArea(exposure, features, 'VU0101')).toMatchObject({
      name: 'North Efate',
      overallWinds: 'Storm Winds',
      exposed: expect.objectContaining({ population: 900 }),
    });
    expect(findExposureArea(exposure, features, 'nowhere')).toBeNull();
    expect(findExposureArea(exposure, features, null)).toBeNull();
  });

  it('names distance rows as bands between rings, which add up to the whole country', () => {
    // Real TC Wati (18:00Z) rows: each asset sits in one ring, so rows partition the population
    const wati = [
      { Track_distance: '200+ km away from track', km: '', Population: '12657' },
      { Track_distance: 'Within 50km of track', km: '50', Population: '553' },
      { Track_distance: 'Within 75km of track', km: '75', Population: '1560' },
      { Track_distance: 'Within 100km of track', km: '100', Population: '509' },
      { Track_distance: 'Within 175km of track', km: '175', Population: '0' },
    ];
    const exposure = buildForecastExposure({
      national,
      regional,
      byWindSpeed,
      byTrackDistance: wati,
    })!;
    expect(exposure.byTrackDistance.map(band => band.label)).toEqual([
      'Within 50km of track',
      '50–75 km from track',
      '75–100 km from track',
      '100–175 km from track',
      '200+ km away from track',
    ]);
    const total = exposure.byTrackDistance.reduce((sum, band) => sum + band.totals.population, 0);
    expect(total).toBe(15279);
  });
});

describe('map framing helpers', () => {
  const line: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-162.9, -14.4],
            [-147.4, -25.3],
          ],
        },
      },
    ],
  };
  const swaths: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [-160, -20] },
      },
    ],
  };
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const layers = (
    cycloneTrack: GeoJSON.FeatureCollection | null,
    windSwaths = null as GeoJSON.FeatureCollection | null
  ) => ({ layers: { cycloneTrack, windSwaths } }) as never;

  it('frames the forecast track, else the wind swaths, else nothing', () => {
    expect(forecastFocusCollection(layers(line, swaths))).toBe(line);
    expect(forecastFocusCollection(layers(empty, swaths))).toBe(swaths);
    expect(forecastFocusCollection(layers(null, null))).toBeNull();
  });

  it('finds an area by name or id, ignoring case, so a click can move the map', () => {
    const areas: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { 'Region.Region': 'Aitutaki', 'Region.ID': 7 },
          geometry: swaths.features[0].geometry,
        },
        {
          type: 'Feature',
          properties: { 'Region.Region': 'Atiu' },
          geometry: swaths.features[0].geometry,
        },
      ],
    };
    expect(featuresForRegion(areas, 'aitutaki')?.features).toHaveLength(1);
    expect(featuresForRegion(areas, '7')?.features).toHaveLength(1);
    expect(featuresForRegion(areas, 'Nowhere')).toBeNull();
    expect(featuresForRegion(areas, null)).toBeNull();
    expect(featuresForRegion(null, 'Atiu')).toBeNull();
  });
});
