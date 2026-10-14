import { describe, expect, it } from 'vitest';

import type { AnalyticsEvent } from './shared/analyticsEvent';
import { computeStats } from './stats';

const DAY = 24 * 60 * 60 * 1000;
const TO = Date.UTC(2025, 9, 14, 12); // 2025-10-14T12:00Z
const RANGE = { from: TO - 2 * DAY, to: TO };

let counter = 0;
const base = (extra: Partial<AnalyticsEvent>): AnalyticsEvent => ({
  eventId: `e${(counter += 1)}`,
  name: 'run_start',
  timestamp: TO - 1000,
  sessionId: 's1',
  ...extra
});

const start = (runId: string, level: number, extra: Partial<AnalyticsEvent> = {}) =>
  base({ name: 'run_start', runId, level, ...extra });

const end = (runId: string, level: number, outcome: 'complete' | 'fail' | 'quit', extra: Partial<AnalyticsEvent> = {}) =>
  base({ name: 'run_end', runId, level, outcome, score: 100, progress: 1, durationMs: 30_000, ...extra });

describe('computeStats', () => {
  it('returns zeros and nulls for no events', () => {
    const stats = computeStats([], RANGE);

    expect(stats.totals).toEqual({
      sessions: 0,
      runs: 0,
      finishedRuns: 0,
      completionRate: null,
      avgDurationMs: null,
      avgScore: null
    });
    expect(stats.byLevel).toEqual([]);
    expect(stats.byDay.map((d) => d.runs)).toEqual([0, 0, 0]);
  });

  it('computes totals and rates from run_end events', () => {
    const stats = computeStats(
      [
        start('r1', 1),
        end('r1', 1, 'complete', { score: 200, durationMs: 20_000 }),
        start('r2', 1, { sessionId: 's2' }),
        end('r2', 1, 'fail', { sessionId: 's2', score: 100, durationMs: 40_000, failureReason: 'wall' }),
        start('r3', 2),
        end('r3', 2, 'quit', { score: 0, durationMs: 0 })
      ],
      RANGE
    );

    expect(stats.totals).toMatchObject({ sessions: 2, runs: 3, finishedRuns: 3, avgScore: 100, avgDurationMs: 20_000 });
    expect(stats.totals.completionRate).toBeCloseTo(1 / 3);
    expect(stats.failureReasons).toEqual({ wall: 1, snake: 0, obstacle: 0, external: 0 });
  });

  it('breaks outcomes down per level in ascending order', () => {
    const stats = computeStats(
      [
        start('a', 2),
        end('a', 2, 'fail'),
        start('b', 1),
        end('b', 1, 'complete', { score: 300 }),
        start('c', 1),
        end('c', 1, 'quit', { score: 100 })
      ],
      RANGE
    );

    expect(stats.byLevel.map((l) => l.level)).toEqual([1, 2]);
    expect(stats.byLevel[0]).toMatchObject({
      starts: 2,
      complete: 1,
      fail: 0,
      quit: 1,
      completionRate: 0.5,
      avgScore: 200
    });
  });

  it('counts a run once when its events are repeated', () => {
    const stats = computeStats(
      [start('r1', 1), start('r1', 1), end('r1', 1, 'complete'), end('r1', 1, 'fail')],
      RANGE
    );

    expect(stats.totals).toMatchObject({ runs: 1, finishedRuns: 1, completionRate: 1 });
    expect(stats.byLevel[0]).toMatchObject({ complete: 1, fail: 0 });
  });

  it('keeps a run that is still in progress out of the rates', () => {
    const stats = computeStats([start('r1', 1)], RANGE);

    expect(stats.totals).toMatchObject({ runs: 1, finishedRuns: 0, completionRate: null });
    expect(stats.byLevel[0]).toMatchObject({ starts: 1, completionRate: null });
  });

  it('ignores events outside the range', () => {
    const stats = computeStats([start('old', 1, { timestamp: RANGE.from - 1 })], RANGE);

    expect(stats.totals.runs).toBe(0);
    expect(stats.totals.sessions).toBe(0);
  });

  it('buckets by UTC day and fills quiet days with zero', () => {
    const stats = computeStats(
      [
        start('r1', 1, { timestamp: TO }),
        start('r2', 1, { timestamp: TO - 2 * DAY, sessionId: 's2' })
      ],
      RANGE
    );

    expect(stats.byDay).toEqual([
      { date: '2025-10-12', sessions: 1, runs: 1 },
      { date: '2025-10-13', sessions: 0, runs: 0 },
      { date: '2025-10-14', sessions: 1, runs: 1 }
    ]);
    expect(stats.range.days).toBe(3);
  });

  it('counts session-only events as sessions without runs', () => {
    const stats = computeStats([base({ name: 'session_start', sessionId: 's9' })], RANGE);

    expect(stats.totals).toMatchObject({ sessions: 1, runs: 0 });
  });

  it('passes the truncated flag through', () => {
    expect(computeStats([], RANGE, true).truncated).toBe(true);
  });
});
