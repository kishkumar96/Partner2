/**
 * Tests for ExportButtons Component
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AlertTriangle, Factory } from 'lucide-react';
import ExportButtons from '../ExportButtons';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr-code'),
}));

jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(async () => ({
    toDataURL: jest.fn(() => 'data:image/png;base64,html2canvas-page'),
  })),
}));

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
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalImage = window.Image;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

  const openPreviewAndDownload = async () => {
    fireEvent.click(screen.getByRole('button', { name: /pdf/i }));

    const downloadButton = await screen.findByRole('button', { name: /download pdf/i });
    fireEvent.click(downloadButton);
  };

  const mockCanvasContext = {
    drawImage: jest.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  class MockImage {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    naturalWidth = 1600;
    naturalHeight = 1144;

    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }

  const mockAssetFetch = (availableAssets: string[]) => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (availableAssets.some(asset => path.includes(asset))) {
        return {
          ok: true,
          text: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
          blob: async () => new Blob(['png'], { type: 'image/png' }),
        } as Response;
      }

      return {
        ok: false,
        text: async () => '',
        blob: async () => new Blob(),
      } as Response;
    }) as jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    let assetCounter = 0;

    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => mockCanvasContext as unknown as CanvasRenderingContext2D);

    HTMLCanvasElement.prototype.toDataURL = jest.fn(
      () => `data:image/png;base64,asset-${++assetCounter}`
    );
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();
    window.Image = MockImage as unknown as typeof window.Image;
    mockAssetFetch([]);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.Image = originalImage;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
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

    await openPreviewAndDownload();

    await waitFor(() => {
      expect(jsPDFMock).toHaveBeenCalledTimes(1);
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

    await openPreviewAndDownload();

    await waitFor(() => {
      expect(mockDoc.addImage).toHaveBeenCalled();
    });

    expect(mockDoc.addPage).toHaveBeenCalled();
  });

  it('prevents duplicate PDF exports while one is in progress', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 300;
    sourceCanvas.height = 200;

    render(
      <ExportButtons
        {...baseProps}
        mapInstance={{
          getCanvas: () => sourceCanvas,
          once: (_event, callback) => {
            setTimeout(callback, 1000);
          },
          triggerRepaint: jest.fn(),
        }}
      />
    );

    const pdfButton = screen.getByRole('button', { name: /pdf/i });
    fireEvent.click(pdfButton);
    fireEvent.click(pdfButton);

    await waitFor(() => {
      expect(pdfButton).toBeDisabled();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  it('shows an error when PDF generation fails', async () => {
    jsPDFMock
      .mockImplementationOnce(() => {
        throw new Error('pdf failed');
      })
      .mockImplementationOnce(() => {
        throw new Error('pdf failed');
      });

    render(<ExportButtons {...baseProps} />);
    await openPreviewAndDownload();

    await waitFor(() => {
      expect(screen.getByText('Failed to export PDF. Please try again.')).toBeInTheDocument();
    });
  });

  it('falls back cleanly when only the first template asset loads', async () => {
    mockAssetFetch(['Topbackdrop.svg', 'PDF1_SVG1.svg']);

    render(<ExportButtons {...baseProps} />);
    await openPreviewAndDownload();

    await waitFor(() => {
      expect(mockDoc.save).toHaveBeenCalled();
    });

    expect(mockDoc.addImage).toHaveBeenCalled();
  });

  it('uses the page 1 template on the first page and the page 2 template on overflow pages', async () => {
    mockAssetFetch(['Topbackdrop.svg', 'PDF1_SVG1.svg', 'PDF1_SVG2.svg']);

    const impactBySector = Array.from({ length: 50 }, (_, index) => ({
      Sector: `Sector ${index + 1}`,
      Number_Exposed_Buildings: 100 + index,
      Number_Damaged_Buildings: 10 + index,
      Building_Loss: 50000 + index,
      Total_Loss: 100000 + index,
    }));

    render(
      <ExportButtons
        {...baseProps}
        exposureData={[]}
        economicDamageData={[]}
        impactBySector={impactBySector}
      />
    );
    await openPreviewAndDownload();

    await waitFor(() => {
      expect(mockDoc.save).toHaveBeenCalled();
    });

    expect(mockDoc.addImage).toHaveBeenCalled();
  });

  it('prefers impact-by-sector rows for damaged building counts in the PDF', async () => {
    render(
      <ExportButtons
        {...baseProps}
        impactBySector={[
          {
            Sector: 'Health',
            Number_Exposed_Buildings: 12,
            Number_Damaged_Buildings: 7,
            Building_Loss: 250000,
            Total_Loss: 300000,
          },
        ]}
      />
    );

    await openPreviewAndDownload();

    await waitFor(() => {
      expect(mockDoc.save).toHaveBeenCalled();
    });

    expect(mockDoc.addImage).toHaveBeenCalled();
  });
});
