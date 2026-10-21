import { fireEvent, render, screen } from '@testing-library/react';
import AnalysisModeSwitch from '../AnalysisModeSwitch';

describe('AnalysisModeSwitch', () => {
  it('offers only the modes the country has data for, in a fixed order', () => {
    render(
      <AnalysisModeSwitch
        available={['scenarios', 'forecast', 'assessment']}
        active="assessment"
        onChange={jest.fn()}
      />
    );
    const group = screen.getByRole('group', { name: 'Analysis mode' });
    expect(Array.from(group.querySelectorAll('button')).map(b => b.textContent)).toEqual([
      'Forecast',
      'Assessment',
      'Scenarios',
    ]);
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
  });

  it('marks the active mode and switches on click', () => {
    const onChange = jest.fn();
    render(
      <AnalysisModeSwitch
        available={['forecast', 'assessment']}
        active="assessment"
        onChange={onChange}
      />
    );
    expect(screen.getByRole('button', { name: 'Assessment' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Forecast' }));
    expect(onChange).toHaveBeenCalledWith('forecast');
  });

  it('does not re-select the active mode', () => {
    const onChange = jest.fn();
    render(<AnalysisModeSwitch available={['forecast']} active="forecast" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forecast' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has a compact dropdown for phones', () => {
    const onChange = jest.fn();
    render(
      <AnalysisModeSwitch
        available={['forecast', 'scenarios']}
        active="forecast"
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'scenarios' } });
    expect(onChange).toHaveBeenCalledWith('scenarios');
  });
});
