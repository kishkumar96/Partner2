import { render, screen } from '@testing-library/react';
import ModeFilterPanel from '../ModeFilterPanel';
import type { AnalysisMode } from '../AnalysisModeSwitch';

const forecastSetup = { runs: [], onRunSelect: jest.fn() };

function renderFor(mode: AnalysisMode) {
  return render(
    <ModeFilterPanel analysisMode={mode} forecastSetup={forecastSetup}>
      <div data-testid="data-filters" />
    </ModeFilterPanel>
  );
}

describe('ModeFilterPanel', () => {
  it('shows the forecast setup, not the data filters, in Forecast mode', () => {
    renderFor('forecast');

    expect(screen.getByTestId('forecast-setup-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('data-filters')).not.toBeInTheDocument();
  });

  it.each(['assessment', 'scenarios', 'history'] as const)(
    'shows the data filters in %s mode',
    mode => {
      renderFor(mode);

      expect(screen.getByTestId('data-filters')).toBeInTheDocument();
      expect(screen.queryByTestId('forecast-setup-panel')).not.toBeInTheDocument();
    }
  );

  it('changes panel when the mode changes', () => {
    const { rerender } = renderFor('assessment');
    expect(screen.getByTestId('data-filters')).toBeInTheDocument();

    rerender(
      <ModeFilterPanel analysisMode="forecast" forecastSetup={forecastSetup}>
        <div data-testid="data-filters" />
      </ModeFilterPanel>
    );
    expect(screen.getByTestId('forecast-setup-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('data-filters')).not.toBeInTheDocument();
  });
});
