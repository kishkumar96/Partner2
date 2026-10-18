import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import ResponsePriorityPanel from '../ResponsePriorityPanel';
import { useForecastLayers } from '@/utils/useForecastLayers';
import {
  countByLevel,
  defaultThresholds,
  prioritise,
  type PriorityThresholds,
} from '@/utils/responsePriority';
import type { ResponsePriority } from '@/utils/useResponsePriority';
import type { ExposureArea, ExposureTotals, ForecastExposure } from '@/utils/forecastExposure';

const totals = (over: Partial<ExposureTotals> = {}) =>
  ({
    population: 0,
    buildings: 0,
    residentialBuildings: 0,
    nonresidentialBuildings: 0,
    buildingValue: 0,
    roadKm: 0,
    roadValue: 0,
    cropValue: 0,
    infrastructureValue: 0,
    evacuationCentres: 0,
    healthFacilities: 0,
    schools: 0,
    ...over,
  }) as ExposureTotals;

const area = (winds: string, exposed: Partial<ExposureTotals>): ExposureArea =>
  ({
    name: 'x',
    overallWinds: winds,
    minWindKmph: null,
    maxWindKmph: null,
    exposed: totals(exposed),
    inFloodplains: totals(),
    inTrackUncertainty: totals(),
    total: totals(),
    totalPopulation: 0,
    totalBuildings: 0,
    populationInFloodplains: 0,
    populationInTrackUncertainty: 0,
  }) as ExposureArea;

const AREAS = [
  {
    name: 'North Maewo',
    area: area('Hurricane Winds', { population: 2775, healthFacilities: 3, evacuationCentres: 13 }),
  },
  { name: 'Sola', area: area('Gale Winds', { population: 40 }) },
  { name: 'Quiet', area: area('Not exposed', {}) },
];

const make = (ageHours: number | null, thresholds: PriorityThresholds = defaultThresholds()) => {
  const results = prioritise(AREAS, thresholds, ageHours);
  const update = jest.fn();
  const reset = jest.fn();
  const priority: ResponsePriority = {
    results,
    counts: countByLevel(results),
    thresholds,
    isCustom: false,
    update,
    reset,
    ageHours,
    features: null,
  };
  return { priority, update, reset };
};

const renderPanel = (priority: ResponsePriority) =>
  render(<ResponsePriorityPanel priority={priority} countryName="Vanuatu" areaLabel="districts" />);

describe('ResponsePriorityPanel', () => {
  it('is labelled preliminary and says it does not declare an emergency', () => {
    renderPanel(make(2).priority);
    const panel = screen.getByTestId('response-priority');
    expect(panel).toHaveTextContent('Operational priority -preliminary');
    expect(panel).toHaveTextContent(/does not declare an emergency/i);
  });

  it('counts areas per level and queues Red with the reasons', () => {
    renderPanel(make(2).priority);
    expect(screen.getByTestId('priority-count-red')).toHaveTextContent('RED 1');
    expect(screen.getByTestId('priority-count-amber')).toHaveTextContent('AMBER 1');
    expect(screen.getByTestId('priority-count-green')).toHaveTextContent('GREEN 1');
    expect(screen.getByText('RED · 1 priority area')).toBeInTheDocument();
    expect(screen.getByText('North Maewo')).toBeInTheDocument();
    expect(screen.getByText(/people exposed ≥ 1,000 \(2,775\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('priority-stale')).not.toBeInTheDocument();
  });

  it('shows grey and a warning for a stale advisory, keeping the rules’ reading', () => {
    renderPanel(make(72).priority);
    expect(screen.getByTestId('priority-stale')).toHaveTextContent(/older than 24 h/i);
    expect(screen.getByTestId('priority-count-grey')).toHaveTextContent('GREY 3');
    expect(screen.getByTestId('priority-count-red')).toHaveTextContent('RED 1');
  });

  it('opens the threshold editor for this country and reports an edit', () => {
    const { priority, update } = make(2);
    renderPanel(priority);
    fireEvent.click(screen.getByRole('button', { name: /thresholds/i }));
    const editor = screen.getByTestId('priority-editor');
    expect(editor).toHaveTextContent('Thresholds · Vanuatu');
    expect(editor).toHaveTextContent(/other countries keep their own/i);
    const input = within(editor).getByLabelText(
      'Hurricane winds with many people exposed: People exposed ≥'
    );
    fireEvent.change(input, { target: { value: '9000' } });
    const saved = update.mock.calls[0][0] as PriorityThresholds;
    expect(saved.red[0].conditions.find(c => c.metric === 'people')!.min).toBe(9000);
  });

  it('shows what the rules give right now, and the Defaults / Custom state', () => {
    const { priority } = make(2);
    const { unmount } = renderPanel(priority);
    fireEvent.click(screen.getByRole('button', { name: /thresholds/i }));
    const preview = screen.getByTestId('priority-editor-preview');
    expect(preview).toHaveTextContent('Red 1');
    expect(preview).toHaveTextContent('Amber 1');
    expect(preview).toHaveTextContent('Green 1');
    expect(screen.getByTestId('priority-editor')).toHaveTextContent('Defaults');
    unmount();
    renderPanel({ ...priority, isCustom: true });
    fireEvent.click(screen.getByRole('button', { name: /thresholds/i }));
    expect(screen.getByTestId('priority-editor')).toHaveTextContent('Custom');
  });

  it('uses switches, and a switched-off rule locks its fields', () => {
    const custom = defaultThresholds();
    custom.red[0].enabled = false;
    const { priority } = make(2, custom);
    renderPanel(priority);
    fireEvent.click(screen.getByRole('button', { name: /thresholds/i }));
    const off = screen.getByRole('switch', {
      name: 'Hurricane winds with many people exposed enabled',
    });
    expect(off).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByLabelText('Hurricane winds with many people exposed: People exposed ≥')
    ).toBeDisabled();
    const on = screen.getByRole('switch', {
      name: 'Hurricane winds with exposed health facilities enabled',
    });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByLabelText(
        'Hurricane winds with exposed health facilities: Health facilities exposed ≥'
      )
    ).toBeEnabled();
  });

  it('can disable a rule and reset to defaults', () => {
    const { priority, update, reset } = make(2);
    renderPanel({ ...priority, isCustom: true });
    fireEvent.click(screen.getByRole('button', { name: /thresholds/i }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Hurricane winds with many people exposed enabled' })
    );
    expect((update.mock.calls[0][0] as PriorityThresholds).red[0].enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(reset).toHaveBeenCalled();
  });
});

describe('Response priority map layer option', () => {
  const fc = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
  const exposure = {
    national: null,
    regions: [],
    byWindDanger: [],
    byTrackDistance: [],
    facilities: [],
    layers: {
      facilities: null,
      windSwaths: fc,
      trackDistance: null,
      cycloneTrack: null,
      cycloneTrackSource: null,
      floodplainRowId: null,
    },
  } as ForecastExposure;

  it('is offered only when there are areas to outline, and starts switched off', () => {
    const without = renderHook(() => useForecastLayers(exposure, 'VU', null)).result.current!;
    expect(without.options.map(o => o.id)).not.toContain('priority');
    const withAreas = renderHook(() => useForecastLayers(exposure, 'VU', fc)).result.current!;
    expect(withAreas.options.map(o => o.id)).toContain('priority');
    expect(withAreas.shown.priority).toBe(false);
    expect(withAreas.options.find(o => o.id === 'priority')!.label).toMatch(/preliminary/i);
  });
});
