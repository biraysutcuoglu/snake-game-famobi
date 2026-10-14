import { describe, expect, it } from 'vitest';

import { handleCollectEvents, type EventStore } from './handler';
import { MAX_BATCH_SIZE, type AnalyticsEvent } from './shared/analyticsEvent';

const event = (id: string, extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  eventId: id,
  name: 'run_end',
  timestamp: 1_760_000_000_000,
  sessionId: 's1',
  runId: 's1-1',
  level: 2,
  outcome: 'fail',
  score: 140,
  progress: 0.6,
  durationMs: 42_000,
  ...extra
});

const memoryStore = (): EventStore & { saved: Map<string, AnalyticsEvent> } => {
  const saved = new Map<string, AnalyticsEvent>();
  return {
    saved,
    async save(events) {
      let stored = 0;
      let duplicates = 0;
      for (const item of events) {
        if (saved.has(item.eventId)) duplicates += 1;
        else {
          saved.set(item.eventId, item);
          stored += 1;
        }
      }
      return { stored, duplicates };
    }
  };
};

describe('handleCollectEvents', () => {
  it('stores valid events', async () => {
    const store = memoryStore();
    const response = await handleCollectEvents({ method: 'POST', body: { events: [event('a'), event('b')] } }, store);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 2, duplicates: 0, rejected: 0 });
    expect(store.saved.size).toBe(2);
  });

  it('accepts the text/plain string body the game sends', async () => {
    const store = memoryStore();
    const response = await handleCollectEvents(
      { method: 'POST', body: JSON.stringify({ events: [event('a')] }) },
      store
    );

    expect(response.status).toBe(200);
    expect(store.saved.has('a')).toBe(true);
  });

  it('reports a resent event as a duplicate instead of failing', async () => {
    const store = memoryStore();
    await handleCollectEvents({ method: 'POST', body: { events: [event('a')] } }, store);
    const response = await handleCollectEvents({ method: 'POST', body: { events: [event('a'), event('b')] } }, store);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 1, duplicates: 1 });
  });

  it('drops invalid events but keeps the valid ones in the same batch', async () => {
    const store = memoryStore();
    const response = await handleCollectEvents(
      { method: 'POST', body: { events: [event('a'), event('b', { outcome: 'nope' as never }), 'junk'] } },
      store
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 1, rejected: 2 });
    expect([...store.saved.keys()]).toEqual(['a']);
  });

  it('strips fields that are not part of the contract', async () => {
    const store = memoryStore();
    await handleCollectEvents({ method: 'POST', body: { events: [{ ...event('a'), isAdmin: true }] } }, store);

    expect(store.saved.get('a')).not.toHaveProperty('isAdmin');
  });

  it('rejects non-POST requests', async () => {
    const response = await handleCollectEvents({ method: 'GET', body: undefined }, memoryStore());
    expect(response.status).toBe(405);
  });

  it('rejects malformed bodies', async () => {
    const store = memoryStore();
    expect((await handleCollectEvents({ method: 'POST', body: 'not json' }, store)).status).toBe(400);
    expect((await handleCollectEvents({ method: 'POST', body: { events: 'x' } }, store)).status).toBe(400);
  });

  it('rejects oversized batches', async () => {
    const events = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => event(`e${i}`));
    const response = await handleCollectEvents({ method: 'POST', body: { events } }, memoryStore());
    expect(response.status).toBe(413);
  });
});
