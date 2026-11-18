/**
 * State of the phone layout's one shared bottom sheet.
 *
 * Exactly one panel is open at a time, so there is no way to describe two overlapping sheets: the state is a
 * single `panel` value, not a set of booleans. The sheet's height is transient (never in the URL); which panel
 * is open can be shared, so a link can open the dashboard on Impacts.
 *
 * Everything here is pure. Opening or closing a panel changes only this state: it must not reload domain
 * data, push history entries or remount the map, and nothing in this module can do those things.
 */

/** The panels the phone layout can show. `none` is the plain map. */
export const MOBILE_PANELS = ['none', 'context', 'layers', 'impacts', 'more', 'place'] as const;
export type MobilePanel = (typeof MOBILE_PANELS)[number];

/** A panel that can be named in a shared link: everything but the plain map */
export type SharedMobilePanel = Exclude<MobilePanel, 'none'>;
export const SHARED_MOBILE_PANELS = MOBILE_PANELS.filter(
  (panel): panel is SharedMobilePanel => panel !== 'none'
);

export type SheetHeight = 'half' | 'expanded';

/** A part of a panel to bring into view when it opens, e.g. the filters inside Layers */
export type MobilePanelSection = 'filters';

export interface MobilePanelState {
  panel: MobilePanel;
  height: SheetHeight;
  section: MobilePanelSection | null;
}

export const INITIAL_MOBILE_PANEL_STATE: MobilePanelState = {
  panel: 'none',
  height: 'half',
  section: null,
};

export type MobilePanelAction =
  | { type: 'open'; panel: MobilePanel; section?: MobilePanelSection | null }
  | { type: 'close' }
  | { type: 'setHeight'; height: SheetHeight }
  | { type: 'toggleHeight' };

export function isMobilePanel(value: unknown): value is MobilePanel {
  return typeof value === 'string' && (MOBILE_PANELS as readonly string[]).includes(value);
}

/**
 * Returns the same object when nothing changes, so a repeated tap on the open destination does not
 * re-render the sheet or reset its height.
 */
export function mobilePanelReducer(
  state: MobilePanelState,
  action: MobilePanelAction
): MobilePanelState {
  switch (action.type) {
    case 'open': {
      if (action.panel === 'none') return mobilePanelReducer(state, { type: 'close' });
      const section = action.section ?? null;
      if (state.panel === action.panel && state.section === section) return state;
      // The same panel keeps the height the person chose; a different one starts at half height
      const height = state.panel === action.panel ? state.height : 'half';
      return { panel: action.panel, height, section };
    }
    case 'close':
      return state.panel === 'none' && state.section === null
        ? state
        : { ...INITIAL_MOBILE_PANEL_STATE };
    case 'setHeight':
      if (state.panel === 'none' || state.height === action.height) return state;
      return { ...state, height: action.height };
    case 'toggleHeight':
      if (state.panel === 'none') return state;
      return { ...state, height: state.height === 'half' ? 'expanded' : 'half' };
    default:
      return state;
  }
}

/** The panel flags older shared links used (`?summary=true&map=true&filters=true`) */
export interface LegacyPanelFlags {
  showSummary?: boolean;
  showMapControls?: boolean;
  showFilters?: boolean;
}

/**
 * Which panel a link opens on a phone. A named mobile panel wins. Otherwise the older flags map to the
 * nearest phone panel, in this order when several are set: summary (Impacts), then map controls (Layers),
 * then filters (Layers, scrolled to its filter section). Returns the plain map when there is none.
 *
 * Only call this on a phone: on desktop the old flags keep opening the old panels.
 */
export function resolveInitialMobilePanel(
  link: LegacyPanelFlags & { mobilePanel?: SharedMobilePanel | null }
): MobilePanelState {
  if (link.mobilePanel)
    return mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, openAction(link.mobilePanel));
  if (link.showSummary)
    return mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, openAction('impacts'));
  if (link.showMapControls)
    return mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, openAction('layers'));
  if (link.showFilters) {
    return mobilePanelReducer(INITIAL_MOBILE_PANEL_STATE, openAction('layers', 'filters'));
  }
  return INITIAL_MOBILE_PANEL_STATE;
}

function openAction(panel: MobilePanel, section?: MobilePanelSection): MobilePanelAction {
  return { type: 'open', panel, section };
}
