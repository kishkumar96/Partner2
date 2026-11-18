import { withMapFramedOn } from '../briefMapFrame';

const fakeMap = () => {
  const calls: string[] = [];
  const map = {
    calls,
    getCenter: () => ({ lng: -158.5, lat: -20.1 }),
    getZoom: () => 6.2,
    getBearing: () => 15,
    getPitch: () => 40,
    fitBounds: jest.fn((bounds: unknown, options: Record<string, unknown>) => {
      calls.push(`fit ${JSON.stringify(bounds)} ${JSON.stringify(options)}`);
    }),
    jumpTo: jest.fn((camera: unknown) => {
      calls.push(`jump ${JSON.stringify(camera)}`);
    }),
  };
  return map;
};
const bounds = [
  [-166, -22],
  [-157, -9],
];

describe('withMapFramedOn', () => {
  it('frames the map on the forecast for the capture, flat and north-up, with no animation', async () => {
    const map = fakeMap();
    const capture = jest.fn(async () => {
      map.calls.push('capture');
      return 'image';
    });
    expect(await withMapFramedOn(map, bounds, capture)).toBe('image');
    expect(map.fitBounds).toHaveBeenCalledWith(
      bounds,
      expect.objectContaining({ animate: false, bearing: 0, pitch: 0, maxZoom: 10 })
    );
  });

  it('puts the officer’s own view back after the capture: centre, zoom, bearing and tilt', async () => {
    const map = fakeMap();
    await withMapFramedOn(map, bounds, async () => {
      map.calls.push('capture');
      return null;
    });
    expect(map.calls.map(c => c.split(' ')[0])).toEqual(['fit', 'capture', 'jump']);
    expect(map.jumpTo).toHaveBeenCalledWith({
      center: [-158.5, -20.1],
      zoom: 6.2,
      bearing: 15,
      pitch: 40,
    });
  });

  it('restores the view even when the capture fails, and passes the failure on', async () => {
    const map = fakeMap();
    await expect(
      withMapFramedOn(map, bounds, async () => {
        throw new Error('canvas lost');
      })
    ).rejects.toThrow('canvas lost');
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
  });

  it('captures the view as it is when there is nothing to frame on, and moves nothing', async () => {
    const map = fakeMap();
    expect(await withMapFramedOn(map, null, async () => 'as is')).toBe('as is');
    expect(await withMapFramedOn(map, undefined, async () => 'as is')).toBe('as is');
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('captures as it is for a map that cannot be framed (no camera methods)', async () => {
    expect(
      await withMapFramedOn({ getCenter: () => ({ lng: 0, lat: 0 }) }, bounds, async () => 'ok')
    ).toBe('ok');
    expect(await withMapFramedOn(null, bounds, async () => 'ok')).toBe('ok');
  });

  it('lets the caller choose the padding and the closest zoom', async () => {
    const map = fakeMap();
    await withMapFramedOn(map, bounds, async () => null, { padding: 10, maxZoom: 7 });
    expect(map.fitBounds).toHaveBeenCalledWith(
      bounds,
      expect.objectContaining({ padding: 10, maxZoom: 7 })
    );
  });
});
