import { describe, expect, it } from 'vitest';

import { handleCollectEvents, type EventStore } from './handler';
import {
  MAX_BATCH_SIZE,
  MAX_EVENT_AGE_MS,
  MAX_FUTURE_SKEW_MS,
  type AnalyticsEvent
} from './shared/analyticsEvent';

const NOW = 1_760_000_000_000;

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
    const response = await handleCollectEvents({ method: 'POST', body: { events: [event('a'), event('b')] } }, store, NOW);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 2, duplicates: 0, rejected: 0 });
    expect(store.saved.size).toBe(2);
  });

  it('accepts the text/plain string body the game sends', async () => {
    const store = memoryStore();
    const response = await handleCollectEvents(
      { method: 'POST', body: JSON.stringify({ events: [event('a')] }) },
      store, NOW
    );

    expect(response.status).toBe(200);
    expect(store.saved.has('a')).toBe(true);
  });

  it('reports a resent event as a duplicate instead of failing', async () => {
    const store = memoryStore();
    await handleCollectEvents({ method: 'POST', body: { events: [event('a')] } }, store, NOW);
    const response = await handleCollectEvents({ method: 'POST', body: { events: [event('a'), event('b')] } }, store, NOW);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 1, duplicates: 1 });
  });

  it('drops invalid events but keeps the valid ones in the same batch', async () => {
    const store = memoryStore();
    const response = await handleCollectEvents(
      { method: 'POST', body: { events: [event('a'), event('b', { outcome: 'nope' as never }), 'junk'] } },
      store, NOW
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 1, rejected: 2 });
    expect([...store.saved.keys()]).toEqual(['a']);
  });

  it('strips fields that are not part of the contract', async () => {
    const store = memoryStore();
    await handleCollectEvents({ method: 'POST', body: { events: [{ ...event('a'), isAdmin: true }] } }, store, NOW);

    expect(store.saved.get('a')).not.toHaveProperty('isAdmin');
  });

  it('rejects non-POST requests', async () => {
    const response = await handleCollectEvents({ method: 'GET', body: undefined }, memoryStore());
    expect(response.status).toBe(405);
  });

  it('rejects malformed bodies', async () => {
    const store = memoryStore();
    expect((await handleCollectEvents({ method: 'POST', body: 'not json' }, store, NOW)).status).toBe(400);
    expect((await handleCollectEvents({ method: 'POST', body: { events: 'x' } }, store, NOW)).status).toBe(400);
  });

  it('rejects oversized batches', async () => {
    const events = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => event(`e${i}`));
    const response = await handleCollectEvents({ method: 'POST', body: { events } }, memoryStore());
    expect(response.status).toBe(413);
  });
});

describe('event validation', () => {
  const run = async (events: unknown[]) => {
    const store = memoryStore();
    const response = await handleCollectEvents({ method: 'POST', body: { events } }, store, NOW);
    return { response, store };
  };
  const rejectedWith = async (item: unknown) => {
    const { response } = await run([item]);
    return (response.body.errors as Array<{ error: string }> | undefined)?.[0]?.error;
  };

  it.each(['a/b', '.', '..', '__reserved__', 'has space', 'x'.repeat(129)])(
    'rejects unsafe id %j instead of failing the batch',
    async (id) => {
      const { response, store } = await run([event(id), event('ok')]);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ accepted: 1, rejected: 1 });
      expect([...store.saved.keys()]).toEqual(['ok']);
    }
  );

  it('rejects unsafe sessionId and runId', async () => {
    expect(await rejectedWith(event('a', { sessionId: 'a/b' }))).toBe('invalid sessionId');
    expect(await rejectedWith(event('a', { runId: '../x' }))).toBe('invalid runId');
  });

  it('enforces the timestamp window', async () => {
    const ok = [
      event('old', { timestamp: NOW - MAX_EVENT_AGE_MS }),
      event('skew', { timestamp: NOW + MAX_FUTURE_SKEW_MS })
    ];
    expect((await run(ok)).response.body).toMatchObject({ accepted: 2 });

    expect(await rejectedWith(event('a', { timestamp: 1 }))).toBe('timestamp out of range');
    expect(await rejectedWith(event('a', { timestamp: NOW - MAX_EVENT_AGE_MS - 1 }))).toBe(
      'timestamp out of range'
    );
    expect(await rejectedWith(event('a', { timestamp: NOW + MAX_FUTURE_SKEW_MS + 1 }))).toBe(
      'timestamp out of range'
    );
  });

  it('accepts every event shape the game emits', async () => {
    const base = { timestamp: NOW, sessionId: 's1' };
    const { response } = await run([
      { ...base, eventId: '1', name: 'session_start' },
      { ...base, eventId: '2', name: 'run_start', runId: 's1-1', level: 1 },
      { ...base, eventId: '3', name: 'score_update', runId: 's1-1', level: 1, score: 10 },
      { ...base, eventId: '4', name: 'run_pause', runId: 's1-1', level: 1, pauseSource: 'player' },
      { ...base, eventId: '5', name: 'run_resume', runId: 's1-1', level: 1 },
      event('6', { failureReason: 'wall' }),
      event('7', { outcome: 'complete' })
    ]);
    expect(response.body).toMatchObject({ accepted: 7, rejected: 0 });
  });

  it('requires the fields each event name depends on', async () => {
    const base = { timestamp: NOW, sessionId: 's1' };
    expect(await rejectedWith({ ...base, eventId: 'a', name: 'run_start', level: 1 })).toBe(
      'runId is required for run_start'
    );
    expect(await rejectedWith({ ...base, eventId: 'a', name: 'score_update', runId: 'r', level: 1 })).toBe(
      'score is required for score_update'
    );
    const { runId: _runId, ...noRun } = event('a');
    expect(await rejectedWith(noRun)).toBe('runId is required for run_end');
    const { durationMs: _duration, ...noDuration } = event('a');
    expect(await rejectedWith(noDuration)).toBe('durationMs is required for run_end');
  });

  it('rejects fields that do not belong to the event name', async () => {
    const base = { timestamp: NOW, sessionId: 's1' };
    expect(await rejectedWith({ ...base, eventId: 'a', name: 'session_start', runId: 'r' })).toBe(
      'runId is not allowed for session_start'
    );
    expect(
      await rejectedWith({ ...base, eventId: 'a', name: 'run_start', runId: 'r', level: 1, outcome: 'fail' })
    ).toBe('outcome is not allowed for run_start');
    expect(
      await rejectedWith({ ...base, eventId: 'a', name: 'run_pause', runId: 'r', level: 1, score: 3 })
    ).toBe('score is not allowed for run_pause');
  });

  it('only allows failureReason on a failed run', async () => {
    expect(await rejectedWith(event('a', { outcome: 'quit', failureReason: 'wall' }))).toBe(
      'failureReason requires outcome "fail"'
    );
  });
});
