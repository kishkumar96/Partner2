import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OperatorConsole, { previewTrackCsv } from '../OperatorConsole';

const PIPELINES = {
  track_types: [
    {
      id: 1,
      name: 'Official Forecast Track',
      label: 'Rapid (forecast)',
      pipelines: [
        {
          country: null,
          models: ['tc'],
          runner: { server_name: 'riskscape.nz', online: true, last_seen_at: null },
        },
      ],
    },
    {
      id: 3,
      name: 'Post-event Best Track',
      label: 'PDNA (post-event best track)',
      pipelines: [
        {
          country: null,
          models: ['QuickSurge', 'Wind Hazard', 'RiskScape'],
          runner: { server_name: 'lotgemdev01', online: false, last_seen_at: null },
        },
      ],
    },
  ],
  countries: [{ id: 2, code: 'VU', name: 'Vanuatu' }],
};

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('previewTrackCsv', () => {
  it('counts track points and reads the time range', () => {
    expect(
      previewTrackCsv(
        'Time,Latitude,Longitude\n2026-04-22T00:00Z,-15,167\n2026-04-22T06:00Z,-15.5,167.6\n'
      )
    ).toEqual({ points: 2, first: '2026-04-22T00:00Z', last: '2026-04-22T06:00Z' });
  });

  it('handles RSMC-style headers and comment lines', () => {
    const csv =
      "# CycloneName=Lola\nTime[fmt=yyyy-MM-dd'T'HH:mm:ss'Z'],Latitude,Longitude\n2023-10-23T03:00:00Z,-12.7,169.4\n";
    expect(previewTrackCsv(csv)).toMatchObject({ points: 1, first: '2023-10-23T03:00:00Z' });
  });

  it('explains what is wrong with an unusable file', () => {
    expect(previewTrackCsv('Time,Latitude,Longitude\n')).toBe('The file has no track rows.');
    expect(previewTrackCsv('a,b\n1,2\n')).toBe('No Latitude / Longitude columns found.');
  });
});

describe('OperatorConsole', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks signed-out users to sign in and shows a failed sign-in', async () => {
    global.fetch = jest.fn((url: string) =>
      url === '/api/operator/session'
        ? respond(401, { detail: 'Sign in as an operator first.' })
        : respond(403, {
            detail: 'This account is not a superuser, so it cannot submit cyclone tracks.',
          })
    ) as jest.Mock;
    render(<OperatorConsole />);
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'viewer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a superuser');
  });

  it('submits a best track and shows the queued PDNA run waiting for its runner', async () => {
    const fetchMock = jest.fn((url: string, _init?: RequestInit) => {
      if (url === '/api/operator/session') return respond(200, { username: 'operator' });
      if (url === '/api/operator/pipelines') return respond(200, PIPELINES);
      return respond(201, {
        track: { id: 9, cyclone_name: '2026042221_VAIANU', points: 24 },
        runs: [
          {
            id: 3,
            status: 'queued',
            error: '',
            models: ['QuickSurge', 'Wind Hazard', 'RiskScape'],
            runner: { server_name: 'lotgemdev01', online: false, last_seen_at: null },
            logs: [],
            event: null,
          },
        ],
        message: null,
      });
    });
    global.fetch = fetchMock as jest.Mock;
    render(<OperatorConsole />);

    fireEvent.click(await screen.findByText('PDNA (post-event best track)'));
    expect(screen.getByText('QuickSurge → Wind Hazard → RiskScape')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cyclone name'), {
      target: { value: '2026042221_VAIANU' },
    });
    fireEvent.change(screen.getByLabelText('Issued (UTC)'), {
      target: { value: '2026-04-22T21:30' },
    });
    const file = new File(['Time,Latitude,Longitude\n2026-04-22T21:30Z,-15,167\n'], 'track.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('Time,Latitude,Longitude\n2026-04-22T21:30Z,-15,167\n'),
    });
    fireEvent.change(screen.getByLabelText('Track file (CSV)'), { target: { files: [file] } });
    expect(await screen.findByText(/1 track points/)).toBeInTheDocument();

    // jsdom treats a file set from a test as an empty required input, so submit the form directly
    fireEvent.submit(
      screen.getByRole('button', { name: 'Submit track and start runs' }).closest('form')!
    );
    expect(await screen.findByText(/Track 2026042221_VAIANU saved/)).toBeInTheDocument();
    expect(screen.getByText(/runner lotgemdev01 hasn’t checked in/)).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/operator/tracks')!;
    const sent = (init as RequestInit).body as FormData;
    expect(sent.get('cyclone_track_type')).toBe('3');
    expect(sent.get('country')).toBe('2');
    expect(sent.get('issued_time')).toBe('2026-04-22T21:30:00.000Z');
  });
});
