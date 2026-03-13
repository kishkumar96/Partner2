/**
 * Tests for ExportButtons Component
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AlertTriangle, Factory } from 'lucide-react';
import ExportButtons from '../ExportButtons';

const mockDoc = {
  addImage: jest.fn(),
  addPage: jest.fn(),
  getNumberOfPages: jest.fn(() => 1),
  line: jest.fn(),
  rect: jest.fn(),
  roundedRect: jest.fn(),
  save: jest.fn(),
  setDrawColor: jest.fn(),
  setFillColor: jest.fn(),
  setFont: jest.fn(),
  setFontSize: jest.fn(),
  setLineWidth: jest.fn(),
  setPage: jest.fn(),
  setProperties: jest.fn(),
  setTextColor: jest.fn(),
  splitTextToSize: jest.fn((text: string) => [text]),
  text: jest.fn(),
};

const jsPDFMock = jest.fn().mockImplementation(() => mockDoc);

jest.mock('jspdf', () => ({
  jsPDF: jsPDFMock,
}));

const baseProps = {
  events: [
    {
      id: 'event-1',
      name: 'Cyclone Lola',
      date: '2023-10-01',
      hazardId: 'cyclone',
      totalAffectedPopulation: 1000,
      totalEconomicDamage: 5000000,
      affectedRegions: 3,
      severity: 'high' as const,
      location: { lat: -17.75, lng: 168.3 },
    },
  ],
  exposureData: [
    {
      id: 'exp-1',
      hazardId: 'cyclone',
      sectorId: 'health',
      population: 1200,
      assets: 25000000,
      infrastructure: 30,
    },
  ],
  economicDamageData: [
    {
      id: 'dmg-1',
      hazardId: 'cyclone',
      sectorId: 'health',
      directLoss: 2000000,
      indirectLoss: 1000000,
      totalLoss: 3000000,
      year: 2023,
    },
  ],
  hazards: [
    {
      id: 'cyclone',
      name: 'Cyclone',
      color: '#ef4444',
      icon: AlertTriangle,
    },
  ],
  sectors: [
    {
      id: 'health',
      name: 'Health',
      color: '#22c55e',
      icon: Factory,
    },
  ],
};

describe('ExportButtons Component', () => {
  let getContextSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
  });

  it('renders PDF and CSV export buttons', () => {
    render(<ExportButtons {...baseProps} />);

    expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /csv/i })).toBeInTheDocument();
  });

  it('disables export when no data available', () => {
    render(<ExportButtons {...baseProps} events={[]} disabled={true} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('generates and saves a PDF report', async () => {
    render(<ExportButtons {...baseProps} countryName="Cook Islands" />);

    fireEvent.click(screen.getByRole('button', { name: /pdf/i }));

    await waitFor(() => {
      expect(jsPDFMock).toHaveBeenCalledTimes(1);
      expect(mockDoc.setProperties).toHaveBeenCalled();
      expect(mockDoc.save).toHaveBeenCalledWith(
        expect.stringMatching(/^PDIE-SitRep-Cook-Islands-\d{4}-\d{2}-\d{2}\.pdf$/)
      );
    });
  });

  it('adds map image when map canvas is available', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 300;
    sourceCanvas.height = 200;

    render(
      <ExportButtons
        {...baseProps}
        mapInstance={{
          getCanvas: () => sourceCanvas,
          once: (_event, callback) => callback(),
          triggerRepaint: jest.fn(),
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pdf/i }));

    await waitFor(() => {
      expect(mockDoc.addImage).toHaveBeenCalled();
    });
  });

  it('prevents duplicate PDF exports while one is in progress', async () => {
    jest.useFakeTimers();

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 300;
    sourceCanvas.height = 200;

    render(
      <ExportButtons
        {...baseProps}
        mapInstance={{
          getCanvas: () => sourceCanvas,
          once: jest.fn(),
        }}
      />
    );

    const pdfButton = screen.getByRole('button', { name: /pdf/i });
    fireEvent.click(pdfButton);

    await waitFor(() => {
      expect(pdfButton).toBeDisabled();
      expect(screen.getByText(/exporting/i)).toBeInTheDocument();
    });

    jest.advanceTimersByTime(2000);
    jest.useRealTimers();

    await waitFor(() => {
      expect(mockDoc.save).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error when PDF generation fails', async () => {
    jsPDFMock.mockImplementationOnce(() => {
      throw new Error('pdf failed');
    });

    render(<ExportButtons {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /pdf/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to export PDF. Please try again.')).toBeInTheDocument();
    });
  });
});
