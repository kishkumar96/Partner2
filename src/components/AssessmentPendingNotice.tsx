import { Info } from 'lucide-react';

/** Says the Assessment on screen is for an older storm than the live forecast. */
export default function AssessmentPendingNotice({
  forecastStorm,
  assessmentName,
  onShowForecast,
}: {
  forecastStorm: string;
  assessmentName: string;
  onShowForecast?: () => void;
}) {
  return (
    <div
      role="note"
      data-testid="assessment-pending-notice"
      className="flex gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-[11px] leading-snug text-sky-100"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-300" aria-hidden="true" />
      <p>
        This is the assessment for <strong>{assessmentName}</strong>, an earlier storm. No
        post-event assessment for <strong>TC {forecastStorm}</strong> has been published yet.
        {onShowForecast && (
          <>
            {' '}
            <button
              type="button"
              onClick={onShowForecast}
              className="underline text-sky-300 hover:text-sky-200"
            >
              See the {forecastStorm} forecast
            </button>
          </>
        )}
      </p>
    </div>
  );
}
