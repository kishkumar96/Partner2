import type { DepthReading } from './hazardZarr';
import { hazardZarrLayersOn, readScenarioDepth, type HazardLayerMap } from './hazardZarrMapLayer';

/**
 * Click the map, read the flood depth.
 *
 * Wherever a hazard scenario is drawn from the Zarr store, the browser holds its raw depths, so a
 * click can be answered on the spot: a small chip is dropped at the point with the depth under it.
 * It is a marker, not a popup, so it does not collide with the popups other layers open on click.
 *
 * It works without a mouse too. The map is focusable and its arrow keys pan it, so with a scenario
 * showing, Enter reads the depth at the centre of the map; a crosshair marks the centre while the
 * map has focus. A hidden live region says what to do when the map gets focus and announces every
 * reading, so a screen reader hears the answer as well as seeing the chip.
 */

export interface ProbeMarker {
  setLngLat(lngLat: [number, number]): ProbeMarker;
  addTo(map: never): ProbeMarker;
  remove(): unknown;
}

/** The map calls used, so a fake can stand in for the map in tests. */
export interface DepthProbeMap extends HazardLayerMap {
  getLayoutProperty(layerId: string, name: string): unknown;
  getCanvas(): HTMLElement;
  getContainer(): HTMLElement;
  getCenter(): { lng: number; lat: number };
  on(type: 'click' | 'styledata', listener: (event: never) => void): unknown;
  off(type: 'click' | 'styledata', listener: (event: never) => void): unknown;
}

export interface DepthProbeOptions {
  createMarker: (element: HTMLElement) => ProbeMarker;
  /** Replaceable for tests */
  read?: typeof readScenarioDepth;
}

/** "1.23 m deep", "No flooding modelled here", "Outside the modelled area". */
export function formatDepthReading(reading: DepthReading | null): string {
  if (!reading) return 'Could not read the depth here';
  if (reading.kind === 'dry') return 'No flooding modelled here';
  if (reading.kind === 'outside') return 'Outside the modelled area';
  const { metres } = reading;
  // centimetres up to 10 m, then to the decimetre: the model is not better than that
  return `${metres < 10 ? metres.toFixed(2) : metres.toFixed(1)} m deep`;
}

const CHIP_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 4px 3px 8px',
  borderRadius: '6px',
  border: '1px solid rgba(148,163,184,0.5)',
  background: '#0f172a',
  color: '#f8fafc',
  font: '600 12px/1.3 system-ui, sans-serif',
  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
  whiteSpace: 'nowrap',
  pointerEvents: 'auto',
  cursor: 'default',
};

/** What is said when the map gets focus while a scenario is showing. */
export const FOCUS_HINT =
  'A flood depth scenario is shown. Use the arrow keys to move the map, then press Enter to read the depth at its centre.';

/** Hidden from sight, read out by screen readers. */
const VISUALLY_HIDDEN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
};

/** A small plus at the middle of the map, so the point Enter will read is visible. */
function buildCrosshair(): HTMLElement {
  const crosshair = document.createElement('div');
  crosshair.className = 'hazard-depth-crosshair';
  crosshair.setAttribute('aria-hidden', 'true');
  Object.assign(crosshair.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '22px',
    height: '22px',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: '2',
    background:
      'linear-gradient(#0f172a, #0f172a) center / 2px 100% no-repeat, linear-gradient(#0f172a, #0f172a) center / 100% 2px no-repeat',
    filter: 'drop-shadow(0 0 1px #f8fafc) drop-shadow(0 0 1px #f8fafc)',
  } satisfies Partial<CSSStyleDeclaration>);
  return crosshair;
}

