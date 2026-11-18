import {
  INITIAL_MOBILE_PANEL_STATE,
  isMobilePanel,
  mobilePanelReducer,
  resolveInitialMobilePanel,
  type MobilePanelState,
} from '@/utils/mobilePanel';

const open = (
  state: MobilePanelState,
  panel: Parameters<typeof isMobilePanel>[0],
  section?: 'filters'
) => mobilePanelReducer(state, { type: 'open', panel: panel as never, section });

describe('mobilePanelReducer', () => {
  it('starts on the plain map', () => {
    expect(INITIAL_MOBILE_PANEL_STATE).toEqual({ panel: 'none', height: 'half', section: null });
  });

  it('opens one panel at a time: opening another replaces it', () => {
    const layers = open(INITIAL_MOBILE_PANEL_STATE, 'layers');
    const impacts = open(layers, 'impacts');
    expect(layers.panel).toBe('layers');
    expect(impacts.panel).toBe('impacts');
  });

  it('starts a different panel at half height, and keeps the height of the same one', () => {
    const expanded = mobilePanelReducer(open(INITIAL_MOBILE_PANEL_STATE, 'impacts'), {
      type: 'setHeight',
      height: 'expanded',
    });
    expect(open(expanded, 'layers').height).toBe('half');
    expect(open(expanded, 'impacts')).toBe(expanded);
  });

  it('returns the same state for a no-op, so nothing re-renders', () => {
    const layers = open(INITIAL_MOBILE_PANEL_STATE, 'layers');
    expect(open(layers, 'layers')).toBe(layers);
    expect(mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, { type: 'close' })).toBe(
      INITIAL_MOBILE_PANEL_STATE
    );
    expect(mobilePanelReducer(layers, { type: 'setHeight', height: 'half' })).toBe(layers);
  });

  it('closes everything, height and section included', () => {
    const state = open(INITIAL_MOBILE_PANEL_STATE, 'layers', 'filters');
    expect(mobilePanelReducer(state, { type: 'close' })).toEqual(INITIAL_MOBILE_PANEL_STATE);
    expect(open(state, 'none')).toEqual(INITIAL_MOBILE_PANEL_STATE);
  });

  it('has no height to change on the plain map', () => {
    expect(
      mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, { type: 'setHeight', height: 'expanded' })
    ).toBe(INITIAL_MOBILE_PANEL_STATE);
    expect(mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, { type: 'toggleHeight' })).toBe(
      INITIAL_MOBILE_PANEL_STATE
    );
  });

  it('toggles between half and expanded', () => {
    const half = open(INITIAL_MOBILE_PANEL_STATE, 'impacts');
    const expanded = mobilePanelReducer(half, { type: 'toggleHeight' });
    expect(expanded.height).toBe('expanded');
    expect(mobilePanelReducer(expanded, { type: 'toggleHeight' }).height).toBe('half');
  });

  it('opens a section of a panel, and re-opens the panel when only the section differs', () => {
    const layers = open(INITIAL_MOBILE_PANEL_STATE, 'layers');
    const filters = open(layers, 'layers', 'filters');
    expect(filters).toMatchObject({ panel: 'layers', section: 'filters' });
    expect(filters).not.toBe(layers);
  });

  it('opens a place at half height from any panel', () => {
    const expanded = mobilePanelReducer(open(INITIAL_MOBILE_PANEL_STATE, 'impacts'), {
      type: 'setHeight',
      height: 'expanded',
    });
    expect(open(expanded, 'place')).toMatchObject({ panel: 'place', height: 'half' });
  });
});

describe('isMobilePanel', () => {
  it('accepts the six panels and nothing else', () => {
    ['none', 'context', 'layers', 'impacts', 'more', 'place'].forEach(p =>
      expect(isMobilePanel(p)).toBe(true)
    );
    ['', 'filters', 'Layers', null, undefined, 3].forEach(p =>
      expect(isMobilePanel(p)).toBe(false)
    );
  });
});

describe('resolveInitialMobilePanel (links opened on a phone)', () => {
  it('opens the plain map for a link with no panel', () => {
    expect(resolveInitialMobilePanel({})).toBe(INITIAL_MOBILE_PANEL_STATE);
  });

  it('maps each older flag to its phone panel', () => {
    expect(resolveInitialMobilePanel({ showSummary: true }).panel).toBe('impacts');
    expect(resolveInitialMobilePanel({ showMapControls: true }).panel).toBe('layers');
    expect(resolveInitialMobilePanel({ showFilters: true })).toMatchObject({
      panel: 'layers',
      section: 'filters',
    });
  });

  it('uses summary, then map controls, then filters when several are set', () => {
    expect(
      resolveInitialMobilePanel({ showSummary: true, showMapControls: true, showFilters: true })
        .panel
    ).toBe('impacts');
    expect(resolveInitialMobilePanel({ showMapControls: true, showFilters: true })).toMatchObject({
      panel: 'layers',
      section: null,
    });
  });

  it('lets an explicit mobile panel win over every older flag', () => {
    expect(
      resolveInitialMobilePanel({ mobilePanel: 'more', showSummary: true, showMapControls: true })
    ).toMatchObject({ panel: 'more', section: null });
  });

  it('always starts at half height', () => {
    expect(resolveInitialMobilePanel({ mobilePanel: 'impacts' }).height).toBe('half');
  });
});
