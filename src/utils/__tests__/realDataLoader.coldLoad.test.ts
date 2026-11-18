/**
 * A cold load of the Cook Islands forecast, replayed against what the partner API really answered
 * (TC Xavier, advisory 9-run-35, captured 2026-11-18). QA found that a fresh page load, and every shared
 * link, said "This run returned no exposure results" for an advisory that has exposure.
 *
 * @jest-environment jsdom
 */
import fixture from './fixtures/xavier-cold-load.json';
import { installPartnerApiReplay, type PartnerApiReplay } from '../testing/partnerApiReplay';

type Loader = typeof import('../realDataLoader');

const responses = (fixture as { responses: Record<string, { status: number; body: unknown }> })
  .responses;
const options = {
  countryCode: 'CK' as const,
  selectedEventIds: ['9-run-35'],
  includeDamagedAssets: false,
  includeSupplementaryData: false,
};

let replay: PartnerApiReplay;
let loader: Loader;

beforeEach(async () => {
  jest.resetModules(); // each test starts with an empty response cache and no shared loads
  replay = installPartnerApiReplay(responses);
  loader = await import('../realDataLoader');
});
afterEach(() => replay.restore());

const summary = (result: Awaited<ReturnType<Loader['loadAllRealData']>>) => ({
  active: result.activeEventRecord?.id,
  areas: result.forecastExposure?.regions.length ?? null,
  people: result.forecastExposure?.national?.exposed.population ?? null,
});

const XAVIER_12Z = { active: '9-run-35', areas: 13, people: 533 };
const partnerRequests = () => replay.requests.filter(url => url.includes('/partner_api/v1/event'));

describe('cold load of advisory 9-run-35', () => {
  it('shows its exposure: 13 Cook Islands areas and 533 people', async () => {
    expect(summary(await loader.loadAllRealData(options))).toEqual(XAVIER_12Z);
  });

  it('leaves out the Samoan and Tongan areas the same run carries', async () => {
    const result = await loader.loadAllRealData(options);
    const names = result.forecastExposure!.regions.map(area => area.name);
    expect(names).toContain('Nassau');
    expect(names).not.toContain("A'ana");
    expect(result.forecastExposure!.neighbouringCountries).toEqual(['Samoa', 'Tonga']);
  });

  it('still shows it when the first load is cancelled and restarted straight away (QA C1)', async () => {
    // The page cancels a load by aborting it and asking again: React's double mount in development,
    // or a selection that settles a moment after mount. The second load must not inherit the abort.
    const first = new AbortController();
    const abandoned = loader.loadAllRealData({ ...options, signal: first.signal });
    first.abort('New data load requested');
    const second = new AbortController();
    const restarted = loader.loadAllRealData({ ...options, signal: second.signal });
    await abandoned.catch(() => undefined);
    expect(summary(await restarted)).toEqual(XAVIER_12Z);
  });

  it('shows it when the cancelled load is a few steps in, not only at the start', async () => {
    const first = new AbortController();
    const abandoned = loader.loadAllRealData({ ...options, signal: first.signal });
    await new Promise(resolve => setTimeout(resolve, 0));
    first.abort('New data load requested');
    const restarted = loader.loadAllRealData({ ...options, signal: new AbortController().signal });
    await abandoned.catch(() => undefined);
    expect(summary(await restarted)).toEqual(XAVIER_12Z);
  });

  it('survives several cancelled loads in a row', async () => {
    const abandoned: Array<Promise<unknown>> = [];
    for (let i = 0; i < 3; i++) {
      const controller = new AbortController();
      abandoned.push(
        loader.loadAllRealData({ ...options, signal: controller.signal }).catch(() => undefined)
      );
      controller.abort('New data load requested');
    }
    const last = loader.loadAllRealData({ ...options, signal: new AbortController().signal });
    await Promise.all(abandoned);
    expect(summary(await last)).toEqual(XAVIER_12Z);
  });
});

describe('loads that share a request', () => {
  it('still make the partner API requests once when nobody leaves', async () => {
    const [a, b] = await Promise.all([
      loader.loadAllRealData(options),
      loader.loadAllRealData(options),
    ]);
    expect(summary(a)).toEqual(XAVIER_12Z);
    expect(summary(b)).toEqual(XAVIER_12Z);
    expect(partnerRequests().filter(url => /event\/?\?country=/.test(url))).toHaveLength(1);
  });

  it('keep going for the caller that stays when the other leaves', async () => {
    const leaver = new AbortController();
    const gone = loader.loadAllRealData({ ...options, signal: leaver.signal });
    const stays = loader.loadAllRealData({ ...options, signal: new AbortController().signal });
    leaver.abort('not needed');
    await gone.catch(() => undefined);
    expect(summary(await stays)).toEqual(XAVIER_12Z);
  });

  it('are not poisoned for later: after everyone left, the next load starts fresh', async () => {
    const only = new AbortController();
    const abandoned = loader.loadAllRealData({ ...options, signal: only.signal });
    only.abort('not needed');
    await abandoned.catch(() => undefined);
    expect(summary(await loader.loadAllRealData(options))).toEqual(XAVIER_12Z);
  });
});

describe('what a cold load costs (QA H6)', () => {
  // The numbers are this advisory's today: 29 model runs, 25 tracks and 9 risk rows have to be read one by
  // one on the shared API. The budget is on round trips, which is what a slow link pays for.
  it('makes no redirected requests: the proxy is asked for the URL it serves, without the slash', async () => {
    await loader.loadAllRealData(options);
    expect(replay.redirects()).toBe(0);
  });

  it('needs about half the round trips it did (30 before, 15 now)', async () => {
    await loader.loadAllRealData(options);
    expect(replay.roundTrips()).toBeLessThanOrEqual(16);
  });

  it('does not ask for more than it did: 70 requests', async () => {
    await loader.loadAllRealData(options);
    expect(replay.requests.length).toBeLessThanOrEqual(70);
  });

  it('asks the event registry at the same time as the partner API, not after it', async () => {
    await loader.loadAllRealData(options);
    const registry = replay.requests.findIndex(url => url.includes('/api/events'));
    const lastRun = replay.requests.map(url => url.includes('/model_run/')).lastIndexOf(true);
    expect(registry).toBeGreaterThanOrEqual(0);
    expect(registry).toBeLessThan(lastRun);
  });
});
