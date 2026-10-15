import { useState } from 'react';

import { RANGE_OPTIONS, type RangeDays, type StatsResponse } from './api/stats';
import { FailureReasons } from './components/FailureReasons';
import { LevelOutcomes } from './components/LevelOutcomes';
import { Overview } from './components/Overview';
import { RunsOverTime } from './components/RunsOverTime';
import { useStats } from './useStats';

const isEmpty = (stats: StatsResponse): boolean => stats.totals.sessions === 0 && stats.totals.runs === 0;

export const App = () => {
  const [days, setDays] = useState<RangeDays>(7);
  const { state, reload } = useStats(days);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Neon Snake analytics</h1>
        <div role="group" aria-label="Time range" className="range">
          {RANGE_OPTIONS.map((option) => (
            <button key={option} type="button" aria-pressed={option === days} onClick={() => setDays(option)}>
              Last {option} days
            </button>
          ))}
        </div>
      </header>

      {state.status === 'loading' && <p role="status">Loading…</p>}

      {state.status === 'error' && (
        <div role="alert" className="notice">
          <p>{state.message}</p>
          <button type="button" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && isEmpty(state.stats) && (
        <p className="notice">No gameplay recorded in this period yet. Play a run and reload.</p>
      )}

      {state.status === 'ready' && !isEmpty(state.stats) && (
        <>
          {state.stats.truncated && (
            <p className="notice" role="note">
              This period has more sessions or runs than can be read at once, so the numbers cover only the most recent ones.
            </p>
          )}
          <Overview stats={state.stats} />
          <div className="grid">
            <LevelOutcomes stats={state.stats} />
            <RunsOverTime stats={state.stats} />
            <FailureReasons stats={state.stats} />
          </div>
        </>
      )}
    </main>
  );
};
