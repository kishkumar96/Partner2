/**
 * Tests for ExportButtons Component
 */
import { render, screen } from '@testing-library/react';
import { AlertTriangle, Factory } from 'lucide-react';
import ExportButtons from '../ExportButtons';

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
  it('renders PDF and Excel export buttons', () => {
    render(<ExportButtons {...baseProps} />);

    expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excel/i })).toBeInTheDocument();
  });

  it('disables export when no data available', () => {
    render(<ExportButtons {...baseProps} events={[]} disabled={true} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });
});
