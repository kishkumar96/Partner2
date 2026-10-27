import type { DepthReading } from './hazardZarr';
import { hazardZarrLayersOn, readScenarioDepth, type HazardLayerMap } from './hazardZarrMapLayer';

/**
 * Click the map, read the flood depth.
 *
 * Wherever a hazard scenario is drawn from the Zarr store, the browser holds its raw depths, so a
 * click can be answered on the spot: a small chip is dropped at the point with the depth under it.
 * It is a marker, not a popup, so it does not collide with the popups other layers open on click.
 */

export interface ProbeMarker {
  setLngLat(lngLat: [number, number]): ProbeMarker;
  addTo(map: never): ProbeMarker;
  remove(): unknown;
}

/** The map calls used, so a fake can stand in for the map in tests. */
export interface DepthProbeMap extends HazardLayerMap {
  getLayoutProperty(layerId: string, name: string): unknown;
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

/** Start answering clicks on the map; returns a function that stops and clears the reading. */
export function attachDepthProbe(map: DepthProbeMap, options: DepthProbeOptions): () => void {
  const { createMarker, read = readScenarioDepth } = options;
  let shown: { marker: ProbeMarker; layerId: string } | null = null;
  let latest = 0;

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

  const onClick = async (event: { lngLat: { lng: number; lat: number } }) => {
    const visible = hazardZarrLayersOn(map).filter(({ layerId }) => isVisible(layerId));
    if (visible.length === 0) return;
    // the layer drawn last is on top
    const { layerId, scenario } = visible[visible.length - 1];
    const { lng, lat } = event.lngLat;
    const mine = ++latest;

    let reading: DepthReading | null = null;
    try {
      reading = await read(scenario, lng, lat);
    } catch (error) {
      console.warn('Could not read the flood depth at the clicked point.', error);
    }
    if (mine !== latest) return; // a newer click came in while this one was being read

    clear();
    const chip = buildChip(formatDepthReading(reading), clear);
    shown = {
      marker: createMarker(chip)
        .setLngLat([lng, lat])
        .addTo(map as never),
      layerId,
    };
    document.addEventListener('keydown', onKey);
  };

  // when the scenario that was read is switched off or replaced, its reading goes too
  const onStyle = () => {
    if (shown && !isVisible(shown.layerId)) clear();
  };

  map.on('click', onClick as (event: never) => void);
  map.on('styledata', onStyle as (event: never) => void);
  return () => {
    latest += 1;
    map.off('click', onClick as (event: never) => void);
    map.off('styledata', onStyle as (event: never) => void);
    clear();
  };
}
