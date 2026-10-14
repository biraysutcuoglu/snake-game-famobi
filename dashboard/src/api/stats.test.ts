import { describe, expect, it } from 'vitest';

import { StatsError, fetchStats, isStatsResponse } from './stats';

const valid = {
  range: { from: 1, to: 2, days: 7 },
  totals: { sessions: 1, runs: 1, finishedRuns: 0, completionRate: null, avgDurationMs: null, avgScore: null },
  byDay: [],
  byLevel: [],
  failureReasons: { wall: 0, snake: 0, obstacle: 0, external: 0 },
  truncated: false
};

const respond = (body: unknown, init: ResponseInit = {}): typeof fetch =>
  (async () => new Response(JSON.stringify(body), init)) as typeof fetch;

describe('isStatsResponse', () => {
  it('accepts the contract shape', () => {
    expect(isStatsResponse(valid)).toBe(true);
  });

  it.each([null, 'x', {}, { ...valid, byDay: undefined }, { ...valid, truncated: 'no' }])(
    'rejects %j',
    (value) => {
      expect(isStatsResponse(value)).toBe(false);
    }
  );
});

describe('fetchStats', () => {
  it('requests the chosen range and returns the stats', async () => {
    let requested = '';
    const fetchImpl = (async (url: string) => {
      requested = url;
      return new Response(JSON.stringify(valid));
    }) as unknown as typeof fetch;

    const stats = await fetchStats({ days: 30, baseUrl: 'http://x/getStats', fetchImpl });

    expect(requested).toBe('http://x/getStats?days=30');
    expect(stats.totals.runs).toBe(1);
  });

  it('fails clearly when the url is not configured', async () => {
    await expect(fetchStats({ days: 7, baseUrl: '' })).rejects.toThrow(/not configured/);
  });

  it('turns a network failure into a StatsError', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('failed');
    }) as typeof fetch;

    await expect(fetchStats({ days: 7, baseUrl: 'http://x', fetchImpl })).rejects.toBeInstanceOf(StatsError);
  });

  it('turns an error status into a StatsError', async () => {
    await expect(
      fetchStats({ days: 7, baseUrl: 'http://x', fetchImpl: respond({ error: 'no' }, { status: 500 }) })
    ).rejects.toThrow(/status 500/);
  });

  it('rejects a body that is not stats', async () => {
    await expect(
      fetchStats({ days: 7, baseUrl: 'http://x', fetchImpl: respond({ hello: 1 }) })
    ).rejects.toThrow(/unexpected response/);
  });
});
