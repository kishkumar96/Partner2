/**
 * The "Export" menu layout of ExportButtons: one button that opens the actions, instead of a row of
 * coloured buttons competing with the forecast.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Download } from 'lucide-react';
import ExportButtons, { type ExportMenuAction } from '../ExportButtons';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr-code'),
}));

jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(async () => ({ toDataURL: jest.fn(() => 'data:image/png;base64,page') })),
}));

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));

const baseProps = {
  events: [],
  exposureData: [],
  economicDamageData: [],
  hazards: [],
  sectors: [],
};

const mapAction = (changes: Partial<ExportMenuAction> = {}): ExportMenuAction => ({
  id: 'map-png',
  label: 'Map image (PNG)',
  hint: 'The current map view',
  icon: Download,
  onClick: jest.fn(),
  ariaLabel: 'Download map as PNG',
  ...changes,
});

const trigger = () => screen.getByRole('button', { name: /^Export$/ });
const openMenu = () => fireEvent.click(trigger());

describe('ExportButtons, menu layout', () => {
  it('is one Export button, with the actions out of sight until it is opened', () => {
    render(<ExportButtons {...baseProps} layout="menu" extraActions={[mapAction()]} />);

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export data as CSV file' })
    ).not.toBeInTheDocument();
  });

  it('lists the PDF, the CSV and each extra action when opened', () => {
    render(<ExportButtons {...baseProps} layout="menu" extraActions={[mapAction()]} />);
    openMenu();

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getAllByRole('menuitem').map(item => item.getAttribute('aria-label'));
    expect(items).toEqual([
      'Export data as PDF report',
      'Export data as CSV file',
      'Download map as PNG',
    ]);
  });

  it('closes on Escape and gives the focus back to the button', () => {
    render(<ExportButtons {...baseProps} layout="menu" />);
    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes when the page outside it is clicked, but not when the menu itself is', () => {
    render(<ExportButtons {...baseProps} layout="menu" extraActions={[mapAction()]} />);
    openMenu();

    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('runs an extra action and closes the menu', () => {
    const onClick = jest.fn();
    render(<ExportButtons {...baseProps} layout="menu" extraActions={[mapAction({ onClick })]} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download map as PNG' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows an extra action that is working, and does not let it run twice', () => {
    const onClick = jest.fn();
    render(
      <ExportButtons
        {...baseProps}
        layout="menu"
        extraActions={[mapAction({ busy: true, onClick })]}
      />
    );
    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Download map as PNG' });

    expect(item).toBeDisabled();
    expect(item).toHaveTextContent('Exporting…');
    fireEvent.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('says why the PDF is unavailable for a forecast that has no brief', () => {
    render(<ExportButtons {...baseProps} layout="menu" forecastExposure={{} as never} />);
    openMenu();
    const pdf = screen.getByRole('menuitem', { name: 'Export data as PDF report' });

    expect(pdf).toBeDisabled();
    expect(pdf).toHaveTextContent('Not available for a forecast');
    expect(pdf).toHaveAttribute('title', expect.stringContaining('covers damage and loss'));
  });

  it('gives every item a tap target of at least 44px', () => {
    render(<ExportButtons {...baseProps} layout="menu" extraActions={[mapAction()]} />);
    openMenu();
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.className).toContain('min-h-[44px]');
    }
  });

  it('is unchanged as a row of buttons when no layout is asked for', () => {
    render(<ExportButtons {...baseProps} />);

    expect(screen.queryByRole('button', { name: /^Export$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export data as PDF report' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export data as CSV file' })).toBeInTheDocument();
  });
});
