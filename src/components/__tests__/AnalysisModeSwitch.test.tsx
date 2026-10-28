import { fireEvent, render, screen } from '@testing-library/react';
import AnalysisModeSwitch from '../AnalysisModeSwitch';

const REF = 'Rapid Exposure Forecast (REF)';
const PDA = 'Post Disaster Analysis';

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
    expect(
      Array.from(group.querySelectorAll('button')).map(
        b => b.getAttribute('aria-label') ?? b.textContent
      )
    ).toEqual([REF, PDA, 'Scenarios']);
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
    expect(screen.getByRole('button', { name: PDA })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: REF }));
    expect(onChange).toHaveBeenCalledWith('forecast');
  });

  it('does not re-select the active mode', () => {
    const onChange = jest.fn();
    render(<AnalysisModeSwitch available={['forecast']} active="forecast" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: REF }));
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

  it('shows the full name on wide screens and the label with its abbreviation on narrower ones', () => {
    render(
      <AnalysisModeSwitch
        available={['forecast', 'assessment']}
        active="forecast"
        onChange={jest.fn()}
      />
    );
    const forecast = screen.getByRole('button', { name: REF });
    const [wide, narrow] = Array.from(forecast.querySelectorAll('span'));
    expect(wide).toHaveTextContent(REF);
    expect(wide).toHaveClass('hidden', 'lg:inline');
    expect(narrow).toHaveTextContent('Forecast (REF)');
    expect(narrow).toHaveClass('lg:hidden');

    // Post Disaster Analysis has no model abbreviation, so it is one plain label at every width
    const assessment = screen.getByRole('button', { name: PDA });
    expect(assessment.querySelectorAll('span')).toHaveLength(0);
  });

  it('wraps inside its border when the header is narrow, with the same chrome on every tab', () => {
    render(
      <AnalysisModeSwitch
        available={['forecast', 'assessment', 'scenarios', 'history']}
        active="history"
        onChange={jest.fn()}
      />
    );
    const group = screen.getByRole('group', { name: 'Analysis mode' });
    // tabs that do not fit wrap onto a second row instead of spilling out past the border
    expect(group).toHaveClass('flex-wrap', 'max-w-full');
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toHaveClass('border', 'text-xs');
    }
  });

  it('keeps the plain label for a mode with no model behind it', () => {
    render(
      <AnalysisModeSwitch available={['scenarios']} active="scenarios" onChange={jest.fn()} />
    );
    const button = screen.getByRole('button', { name: 'Scenarios' });
    expect(button).not.toHaveAttribute('aria-label');
    expect(button.querySelectorAll('span')).toHaveLength(0);
  });

  it('keeps the explanation in the tooltips', () => {
    render(
      <AnalysisModeSwitch
        available={['forecast', 'assessment', 'scenarios']}
        active="forecast"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: REF })).toHaveAttribute(
      'title',
      'REF · Rapid Exposure Forecast: what may be exposed under the latest advisory?'
    );
    expect(screen.getByRole('button', { name: PDA })).toHaveAttribute(
      'title',
      'Post-event: what damage and loss occurred?'
    );
    // A mode with no model behind it keeps its plain question
    expect(screen.getByRole('button', { name: 'Scenarios' })).toHaveAttribute(
      'title',
      'Future risk: what could happen at a given return period and sea-level rise?'
    );
  });

  it('names the abbreviation in the phone dropdown too', () => {
    render(
      <AnalysisModeSwitch
        available={['forecast', 'assessment', 'history']}
        active="forecast"
        onChange={jest.fn()}
      />
    );
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'Forecast (REF): Forecast exposure',
      'Post Disaster Analysis: Post-event impact',
      'History: Historical event',
    ]);
  });
});
