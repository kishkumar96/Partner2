/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../[...path]/route';

describe('partner-proxy forwarded headers', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('passes on what the API needs, not our host name or the browser’s cookies', async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const request = new NextRequest(
      'https://opmthredds.gem.spc.int/partner2/api/partner-proxy/partner_api/v1/country/',
      {
        headers: {
          accept: 'application/json',
          'accept-language': 'en',
          cookie: 'country_session=secret',
          'x-forwarded-host': 'opmthredds.gem.spc.int',
          'x-forwarded-for': '203.0.113.9',
          'cf-connecting-ip': '203.0.113.9',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ['partner_api', 'v1', 'country'] }),
    });

    expect(response.status).toBe(200);
    // The browser cannot see the upstream request; this header says where the data came from
    expect(response.headers.get('x-partner-upstream')).toBeTruthy();
    // Kept briefly in the viewer's own browser only, never in a shared cache
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=120, stale-while-revalidate=600'
    );
    const sent = new Headers(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit)?.headers);
    expect(sent.get('accept')).toBe('application/json');
    expect(sent.get('accept-language')).toBe('en');
    // The shared API answers 400 to our host name in X-Forwarded-Host
    expect(sent.get('x-forwarded-host')).toBeNull();
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('cf-connecting-ip')).toBeNull();
  });

  it('answers a missing scenario table with an empty list, and other 404s as they are', async () => {
    global.fetch = jest.fn(
      async () => new Response('not found', { status: 404 })
    ) as unknown as typeof fetch;
    const missing = await GET(
      new NextRequest(
        'https://x/partner2/api/partner-proxy/partner_api/v1/risk_scenario/?page_size=200'
      ),
      { params: Promise.resolve({ path: ['partner_api', 'v1', 'risk_scenario'] }) }
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ count: 0, next: null, previous: null, results: [] });

    const other = await GET(
      new NextRequest('https://x/partner2/api/partner-proxy/partner_api/v1/event/99/'),
      {
        params: Promise.resolve({ path: ['partner_api', 'v1', 'event', '99'] }),
      }
    );
    expect(other.status).toBe(404);
  });

  it("passes on the upstream body's size, which the re-streamed response no longer carries", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response('{"id":12}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-length': '8503954' },
        })
    ) as unknown as typeof fetch;
    const response = await GET(
      new NextRequest('https://x/partner2/api/partner-proxy/partner_api/v1/risk_information/12/'),
      { params: Promise.resolve({ path: ['partner_api', 'v1', 'risk_information', '12'] }) }
    );
    expect(response.headers.get('x-upstream-content-length')).toBe('8503954');
    expect(response.headers.get('content-length')).toBeNull();
  });
});
