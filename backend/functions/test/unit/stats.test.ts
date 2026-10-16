import { describe, expect, it } from 'vitest';

import type { RunDocument, RunStatus, SessionDocument } from '../../src/shared/analyticsDocument';
import { computeStats } from '../../src/stats';

const DAY = 24 * 60 * 60 * 1000;
const TO = Date.UTC(2025, 9, 14, 12);
const RANGE = { from: TO - 2 * DAY, to: TO };

const session = (sessionId: string, startTime = TO - 1000, endTime: number | null = null): SessionDocument => ({
  sessionId,
  startTime,
  endTime,
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
      avgRunsPerSession: null,
      finishedRuns: 0,
      completionRate: null,
      avgSessionDurationMs: null,
      avgScore: null
    });
    expect(stats.byLevel).toEqual([]);
    expect(stats.byDay.map((day) => day.runs)).toEqual([0, 0, 0]);
  });

  it('computes totals, session duration, outcomes and failure reasons', () => {
    const stats = computeStats(
      [session('s1', TO - 61_000, TO - 1000), session('s2', TO - 31_000, TO - 1000)],
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
      avgRunsPerSession: 2.5,
      finishedRuns: 4,
      avgScore: 400 / 3,
      avgSessionDurationMs: 45_000
    });
    expect(stats.totals.completionRate).toBe(0.25);
    expect(stats.failureReasons).toEqual({ wall: 1, self: 1 });
    expect(stats.byLevel.find((level) => level.level === 2)?.avgScore).toBe(100);
  });

  it('does not include quit runs in average scores', () => {
    const stats = computeStats([], [run('quit', 1, 'QUIT', { score: 500 })], RANGE);

    expect(stats.totals.avgScore).toBeNull();
    expect(stats.byLevel[0]?.avgScore).toBeNull();
  });

  it('calculates runs per session from runs belonging to the selected session cohort', () => {
    const stats = computeStats(
      [session('old', RANGE.from - 1), session('selected', RANGE.from)],
      [
        run('old-run', 1, 'SUCCESS', { sessionId: 'old', startTime: RANGE.from + 1000 }),
        run('selected-1', 1, 'SUCCESS', { sessionId: 'selected', startTime: RANGE.from + 2000 }),
        run('selected-2', 1, 'IN_PROGRESS', { sessionId: 'selected', startTime: RANGE.from + 3000 })
      ],
      RANGE
    );

    expect(stats.totals.runs).toBe(3);
    expect(stats.totals.avgRunsPerSession).toBe(2);
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
      avgRunDurationMs: 30_000,
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
