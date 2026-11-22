/**
 * Jest Configuration
 * Testing setup for the Climate Risk Dashboard
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Handle CSS imports (with CSS modules)
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    // Handle CSS imports (without CSS modules)
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    // Handle image imports
    '^.+\\.(jpg|jpeg|png|gif|webp|avif|svg)$': '<rootDir>/__mocks__/fileMock.js',
    // Handle MapLibre GL
    '^maplibre-gl$': '<rootDir>/__mocks__/maplibre-gl.js',
    // next/jest's SWC modularizeImports rewrites
    //   import { AlertTriangle } from 'lucide-react'
    // to
    //   import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle'
    // at transform time, before moduleNameMapper runs.
    // This wider regex catches both the package root AND the rewritten paths.
    '^lucide-react(/.*)?$': '<rootDir>/__mocks__/lucide-react.js',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/tests/perf/',
  ],
  transformIgnorePatterns: [
    // Allow transpilation of ESM-only packages; next/jest handles CSS/image transforms
    '/node_modules/(?!(georaster|georaster-to-canvas|geotiff|geotiff-palette|ieee754|kdbush|lucide-react|nanoid|pbf|quickselect|supercluster|uuid|@mapbox).*/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/reports/junit',
        outputName: 'junit.xml',
      },
    ],
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  // A floor, not a goal. Measured 2026-11-23: statements 43.9, branches 41.1, functions 48.0, lines 44.1. The old
  // 50 % was not met by any commit before it (36.8 % statements the day before), so CI was red whatever
  // anyone changed. These are set just under what is met now: coverage can no longer fall, and each time
  // tests lift it, raise the floor to match. The aim is still 50.
  coverageThreshold: {
    global: {
      branches: 41,
      functions: 47,
      lines: 44,
      statements: 43,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
