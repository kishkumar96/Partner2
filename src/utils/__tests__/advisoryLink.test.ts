import { advisoryPin, findPinnedAdvisory, parseAdvisoryPin } from '../advisoryLink';
import { normalizePartnerEventRecords } from '../partnerEvents';
import { deserializeMapState, serializeMapState } from '../urlState';
import { briefDashboardLink } from '../briefLink';

const run = (id: number, issued: string, current = false) => ({
  id,
  cyclone_track: 100 + id,
  issued_time: issued,
  status: 'complete',
  risks: [id * 10],
  is_current: current,
});
const stormWith = (runs: ReturnType<typeof run>[]) => ({
  id: 12,
  title: 'Tropical Cyclone Xavier',
  data_source: 'rapid_exposure_forecast',
  cyclone_track: 131,
  risks: [90],
  forecast_runs: runs,
});

describe('the problem: the newest advisory has no id that stays put', () => {
  const before = normalizePartnerEventRecords(
    'CK',
    stormWith([run(21, '2026-11-18T12:00:00Z'), run(22, '2026-11-18T18:00:00Z', true)])
  );
  const after = normalizePartnerEventRecords(
    'CK',
    stormWith([
      run(21, '2026-11-18T12:00:00Z'),
      run(22, '2026-11-18T18:00:00Z'),
      run(23, '2026-11-19T00:00:00Z', true),
    ])
  );
  const idOfRun = (records: typeof before, runId: string) =>
    records.find(r => r.forecastRunId === runId)?.id;

  it('an id taken from the newest advisory means a different advisory once another arrives', () => {
    expect(idOfRun(before, '22')).toBe('12'); // newest: the Event's own id
    expect(idOfRun(after, '22')).toBe('12-run-22'); // no longer the newest
    expect(after.find(r => r.id === '12')?.forecastRunId).toBe('23'); // and "12" now means run 23
  });

  it('the run id names the same advisory before and after', () => {
    expect(findPinnedAdvisory(before, '22')?.trackIssuedTime).toBe('2026-11-18T18:00:00Z');
    expect(findPinnedAdvisory(after, '22')?.trackIssuedTime).toBe('2026-11-18T18:00:00Z');
    expect(findPinnedAdvisory(after, '22')?.id).toBe('12-run-22');
  });

  it('a link made on the newest advisory is pinned to it, not to whatever is newest later', () => {
    const shown = before.find(r => r.id === '12'); // what an officer is looking at
    const pin = advisoryPin(shown);
    expect(pin).toBe('22');
    // opened after run 23 arrived:
    expect(findPinnedAdvisory(after, pin)?.forecastRunId).toBe('22');
  });
});

describe('advisoryPin', () => {
  it('is the run id of a forecast advisory, and nothing for anything else', () => {
    expect(advisoryPin({ isForecast: true, forecastRunId: '35' })).toBe('35');
    expect(advisoryPin({ isForecast: false, forecastRunId: '35' })).toBeUndefined();
    expect(advisoryPin({ isForecast: true })).toBeUndefined();
    expect(advisoryPin(null)).toBeUndefined();
  });
});

describe('findPinnedAdvisory', () => {
  const records = [
    { id: '9', isForecast: true, forecastRunId: '36' },
    { id: '9-run-35', isForecast: true, forecastRunId: '35' },
    { id: '4', isForecast: false, forecastRunId: '35' },
  ];

  it('finds the forecast advisory with that run id, whatever its id is today', () => {
    expect(findPinnedAdvisory(records, '36')?.id).toBe('9');
    expect(findPinnedAdvisory(records, '35')?.id).toBe('9-run-35');
  });

  it('is null for a run that is gone, and never matches an assessment', () => {
    expect(findPinnedAdvisory(records, '99')).toBeNull();
    expect(findPinnedAdvisory([records[2]], '35')).toBeNull();
    expect(findPinnedAdvisory(records, undefined)).toBeNull();
  });
});

describe('parseAdvisoryPin (it is read from the address)', () => {
  it('takes plain ids and nothing else', () => {
    expect(parseAdvisoryPin('35')).toBe('35');
    expect(parseAdvisoryPin(' run_7-b ')).toBe('run_7-b');
    for (const bad of [
      '',
      '   ',
      '<script>',
      '35;drop',
      'a b',
      'x'.repeat(41),
      '../etc',
      null,
      undefined,
    ]) {
      expect(parseAdvisoryPin(bad as string | null | undefined)).toBeUndefined();
    }
  });
});

describe('in the address', () => {
  it('is written and read back', () => {
    const params = serializeMapState({ events: ['9-run-35'], advisory: '35' });
    expect(params.get('advisory')).toBe('35');
    expect(deserializeMapState(params).advisory).toBe('35');
  });

  it('leaves older links alone: no advisory parameter, no advisory', () => {
    const state = deserializeMapState(new URLSearchParams('events=9&mode=event'));
    expect(state.advisory).toBeUndefined();
    expect(state.events).toEqual(['9']);
    expect(serializeMapState({ events: ['9'] }).has('advisory')).toBe(false);
  });

  it('ignores a malformed advisory instead of passing it on', () => {
    expect(
      deserializeMapState(new URLSearchParams('advisory=%3Cscript%3E')).advisory
    ).toBeUndefined();
  });

  it('survives into the QR code on the brief, which is what makes it open the same forecast', () => {
    const link = briefDashboardLink(
      'https://dash.example.org/partner2/cook-islands?advisory=35&events=9&panel=layers&lat=-10&lng=-165&zoom=6'
    );
    const params = new URL(link).searchParams;
    expect(params.get('advisory')).toBe('35');
    expect(params.has('panel')).toBe(false);
    expect(params.has('lat')).toBe(false);
  });
});
