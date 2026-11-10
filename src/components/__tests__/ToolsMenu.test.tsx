import { fireEvent, render, screen } from '@testing-library/react';
import ToolsMenu from '../ToolsMenu';

describe('ToolsMenu', () => {
  const setup = () => {
    const onMap = jest.fn();
    const onTour = jest.fn();
    render(
      <ToolsMenu
        items={[
          { id: 'map', label: 'Map controls', onSelect: onMap },
          { id: 'tour', label: 'Guided tour', onSelect: onTour },
          { id: 'logout', label: 'Log out', onSelect: jest.fn(), hidden: true },
        ]}
      />
    );
    return { onMap, onTour };
  };

  it('is closed by default and opens from the Tools button', () => {
    setup();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    expect(screen.getByRole('menu', { name: /tools/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /map controls/i })).toBeInTheDocument();
  });

  it('omits hidden items', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('runs the item and closes the menu when one is chosen', () => {
    const { onTour } = setup();
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /guided tour/i }));
    expect(onTour).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /tools/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
