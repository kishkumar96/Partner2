/** @jest-environment node */
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import {
  depthToRgba,
  hazardZarrEnabled,
  imageCorners,
  loadHazardScenario,
  parseHazardTileUrl,
  storeFor,
} from '../hazardZarr';
import { ZarrHttpStore } from '../zarrReader';

const ROOT = join(__dirname, 'fixtures', 'hazard_zarr_mini');
const BASE = 'https://dashboard.example/api/partner-proxy/partner_api/v1/hazard_zarr';
const miniStore = () =>
  new ZarrHttpStore(BASE, (async (input: RequestInfo | URL) => {
    const file = join(ROOT, String(input).slice(BASE.length + 1));
    return existsSync(file) && statSync(file).isFile()
      ? new Response(readFileSync(file))
      : new Response('', { status: 404 });
  }) as typeof fetch);

describe('parseHazardTileUrl', () => {
  const tile = (path: string) =>
    `/partner2/api/partner-proxy/partner_api/v1/hazard_tiles/${path}/{z}/{x}/{y}.png`;

  it('reads the scenario and finds the store beside the tile endpoint', () => {
    expect(parseHazardTileUrl(tile('tc/0.25/100'))).toEqual({
      storeUrl: '/partner2/api/partner-proxy/partner_api/v1/hazard_zarr',
      source: 'tc',
      slr: 0.25,
      selector: '100',
    });
  });

  it('keeps an event label, decoding it', () => {
    expect(parseHazardTileUrl(tile('historical_tcs/0.0/01-Mar-1987'))?.selector).toBe(
      '01-Mar-1987'
    );
    expect(parseHazardTileUrl(tile('historical_tcs/0.5/Event%203'))?.selector).toBe('Event 3');
  });

  it('works for an absolute address and ignores a query string', () => {
    const parsed = parseHazardTileUrl(
      'https://host.example/partner_api/v1/hazard_tiles/swell/1.0/500/{z}/{x}/{y}.png?v=2'
    );
    expect(parsed).toMatchObject({
      storeUrl: 'https://host.example/partner_api/v1/hazard_zarr',
      slr: 1,
      selector: '500',
    });
  });

  it('is null for anything that is not one of the catalogue tiles', () => {
    expect(parseHazardTileUrl(tile('nonsense/0.25/100'))).toBeNull();
    expect(parseHazardTileUrl(tile('tc/high/100'))).toBeNull();
    expect(parseHazardTileUrl('https://thredds.example/wms?LAYERS=Depth')).toBeNull();
    expect(parseHazardTileUrl('/hazard_tiles/tc/0.25/100/1/2/3.png')).toBeNull();
    expect(parseHazardTileUrl('')).toBeNull();
  });
});

describe('hazardZarrEnabled', () => {
  const original = process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT;
    else process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT = original;
  });

  it('is on unless switched off', () => {
    delete process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT;
    expect(hazardZarrEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT = 'true';
    expect(hazardZarrEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_HAZARD_ZARR_DIRECT = 'false';
    expect(hazardZarrEnabled()).toBe(false);
  });
});

describe('depthToRgba', () => {
  // red and green channels the server's own numpy code gives for these float32 depths
  const VALUES = [0, 0.01, 0.1, 0.33, 1, 1.5, 2.5, 3.14159, 4.99, 5, 7, -1, 0.2, 4.2, 3.7];
  const RED = [120, 119, 117, 112, 96, 84, 60, 44, 0, 0, 0, 120, 115, 19, 31];
  const GREEN = [200, 199, 196, 186, 160, 140, 100, 74, 0, 0, 0, 200, 192, 32, 52];

  it('gives the same colours as the server-drawn tiles', () => {
    const rgba = depthToRgba(new Float32Array(VALUES), VALUES.length, 1, false);
    VALUES.forEach((value, i) => {
      expect([value, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]]).toEqual([
        value,
        RED[i],
        GREEN[i],
        255,
        190,
      ]);
    });
  });

  it('leaves cells with no data transparent', () => {
    const rgba = depthToRgba(new Float32Array([Number.NaN, 1]), 2, 1, false);
    expect(Array.from(rgba.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(rgba[7]).toBe(190);
  });

  it('flips the rows when asked, so a south-to-north grid draws north-up', () => {
    const grid = new Float32Array([0, 5, /* second row */ 2.5, Number.NaN]);
    const plain = depthToRgba(grid, 2, 2, false);
    const flipped = depthToRgba(grid, 2, 2, true);
    expect(Array.from(flipped.slice(0, 8))).toEqual(Array.from(plain.slice(8, 16)));
    expect(Array.from(flipped.slice(8, 16))).toEqual(Array.from(plain.slice(0, 8)));
  });
});

describe('imageCorners', () => {
  const transform = [5, 0, 0, 413152.5, 0, 5, 0, 7646506.5, 0, 0, 0, 0, 0, 0, 0, 1];
  // pyproj, EPSG:32704 -> 4326, at the outer edges of the first and last cells
  const REAL = {
    sw: [-159.8372240437321, -21.281167085477964],
    se: [-159.71827552918268, -21.281716386529485],
    ne: [-159.71783980379888, -21.19173094106384],
    nw: [-159.83671618002484, -21.19118418151189],
  };

  it('puts the corners where pyproj puts them, north-up, for the real Rarotonga grid', () => {
    const { corners, flipRows } = imageCorners(
      { epsg: 32704, model_transformation: transform },
      2468,
      1992
    );
    expect(flipRows).toBe(true);
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    for (const [got, want] of [
      [topLeft, REAL.nw],
      [topRight, REAL.ne],
      [bottomRight, REAL.se],
      [bottomLeft, REAL.sw],
    ]) {
      expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-8);
      expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-8);
    }
    expect(topLeft[1]).toBeGreaterThan(bottomLeft[1]); // the top is the north
    expect(topRight[0]).toBeGreaterThan(topLeft[0]); // the right is the east
  });

  it('keeps rows as they are when the grid already runs north to south', () => {
    const northUp = [5, 0, 0, 413152.5, 0, -5, 0, 7656466.5];
    const { corners, flipRows } = imageCorners(
      { epsg: 32704, model_transformation: northUp },
      100,
      50
    );
    expect(flipRows).toBe(false);
    expect(corners[0][1]).toBeGreaterThan(corners[3][1]);
  });

  it('refuses what it cannot place', () => {
    expect(() => imageCorners({ epsg: 3832, model_transformation: transform }, 10, 10)).toThrow(
      RangeError
    );
    expect(() =>
      imageCorners({ epsg: 32704, model_transformation: [-5, 0, 0, 1, 0, 5, 0, 1] }, 10, 10)
    ).toThrow(/west/);
  });
});

