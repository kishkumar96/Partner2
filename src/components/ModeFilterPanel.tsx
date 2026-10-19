'use client';

import type { ReactNode } from 'react';
import type { AnalysisMode } from './AnalysisModeSwitch';
import ForecastSetupPanel from './ForecastSetupPanel';

type ForecastSetupProps = Parameters<typeof ForecastSetupPanel>[0];

/**
 * The left panel for the current analysis mode: a forecast has its own setup, every other
 * mode the data filters (the children). Kept apart from DashboardView so the choice is testable;
 * the filters are not mounted, and so not loaded, while a forecast is showing.
 */
export default function ModeFilterPanel({
  analysisMode,
  forecastSetup,
  children,
}: {
  analysisMode: AnalysisMode;
  forecastSetup: ForecastSetupProps;
  children: ReactNode;
}) {
  return analysisMode === 'forecast' ? <ForecastSetupPanel {...forecastSetup} /> : <>{children}</>;
}
