import { useState } from 'react';

import { RANGE_OPTIONS, type RangeDays, type StatsResponse } from './api/stats';
import { FailureReasons } from './components/FailureReasons';
import { LevelOutcomes } from './components/LevelOutcomes';
import { Overview } from './components/Overview';
import { RunDurationByLevel } from './components/RunDurationByLevel';
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
              This range contains more data than the read limit. The results only cover the most recent records.
            </p>
          )}
          <Overview stats={state.stats} />
          <div className="dashboard-grid">
            <div className="dashboard-slot dashboard-slot--activity">
              <RunsOverTime stats={state.stats} />
            </div>
            <div className="dashboard-slot dashboard-slot--levels">
              <LevelOutcomes stats={state.stats} />
            </div>
            <div className="dashboard-slot dashboard-slot--failures">
              <FailureReasons stats={state.stats} />
            </div>
            <div className="dashboard-slot dashboard-slot--durations">
              <RunDurationByLevel stats={state.stats} />
            </div>
          </div>
        </>
      )}
    </main>
  );
};
