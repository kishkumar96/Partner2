import { metadata } from '../layout';

jest.mock('../globals.css', () => ({}), { virtual: true });

const text = JSON.stringify(metadata);

describe('link preview and page metadata', () => {
  it('names the product, and nothing about being real time (a forecast is not live)', () => {
    expect(text).not.toMatch(/real-?time/i);
    expect(metadata.applicationName).toBe('Tropical Cyclone Rapid Impact Assessment Tool');
  });

  it('carries no placeholder handle', () => {
    expect(text).not.toMatch(/yourtwitterhandle/i);
    expect((metadata.twitter as { creator?: string }).creator).toBeUndefined();
  });

  it('describes what it does in plain words', () => {
    expect(metadata.description).toMatch(/Forecast exposure/);
    expect(text).not.toMatch(/Advanced WebGIS/i);
  });
});
