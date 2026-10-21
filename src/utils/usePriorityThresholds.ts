import { useCallback, useEffect, useState } from 'react';
import {
  loadThresholds,
  resetThresholds as clearThresholds,
  saveThresholds,
} from './priorityStorage';
import { defaultThresholds, type PriorityThresholds } from './responsePriority';

interface State {
  countryCode: string;
  thresholds: PriorityThresholds;
  isCustom: boolean;
}

/**
 * The priority thresholds for one country. Switching country loads that
 * country's own saved values (or the defaults) and never shows another's.
 */
export function usePriorityThresholds(countryCode: string) {
  const [state, setState] = useState<State>(() => ({
    countryCode,
    thresholds: defaultThresholds(),
    isCustom: false,
  }));

  useEffect(() => {
    setState({ countryCode, ...loadThresholds(countryCode) });
  }, [countryCode]);

  // Between a country switch and the load above, show the defaults, not the previous country's
  const current: State =
    state.countryCode === countryCode
      ? state
      : { countryCode, thresholds: defaultThresholds(), isCustom: false };

  const update = useCallback(
    (thresholds: PriorityThresholds) => {
      saveThresholds(countryCode, thresholds);
      setState({ countryCode, thresholds, isCustom: true });
    },
    [countryCode]
  );

  const reset = useCallback(() => {
    clearThresholds(countryCode);
    setState({ countryCode, thresholds: defaultThresholds(), isCustom: false });
  }, [countryCode]);

  return { thresholds: current.thresholds, isCustom: current.isCustom, update, reset };
}
