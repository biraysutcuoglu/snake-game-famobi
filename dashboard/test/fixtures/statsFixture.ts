import type { StatsResponse } from '../../src/api/stats';

export const statsFixture: StatsResponse = {
  range: { from: Date.UTC(2025, 9, 8), to: Date.UTC(2025, 9, 14), days: 7 },
  totals: {
    sessions: 2,
    runs: 5,
    avgRunsPerSession: 2.5,
    finishedRuns: 4,
    completionRate: 0.25,
    avgSessionDurationMs: 75_000,
    avgScore: 120
  },
  byDay: [
    { date: '2025-10-13', sessions: 1, runs: 2 },
    { date: '2025-10-14', sessions: 1, runs: 3 }
  ],
  byLevel: [
    {
      level: 1,
      starts: 3,
      complete: 1,
      fail: 1,
      quit: 1,
      completionRate: 1 / 3,
      avgRunDurationMs: 20_000,
      avgScore: 100
    },
    {
      level: 2,
      starts: 2,
      complete: 0,
      fail: 1,
      quit: 0,
      completionRate: 0,
      avgRunDurationMs: 30_000,
      avgScore: 140
    }
  ],
  failureReasons: { wall: 1, self: 1 },
  truncated: false
};
