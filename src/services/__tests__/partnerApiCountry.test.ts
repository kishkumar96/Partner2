import { findCountryRecord, resolveCountryId } from '../partnerApiService';

type Row = Record<string, unknown>;

// The live API today: no codes, ids and names as SPC set them
const liveWithoutCodes: Row[] = [
  { id: 1, short_name: 'FJI', long_name: 'FIJI' },
  { id: 2, short_name: 'VU', long_name: 'Vanuatu' },
  { id: 3, short_name: 'CK', long_name: 'Cook Island' },
  { id: 4, short_name: 'Ton', long_name: 'Tonga' },
  { id: 5, short_name: 'WS', long_name: 'Samoa' },
];

// A database numbered differently (Cook Islands is 1 here), now with canonical codes
const localWithCodes: Row[] = [
  { id: 1, code: 'CK', short_name: 'CK', long_name: 'Cook Islands' },
  { id: 2, code: 'VU', short_name: 'VU', long_name: 'Vanuatu' },
  { id: 3, code: 'TO', short_name: 'TO', long_name: 'Tonga' },
  { id: 4, code: 'WS', short_name: 'WS', long_name: 'Samoa' },
];

describe('resolveCountryId', () => {
  it('still finds each country on an API that has no codes yet', () => {
    expect(resolveCountryId(liveWithoutCodes, 'VU')).toBe(2);
    expect(resolveCountryId(liveWithoutCodes, 'CK')).toBe(3); // via short name: "Cook Island" is not "cook islands"
    expect(resolveCountryId(liveWithoutCodes, 'TO')).toBe(4); // short name "Ton", found by the long name
    expect(resolveCountryId(liveWithoutCodes, 'WS')).toBe(5);
  });

  it('finds the same country by code whatever ids a deployment gives them', () => {
    expect(resolveCountryId(localWithCodes, 'CK')).toBe(1);
    expect(resolveCountryId(localWithCodes, 'TO')).toBe(3);
    expect(resolveCountryId(liveWithoutCodes, 'CK')).not.toBe(
      resolveCountryId(localWithCodes, 'CK')
    );
  });

  it('trusts the code over misleading names', () => {
    const rows: Row[] = [
      { id: 3, short_name: 'CK', long_name: 'Cook Islands' }, // looks right, has no code
      { id: 9, code: 'CK', short_name: 'XX', long_name: 'Renamed in the admin' },
    ];
    expect(resolveCountryId(rows, 'CK')).toBe(9);
  });

  it('never matches a country that carries a different code by its name', () => {
    // "American Samoa" contains "samoa", which used to count as a match for Samoa
    const rows: Row[] = [{ id: 7, code: 'AS', short_name: 'AS', long_name: 'American Samoa' }];
    expect(resolveCountryId(rows, 'WS')).toBeNull();
    // and without a code, a name match on a record with another code is not made either
    const mixed: Row[] = [
      { id: 7, code: 'AS', short_name: 'AS', long_name: 'American Samoa' },
      { id: 5, short_name: 'WS', long_name: 'Samoa' },
    ];
    expect(resolveCountryId(mixed, 'WS')).toBe(5);
  });

  it('upper-cases a lower-case code, and ignores a blank one', () => {
    expect(resolveCountryId([{ id: 4, code: ' ck ' }], 'CK')).toBe(4);
    expect(resolveCountryId([{ id: 4, code: '   ', short_name: 'CK' }], 'CK')).toBe(4); // blank = no code
  });

  it('reads the id under the other key names and as a string', () => {
    expect(resolveCountryId([{ pk: 12, code: 'VU' }], 'VU')).toBe(12);
    expect(resolveCountryId([{ country_id: '13', code: 'VU' }], 'VU')).toBe(13);
    expect(resolveCountryId([{ id: 'abc', code: 'VU' }], 'VU')).toBeNull();
  });

  it('returns null when no record is for the country', () => {
    expect(resolveCountryId([], 'CK')).toBeNull();
    expect(resolveCountryId(localWithCodes, 'CK' as never)).toBe(1);
    expect(resolveCountryId([{ id: 1, code: 'FJ' }], 'CK')).toBeNull();
  });
});

describe('findCountryRecord', () => {
  it('returns the whole record, preferring a coded one', () => {
    expect(findCountryRecord(localWithCodes, 'VU')).toEqual(localWithCodes[1]);
    expect(findCountryRecord([], 'VU')).toBeNull();
  });
});
