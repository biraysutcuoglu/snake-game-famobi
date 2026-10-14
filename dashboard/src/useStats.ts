import { useCallback, useEffect, useState } from 'react';

import { fetchStats, type RangeDays, type StatsResponse } from './api/stats';

export type StatsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stats: StatsResponse };

export const POLL_INTERVAL_MS = 30_000;

/**
 * Loads stats for the range and refreshes them every POLL_INTERVAL_MS while the
 * tab is visible. A newer request cancels the one in flight. Background
 * refreshes are silent: they never flip back to "loading", and a failed one
 * keeps whatever is already on screen.
 */
export const useStats = (days: RangeDays): { state: StatsState; reload: () => void } => {
  const [state, setState] = useState<StatsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    let polling = false;

    fetchStats({ days, signal: controller.signal }).then(
      (stats) => setState({ status: 'ready', stats }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
      }
    );

    const timer = setInterval(() => {
      if (document.hidden || polling) return;
      polling = true;
      fetchStats({ days, signal: controller.signal })
        .then((stats) => setState({ status: 'ready', stats }))
        .catch(() => undefined)
        .finally(() => {
          polling = false;
        });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [days, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
};
