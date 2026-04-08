/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThresholdRow from '../ThresholdRow';
import type { LegendThreshold } from '@/data/realThreddsLayers';

describe('ThresholdRow', () => {
  const mockThreshold: LegendThreshold = {
    value: 500000,
    label: '$0M - $0.5M',
    color: '#e8f5e9',
  };

  const mockOnChange = jest.fn();
  const mockOnValueChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders with basic props', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
        />
      );

      expect(screen.getByDisplayValue('$0M - $0.5M')).toBeInTheDocument();
    });

    it('renders color swatch with accessible label', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
        />
      );

      const swatch = screen.getByRole('img');
      expect(swatch).toHaveAttribute(
        'aria-label',
        'Color indicator: #e8f5e9 for Economic Loss range 1'
      );
    });

    it('shows value input when showValue is true', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          showValue={true}
          onValueChange={mockOnValueChange}
        />
      );

      expect(screen.getByDisplayValue('500000')).toBeInTheDocument();
    });

    it('hides value input by default', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
        />
      );

      expect(screen.queryByDisplayValue('500000')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible labels for inputs', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
        />
      );

      const labelInput = screen.getByLabelText('Economic Loss threshold 1 range label');
      expect(labelInput).toBeInTheDocument();
    });

    it('disables inputs when readonly', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          readonly={true}
        />
      );

      const input = screen.getByDisplayValue('$0M - $0.5M');
      expect(input).toBeDisabled();
    });

    it('shows help text for infinite values', () => {
      const infiniteThreshold: LegendThreshold = {
        value: Infinity,
        label: '> $3M',
        color: '#c62828',
      };

      render(
        <ThresholdRow
          threshold={infiniteThreshold}
          index={5}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          showValue={true}
          onValueChange={mockOnValueChange}
        />
      );

      expect(
        screen.getByText('This is the upper bound threshold with no maximum value')
      ).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onChange when label is edited', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
        />
      );

      const input = screen.getByDisplayValue('$0M - $0.5M');
      fireEvent.change(input, { target: { value: '$0M - $1M' } });

      expect(mockOnChange).toHaveBeenCalledWith('$0M - $1M');
    });

    it('calls onValueChange when value is edited', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          showValue={true}
          onValueChange={mockOnValueChange}
        />
      );

      const input = screen.getByDisplayValue('500000');
      fireEvent.change(input, { target: { value: '750000' } });

      expect(mockOnValueChange).toHaveBeenCalledWith(750000);
    });

    it('does not call onChange when readonly', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          readonly={true}
        />
      );

      const input = screen.getByDisplayValue('$0M - $0.5M');
      fireEvent.change(input, { target: { value: 'New Value' } });

      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty label', () => {
      const emptyThreshold: LegendThreshold = {
        value: 0,
        label: '',
        color: '#ffffff',
      };

      render(
        <ThresholdRow
          threshold={emptyThreshold}
          index={0}
          categoryLabel="Test"
          onChange={mockOnChange}
        />
      );

      expect(screen.getByPlaceholderText('Range label')).toHaveValue('');
    });

    it('validates numeric input for value changes', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          showValue={true}
          onValueChange={mockOnValueChange}
        />
      );

      const input = screen.getByDisplayValue('500000');
      fireEvent.change(input, { target: { value: 'abc' } });

      // Should not call onValueChange for non-numeric input
      expect(mockOnValueChange).not.toHaveBeenCalled();
    });

    it('prevents negative values', () => {
      render(
        <ThresholdRow
          threshold={mockThreshold}
          index={0}
          categoryLabel="Economic Loss"
          onChange={mockOnChange}
          showValue={true}
          onValueChange={mockOnValueChange}
        />
      );

      const input = screen.getByDisplayValue('500000');
      fireEvent.change(input, { target: { value: '-100' } });

      expect(mockOnValueChange).not.toHaveBeenCalled();
    });
  });
});