function buildChip(text: string, onClose: () => void): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'hazard-depth-chip';
  chip.setAttribute('role', 'status');
  Object.assign(chip.style, CHIP_STYLE);

  const label = document.createElement('span');
  label.textContent = text;

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close depth reading');
  Object.assign(close.style, {
    border: '0',
    background: 'transparent',
    color: '#cbd5e1',
    font: '16px/1 system-ui, sans-serif',
    padding: '0 4px',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  close.addEventListener('click', event => {
    event.stopPropagation();
    onClose();
  });

  chip.append(label, close);
  // the chip sits on the map: a press on it must not also be a click on the map beneath
  for (const type of ['mousedown', 'dblclick', 'touchstart', 'click']) {
    chip.addEventListener(type, event => event.stopPropagation());
  }
  return chip;
}

/** Start answering clicks and Enter on the map; returns a function that stops and clears everything. */
export function attachDepthProbe(map: DepthProbeMap, options: DepthProbeOptions): () => void {
  const { createMarker, read = readScenarioDepth } = options;
  const container = map.getContainer();
  const canvas = map.getCanvas();
  let shown: { marker: ProbeMarker; layerId: string } | null = null;
  let crosshair: HTMLElement | null = null;
  let latest = 0;

  // Screen readers hear a change to an existing live region, so one is kept and rewritten.
  const announcer = document.createElement('div');
  announcer.className = 'hazard-depth-announcer';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  Object.assign(announcer.style, VISUALLY_HIDDEN);
  container.append(announcer);
  const announce = (text: string) => {
    announcer.textContent = '';
    announcer.textContent = text; // cleared first, so the same words are announced again
  };

  const clear = () => {
    shown?.marker.remove();
    shown = null;
    document.removeEventListener('keydown', onKey);
  };
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') clear();
  }

  const isVisible = (layerId: string) =>
    Boolean(map.getLayer(layerId)) && map.getLayoutProperty(layerId, 'visibility') !== 'none';
  const visibleScenarios = () =>
    hazardZarrLayersOn(map).filter(({ layerId }) => isVisible(layerId));

  const probeAt = async (lng: number, lat: number, where: string) => {
    const visible = visibleScenarios();
    if (visible.length === 0) return;
    // the layer drawn last is on top
    const { layerId, scenario } = visible[visible.length - 1];
    const mine = ++latest;

    let reading: DepthReading | null = null;
    try {
      reading = await read(scenario, lng, lat);
    } catch (error) {
      console.warn('Could not read the flood depth at the chosen point.', error);
    }
    if (mine !== latest) return; // a newer reading was asked for while this one was being read

    clear();
    const text = formatDepthReading(reading);
    const chip = buildChip(text, clear);
    shown = {
      marker: createMarker(chip)
        .setLngLat([lng, lat])
        .addTo(map as never),
      layerId,
    };
    document.addEventListener('keydown', onKey);
    announce(`Flood depth at the ${where}: ${text}`);
  };

  const onClick = (event: { lngLat: { lng: number; lat: number } }) =>
    probeAt(event.lngLat.lng, event.lngLat.lat, 'clicked point');

  // Enter reads the centre; every other key is left to the map (arrows pan, + and - zoom)
  const onCanvasKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || visibleScenarios().length === 0) return;
    event.preventDefault();
    const { lng, lat } = map.getCenter();
    void probeAt(lng, lat, 'centre of the map');
  };

  const showCrosshair = () => {
    if (crosshair || visibleScenarios().length === 0) return;
    crosshair = buildCrosshair();
    container.append(crosshair);
  };
  const hideCrosshair = () => {
    crosshair?.remove();
    crosshair = null;
  };
  const onFocus = () => {
    if (visibleScenarios().length === 0) return;
    showCrosshair();
    announce(FOCUS_HINT);
  };

  // when the scenario that was read is switched off or replaced, its reading goes too
  const onStyle = () => {
    if (shown && !isVisible(shown.layerId)) clear();
    if (crosshair && visibleScenarios().length === 0) hideCrosshair();
  };

  map.on('click', onClick as (event: never) => void);
  map.on('styledata', onStyle as (event: never) => void);
  canvas.addEventListener('keydown', onCanvasKey);
  canvas.addEventListener('focus', onFocus);
  canvas.addEventListener('blur', hideCrosshair);
  return () => {
    latest += 1;
    map.off('click', onClick as (event: never) => void);
    map.off('styledata', onStyle as (event: never) => void);
    canvas.removeEventListener('keydown', onCanvasKey);
    canvas.removeEventListener('focus', onFocus);
    canvas.removeEventListener('blur', hideCrosshair);
    clear();
    hideCrosshair();
    announcer.remove();
  };
}
