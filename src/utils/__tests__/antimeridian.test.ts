import { unwrapAntimeridian, unwrapLine, unwrapPolygon } from '../antimeridian';

const fc = (geometry: GeoJSON.Geometry): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { a: 1 }, geometry }],
});

describe('unwrapLine', () => {
  it('makes an eastward crossing continuous', () => {
    expect(
      unwrapLine([
        [178, -15],
        [-179, -16],
        [-175, -17],
      ])
    ).toEqual([
      [178, -15],
      [181, -16],
      [185, -17],
    ]);
  });

  it('makes a westward crossing continuous and keeps extra ordinates', () => {
    expect(
      unwrapLine([
        [-178, -15, 5],
        [179, -16, 6],
        [175, -17, 7],
      ])
    ).toEqual([
      [-178, -15, 5],
      [-181, -16, 6],
      [-185, -17, 7],
    ]);
  });

  it('handles a track that crosses and comes back', () => {
    const out = unwrapLine([[179], [-179], [179]]);
    expect(out.map(p => p[0])).toEqual([179, 181, 179]);
  });

  it('returns the same array when nothing crosses', () => {
    const line = [
      [-162.9, -14.4],
      [-147.4, -25.3],
    ];
    expect(unwrapLine(line)).toBe(line);
  });
});

describe('unwrapPolygon', () => {
  it('closes a ring that straddles the dateline', () => {
    const ring = [
      [179, -10],
      [-179, -10],
      [-179, -12],
      [179, -12],
      [179, -10],
    ];
    const [out] = unwrapPolygon([ring]);
    expect(out.map(p => p[0])).toEqual([179, 181, 181, 179, 179]);
  });

  it('keeps a hole on the same world copy as its outer ring', () => {
    const outer = [
      [170, 0],
      [-170, 0],
      [-170, 10],
      [170, 10],
      [170, 0],
    ];
    const hole = [
      [-179, 4],
      [-178, 4],
      [-178, 5],
      [-179, 4],
    ];
    const [o, h] = unwrapPolygon([outer, hole]);
    expect(o.map(p => p[0])).toEqual([170, 190, 190, 170, 170]);
    expect(h.map(p => p[0])).toEqual([181, 182, 182, 181]);
  });
});

describe('unwrapAntimeridian', () => {
  it('returns the same object when no feature crosses', () => {
    const data = fc({
      type: 'LineString',
      coordinates: [
        [-160, -20],
        [-150, -25],
      ],
    });
    expect(unwrapAntimeridian(data)).toBe(data);
  });

  it('fixes lines and multipolygons without mutating the input', () => {
    const line = fc({
      type: 'LineString',
      coordinates: [
        [179, -15],
        [-179, -15],
      ],
    });
    const before = JSON.stringify(line);
    const out = unwrapAntimeridian(line);
    expect(JSON.stringify(line)).toBe(before);
    expect((out.features[0].geometry as GeoJSON.LineString).coordinates[1][0]).toBe(181);
    expect(out.features[0].properties).toEqual({ a: 1 });

    const multi = unwrapAntimeridian(
      fc({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [179, 0],
              [-179, 0],
              [-179, 1],
              [179, 0],
            ],
          ],
        ],
      })
    );
    const ring = (multi.features[0].geometry as GeoJSON.MultiPolygon).coordinates[0][0];
    expect(ring.map(p => p[0])).toEqual([179, 181, 181, 179]);
  });

  it('leaves points alone', () => {
    const data = fc({ type: 'Point', coordinates: [-179, -15] });
    expect(unwrapAntimeridian(data)).toBe(data);
  });
});
