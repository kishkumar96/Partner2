import { partnerTargetPath } from '../partnerProxyPath';

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
