import { describe, expect, it } from 'vitest';

import type { AnalyticsEvent } from './shared/analyticsEvent';
import { MAX_DAYS, MAX_EVENTS_READ, handleGetStats, type EventSource } from './statsHandler';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2025, 9, 14, 12);

const runStart = (id: string, timestamp: number): AnalyticsEvent => ({
  eventId: id,
  name: 'run_start',
  timestamp,
  sessionId: 's1',
  runId: id,
  level: 1
});

const source = (events: AnalyticsEvent[] = [], truncated = false) => {
  const calls: Array<{ from: number; to: number; limit: number }> = [];
  const impl: EventSource = {
    async load(from, to, limit) {
      calls.push({ from, to, limit });
      return { events, truncated };
    }
  };
  return { impl, calls };
};

describe('handleGetStats', () => {
  it('rejects anything but GET', async () => {
    const { impl } = source();
    expect((await handleGetStats({ method: 'POST', query: {} }, impl, NOW)).status).toBe(405);
  });

  it('defaults to 7 whole UTC days ending today', async () => {
    const { impl, calls } = source();
    const response = await handleGetStats({ method: 'GET', query: {} }, impl, NOW);

    expect(response.status).toBe(200);
    expect(calls[0]).toEqual({ from: Date.UTC(2025, 9, 8), to: NOW, limit: MAX_EVENTS_READ });
    expect(response.body).toMatchObject({ range: { days: 7 } });
  });

  it('honours the days parameter', async () => {
    const { impl } = source();
    const response = await handleGetStats({ method: 'GET', query: { days: '30' } }, impl, NOW);

    expect(response.body).toMatchObject({ range: { days: 30 } });
  });

  it.each(['0', '-1', '1.5', 'abc', String(MAX_DAYS + 1), '', '7;drop'])('rejects days=%s', async (days) => {
    const { impl, calls } = source();
    const response = await handleGetStats({ method: 'GET', query: { days } }, impl, NOW);

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects a repeated days parameter', async () => {
    const { impl } = source();
    const response = await handleGetStats({ method: 'GET', query: { days: ['7', '30'] } }, impl, NOW);

    expect(response.status).toBe(400);
  });

  it('aggregates what the source returns and reports truncation', async () => {
    const { impl } = source([runStart('r1', NOW - DAY), runStart('r2', NOW)], true);
    const response = await handleGetStats({ method: 'GET', query: {} }, impl, NOW);

    expect(response.body).toMatchObject({ totals: { runs: 2 }, truncated: true });
  });
});
