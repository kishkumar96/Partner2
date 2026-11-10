'use client';

interface ViewStatusLineProps {
  /** Planning mode: opens the scenario selector so it can be changed from here */
  onChangeScenario?: () => void;
  /** Observed mode: jumps to the catalogue's historical events (shown only when it has some) */
  onBrowseHistorical?: () => void;
  mode: 'event' | 'planning';
  /** Names the kind of analysis, e.g. "Forecast exposure", "Scenario" */
  modeLabel?: string;
  /** The observed-storm slot shows a Rapid Exposure Forecast (exposure, not damage) */
  isForecast?: boolean;
  /** When the forecast track was issued (ISO string) */
  issuedAt?: string;
  /** Observed storm name (event mode) */
  eventName?: string;
  /** Scenario description parts, e.g. ["Coastal Flood", "SLR 0 m", "5-yr return period"] (planning mode) */
  scenarioParts?: string[];
  /** Label for the current resolution, e.g. "Province" */
  aggregationLabel?: string;
  /** Names of the sectors currently filtered */
  sectorNames?: string[];
  /** Spacing and layout classes; defaults to a small top margin under a title */
  className?: string;
}

/** Builds the segments of the always-visible "what am I looking at?" line. */
export function buildViewStatusSegments({
  mode,
  modeLabel,
  isForecast,
  issuedAt,
  eventName,
  scenarioParts,
  aggregationLabel,
  sectorNames,
}: ViewStatusLineProps): string[] {
  // The mode (observed / forecast / planning) is named by the toggle beside
  // the title; this line carries only the specifics.
  const segments: string[] = [];
  if (modeLabel) segments.push(modeLabel);
  if (mode === 'planning') {
    if (scenarioParts?.length) segments.push(scenarioParts.join(' · '));
  } else {
    if (eventName) segments.push(eventName.replace(/^Tropical Cyclone\s+/i, 'TC '));
    const issued = issuedAt ? new Date(issuedAt) : null;
    if (isForecast && issued && !Number.isNaN(issued.getTime())) {
      segments.push(`track issued ${issued.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    }
  }
  if (aggregationLabel) segments.push(`by ${aggregationLabel.toLowerCase()}`);
  if (sectorNames?.length) segments.push(`sector: ${sectorNames.join(', ')}`);
  return segments;
}

export default function ViewStatusLine(props: ViewStatusLineProps) {
  const { onChangeScenario, onBrowseHistorical, className = 'mt-1' } = props;
  const segments = buildViewStatusSegments(props);
  const hasAction =
    (props.mode === 'event' && Boolean(onBrowseHistorical)) ||
    (props.mode === 'planning' && Boolean(onChangeScenario));
  // Nothing to say (for example a mode with no specifics): leave no empty line
  if (segments.length === 0 && !hasAction) return null;
  return (
    <p
      className={`${className} text-xs leading-snug text-slate-400`}
      data-testid="view-status-line"
      aria-label="Current view"
    >
      {segments.map((segment, index) => (
        <span key={segment}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <span className={index === 0 ? 'font-semibold text-slate-200' : undefined}>
            {segment}
          </span>
        </span>
      ))}
      {props.mode === 'event' && onBrowseHistorical && (
        <>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            onClick={onBrowseHistorical}
            className="font-semibold text-amber-300 underline-offset-2 hover:underline"
          >
            Browse historical events
          </button>
        </>
      )}
      {props.mode === 'planning' && onChangeScenario && (
        <>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            onClick={onChangeScenario}
            className="font-semibold text-blue-300 underline-offset-2 hover:underline"
          >
            Change scenario
          </button>
        </>
      )}
    </p>
  );
}
