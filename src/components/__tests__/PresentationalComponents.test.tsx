/**
 * Tests for Accordion, Toast, and MetricTooltip
 *
 * These are low-level presentational components;
 * tests cover render, interaction, and timer behaviour.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Accordion from '../Accordion';
import Toast from '../Toast';
import MetricTooltip from '../MetricTooltip';

// ─── Accordion ────────────────────────────────────────────────────────────────

describe('Accordion', () => {
  it('renders the title', () => {
    render(<Accordion title="Section A">Content here</Accordion>);
    expect(screen.getByText('Section A')).toBeInTheDocument();
  });

  it('hides content by default (defaultOpen=false)', () => {
    render(<Accordion title="Hidden">Secret content</Accordion>);
    const details = document.querySelector('details');
    expect(details).not.toHaveAttribute('open');
  });

  it('shows content when defaultOpen is true', () => {
    render(
      <Accordion title="Open Section" defaultOpen>
        Visible content
      </Accordion>
    );
    const details = document.querySelector('details');
    expect(details).toHaveAttribute('open');
  });

  it('renders children content', () => {
    render(<Accordion title="A">Child content</Accordion>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders a badge when provided', () => {
    render(
      <Accordion title="With Badge" badge={42}>
        Body
      </Accordion>
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a string badge', () => {
    render(
      <Accordion title="With Badge" badge="New">
        Body
      </Accordion>
    );
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});

// ─── Toast ────────────────────────────────────────────────────────────────────

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders the message', () => {
    render(<Toast message="Export complete" onClose={jest.fn()} />);
    expect(screen.getByText('Export complete')).toBeInTheDocument();
  });

  it('renders as an alert region', () => {
    render(<Toast message="Hello" onClose={jest.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onClose after the default duration (5000ms)', () => {
    const onClose = jest.fn();
    render(<Toast message="Fading out" onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose after a custom duration', () => {
    const onClose = jest.fn();
    render(<Toast message="Quick" onClose={onClose} duration={1000} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-dismiss when duration is 0', () => {
    const onClose = jest.fn();
    render(<Toast message="Sticky" onClose={onClose} duration={0} />);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders with success type', () => {
    render(<Toast message="Done" type="success" onClose={jest.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders with warning type', () => {
    render(<Toast message="Careful" type="warning" onClose={jest.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders an action button when action prop is provided', () => {
    const onClick = jest.fn();
    render(
      <Toast message="Action needed" onClose={jest.fn()} action={{ label: 'Retry', onClick }} />
    );
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// ─── MetricTooltip ───────────────────────────────────────────────────────────

describe('MetricTooltip', () => {
  const baseProps = {
    unit: 'USD ($)',
    temporalScope: 'Return period 100 years',
    methodology: 'Stochastic loss model based on wind field.',
  };

  it('renders the trigger button', () => {
    render(<MetricTooltip {...baseProps} />);
    expect(screen.getByRole('button', { name: /show metric information/i })).toBeInTheDocument();
  });

  it('tooltip content is not visible before hover/click', () => {
    render(<MetricTooltip {...baseProps} />);
    expect(screen.queryByText('USD ($)')).not.toBeInTheDocument();
  });

  it('shows tooltip content after clicking the trigger', () => {
    render(<MetricTooltip {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /show metric information/i }));
    expect(screen.getByText('USD ($)')).toBeInTheDocument();
    expect(screen.getByText('Return period 100 years')).toBeInTheDocument();
    expect(screen.getByText('Stochastic loss model based on wind field.')).toBeInTheDocument();
  });

  it('shows tooltip content on mouse enter', () => {
    render(<MetricTooltip {...baseProps} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /show metric information/i }));
    expect(screen.getByText('USD ($)')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    render(<MetricTooltip {...baseProps} />);
    const btn = screen.getByRole('button', { name: /show metric information/i });
    fireEvent.mouseEnter(btn);
    expect(screen.getByText('USD ($)')).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(screen.queryByText('USD ($)')).not.toBeInTheDocument();
  });

  it('renders the classification badge when provided', () => {
    render(<MetricTooltip {...baseProps} classification="Hazard" />);
    fireEvent.click(screen.getByRole('button', { name: /show metric information/i }));
    expect(screen.getByText('Hazard')).toBeInTheDocument();
  });

  it('does not render classification when omitted', () => {
    render(<MetricTooltip {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /show metric information/i }));
    expect(screen.queryByText('Hazard')).not.toBeInTheDocument();
    expect(screen.queryByText('Exposure')).not.toBeInTheDocument();
  });
});