describe('loadHazardScenario', () => {
  it('reads a return-period scenario and draws it north-up in the right place', async () => {
    // return_period 10 is index 0, slr 0.5 is index 1: depth = 0*100 + 1*10 + y + x/10, all present
    const scenario = await loadHazardScenario(miniStore(), {
      source: 'tc',
      slr: 0.5,
      selector: '10',
    });
    expect([scenario.width, scenario.height]).toEqual([10, 6]);
    expect(scenario.wetCells).toBe(60);
    expect(scenario.maxDepth).toBeCloseTo(15.9, 4);
    expect(Array.from(scenario.rgba.slice(0, 4))).toEqual([0, 0, 255, 190]); // deeper than 5 m
    expect(scenario.corners).toHaveLength(4);
    const [topLeft, topRight, bottomRight, bottomLeft] = scenario.corners;
    // pyproj, at the outer edges of the 10 x 6 grid
    expect(Math.abs(topLeft[0] - -159.8372225100132)).toBeLessThan(1e-8);
    expect(Math.abs(topLeft[1] - -21.280896054092914)).toBeLessThan(1e-8);
    expect(Math.abs(bottomRight[0] - -159.83674208842882)).toBeLessThan(1e-8);
    expect(Math.abs(bottomRight[1] - -21.281169480638138)).toBeLessThan(1e-8);
    expect(topRight[0]).toBeGreaterThan(topLeft[0]);
    expect(bottomLeft[1]).toBeLessThan(topLeft[1]);
  });

  it('counts the cells of a chunk that was never written as no data', async () => {
    const scenario = await loadHazardScenario(miniStore(), {
      source: 'tc',
      slr: 0.5,
      selector: '100',
    });
    // the one chunk that was never written (return periods 50 and 100, 0.5 m) is rows 3-5 of columns 5-9
    expect(scenario.wetCells).toBe(60 - 15);
    // the top row of the picture is the north: array row 5, where columns 5-9 are NaN
    expect(scenario.rgba[5 * 4 + 3]).toBe(0);
    expect(scenario.rgba[3]).toBe(190);
  });

  it('finds the 0 m scenario, which a missing-data marker used to hide', async () => {
    const scenario = await loadHazardScenario(miniStore(), {
      source: 'historical_tcs',
      slr: 0,
      selector: '01-Mar-1987',
    });
    expect(scenario.maxDepth).toBeCloseTo(5.9, 4);
    expect(scenario.wetCells).toBe(60);
  });

  it('finds an event by its label, including non-ASCII', async () => {
    const scenario = await loadHazardScenario(miniStore(), {
      source: 'historical_tcs',
      slr: 0.5,
      selector: 'Évènement-3',
    });
    expect(scenario.maxDepth).toBeCloseTo(2015.9, 3);
  });

  it('says which part of the scenario is not in the store', async () => {
    const store = miniStore();
    await expect(
      loadHazardScenario(store, { source: 'tc', slr: 0.5, selector: '77' })
    ).rejects.toThrow('return period of 77');
    await expect(
      loadHazardScenario(store, { source: 'tc', slr: 3, selector: '50' })
    ).rejects.toThrow('sea-level rise of 3');
    await expect(
      loadHazardScenario(store, { source: 'historical_tcs', slr: 0, selector: 'No such event' })
    ).rejects.toThrow("no event 'No such event'");
    await expect(
      loadHazardScenario(store, { source: 'nonsense', slr: 0, selector: '1' })
    ).rejects.toThrow("unknown hazard source 'nonsense'");
    await expect(
      loadHazardScenario(store, { source: 'swell_driven', slr: 0, selector: 'x' })
    ).rejects.toThrow(/no array/);
  });
});

describe('storeFor', () => {
  it('shares one store, and its cached metadata, per address', () => {
    expect(storeFor('/a/hazard_zarr')).toBe(storeFor('/a/hazard_zarr'));
    expect(storeFor('/a/hazard_zarr')).not.toBe(storeFor('/b/hazard_zarr'));
  });
});
