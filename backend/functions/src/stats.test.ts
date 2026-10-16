import { describe, expect, it } from 'vitest';

import type { RunDocument, RunStatus, SessionDocument } from './shared/analyticsDocument';
import { computeStats } from './stats';

const DAY = 24 * 60 * 60 * 1000;
const TO = Date.UTC(2025, 9, 14, 12);
const RANGE = { from: TO - 2 * DAY, to: TO };

const session = (sessionId: string, startTime = TO - 1000): SessionDocument => ({
  sessionId,
  startTime,
  endTime: null,
  runsPlayed: 0
});

const run = (
  runId: string,
  level: number,
  status: RunStatus,
  extra: Partial<RunDocument> = {}
): RunDocument => ({
  sessionId: 's1',
  runId,
  level,
  startTime: TO - 31_000,
  endTime: status === 'IN_PROGRESS' ? null : TO - 1000,
  score: 100,
  status,
  ...extra
});

describe('computeStats', () => {
  it('returns zeros and nulls for empty collections', () => {
    const stats = computeStats([], [], RANGE);
    expect(stats.totals).toEqual({
      sessions: 0,
      runs: 0,
      finishedRuns: 0,
      completionRate: null,
      avgDurationMs: null,
      avgScore: null
    });
    expect(stats.byLevel).toEqual([]);
    expect(stats.byDay.map((day) => day.runs)).toEqual([0, 0, 0]);
  });

  it('computes totals, duration, outcomes and failure reasons', () => {
    const stats = computeStats(
      [session('s1'), session('s2')],
      [
        run('r1', 1, 'SUCCESS', { score: 200, startTime: TO - 21_000 }),
        run('r2', 1, 'FAIL_WALL', { sessionId: 's2', score: 100, startTime: TO - 41_000 }),
        run('r3', 2, 'FAIL_SELF'),
        run('r4', 2, 'QUIT', { score: 0 }),
        run('r5', 2, 'IN_PROGRESS')
      ],
      RANGE
    );

    expect(stats.totals).toMatchObject({
      sessions: 2,
      runs: 5,
      finishedRuns: 4,
      avgScore: 100,
      avgDurationMs: 30_000
    });
    expect(stats.totals.completionRate).toBe(0.25);
    expect(stats.failureReasons).toEqual({ wall: 1, self: 1 });
  });

  it('breaks outcomes down per level and excludes in-progress runs from rates', () => {
    const stats = computeStats(
      [],
      [run('a', 2, 'FAIL_WALL'), run('b', 1, 'SUCCESS', { score: 300 }), run('c', 1, 'IN_PROGRESS')],
      RANGE
    );

    expect(stats.byLevel.map((level) => level.level)).toEqual([1, 2]);
    expect(stats.byLevel[0]).toMatchObject({
      starts: 2,
      complete: 1,
      fail: 0,
      quit: 0,
      completionRate: 1,
      avgScore: 300
    });
  });

  it('filters documents outside the range and zero-fills UTC days', () => {
    const stats = computeStats(
      [session('old', RANGE.from - 1), session('today', TO)],
      [run('old', 1, 'SUCCESS', { startTime: RANGE.from - 1 }), run('today', 1, 'IN_PROGRESS', { startTime: TO })],
      RANGE
    );

    expect(stats.totals).toMatchObject({ sessions: 1, runs: 1 });
    expect(stats.byDay).toEqual([
      { date: '2025-10-12', sessions: 0, runs: 0 },
      { date: '2025-10-13', sessions: 0, runs: 0 },
      { date: '2025-10-14', sessions: 1, runs: 1 }
    ]);
  });

  it('passes the truncated flag through', () => {
    expect(computeStats([], [], RANGE, true).truncated).toBe(true);
  });
});
