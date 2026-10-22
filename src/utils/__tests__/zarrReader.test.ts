/**
 * @jest-environment node
 *
 * Reads the tiny hazard store in fixtures/hazard_zarr_mini (made by make_hazard_zarr_mini.py, with
 * real zstd chunks) through a fake `fetch`, so the reader is tested on the format it will really see.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { ZarrError, ZarrHttpStore } from '../zarrReader';

const ROOT = join(__dirname, 'fixtures', 'hazard_zarr_mini');
const BASE = 'https://dashboard.example/api/partner-proxy/partner_api/v1/hazard_zarr';

function fakeFetch(overrides: Record<string, () => Response> = {}): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const key = String(input).slice(BASE.length + 1);
    if (overrides[key]) return overrides[key]();
    const file = join(ROOT, key);
    if (!existsSync(file) || !statSync(file).isFile())
      return new Response('not found', { status: 404 });
    return new Response(readFileSync(file));
  });
}

const tc = (r: number, s: number, y: number, x: number) => r * 100 + s * 10 + y + x / 10;

describe('ZarrHttpStore', () => {
  it('reads metadata once, from the consolidated file', async () => {
    const fetchMock = fakeFetch();
    const store = new ZarrHttpStore(BASE, fetchMock);
    const meta = await store.arrayMeta('probabilistic/tc/depth');
    expect(meta.shape).toEqual([4, 2, 6, 10]);
    expect(meta.chunks).toEqual([2, 1, 3, 5]);
    expect((await store.attrs('probabilistic/tc')).epsg).toBe(32704);
    await store.arrayMeta('historical_tcs/depth');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('.zmetadata'))).toHaveLength(
      1
    );
  });

  it('reads coordinates, keeping real zeros and decoding int64 and unicode strings', async () => {
    const store = new ZarrHttpStore(BASE, fakeFetch());
    expect(await store.vector('probabilistic/tc/slr')).toEqual([0, 0.5]);
    expect(await store.vector('probabilistic/tc/return_period')).toEqual([10, 25, 50, 100]);
    expect(await store.vector('probabilistic/tc/x')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await store.vector('historical_tcs/event')).toEqual([
      '01-Mar-1987',
      '02-Jan-1995',
      'Évènement-3',
    ]);
  });

  it('assembles a plane from several chunks, picking the right layer of a multi-layer chunk', async () => {
    const store = new ZarrHttpStore(BASE, fakeFetch());
    // return_period index 3 is the second layer of its (2-deep) chunk; slr index 1
    const { data, height, width } = await store.plane('probabilistic/tc/depth', [3, 1]);
    expect([height, width, data.length]).toEqual([6, 10, 60]);
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        // the chunk at 1.1.1.1 was never written: its corner (rows 3-5, columns 5-9) reads as NaN
        const expected = y >= 3 && x >= 5 ? Number.NaN : Math.fround(tc(3, 1, y, x));
        expect(data[y * width + x]).toEqual(expected);
      }
    }
    const first = await store.plane('probabilistic/tc/depth', [0, 0]);
    expect(first.data[0]).toBe(0);
    expect(first.data[9]).toBeCloseTo(0.9, 6);
    expect(first.data[5 * 10 + 9]).toBeCloseTo(5.9, 5);
  });

  it('reads a plane held in a single chunk per layer', async () => {
    const store = new ZarrHttpStore(BASE, fakeFetch());
    const { data } = await store.plane('historical_tcs/depth', [2, 1]);
    expect(data[0]).toBe(2010);
    expect(data[59]).toBeCloseTo(2015.9, 3);
  });

  it('fetches only the chunks of the plane it was asked for', async () => {
    const fetchMock = fakeFetch();
    await new ZarrHttpStore(BASE, fetchMock).plane('probabilistic/tc/depth', [0, 0]);
    const chunkUrls = fetchMock.mock.calls
      .map(([url]) => String(url).slice(BASE.length + 1))
      .filter(k => /\d$/.test(k));
    expect(chunkUrls.sort()).toEqual(
      [
        'probabilistic/tc/depth/0.0.0.0',
        'probabilistic/tc/depth/0.0.0.1',
        'probabilistic/tc/depth/0.0.1.0',
        'probabilistic/tc/depth/0.0.1.1',
      ].sort()
    );
  });

  it('refuses indices outside the array, and the wrong number of them', async () => {
    const store = new ZarrHttpStore(BASE, fakeFetch());
    await expect(store.plane('probabilistic/tc/depth', [4, 0])).rejects.toThrow(/outside axis 0/);
    await expect(store.plane('probabilistic/tc/depth', [0, -1])).rejects.toThrow(/outside axis 1/);
    await expect(store.plane('probabilistic/tc/depth', [0])).rejects.toThrow(
      /needs 2 leading indices/
    );
    await expect(store.plane('probabilistic/tc/depth', [0.5, 0])).rejects.toThrow(ZarrError);
  });

  it('says what is wrong when the store or an array is missing', async () => {
    await expect(new ZarrHttpStore(BASE, fakeFetch()).arrayMeta('nope/depth')).rejects.toThrow(
      "no array 'nope/depth'"
    );
    const down = new ZarrHttpStore(
      BASE,
      fakeFetch({ '.zmetadata': () => new Response('x', { status: 503 }) })
    );
    await expect(down.arrayMeta('probabilistic/tc/depth')).rejects.toThrow('HTTP 503');
  });

  it('can recover after the metadata failed to load once', async () => {
    let calls = 0;
    const flaky = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('.zmetadata') && (calls += 1) === 1)
        return new Response('x', { status: 502 });
      return fakeFetch()(input);
    });
    const store = new ZarrHttpStore(BASE, flaky as unknown as typeof fetch);
    await expect(store.arrayMeta('probabilistic/tc/depth')).rejects.toThrow('HTTP 502');
    await expect(store.arrayMeta('probabilistic/tc/depth')).resolves.toMatchObject({
      dtype: '<f4',
    });
  });

  it('fails clearly on a server error for a chunk, but reads a missing one as no data', async () => {
    const broken = new ZarrHttpStore(
      BASE,
      fakeFetch({ 'probabilistic/tc/depth/0.0.0.0': () => new Response('x', { status: 500 }) })
    );
    await expect(broken.plane('probabilistic/tc/depth', [0, 0])).rejects.toThrow('HTTP 500');
    const missing = new ZarrHttpStore(
      BASE,
      fakeFetch({ 'probabilistic/tc/depth/0.0.0.0': () => new Response('', { status: 404 }) })
    );
    const { data } = await missing.plane('probabilistic/tc/depth', [0, 0]);
    expect(Number.isNaN(data[0])).toBe(true);
    expect(Number.isNaN(data[0 * 10 + 4])).toBe(true);
  });

  it('refuses a chunk that is not the size the metadata promises', async () => {
    // the slr coordinate file decompresses to 16 bytes, not the 120 a depth chunk must hold
    const wrong = new ZarrHttpStore(
      BASE,
      fakeFetch({
        'probabilistic/tc/depth/0.0.0.0': () =>
          new Response(readFileSync(join(ROOT, 'probabilistic/tc/slr/0'))),
      })
    );
    await expect(wrong.plane('probabilistic/tc/depth', [0, 0])).rejects.toThrow(/expected 120/);
  });

  it('refuses storage it does not understand instead of misreading it', async () => {
    const odd = (meta: object) => () =>
      new Response(
        JSON.stringify({
          metadata: {
            'a/.zarray': {
              shape: [2, 2],
              chunks: [2, 2],
              dtype: '<f4',
              fill_value: 'NaN',
              order: 'C',
              filters: null,
              compressor: { id: 'zstd' },
              zarr_format: 2,
              ...meta,
            },
          },
        })
      );
    for (const [meta, message] of [
      [{ zarr_format: 3 }, 'only v2'],
      [{ order: 'F' }, 'only C'],
      [{ filters: [{ id: 'delta' }] }, 'filters'],
      [{ compressor: { id: 'blosc' } }, 'only zstd'],
      [{ dtype: '<c8' }, "unsupported data type '<c8'"],
    ] as Array<[object, string]>) {
      const store = new ZarrHttpStore(BASE, fakeFetch({ '.zmetadata': odd(meta) }));
      await expect(store.arrayMeta('a')).rejects.toThrow(message);
    }
  });
});
