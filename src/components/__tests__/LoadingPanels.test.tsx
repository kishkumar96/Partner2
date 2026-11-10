import { render, screen } from '@testing-library/react';
import { LoadingDataWorkspace, LoadingSummaryPanel } from '../LoadingPanels';

describe('first-load placeholders', () => {
  it('say the country is loading, without claiming any data is missing', () => {
    render(<LoadingSummaryPanel countryName="Cook Islands" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Cook Islands…');
    const panel = screen.getByTestId('loading-summary-panel');
    // The Assessment layout used to flash these before the real view arrived
    expect(panel.textContent).not.toMatch(/No Impact Data Available|have not been processed/i);
  });

  it('say the data table is loading, not that a CSV is missing', () => {
    render(<LoadingDataWorkspace />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading data…');
    expect(screen.getByTestId('loading-data-workspace').textContent).not.toMatch(
      /CSV data not loaded|No Impact Data/i
    );
  });
});
