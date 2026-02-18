// Mock for MapLibre GL
const maplibreMock = {
  Map: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
    addControl: jest.fn(),
    removeControl: jest.fn(),
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
    addSource: jest.fn(),
    removeSource: jest.fn(),
    getSource: jest.fn(),
    setStyle: jest.fn(),
    getStyle: jest.fn(),
    flyTo: jest.fn(),
    fitBounds: jest.fn(),
    getZoom: jest.fn(),
    getCenter: jest.fn(),
    resize: jest.fn(),
  })),
  Marker: jest.fn().mockImplementation(() => ({
    setLngLat: jest.fn().mockReturnThis(),
    addTo: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
    getElement: jest.fn(() => document.createElement('div')),
    setPopup: jest.fn().mockReturnThis(),
    togglePopup: jest.fn().mockReturnThis(),
  })),
  Popup: jest.fn().mockImplementation(() => ({
    setLngLat: jest.fn().mockReturnThis(),
    setHTML: jest.fn().mockReturnThis(),
    setDOMContent: jest.fn().mockReturnThis(),
    setText: jest.fn().mockReturnThis(),
    addTo: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
    isOpen: jest.fn(() => false),
  })),
  NavigationControl: jest.fn(),
  GeolocateControl: jest.fn(),
  ScaleControl: jest.fn(),
  FullscreenControl: jest.fn(),
};

// Support both `import maplibregl from 'maplibre-gl'` (default) and
// `import { Map } from 'maplibre-gl'` (named) module styles
module.exports = { ...maplibreMock, default: maplibreMock, __esModule: true };
