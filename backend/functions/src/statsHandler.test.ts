import { describe, expect, it } from 'vitest';

import type { RunDocument, SessionDocument } from './shared/analyticsDocument';
import {
  MAX_DAYS,
  MAX_DOCUMENTS_PER_COLLECTION,
  handleGetStats,
  type StatsSource
} from './statsHandler';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2025, 9, 14, 12);

const source = (sessions: SessionDocument[] = [], runs: RunDocument[] = [], truncated = false) => {
  const calls: Array<{ from: number; to: number; limit: number }> = [];
  const impl: StatsSource = {
    async load(from, to, limit) {
      calls.push({ from, to, limit });
      return { sessions, runs, truncated };
    }
  };
  return { impl, calls };
};

describe('handleGetStats', () => {
  it('rejects anything but GET', async () => {
    expect((await handleGetStats({ method: 'POST', query: {} }, source().impl, NOW)).status).toBe(405);
  });

  it('defaults to seven whole UTC days ending today', async () => {
    const { impl, calls } = source();
    const response = await handleGetStats({ method: 'GET', query: {} }, impl, NOW);

    expect(response.status).toBe(200);
    expect(calls[0]).toEqual({
      from: Date.UTC(2025, 9, 8),
      to: NOW,
      limit: MAX_DOCUMENTS_PER_COLLECTION
    });
    expect(response.body).toMatchObject({ range: { days: 7 } });
  });

  it('honours valid ranges and propagates truncation', async () => {
    const response = await handleGetStats({ method: 'GET', query: { days: '30' } }, source([], [], true).impl, NOW);
    expect(response.body).toMatchObject({ range: { days: 30 }, truncated: true });
  });

  it.each(['0', '-1', '1.5', 'abc', String(MAX_DAYS + 1), '', '7;drop'])('rejects days=%s', async (days) => {
    const { impl, calls } = source();
    expect((await handleGetStats({ method: 'GET', query: { days } }, impl, NOW)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects repeated range parameters', async () => {
    expect(
      (await handleGetStats({ method: 'GET', query: { days: ['7', '30'] } }, source().impl, NOW)).status
    ).toBe(400);
  });
});
