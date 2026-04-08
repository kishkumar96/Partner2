/**
 * Jest Setup
 * Runs before each test file
 */

import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Keep console.error intact so real errors surface in test output.
// Suppress only the JSDOM "Not implemented" noise which is never actionable.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('Not implemented: HTMLFormElement.prototype.submit')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// ---------------------------------------------------------------------------
// Fetch mock – prevents real network calls in tests.
// Components that need a specific response can override per-test:
//   global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => ... })
// ---------------------------------------------------------------------------
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.reject(
      new Error(
        'fetch() was called but is not mocked. ' +
          'Provide a test-specific mock: global.fetch = jest.fn().mockResolvedValue(...)',
      ),
    ),
  );
});

afterEach(() => {
  // Restore so mocks do not bleed across test files
  if (jest.isMockFunction(global.fetch)) {
    jest.restoreAllMocks();
  }
});
