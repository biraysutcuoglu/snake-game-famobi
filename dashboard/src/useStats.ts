import { useCallback, useEffect, useState } from 'react';

import { fetchStats, type RangeDays, type StatsResponse } from './api/stats';

export type StatsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stats: StatsResponse };

/** Loads stats for the range; a newer request cancels the one in flight. */
export const useStats = (days: RangeDays): { state: StatsState; reload: () => void } => {
  const [state, setState] = useState<StatsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchStats({ days, signal: controller.signal }).then(
      (stats) => setState({ status: 'ready', stats }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
      }
    );

    return () => controller.abort();
  }, [days, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
};
