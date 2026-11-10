import { lonLatToUtm, utmToLonLat, utmZoneFromEpsg } from '../utm';

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

// pyproj, EPSG:4326 -> EPSG:<code>
const FORWARD = [
  { epsg: 32704, lon: -159.7794, lat: -21.2651, e: 419139.92319366225, n: 7648313.085090866 },
  { epsg: 32704, lon: -159.8372, lat: -21.2812, e: 413152.5136465707, n: 7646500.370079674 },
  { epsg: 32704, lon: -159.0, lat: -21.25, e: 500000.0, n: 7650183.76924341 },
  { epsg: 32704, lon: -162.3, lat: -27.0, e: 172482.702406799, n: 7009279.69902752 },
  { epsg: 32704, lon: -156.5, lat: -20.0, e: 761577.0880751373, n: 7786566.008333919 },
  { epsg: 32701, lon: -179.5, lat: -17.0, e: 233821.40740023472, n: 8118746.354721308 },
  { epsg: 32706, lon: -149.8, lat: -17.6, e: 202826.2353991054, n: 8051871.142975669 },
  { epsg: 32632, lon: 9.19, lat: 45.46, e: 514854.59885327885, n: 5034070.191608519 },
  { epsg: 32601, lon: -177.0, lat: 5.0, e: 500000.0, n: 552664.2968779367 },
];

describe('lonLatToUtm', () => {
  it.each(FORWARD)(
    'matches pyproj to a millimetre for $lon, $lat in EPSG:$epsg',
    ({ epsg, lon, lat, e, n }) => {
      const [easting, northing] = lonLatToUtm(lon, lat, utmZoneFromEpsg(epsg));
      expect(Math.abs(easting - e)).toBeLessThan(0.001);
      expect(Math.abs(northing - n)).toBeLessThan(0.001);
    }
  );

  it('is the inverse of utmToLonLat', () => {
    const zone = utmZoneFromEpsg(32704);
    for (const [easting, northing] of [
      [413152.5, 7646506.5],
      [425492.5, 7656466.5],
      [166000, 7000000],
    ]) {
      const [lon, lat] = utmToLonLat(easting, northing, zone);
      const [backEasting, backNorthing] = lonLatToUtm(lon, lat, zone);
      expect(Math.abs(backEasting - easting)).toBeLessThan(1e-4);
      expect(Math.abs(backNorthing - northing)).toBeLessThan(1e-4);
    }
  });

  it('puts the central meridian on the false easting, and the southern equator on the false northing', () => {
    expect(lonLatToUtm(-159, -21, { zone: 4, south: true })[0]).toBeCloseTo(500000, 6);
    expect(lonLatToUtm(-159, 0, { zone: 4, south: true })[1]).toBeCloseTo(10000000, 6);
    expect(lonLatToUtm(3, 0, { zone: 31, south: false })[1]).toBeCloseTo(0, 6);
  });
});
