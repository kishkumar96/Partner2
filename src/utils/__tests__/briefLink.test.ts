import { briefDashboardLink } from '../briefLink';

describe('briefDashboardLink (the QR code on the forecast brief)', () => {
  const base = 'https://dash.example.org/partner2/cook-islands';

  it('keeps what says which forecast, and how it is drawn', () => {
    const link = briefDashboardLink(
      `${base}?events=9-run-35&mode=event&basemap=dark&eez=off&layers=buildings`
    );
    const params = new URL(link).searchParams;
    expect(params.get('events')).toBe('9-run-35');
    expect(params.get('mode')).toBe('event');
    expect(params.get('basemap')).toBe('dark');
    expect(params.get('eez')).toBe('off');
    expect(params.get('layers')).toBe('buildings');
  });

  it('drops the screen the officer happened to be on: panels, selected area, position, playback', () => {
    const link = briefDashboardLink(
      `${base}?events=9&panel=layers&map=true&filters=true&summary=true&region=Nassau&story=true&cyclone=12&lat=-10.7&lng=-165.8&zoom=7.5#details`
    );
    const url = new URL(link);
    for (const key of [
      'panel',
      'map',
      'filters',
      'summary',
      'region',
      'story',
      'cyclone',
      'lat',
      'lng',
      'zoom',
    ]) {
      expect(url.searchParams.has(key)).toBe(false);
    }
    expect(url.searchParams.get('events')).toBe('9');
    expect(url.hash).toBe('');
  });

  it('leaves a link with nothing to drop as it is', () => {
    expect(briefDashboardLink(base)).toBe(base);
  });

  it('returns what it was given when it is not a URL', () => {
    expect(briefDashboardLink('not a url')).toBe('not a url');
  });
});
