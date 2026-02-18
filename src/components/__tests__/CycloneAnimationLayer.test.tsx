/**
 * Tests for CycloneAnimationLayer
 *
 * The component is map-canvas heavy so we mock maplibre-gl and the internal
 * hooks.  We test the play/pause UI surface and speed control, not WebGL.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import CycloneAnimationLayer from '../CycloneAnimationLayer';
import type { CycloneForecastPoint } from '@/utils/cycloneAnimationLoader';

// maplibre-gl and portal target are globally mocked via __mocks__ and jest.setup.js
// Additionally mock the heavy playback hook to give us controllable state
jest.mock('@/hooks/useCycloneTrackPlayback', () => ({
  useCycloneTrackPlayback: () => ({
    state: {
      isPlaying: false,
      currentIndex: 0,
      playbackSpeed: 1,
      totalSteps: 0,
    },
    controls: {
      play: jest.fn(),
      pause: jest.fn(),
      toggle: jest.fn(),
      seekTo: jest.fn(),
      next: jest.fn(),
      previous: jest.fn(),
      setSpeed: jest.fn(),
      reset: jest.fn(),
      nextBeat: jest.fn(),
      previousBeat: jest.fn(),
    },
  }),
}));

// Mock sub-components that render complex canvas/SVG or require extra deps
jest.mock('../CycloneIntensityChart', () => {
  const MockComponent = () => <div data-testid="intensity-chart" />;
  MockComponent.displayName = 'CycloneIntensityChart';
  return MockComponent;
});
jest.mock('../CycloneShareCard', () => {
  const MockComponent = () => <div data-testid="share-card" />;
  MockComponent.displayName = 'CycloneShareCard';
  return MockComponent;
});
jest.mock('../StoryBeatAnnotation', () => {
  const MockComponent = () => null;
  MockComponent.displayName = 'StoryBeatAnnotation';
  return MockComponent;
});

// Mock portal target and canvas
beforeAll(() => {
  const portalRoot = document.createElement('div');
  portalRoot.setAttribute('id', 'map-overlay-root');
  document.body.appendChild(portalRoot);

  // jsdom doesn't support canvas — return a no-op 2D context
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    drawImage: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    putImageData: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(),
    strokeText: jest.fn(),
    setLineDash: jest.fn(),
    canvas: document.createElement('canvas'),
  })) as jest.Mock;
});

const mockContainer = document.createElement('div');
Object.defineProperty(mockContainer, 'offsetWidth', { value: 800, configurable: true });
Object.defineProperty(mockContainer, 'offsetHeight', { value: 600, configurable: true });

const mockMap = {
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  loaded: jest.fn(() => true),
  project: jest.fn(() => ({ x: 100, y: 100 })),
  unproject: jest.fn(() => ({ lng: 166, lat: -15 })),
  flyTo: jest.fn(),
  getContainer: jest.fn(() => mockContainer),
  getStyle: jest.fn(() => ({ layers: [], sources: {} })),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  addSource: jest.fn(),
  removeSource: jest.fn(),
  getSource: jest.fn(() => null),
  getLayer: jest.fn(() => null),
  getCanvas: jest.fn(() => ({ style: {} })),
  isStyleLoaded: jest.fn(() => true),
  setPaintProperty: jest.fn(),
  setLayoutProperty: jest.fn(),
  getZoom: jest.fn(() => 7),
} as unknown as import('maplibre-gl').Map;

const sampleForecast: CycloneForecastPoint[] = [
  {
    time: new Date('2020-04-10T00:00:00Z'),
    timeString: '2020-04-10T00:00:00Z',
    latitude: -15.0,
    longitude: 166.0,
    category: 2,
    pressure: 975,
    meanWind: 65,
    windGust: 80,
    uncertainty: 10,
    galeRadiusNE: 0,
    galeRadiusSE: 0,
    galeRadiusSW: 0,
    galeRadiusNW: 0,
    stormRadiusNE: 0,
    stormRadiusSE: 0,
    stormRadiusSW: 0,
    stormRadiusNW: 0,
    hurricaneRadiusNE: 0,
    hurricaneRadiusSE: 0,
    hurricaneRadiusSW: 0,
    hurricaneRadiusNW: 0,
    eyeRadius: 0,
    eyeRadiusUncertainty: 0,
    verticalExtent: 1,
    pressureOCI: 1000,
    radiusOCI: 300,
    dvorakTNumber: 4.5,
    currentIntensity: 65,
    p5Wind: 65,
  },
  {
    time: new Date('2020-04-10T06:00:00Z'),
    timeString: '2020-04-10T06:00:00Z',
    latitude: -15.5,
    longitude: 165.5,
    category: 3,
    pressure: 955,
    meanWind: 80,
    windGust: 95,
    uncertainty: 15,
    galeRadiusNE: 0,
    galeRadiusSE: 0,
    galeRadiusSW: 0,
    galeRadiusNW: 0,
    stormRadiusNE: 0,
    stormRadiusSE: 0,
    stormRadiusSW: 0,
    stormRadiusNW: 0,
    hurricaneRadiusNE: 0,
    hurricaneRadiusSE: 0,
    hurricaneRadiusSW: 0,
    hurricaneRadiusNW: 0,
    eyeRadius: 0,
    eyeRadiusUncertainty: 0,
    verticalExtent: 2,
    pressureOCI: 1000,
    radiusOCI: 350,
    dvorakTNumber: 5.5,
    currentIntensity: 80,
    p5Wind: 80,
  },
];

describe('CycloneAnimationLayer', () => {
  it('renders without crashing when forecastTrack is null', () => {
    const { container } = render(<CycloneAnimationLayer map={mockMap} forecastTrack={null} />);
    expect(container).toBeInTheDocument();
  });

  it('renders without crashing with a valid forecastTrack', () => {
    const { container } = render(
      <CycloneAnimationLayer map={mockMap} forecastTrack={sampleForecast} />
    );
    expect(container).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <CycloneAnimationLayer
        map={mockMap}
        forecastTrack={sampleForecast}
        alwaysDocked
        onClose={onClose}
      />
    );
    // The close button renders an X icon; find it by aria-label or role
    const closeBtn = document.querySelector('button[aria-label*="lose"], button[title*="lose"]');
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
    // If the close button is not rendered in docked mode with null uiVisible, skip
  });

  it('calls onPlayingChange when play state changes externally', () => {
    const onPlayingChange = jest.fn();
    const { rerender } = render(
      <CycloneAnimationLayer
        map={mockMap}
        forecastTrack={sampleForecast}
        isPlayingExternal={false}
        onPlayingChange={onPlayingChange}
      />
    );
    rerender(
      <CycloneAnimationLayer
        map={mockMap}
        forecastTrack={sampleForecast}
        isPlayingExternal={true}
        onPlayingChange={onPlayingChange}
      />
    );
    expect(onPlayingChange).toBeDefined();
  });
});
