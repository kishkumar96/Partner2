import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import MapPanel from '../MapPanel';
import ForecastLayersSection from '../ForecastLayersSection';
import { ForecastLegend } from '../ForecastLayers';
import { useForecastLayers, type ForecastLayerControls } from '@/utils/useForecastLayers';
import type { ForecastExposure } from '@/utils/forecastExposure';

jest.mock('@/utils/realDataLoader', () => ({
  fetchPartnerRiskInformationGeometry: jest.fn(() => new Promise(() => {})),
}));

const fc = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
const exposure = (over: Partial<ForecastExposure['layers']> = {}): ForecastExposure => ({
  national: null,
  regions: [],
  byWindDanger: [],
  byTrackDistance: [],
  facilities: [
    {
      id: '1',
      name: 'Clinic',
      asset: 'Health Facility',
      useType: '',
      area: 'A',
      danger: 'Hurricane Winds',
      windKmph: 1,
      trackDistance: '',
      inFloodplain: true,
    },
  ],
  layers: {
    facilities: fc,
    windSwaths: fc,
    trackDistance: null,
    cycloneTrack: fc,
    cycloneTrackSource: 'run',
    floodplainRowId: '63',
    ...over,
  },
});

describe('useForecastLayers', () => {
  it('offers only the overlays the run has data for, with the defaults on', () => {
    const { result } = renderHook(() => useForecastLayers(exposure(), 'VU'));
    const c = result.current!;
    expect(c.options.map(o => o.id)).toEqual(['track', 'swaths', 'facilities', 'floodplain']);
    expect(c.shown).toMatchObject({
      swaths: true,
      facilities: true,
      track: true,
      floodplain: false,
    });
    expect(c.activeCount).toBe(3);
    expect(c.summary).toBe('Track · Wind swaths · Facilities');
  });

  it('updates the count and summary when a layer is switched off', () => {
    const { result } = renderHook(() => useForecastLayers(exposure(), 'VU'));
    act(() => result.current!.toggle('track'));
    expect(result.current!.activeCount).toBe(2);
    expect(result.current!.summary).toBe('Wind swaths · Facilities');
  });

  it('says so when nothing is shown, and returns null with no forecast', () => {
    const { result } = renderHook(() => useForecastLayers(exposure(), 'VU'));
    ['track', 'swaths', 'facilities'].forEach(id => act(() => result.current!.toggle(id as never)));
    expect(result.current!.summary).toBe('None shown');
    expect(renderHook(() => useForecastLayers(null, 'VU')).result.current).toBeNull();
  });
});

describe('forecast track source', () => {
  it("calls the run's own track the Rapid Exposure Forecast input track", () => {
    const { result } = renderHook(() => useForecastLayers(exposure(), 'VU'));
    expect(result.current!.options.find(o => o.id === 'track')!.label).toBe(
      'Rapid Exposure Forecast input track'
    );
  });

  it("labels the event's linked track honestly when the run kept none", () => {
    const { result } = renderHook(() =>
      useForecastLayers(exposure({ cycloneTrackSource: 'event' }), 'VU')
    );
    const track = result.current!.options.find(o => o.id === 'track')!;
    expect(track.label).toBe('Forecast track');
    expect(track.note).toMatch(/linked to this event/i);
  });
});

describe('Forecast layers in Map Controls', () => {
  const controls = (): ForecastLayerControls => {
    const { result } = renderHook(() => useForecastLayers(exposure(), 'VU'));
    return result.current!;
  };

  it('lists the switches and reports a toggle', () => {
    const c = controls();
    const toggle = jest.fn();
    render(<ForecastLayersSection id="x" controls={{ ...c, toggle }} />);
    expect(screen.getByText(/the figures don’t change/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Floodplain exposure'));
    expect(toggle).toHaveBeenCalledWith('floodplain');
  });

  it('is its own section in MapPanel, open by default, collapsible to a one-line summary', () => {
    render(<MapPanel forecastLayers={controls()} />);
    const header = screen.getByRole('button', { name: /forecast layers/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Facilities (1)')).toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.queryByLabelText('Facilities (1)')).not.toBeInTheDocument();
    expect(screen.getByText('Track · Wind swaths · Facilities')).toBeInTheDocument();
  });

  it('has no forecast section when there is no forecast', () => {
    render(<MapPanel />);
    expect(screen.queryByRole('button', { name: /forecast layers/i })).not.toBeInTheDocument();
  });
});

describe('ForecastLegend', () => {
  const active = {
    track: false,
    swaths: true,
    rings: false,
    facilities: true,
    floodplain: false,
    priority: false,
  };

  it('always explains every wind band, since area shading is always drawn', () => {
    render(<ForecastLegend active={{ ...active, swaths: false, facilities: false }} />);
    const legend = screen.getByRole('region', { name: 'Forecast legend' });
    ['Hurricane', 'Possible Hurricane', 'Gale', 'Track Uncertainty', 'Not exposed'].forEach(band =>
      expect(within(legend).getByText(band)).toBeInTheDocument()
    );
    expect(legend).toHaveTextContent('area shading');
    expect(legend).not.toHaveTextContent('swath outlines');
  });

  it('explains each layer that is drawn, and only those', () => {
    const { rerender } = render(<ForecastLegend active={active} />);
    const legend = () => screen.getByRole('region', { name: 'Forecast legend' });
    expect(legend()).toHaveTextContent('swath outlines');
    expect(legend()).toHaveTextContent('Evacuation Centre');
    expect(legend()).toHaveTextContent('Blue ring: facility in a floodplain');
    expect(legend()).not.toHaveTextContent('Floodplain exposure');
    expect(legend()).not.toHaveTextContent('25 km rings');
    expect(legend()).not.toHaveTextContent('Forecast track');
    rerender(<ForecastLegend active={{ ...active, floodplain: true, rings: true, track: true }} />);
    expect(legend()).toHaveTextContent('Floodplain exposure');
    expect(legend()).toHaveTextContent('Distance from track (25 km rings)');
    expect(legend()).toHaveTextContent('Forecast track');
  });
});

describe('Overlays belong to the assessment only', () => {
  const handlers = {
    onCycloneLayerToggle: jest.fn(),
    onWindLayerToggle: jest.fn(),
    onInundationLayerToggle: jest.fn(),
    onBuildingsLayerToggle: jest.fn(),
    onRoadsLayerToggle: jest.fn(),
  };

  it('shows the Overlays group by default', () => {
    render(<MapPanel {...handlers} />);
    expect(screen.getByText('Overlays')).toBeInTheDocument();
    expect(screen.getByText('Buildings')).toBeInTheDocument();
  });

  it('hides the whole group (cyclone, wind, inundation, damage) outside Assessment', () => {
    render(<MapPanel {...handlers} showOverlayRows={false} />);
    [
      'Overlays',
      'Tropical Cyclone',
      'Maximum Wind',
      'Maximum Inundation',
      'Buildings',
      'Roads',
    ].forEach(label => expect(screen.queryByText(label)).not.toBeInTheDocument());
  });
});
