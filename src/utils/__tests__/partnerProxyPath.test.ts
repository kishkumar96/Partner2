import { partnerTargetPath, withoutProxyTrailingSlash } from '../partnerProxyPath';

describe('partnerTargetPath', () => {
  it('adds the trailing slash Django wants to its list and detail endpoints', () => {
    expect(partnerTargetPath('partner_api/v1/event')).toBe('partner_api/v1/event/');
    expect(partnerTargetPath('partner_api/v1/risk_information/12')).toBe(
      'partner_api/v1/risk_information/12/'
    );
    expect(partnerTargetPath('partner_api/v1/event/')).toBe('partner_api/v1/event/');
  });

  it('leaves file endpoints alone, such as a tile image', () => {
    expect(partnerTargetPath('partner_api/v1/hazard_tiles/tc/0.25/100/12/3/4.png')).toBe(
      'partner_api/v1/hazard_tiles/tc/0.25/100/12/3/4.png'
    );
  });

  it('never adds a slash to a Zarr object, including a plain chunk name with no dot', () => {
    for (const key of [
      '.zmetadata',
      'probabilistic/tc/depth/.zarray',
      'probabilistic/tc/depth/0.1.2.3',
      'probabilistic/tc/slr/0',
      'historical_tcs/event/0',
      'probabilistic/tc/x/12',
      'historical_tcs/depth/c/0/0/0/0',
    ]) {
      expect(partnerTargetPath(`partner_api/v1/hazard_zarr/${key}`)).toBe(
        `partner_api/v1/hazard_zarr/${key}`
      );
    }
  });

  it('passes through anything that is not a Partner API path', () => {
    expect(partnerTargetPath('thredds/wms/POP/file.nc')).toBe('thredds/wms/POP/file.nc');
    expect(partnerTargetPath('other/thing')).toBe('other/thing');
  });
});

describe('withoutProxyTrailingSlash', () => {
  const proxy = '/api/partner-proxy/partner_api/v1';

  it('drops the trailing slash Next would redirect, keeping the query', () => {
    expect(withoutProxyTrailingSlash(`${proxy}/event/?country=3&page_size=200`)).toBe(
      `${proxy}/event?country=3&page_size=200`
    );
    expect(withoutProxyTrailingSlash(`${proxy}/risk_information/297/`)).toBe(
      `${proxy}/risk_information/297`
    );
    expect(withoutProxyTrailingSlash(`${proxy}/country/`)).toBe(`${proxy}/country`);
  });

  it('works with a base path and an absolute URL', () => {
    expect(withoutProxyTrailingSlash(`/partner2${proxy}/model_run/36/`)).toBe(
      `/partner2${proxy}/model_run/36`
    );
    expect(withoutProxyTrailingSlash(`https://dash.example.org${proxy}/event/?x=1#top`)).toBe(
      `https://dash.example.org${proxy}/event?x=1#top`
    );
  });

  it('leaves a URL with no trailing slash, and anything that is not the proxy, alone', () => {
    expect(withoutProxyTrailingSlash(`${proxy}/event?country=3`)).toBe(`${proxy}/event?country=3`);
    expect(
      withoutProxyTrailingSlash('https://pacific-disaster-api.spc.int/partner_api/v1/event/')
    ).toBe('https://pacific-disaster-api.spc.int/partner_api/v1/event/');
    expect(withoutProxyTrailingSlash('/api/events?country=CK')).toBe('/api/events?country=CK');
  });

  it('keeps a slash inside the path and strips a doubled one at the end', () => {
    expect(withoutProxyTrailingSlash(`${proxy}/hazard_tiles/tc/0.25/12/3/4.png?x=1`)).toBe(
      `${proxy}/hazard_tiles/tc/0.25/12/3/4.png?x=1`
    );
    expect(withoutProxyTrailingSlash(`${proxy}/event//`)).toBe(`${proxy}/event`);
  });
});
