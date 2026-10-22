import { utmToLonLat, utmZoneFromEpsg } from '../utm';

// Reference values from pyproj (EPSG:<code> -> EPSG:4326), including the corners of the Rarotonga grid
const REFERENCE = [
  { epsg: 32704, e: 413152.5, n: 7646506.5, lon: -159.8371998181614, lat: -21.281144619320166 },
  { epsg: 32704, e: 425487.5, n: 7656461.5, lon: -159.7178639968039, lat: -21.191753425590615 },
  { epsg: 32704, e: 425492.5, n: 7656466.5, lon: -159.71781561080118, lat: -21.191708456533327 },
  { epsg: 32704, e: 500000, n: 7650000, lon: -159.0, lat: -21.251660425195492 },
  { epsg: 32704, e: 166000, n: 7000000, lon: -162.3677262316859, lat: -27.082092319837038 },
];

describe('utmZoneFromEpsg', () => {
  it('reads northern and southern WGS84 zones', () => {
    expect(utmZoneFromEpsg(32704)).toEqual({ zone: 4, south: true });
    expect(utmZoneFromEpsg(32632)).toEqual({ zone: 32, south: false });
    expect(utmZoneFromEpsg(32601)).toEqual({ zone: 1, south: false });
    expect(utmZoneFromEpsg(32760)).toEqual({ zone: 60, south: true });
  });

  it('refuses a code that is not a WGS84 UTM zone', () => {
    for (const code of [4326, 3857, 3832, 32600, 32661, 32700, 32761]) {
      expect(() => utmZoneFromEpsg(code)).toThrow(RangeError);
    }
  });
});

describe('utmToLonLat', () => {
  it.each(REFERENCE)(
    'matches pyproj to a millimetre for $e, $n in EPSG:$epsg',
    ({ epsg, e, n, lon, lat }) => {
      const [gotLon, gotLat] = utmToLonLat(e, n, utmZoneFromEpsg(epsg));
      // 1e-8 degrees is about a millimetre
      expect(Math.abs(gotLon - lon)).toBeLessThan(1e-8);
      expect(Math.abs(gotLat - lat)).toBeLessThan(1e-8);
    }
  );

  it('puts the central meridian at the zone centre', () => {
    const [lon] = utmToLonLat(500000, 7650000, { zone: 4, south: true });
    expect(lon).toBeCloseTo(-159, 9);
  });

  it('treats the northern hemisphere as measured from the equator', () => {
    const [lon, lat] = utmToLonLat(500000, 0, { zone: 31, south: false });
    expect(lon).toBeCloseTo(3, 9);
    expect(lat).toBeCloseTo(0, 9);
  });

  it('puts the southern false origin on the equator', () => {
    const [, lat] = utmToLonLat(500000, 10000000, { zone: 4, south: true });
    expect(lat).toBeCloseTo(0, 9);
  });
});
