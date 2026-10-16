import { describe, expect, it } from 'vitest';

import type { StatsLevel, StatsResponse } from './api/stats';
import { hardestLevel, summarize } from './insights';

const level = (n: number, complete: number, fail: number, quit = 0): StatsLevel => {
  const ended = complete + fail + quit;
  return {
    level: n,
    starts: ended,
    complete,
    fail,
    quit,
    completionRate: ended === 0 ? null : complete / ended,
    avgScore: null
  };
};

const stats = (byLevel: StatsLevel[], totals: Partial<StatsResponse['totals']> = {}): StatsResponse => ({
  range: { from: 0, to: 1, days: 7 },
  totals: {
    sessions: 12,
    runs: 40,
    finishedRuns: 40,
    completionRate: 0.5,
    avgDurationMs: null,
    avgScore: null,
    ...totals
  },
  byDay: [],
  byLevel,
  failureReasons: { wall: 0, self: 0 },
  truncated: false
});

describe('hardestLevel', () => {
  it('picks the level with the lowest completion rate', () => {
    expect(hardestLevel(stats([level(1, 9, 1), level(2, 3, 7), level(3, 6, 4)]))?.level).toBe(2);
  });

  it('ignores levels with too few finished runs', () => {
    expect(hardestLevel(stats([level(1, 9, 1), level(2, 0, 2)]))).toBeNull();
  });

  it('needs at least two levels to compare', () => {
    expect(hardestLevel(stats([level(1, 3, 7)]))).toBeNull();
  });
});

describe('summarize', () => {
  it('states volume, completion and the hardest level', () => {
    const text = summarize(stats([level(1, 9, 1), level(2, 3, 7)]));

    expect(text).toContain('12 sessions started 40 runs.');
    expect(text).toContain('50% of finished runs');
    expect(text).toContain('Level 2 is the hardest: only 30%');
  });

  it('omits the completion sentence when no run has ended', () => {
    const text = summarize(stats([], { finishedRuns: 0, completionRate: null }));

    expect(text).not.toContain('cleared');
  });
});
