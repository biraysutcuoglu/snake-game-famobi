import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryEventQueueStorage } from '../../core/storage/EventQueueStorage';
import type { AnalyticsEvent } from '../../shared/analyticsEvent';
import { HttpBatchSink } from './HttpBatchSink';

const event = (id: string, name: AnalyticsEvent['name'] = 'score_update'): AnalyticsEvent => ({
  eventId: id,
  name,
  sessionId: 's',
  timestamp: 1
});

const okResponse = (status = 200) => ({ ok: status >= 200 && status < 300, status }) as Response;

const sentIds = (fetchMock: ReturnType<typeof vi.fn>, call: number): string[] =>
  (JSON.parse(fetchMock.mock.calls[call][1].body) as { events: AnalyticsEvent[] }).events.map((e) => e.eventId);

describe('HttpBatchSink', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const create = (overrides: Partial<ConstructorParameters<typeof HttpBatchSink>[0]> = {}) => {
    const storage = new MemoryEventQueueStorage();
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const sink = new HttpBatchSink({
      endpoint: 'https://example.test/events',
      storage,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sendBeacon: null as never,
      ...overrides
    });
    return { sink, storage, fetchMock };
  };

  it('batches events and sends them after the flush interval', async () => {
    const { sink, fetchMock, storage } = create({ flushIntervalMs: 5000 });
    sink.track(event('a'));
    sink.track(event('b'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.load()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentIds(fetchMock, 0)).toEqual(['a', 'b']);
    expect(sink.pending).toBe(0);
    expect(storage.load()).toEqual([]);
  });

  it('sends immediately when a run ends', async () => {
    const { sink, fetchMock } = create();
    sink.track(event('end', 'run_end'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps events and retries with backoff when the server fails', async () => {
    const { sink, fetchMock, storage } = create({ flushIntervalMs: 1000 });
    fetchMock.mockResolvedValueOnce(okResponse(503)).mockResolvedValueOnce(okResponse(200));
    sink.track(event('a', 'run_end'));

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sink.pending).toBe(1);
    expect(storage.load()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sink.pending).toBe(0);
  });

  it('keeps events when the network is down', async () => {
    const { sink, fetchMock } = create();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    sink.track(event('a', 'run_end'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.pending).toBe(1);
  });

  it('drops a batch the server permanently rejects', async () => {
    const { sink, fetchMock } = create();
    fetchMock.mockResolvedValueOnce(okResponse(400));
    sink.track(event('bad', 'run_end'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.pending).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers and sends events persisted by a previous page load', async () => {
    const storage = new MemoryEventQueueStorage();
    storage.save([event('old-1'), event('old-2')]);
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const sink = new HttpBatchSink({
      endpoint: 'https://example.test/events',
      storage,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sendBeacon: null as never
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(sentIds(fetchMock, 0)).toEqual(['old-1', 'old-2']);
    expect(sink.pending).toBe(0);
  });

  it('flush uses sendBeacon and clears the queue when the browser accepts it', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const { sink, fetchMock, storage } = create({ sendBeacon });
    sink.track(event('a'));

    sink.flush();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('https://example.test/events');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sink.pending).toBe(0);
    expect(storage.load()).toEqual([]);
  });

  it('flush falls back to keepalive fetch when sendBeacon is refused', async () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    const { sink, fetchMock } = create({ sendBeacon });
    sink.track(event('a'));

    sink.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('caps the queue by dropping the oldest events', () => {
    const { sink } = create({ maxQueueSize: 3, flushIntervalMs: 10_000, maxBatchSize: 100 });
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => sink.track(event(id)));
    expect(sink.pending).toBe(3);
  });
});
