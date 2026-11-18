import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BottomSheet, { sheetFrameStyle } from '../BottomSheet';
import MobileBottomNav, {
  activeDestination,
  NAV_SAFE_AREA_PADDING,
  type MobileNavItem,
} from '../MobileBottomNav';
import type { SheetHeight } from '@/utils/mobilePanel';

/** A pointer event with a position: jsdom's own PointerEvent has none */
const pointer = (type: string, clientY: number) => new MouseEvent(type, { bubbles: true, clientY });

function Harness({
  initialHeight = 'half',
  onClose = jest.fn(),
  onModalChange,
}: {
  initialHeight?: SheetHeight;
  onClose?: () => void;
  onModalChange?: (modal: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState<SheetHeight>(initialHeight);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open layers</button>
      <BottomSheet
        open={open}
        title="Layers"
        height={height}
        onHeightChange={setHeight}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onModalChange={onModalChange}
      >
        <div data-testid="body">
          <button>First</button>
          <button>Last</button>
        </div>
      </BottomSheet>
      <button>Map control</button>
    </div>
  );
}

const openSheet = () => fireEvent.click(screen.getByText('Open layers'));

describe('BottomSheet', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByText('Layers')).toBeNull();
  });

  it('is a labelled, non-modal region at half height, with the map left reachable', () => {
    render(<Harness />);
    openSheet();
    const sheet = screen.getByRole('region', { name: 'Layers' });
    expect(sheet).toHaveAttribute('data-height', 'half');
    expect(sheet).not.toHaveAttribute('aria-modal');
    // The frame around it lets touches through, so the uncovered map keeps working
    expect(sheet.parentElement).toHaveClass('pointer-events-none');
    expect(sheet).toHaveClass('pointer-events-auto');
  });

  it('becomes a modal dialog when expanded, and says so to the page behind it', () => {
    const onModalChange = jest.fn();
    render(<Harness onModalChange={onModalChange} />);
    openSheet();
    expect(onModalChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Show more of this panel' }));
    const dialog = screen.getByRole('dialog', { name: 'Layers' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-height', 'expanded');
    expect(onModalChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show less of this panel' }));
    expect(screen.getByRole('region')).toHaveAttribute('data-height', 'half');
    expect(onModalChange).toHaveBeenLastCalledWith(false);
  });

  it('has visible buttons for expanding and closing, with names', () => {
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    openSheet();
    expect(screen.getByRole('button', { name: 'Show more of this panel' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close Layers' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('moves focus into the sheet on open, and back to what had it on close', () => {
    render(<Harness />);
    const trigger = screen.getByText('Open layers');
    trigger.focus();
    openSheet();
    expect(screen.getByRole('heading', { name: 'Layers' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close Layers' }));
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<Harness onClose={onClose} />);
    openSheet();
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not trap focus at half height: Tab can leave for the map and navigation', () => {
    render(<Harness />);
    openSheet();
    const last = screen.getByText('Last');
    last.focus();
    const proceed = fireEvent.keyDown(last, { key: 'Tab' });
    expect(proceed).toBe(true); // not prevented: the browser moves on
  });

  it('traps focus when expanded, wrapping at both ends', () => {
    render(<Harness initialHeight="expanded" />);
    openSheet();
    const dialog = screen.getByRole('dialog');
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
    expect(first).toHaveFocus();
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(last).toHaveFocus();
  });

  describe('dragging the handle', () => {
    const drag = (from: number, to: number) => {
      const handle = screen.getByTestId('sheet-handle');
      act(() => {
        handle.dispatchEvent(pointer('pointerdown', from));
        handle.dispatchEvent(pointer('pointerup', to));
      });
    };

    it('expands on an upward drag and collapses on a downward one', () => {
      render(<Harness />);
      openSheet();
      drag(400, 250);
      expect(screen.getByRole('dialog')).toHaveAttribute('data-height', 'expanded');
      drag(250, 400);
      expect(screen.getByRole('region')).toHaveAttribute('data-height', 'half');
    });

    it('closes on a downward drag from half height, and ignores a small slip', () => {
      const onClose = jest.fn();
      render(<Harness onClose={onClose} />);
      openSheet();
      drag(400, 410);
      expect(onClose).not.toHaveBeenCalled();
      drag(400, 520);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is not on the content, so scrolling the content never moves the sheet', () => {
      const onClose = jest.fn();
      render(<Harness onClose={onClose} />);
      openSheet();
      const content = screen.getByTestId('sheet-content');
      act(() => {
        content.dispatchEvent(pointer('pointerdown', 400));
        content.dispatchEvent(pointer('pointerup', 700));
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('region')).toHaveAttribute('data-height', 'half');
      expect(content).toHaveClass('overflow-y-auto');
      expect(content).toHaveClass('overscroll-contain');
    });
  });

  it('respects reduced motion', () => {
    render(<Harness />);
    openSheet();
    expect(screen.getByRole('region')).toHaveClass('motion-reduce:transition-none');
  });

  it('leaves room for the header, the navigation and the device safe areas', () => {
    // jsdom drops env() values from inline styles, so the strings are checked where they are made
    const style = sheetFrameStyle(
      'var(--mobile-header-height, 3.5rem)',
      'var(--mobile-nav-height, 3rem)'
    );
    expect(style.top).toBe(
      'calc(var(--mobile-header-height, 3.5rem) + env(safe-area-inset-top, 0px))'
    );
    expect(style.bottom).toBe(
      'calc(var(--mobile-nav-height, 3rem) + env(safe-area-inset-bottom, 0px))'
    );
  });
});

describe('MobileBottomNav', () => {
  const items: MobileNavItem[] = [
    { id: 'map', label: 'Map', icon: null },
    { id: 'layers', label: 'Layers', icon: null },
    { id: 'impacts', label: 'Impacts', icon: null },
    { id: 'more', label: 'More', icon: null },
  ];

  it('has four labelled buttons, each at least 48px tall', () => {
    render(<MobileBottomNav items={items} panel="none" onSelect={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['Map', 'Layers', 'Impacts', 'More']);
    buttons.forEach(b => expect(b).toHaveClass('min-h-12'));
    expect(screen.getByRole('navigation', { name: 'Dashboard sections' })).toBeInTheDocument();
  });

  it('marks the open destination, and Map for the plain map', () => {
    const { rerender } = render(
      <MobileBottomNav items={items} panel="none" onSelect={jest.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    rerender(<MobileBottomNav items={items} panel="impacts" onSelect={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Impacts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Map' })).not.toHaveAttribute('aria-current');
  });

  it('lights Map for the context sheet and a place, which belong to the map', () => {
    expect(activeDestination('context')).toBe('map');
    expect(activeDestination('place')).toBe('map');
    expect(activeDestination('none')).toBe('map');
    expect(activeDestination('layers')).toBe('layers');
    expect(activeDestination('more')).toBe('more');
  });

  it('reports the choice', () => {
    const onSelect = jest.fn();
    render(<MobileBottomNav items={items} panel="none" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(onSelect.mock.calls.map(c => c[0])).toEqual(['layers', 'map']);
  });

  it('keeps clear of the device safe area', () => {
    expect(NAV_SAFE_AREA_PADDING).toBe('env(safe-area-inset-bottom, 0px)');
  });
});
